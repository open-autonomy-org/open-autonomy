import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const env = {
  ...process.env,
  TERMFLEET_AGENT: 'claude',
  TERMFLEET_CONTINUATION_CONFIRM_MS: '1000',
};

async function runnerClass() {
  const root = mkdtempSync(join(tmpdir(), 'oa-backend-continuation-'));
  const scripts = join(root, 'scripts');
  mkdirSync(scripts, { recursive: true });
  writeFileSync(join(scripts, 'autonomy-runner.mjs'), readFileSync(new URL('./backend.mjs', import.meta.url), 'utf8'));
  writeFileSync(
    join(scripts, 'runner-defaults.mjs'),
    "export const RUNNER_DEFAULTS={harness:'claude',createTimeoutMs:1000};\n",
  );
  const termfleet = join(root, 'node_modules', 'termfleet');
  mkdirSync(termfleet, { recursive: true });
  writeFileSync(join(termfleet, 'package.json'), JSON.stringify({ name: 'termfleet', type: 'module', exports: './index.js' }));
  writeFileSync(
    join(termfleet, 'index.js'),
    'export class ProviderClient{}; export const providerRefFromUrl=(url)=>url;\n',
  );
  const core = join(root, 'node_modules', '@termfleet', 'core');
  mkdirSync(core, { recursive: true });
  writeFileSync(
    join(core, 'package.json'),
    JSON.stringify({ name: '@termfleet/core', type: 'module', exports: { './local-providers.js': './local-providers.js' } }),
  );
  writeFileSync(
    join(core, 'local-providers.js'),
    "export const resolveDefaultProvider=async()=>({baseUrl:'http://127.0.0.1'});\n",
  );
  const module = await import(`${pathToFileURL(join(scripts, 'autonomy-runner.mjs')).href}?test=${Date.now()}`);
  return module.TermfleetRunner;
}

describe('history-preserving runner continuation', () => {
  test('resumes an ended conversation by its exact harness session id', async () => {
    const TermfleetRunner = await runnerClass();
    let created: Record<string, unknown> | undefined;
    const runner = new TermfleetRunner({
      cwd: '/repo',
      env,
      continuationPollMs: 0,
      wait: async () => {},
      client: {
        snapshot: async () => ({ windows: [] }),
        createAgentWindow: async (options: Record<string, unknown>) => {
          created = options;
          return { ok: true, result: { terminalId: 'terminal-2', agentSessionId: 'claude:session-1' } };
        },
        getAgentSession: async () => ({
          messages: created ? [{ role: 'user', text: 'continue the scheduled tick' }] : [],
        }),
      },
    });

    const result = await runner.continue('pm', {
      terminalId: 'terminal-1',
      agentSessionId: 'claude:session-1',
      cwd: '/repo',
      instruction: 'continue the scheduled tick',
    });

    expect(created).toMatchObject({
      resume: true,
      agentSessionId: 'session-1',
      cwd: '/repo',
      name: 'pm',
    });
    expect(result).toEqual({
      mode: 'resumed',
      terminalId: 'terminal-2',
      agentSessionId: 'claude:session-1',
    });
  });

  test('prods an idle live conversation and confirms the exact durable instruction', async () => {
    const TermfleetRunner = await runnerClass();
    let accepted = false;
    const runner = new TermfleetRunner({
      cwd: '/repo',
      env,
      continuationPollMs: 0,
      wait: async () => {},
      client: {
        snapshot: async () => ({
          windows: [{ terminalId: 'terminal-1', lifecycle: { currentSessionId: 'claude:session-1' } }],
        }),
        getAgentSession: async () => ({
          endOfTurn: true,
          messages: accepted ? [{ role: 'user', text: 'continue the scheduled tick' }] : [],
        }),
        sendToSession: async () => {
          accepted = true;
          return { ok: true };
        },
      },
    });

    await expect(runner.continue('pm', {
      terminalId: 'terminal-1',
      agentSessionId: 'claude:session-1',
      cwd: '/repo',
      instruction: 'continue the scheduled tick',
    })).resolves.toEqual({
      mode: 'sent',
      terminalId: 'terminal-1',
      agentSessionId: 'claude:session-1',
    });
  });

  test('never interrupts an actively working singleton merely because another tick fired', async () => {
    const TermfleetRunner = await runnerClass();
    let sends = 0;
    const runner = new TermfleetRunner({
      cwd: '/repo',
      env,
      client: {
        snapshot: async () => ({
          windows: [{ terminalId: 'terminal-1', lifecycle: { currentSessionId: 'claude:session-1' } }],
        }),
        getAgentSession: async () => ({ endOfTurn: false, messages: [] }),
        sendToSession: async () => {
          sends += 1;
          return { ok: true };
        },
      },
    });

    await expect(runner.continue('pm', {
      terminalId: 'terminal-1',
      agentSessionId: 'claude:session-1',
      cwd: '/repo',
      instruction: 'continue the scheduled tick',
    })).rejects.toThrow('must not interrupt');
    expect(sends).toBe(0);
  });
});
