// The local Codex choice is a process runtime, not a credential source. These
// checks are shared by setup and startup; neither reads Codex's auth store.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function localCodexLogin(): boolean {
  const result = spawnSync('codex', ['login', 'status'], { encoding: 'utf8', timeout: 10_000 });
  // An API-key login is a different funding arrangement. Never print the raw
  // result: some CLI versions include account information in status output.
  return result.status === 0 && /logged in using ChatGPT/i.test(`${result.stdout ?? ''}\n${result.stderr ?? ''}`);
}

export function usesLocalCodex(config: any): boolean {
  return config?.model?.provider === 'local-codex' || config?.model?.api_mode === 'codex_app_server'
    || config?.model?.openai_runtime === 'codex_app_server';
}

export const LOCAL_CODEX_ACTIVATION_BLOCKED = 'Local Codex activation is unavailable: the host sidecar and container executor are not integrated and verified yet. Keep the fleet stopped; running Hermes as the host operator is not a supported substitute.';

// Fail before starting any fleet process. Native transport selection alone does
// not isolate agent tools from the operator's filesystem and credentials.
export function checkLocalCodexActivation(configs: any[], requested: boolean): void {
  if (requested || configs.some(usesLocalCodex)) throw new Error(LOCAL_CODEX_ACTIVATION_BLOCKED);
}

export function checkLocalCodexConfig(config: any): void {
  const provider = Array.isArray(config?.custom_providers) ? config.custom_providers.find((entry: any) => entry?.name === 'local-codex') : undefined;
  if (config?.model?.provider !== 'local-codex' || typeof config.model.default !== 'string' || !config.model.default.trim()
    || provider?.api_mode !== 'codex_app_server' || provider?.api_key !== 'local-codex'
    || provider?.base_url !== 'http://127.0.0.1:1/v1' || config.model.base_url || config.model.api_key
    || config?.terminal?.backend !== 'local' || config?.terminal?.home_mode === 'profile') {
    throw new Error('Local Codex requires the native codex_app_server configuration in SETUP.md, with the agreed local model. Configure it before setup; OAuth import and the codex-valve proxy are not local Codex.');
  }
}

export function checkLocalCodexProfiles(home: string): void {
  let model: string | undefined;
  for (const path of ['config.yaml', 'profiles/treasurer/config.yaml']) {
    const config = Bun.YAML.parse(readFileSync(join(home, path), 'utf8')) as any;
    checkLocalCodexConfig(config);
    if (model && model !== config.model.default) throw new Error('The pinned Hermes runtime uses the local Codex model for both profiles. Reconcile their model labels with the model verified in Codex.');
    model = config.model.default;
  }
}
