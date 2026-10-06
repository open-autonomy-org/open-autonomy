// Selected native runtime observation, through its public SDK (ADR 0026). Worker harness is not home flavor.
import { isAbsolute, resolve } from 'node:path';
import type { SupercodeHarnessClient, RunsQuery, SessionDescriptor, RequestOptions } from '@volter/supercode-harness-sdk';

export type NativeRuntimeSelection = { kind: 'hermes' | 'orchestrator'; root: string };
export type NativeProfile = {
  name?: string; dir?: string; persona?: { text?: string };
  worker?: { harness: string; model?: string | null; permission?: Record<string, unknown> } | null;
  jobs: Record<string, { residue?: { name?: string } }>;
  bindings: Record<string, { worker: { session_id?: string }; started_at?: string; ended_at?: string; end_reason?: string }>;
  residue?: { config?: Record<string, any> };
};

export function nativeRuntime(config: { native_runtime?: unknown; hermes_home?: unknown }, env = process.env): NativeRuntimeSelection {
  const check = (value: any): NativeRuntimeSelection => {
    if (!value || !['hermes', 'orchestrator'].includes(value.kind) || typeof value.root !== 'string' || !isAbsolute(value.root))
      throw new Error('native_runtime requires kind hermes or orchestrator and an absolute root');
    return { kind: value.kind, root: resolve(value.root) };
  };
  const keeper = env.OPEN_AUTONOMY_NATIVE_RUNTIME ? check(JSON.parse(env.OPEN_AUTONOMY_NATIVE_RUNTIME)) : undefined;
  const declared = config.native_runtime === undefined ? undefined : check(config.native_runtime);
  if (keeper && declared && (keeper.kind !== declared.kind || keeper.root !== declared.root)) throw new Error('Reporter native_runtime conflicts with the keeper selection');
  return keeper ?? declared ?? check({ kind: 'hermes', root: config.hermes_home ?? env.HERMES_HOME });
}

export class NativeRuntime {
  constructor(readonly selected: NativeRuntimeSelection, private readonly sc: SupercodeHarnessClient) {}
  get native(): boolean { return this.selected.kind === 'orchestrator'; }
  get root(): string { return this.selected.root; }
  get homes(): { hermes?: string; orchestrator?: string } {
    return this.native ? { orchestrator: this.root } : { hermes: resolve(this.root, 'state.db') };
  }
  get scheduler() { return { harness: this.selected.kind, homes: this.homes }; }
  async load(options?: RequestOptions) {
    const result = await this.sc.orchestrationLoad({ root: this.root, flavor: this.selected.kind }, { timeoutMs: 60_000, ...options });
    const profiles = result.orchestration.profiles as Record<string, NativeProfile>;
    if (!profiles?.default) throw new Error('Native profile state unavailable');
    return { orchestration: result.orchestration, profiles };
  }
  async runs(options?: RequestOptions) {
    // Published binary 0.5.141 supports orchestrator runs.list. SDK 0.3.64's RunHarnessId union is stale (ADR 0026).
    const harness = this.selected.kind as RunsQuery['harness'];
    const result = await this.sc.listRuns({ harness, homes: this.homes, limit: 500 }, { timeoutMs: 60_000, ...options });
    if (result.sources.some(s => s.state === 'unreadable')) throw new Error('Native run ledger unreadable');
    return result;
  }
  async jobs(options?: RequestOptions) {
    const result = await this.sc.listJobs(this.scheduler, options);
    if (result.sources.some(s => s.state === 'unreadable')) throw new Error('Native schedule unreadable');
    return result;
  }
  async skills(options?: RequestOptions) {
    if (!this.native) return this.sc.listSkills({ harness: 'hermes', homes: { hermes: this.root } }, options);
    const { profiles } = await this.load(options);
    const rows = await Promise.all(Object.entries(profiles).map(([name, profile]) => {
      if (!profile.worker) return Promise.resolve([]);
      const dir = profile.dir ?? (name === 'default' ? this.root : resolve(this.root, 'profiles', name));
      return this.sc.listSkills({ harness: profile.worker.harness, cwd: dir,
        homes: { agents: resolve(dir, '.agents'), claude_code: resolve(dir, 'claude-code'), codex: resolve(dir, 'codex') } }, options);
    }));
    return rows.flat();
  }
  async profiles(options?: RequestOptions) { return (await this.sc.listProfiles({ harness: this.selected.kind, homes: this.homes }, options)).profiles; }
  async queries(seats?: string, options?: RequestOptions) {
    const profiles = await this.profiles(options);
    if (!this.native) return {
      profiles,
      queries: [{ harnesses: seats ? ['hermes', 'claude-code'] : ['hermes'], homes: { ...this.homes, ...(seats ? { claude_code: resolve(process.env.HOME ?? '', '.claude', 'projects') } : {}) } },
        ...profiles.filter(p => !p.default && p.home).map(p => ({ harnesses: ['hermes'], homes: { hermes: resolve(p.home!, 'state.db') } }))],
    };
    const { profiles: model } = await this.load(options);
    const queries: Array<{ harnesses: string[]; homes: { claude_code?: string; codex?: string } }> = Object.entries(model).map(([name, profile]) => {
      const dir = profile.dir ?? (name === 'default' ? this.root : resolve(this.root, 'profiles', name));
      return { harnesses: ['claude-code', 'codex'], homes: { claude_code: resolve(dir, 'claude-code', 'projects'), codex: resolve(dir, 'codex') } };
    });
    if (seats) queries.push({ harnesses: ['claude-code'], homes: { claude_code: resolve(process.env.HOME ?? '', '.claude', 'projects') } });
    return { profiles, queries };
  }
  accepts(d: SessionDescriptor, worker: boolean, seat: boolean): boolean { return this.native ? worker || seat : d.locator.harness === 'hermes' || seat; }
}
