#!/usr/bin/env bun
// The platform's model gateway in the review World: the Merge twin (the twins arc's P3 pack, WORLD_MERGE_CLI), serving
// the World's scripted turns (handlers/merge.json), with the organization the platform's MODEL_GATEWAY_API_KEY names,
// made at its door with a credit, Anthropic granted (the Claude profiles' route). The key is left for the platform
// (world/platform.ts) in the World's data, owner-only.
import { writeFileSync } from 'node:fs';
const need = (name: string): string => { const v = process.env[name]; if (!v) throw new Error(`world/gateway.ts: ${name} is required`); return v; };
const port = need('PORT');
const twin = Bun.spawn({ cmd: ['bun', need('WORLD_MERGE_CLI'), 'serve', '--port', port, '--root', `${need('VOLTER_WORLD_DATA')}/merge`, '--scenario', need('VO_MERGE_HANDLERS')], stdout: 'inherit', stderr: 'inherit' });
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => twin.kill(signal));
const base = `http://127.0.0.1:${port}`;
for (let i = 0; ; i++) { try { await fetch(`${base}/v1/models`); break; } catch { if (i > 120) throw new Error('the Merge twin did not come up'); await Bun.sleep(500); } }
const made = await (await fetch(`${base}/_twin/organizations`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Volter', credit_usd: 50, access: ['anthropic'] }) })).json() as { organization_id: string; api_key: string };
writeFileSync(`${need('VOLTER_WORLD_DATA')}/gateway.key`, made.api_key, { mode: 0o600 });
console.log(`gateway: organization ${made.organization_id} with $50 credit`);
process.exit(await twin.exited);
