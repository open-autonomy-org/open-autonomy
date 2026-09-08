import { test, expect } from 'bun:test';
import { checkLocalCodexConfig, usesLocalCodex } from '../src/local-codex.ts';

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
