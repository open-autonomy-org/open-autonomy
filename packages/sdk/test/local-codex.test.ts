import { test, expect } from 'bun:test';
import { checkLocalCodexActivation, checkLocalCodexConfig, usesLocalCodex } from '../src/local-codex.ts';

const local = () => ({
  model: { default: 'verified-model', provider: 'local-codex' },
  terminal: { backend: 'local' },
  custom_providers: [{ name: 'local-codex', base_url: 'http://127.0.0.1:1/v1', api_key: 'local-codex', api_mode: 'codex_app_server' }],
});

test('local runtime accepts native app-server and rejects HTTP/auth substitution', () => {
  expect(() => checkLocalCodexConfig(local())).not.toThrow();
  for (const substitution of [
    { api_mode: 'codex_responses' }, { base_url: 'https://example.test/v1' }, { api_key: 'copied-token' },
  ]) {
    const config = local();
    Object.assign(config.custom_providers[0], substitution);
    expect(() => checkLocalCodexConfig(config)).toThrow();
  }
  expect(() => checkLocalCodexConfig({ model: { provider: 'codex-valve' } })).toThrow();
  expect(() => checkLocalCodexConfig({ ...local(), terminal: { backend: 'docker' } })).toThrow();
  expect(() => checkLocalCodexConfig({ ...local(), terminal: { backend: 'local', home_mode: 'profile' } })).toThrow();
});

test('native runtime opt-ins cannot be mistaken for a hosted fleet', () => {
  for (const config of [local(), { model: { api_mode: 'codex_app_server' } }, { model: { openai_runtime: 'codex_app_server' } }]) {
    expect(usesLocalCodex(config)).toBe(true);
  }
  expect(usesLocalCodex({ model: { provider: 'custom', api_mode: 'chat_completions' } })).toBe(false);
});

test('the managed entrypoint cannot expose the host through a local flag or profile', () => {
  const funded = { model: { provider: 'custom', api_mode: 'chat_completions' } };
  expect(() => checkLocalCodexActivation([funded, funded], false)).not.toThrow();
  expect(() => checkLocalCodexActivation([funded, funded], true)).toThrow('This entrypoint cannot run');
  for (const config of [local(), { model: { api_mode: 'codex_app_server' } }, { model: { openai_runtime: 'codex_app_server' } }]) {
    expect(() => checkLocalCodexActivation([config, funded], false)).toThrow('This entrypoint cannot run');
    expect(() => checkLocalCodexActivation([funded, config], false)).toThrow('This entrypoint cannot run');
  }
});

import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { probeLocalCodex } from '../src/local-codex.ts';

test('native verification never exposes account data, forwards credentials, or starts a turn', async () => {
  const root = mkdtempSync(join(tmpdir(), 'oa-codex-probe-'));
  const binary = join(root, 'codex');
  const trace = join(root, 'methods.json');
  const original = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'synthetic-host-key';
  writeFileSync(binary, `#!/usr/bin/env bun
import {createInterface} from 'node:readline';
const methods=[];
for await (const line of createInterface({input:process.stdin})) {
 const request=JSON.parse(line); methods.push(request.method);
 await Bun.write(${JSON.stringify(trace)}, JSON.stringify({methods,apiKeyPresent:!!process.env.OPENAI_API_KEY,executor:process.env.CODEX_EXEC_SERVER_URL}));
 if (request.id===undefined) continue;
 const result=request.method==='account/read'?{account:{type:'chatgpt',email:'synthetic-private-account@example.test'}}:request.method==='model/list'?{data:[{id:'verified-model'}]}:{};
 console.log(JSON.stringify({id:request.id,result}));
}
`);
  chmodSync(binary, 0o700);
  try {
    expect(await probeLocalCodex({ binary, stateDir: join(root, 'state'), model: 'verified-model' })).toEqual({ accountType: 'chatgpt', model: 'verified-model' });
    expect(JSON.parse(readFileSync(trace, 'utf8'))).toEqual({ methods: ['initialize', 'initialized', 'account/read', 'model/list'], apiKeyPresent: false, executor: 'none' });
    await expect(probeLocalCodex({ binary, stateDir: join(root, 'state'), model: 'unavailable-model' })).rejects.toThrow('not listed');
    writeFileSync(binary, `#!/usr/bin/env bun\nconsole.log('synthetic-private-diagnostic');setInterval(()=>{},1000);\n`);
    await expect(probeLocalCodex({ binary, stateDir: join(root, 'state'), model: 'verified-model' })).rejects.toThrow('raw output was not published');
  } finally {
    if (original === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = original;
    rmSync(root, { recursive: true, force: true });
  }
});
