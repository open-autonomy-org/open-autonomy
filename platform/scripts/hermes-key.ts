#!/usr/bin/env bun
// Mint a STANDING platform key for a project's always-on agent (a Hermes daemon) and write it into the
// repo's Hermes home (`hermes/.env`, git-ignored). A standing key is admin-minted, lives ~90 days, has no
// per-run cap, and is hard-stopped by the project's account balance and the platform's global daily cap.
// Every model call through it is metered to the project's account — that is what sponsors fund.
//
//   MODEL_PROXY_ADMIN_TOKEN=... bun platform/scripts/hermes-key.ts [--account owner/repo] [--models a,b] [--home hermes]
//
// Re-run to rotate: the previous key keeps working until it expires or is revoked
// (POST /admin/runs/:run_id/revoke).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const proxyUrl = (process.env.MODEL_PROXY_URL || 'https://volter-agent-model-proxy.aaron-0ed.workers.dev').replace(/\/$/, '');
const adminToken = process.env.MODEL_PROXY_ADMIN_TOKEN;
if (!adminToken) {
  console.error('MODEL_PROXY_ADMIN_TOKEN is required (the worker admin secret; see platform/scripts/rotate-admin-token.ts)');
  process.exit(2);
}
const account = arg('--account') ?? 'volter-ai/open-autonomy';
const models = (arg('--models') ?? 'deepseek/deepseek-v4-flash').split(',').map((m) => m.trim()).filter(Boolean);
const home = arg('--home') ?? 'hermes';

const res = await fetch(`${proxyUrl}/admin/runs/mint`, {
  method: 'POST',
  headers: { 'x-admin-token': adminToken, 'content-type': 'application/json' },
  body: JSON.stringify({ repo: account, issue: 0, actor: 'hermes', purpose: 'hermes', standing: true, models }),
});
const body = await res.json() as { ok?: boolean; error?: string; token?: string; run?: { run_id: string; expires_at: string } };
if (!res.ok || !body.ok || !body.token || !body.run) {
  console.error(`mint failed: ${res.status} ${body.error ?? ''}`);
  process.exit(1);
}

// Merge into hermes/.env: replace our keys, keep everything else (Discord token etc.).
const envPath = join(home, '.env');
const keep = existsSync(envPath)
  ? readFileSync(envPath, 'utf8').split('\n').filter((l) => !/^(OPEN_AUTONOMY_KEY|OPEN_AUTONOMY_BASE_URL|OPEN_AUTONOMY_KEY_RUN_ID|OPEN_AUTONOMY_KEY_EXPIRES_AT)=/.test(l) && l.trim() !== '')
  : [];
keep.push(`OPEN_AUTONOMY_BASE_URL=${proxyUrl}/v1`);
keep.push(`OPEN_AUTONOMY_KEY=${body.token}`);
keep.push(`OPEN_AUTONOMY_KEY_RUN_ID=${body.run.run_id}`);
keep.push(`OPEN_AUTONOMY_KEY_EXPIRES_AT=${body.run.expires_at}`);
writeFileSync(envPath, keep.join('\n') + '\n', { mode: 0o600 });
console.log(`standing key ${body.run.run_id} for ${account} (models: ${models.join(', ')}) expires ${body.run.expires_at} → ${envPath}`);
