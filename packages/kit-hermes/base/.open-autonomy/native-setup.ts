// The bounded native setup mapping in ADR 0026. Native codecs/jobs and applier ownership remain external.
import type { SupercodeHarnessClient } from '@volter/supercode-harness-sdk';
import { harnessSdkModule, orchestratorModule, supercodeBin } from './machine-supercode.ts';
// the machine's harness SDK (machine-supercode.ts)
const { SupercodeHarnessClient: HarnessClient } = await import(harnessSdkModule());
import type { Package, Setup } from './agent.ts';
import { profileHarness } from './agent.ts';
import { NativeRuntime, type NativeProfile } from './native-runtime.ts';
import { redactSecrets } from './sdk/redaction.ts';

type Unit = Record<string, unknown>;
type ConfigUnit = { values?: Unit; error?: string };
// The published 0.5.47 declarations expose only target. These methods/units are its audited public JS door.
type NativeJobDoor = {
  target: 'orchestrator';
  list(): Promise<Array<{ name: string | null; managed: Record<string, unknown> }>>;
  fields(spec: unknown, inference: unknown): Record<string, unknown>;
  differs(want: Record<string, unknown>, live: Record<string, unknown>): string[];
};
// The typed worker fields the native runtime reads (supercode interchange WorkerSpec; ADR 0030): harness, cwd (activation
// cwd), home (user: the user's own Claude home), surface (the board's pane sessions) and reasoning_effort (Codex lanes).
const WORKER = new Set(['worker.harness', 'worker.cwd', 'worker.home', 'worker.surface', 'worker.reasoning_effort']);
// The codec omits a typed field at its default when it saves, so a field read back absent is that default.
const WORKER_DEFAULT: Record<string, unknown> = { 'worker.cwd': '.', 'worker.home': 'profile', 'worker.surface': 'headless' };
// memory.memory_enabled is config residue: the agent home's config.yaml, read by the memory snapshot and memory tool.
const SETTINGS = new Set([...WORKER, 'agent.max_turns', 'approvals.mode', 'memory.memory_enabled']);
// The worker fields a harness service that does not advertise `orchestration.worker_fields` writes on a save (supercode
// encode_config before it wrote reasoning_effort, d9c92add1): a field outside them reads back absent after a save.
const UNADVERTISED_WORKER_FIELDS = ['harness', 'model', 'preset', 'cwd', 'home', 'surface', 'capacity', 'env', 'permission'];
// Settings whose native consumer is reviewed only for the Claude Code and Codex workers.
const WORKER_ONLY = ['agent.max_turns', 'approvals.mode', 'worker.home', 'worker.surface', 'worker.reasoning_effort'];
// The pinned applier can pause a new create, but lacks complete reviewed declarative enabled reconciliation.
const JOB_FIELDS = new Set(['schedule', 'prompt', 'skills', 'deliver', 'attach_to_session', 'model', 'workdir', 'repeat', 'script', 'no_agent', 'monitor_script', 'monitor_url', 'context_from']);
const UPDATABLE = new Set(['schedule', 'prompt', 'deliver', 'attach_to_session', 'model', 'workdir', 'script', 'no_agent', 'monitor_script', 'monitor_url']);
const CONFIG = new Set(['model.default', 'model.provider', 'model.base_url', 'model.api_key', 'model.api_mode', ...SETTINGS]);
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const reservedJob = (key: unknown) => typeof key === 'string' && /^(inference|setting)\./.test(key);
function checkJobNames(spec: Package, name: string): void {
  // The owning applier reserves these prefixes to classify config rows, even when they are legal job names.
  const operations = spec as Package & { moved?: Array<{ from?: string; to?: string }>; removed?: Array<{ key?: string }> };
  if (Object.keys(spec.jobs ?? {}).some(reservedJob) || (operations.moved ?? []).some(move => reservedJob(move.from) || reservedJob(move.to)) || (operations.removed ?? []).some(remove => reservedJob(remove.key)))
    throw new Error(`${name}: inference.* and setting.* job names/moves/removals are unsupported by the pinned native applier`);
}
const read = (profile: NativeProfile, key: string): unknown => {
  if (!CONFIG.has(key)) throw new Error(`Native setting ${key} has no supported mapping`);
  if (WORKER.has(key)) return profile.worker ? (profile.worker as Record<string, unknown>)[key.slice('worker.'.length)] ?? WORKER_DEFAULT[key] ?? null : null;
  const [parent, child] = key.split('.');
  const value = profile.residue?.config?.[parent];
  if (value !== undefined && !object(value)) throw new Error(`Native ${parent} is not an object; refusing to replace unmanaged residue`);
  return value?.[child] ?? null;
};
/** `harness` is the profile's declared worker: a missing worker is created as that harness's, never as another's. */
function patch(profile: NativeProfile, values: Unit, harness: string): void {
  profile.residue ??= { config: {} };
  profile.residue.config ??= {};
  // the harness first, so a worker field never makes a worker of the wrong harness
  for (const [key, value] of Object.entries(values).sort(([a], [b]) => Number(b === 'worker.harness') - Number(a === 'worker.harness'))) {
    read(profile, key); // validates the exact mapping and existing container before changing anything
    if (WORKER.has(key)) {
      profile.worker ??= { harness };
      if (key === 'worker.harness') profile.worker.harness = String(value);
      else (profile.worker as Record<string, unknown>)[key.slice('worker.'.length)] = value;
    } else {
      const [parent, child] = key.split('.');
      profile.residue.config[parent] ??= {};
      profile.residue.config[parent][child] = value;
    }
  }
}

/** `written` is the worker fields this machine's supercode saves; a declared worker field outside them is withheld from
 *  the applier (never applied, never stamped) and pushed onto `withheld`, for the start to say. */
function nativeSpec(setup: Setup, name: string, raw: Package, written: Set<string>, withheld: Array<[string, unknown]>): Package {
  for (const key of Object.keys(raw)) if (!['schema_version', 'parameters', 'inference', 'jobs', 'extensions', 'moved', 'removed'].includes(key)) throw new Error(`${name}: unsupported native declaration ${key}`);
  const spec = structuredClone(raw);
  checkJobNames(spec, name);
  for (const ext of Object.keys(spec.extensions ?? {})) if (!['hermes', 'orchestrator'].includes(ext)) throw new Error(`${name}: unsupported native extension ${ext}`);
  const old = spec.extensions?.hermes?.config ?? {};
  const native = spec.extensions?.orchestrator?.config ?? {};
  const settings: Unit = { ...old, ...native, 'worker.harness': profileHarness(setup, name) };
  for (const [key, value] of Object.entries(old)) if (key in native && !same(value, native[key])) throw new Error(`${name}: conflicting native and legacy declaration for ${key}`);
  for (const [key, value] of Object.entries(settings)) {
    if (!SETTINGS.has(key)) throw new Error(`${name}: native runtime does not implement ${key}`);
    if (key === 'agent.max_turns' && !(typeof value === 'number' && Number.isSafeInteger(value) && value > 0)) throw new Error(`${name}: agent.max_turns must be a positive safe integer`);
    if (key === 'approvals.mode' && !['off', 'manual'].includes(String(value))) throw new Error(`${name}: approvals.mode is off or manual`);
    if (key === 'worker.harness' && !/^[a-z][a-z0-9-]{0,31}$/.test(String(value))) throw new Error(`${name}: invalid native worker harness`);
    // as the codec decodes it (decode_worker): a relative path inside the profile, no leading / and no .. segment
    if (key === 'worker.cwd' && !(typeof value === 'string' && value.trim() && !value.startsWith('/') && !value.split('/').includes('..'))) throw new Error(`${name}: worker.cwd must be a relative path inside the profile folder (no leading / and no .. segment), not ${JSON.stringify(value)}`);
    if (key === 'worker.home' && !['profile', 'user'].includes(String(value))) throw new Error(`${name}: worker.home is profile or user`);
    if (key === 'worker.surface' && !['headless', 'pane'].includes(String(value))) throw new Error(`${name}: worker.surface is headless or pane`);
    if (key === 'worker.reasoning_effort' && !(typeof value === 'string' && /^[a-z]{1,16}$/.test(value))) throw new Error(`${name}: worker.reasoning_effort is one lowercase effort word (high, xhigh, ...)`);
    if (key === 'memory.memory_enabled' && typeof value !== 'boolean') throw new Error(`${name}: memory.memory_enabled is true or false`);
  }
  const harness = String(settings['worker.harness']);
  const reviewed = WORKER_ONLY.filter(key => key in settings);
  if (!['claude-code', 'codex'].includes(harness) && (reviewed.length || spec.inference)) throw new Error(`${name}: ${harness} has no reviewed route/limit/policy mapping in this native adapter${reviewed.length ? ` (${reviewed.join(', ')})` : ''}`);
  // The native runtime runs only Claude Code in the user's own home (activation USER_HOME_HARNESSES) and passes an effort
  // only to Codex (board dispatch `model_reasoning_effort`): a declaration another worker would ignore or refuse at launch.
  if (settings['worker.home'] === 'user' && harness !== 'claude-code') throw new Error(`${name}: worker.home user runs only a Claude Code worker natively, not ${harness}`);
  if ('worker.reasoning_effort' in settings && harness !== 'codex') throw new Error(`${name}: worker.reasoning_effort reaches only a Codex worker natively, not ${harness}`);
  const inference = spec.inference;
  if (inference) {
    for (const key of Object.keys(inference)) if (!['models', 'default', 'unattended'].includes(key)) throw new Error(`${name}: native inference does not implement ${key}`);
    if (!inference.default || !inference.models?.[inference.default]) throw new Error(`${name}: native inference requires a named default model`);
    const baseline = inference.models[inference.default];
    if (!baseline.model || typeof baseline.model !== 'string') throw new Error(`${name}: model must be a nonempty string`);
    // A Claude Code model naming no provider, no endpoint and the harness's own login (ADR 0009, `credential:
    // harness-login`) is the anthropic route on that login, derived here (ADR 0030). Natively that login is the user's
    // home with no provider (worker.home user, as the applier writes it) or, in the profile's home, provider anthropic
    // (worker-route ownLogin); the declaration is materialized as the one its worker home needs.
    const login = (m: any) => harness === 'claude-code' && m.provider === undefined && m.credential === 'harness-login' && !m.endpoint && !m.base_url && !m.placeholder_key;
    if (login(baseline) && settings['worker.home'] !== 'user') for (const model of Object.values(inference.models ?? {}) as any[]) if (login(model)) model.provider = 'anthropic';
    const provider = baseline.provider ?? (login(baseline) ? 'anthropic' : undefined);
    const providers = harness === 'claude-code' ? ['custom', 'anthropic'] : ['custom', 'openai', 'openai-codex'];
    if (!providers.includes(provider ?? '')) throw new Error(`${name}: unsupported ${harness} provider ${provider}${provider === undefined && harness === 'claude-code' ? ' (a Claude Code model names provider custom with its endpoint, provider anthropic, or the harness\'s own login: credential harness-login and no endpoint)' : ''}`);
    if (baseline.api_mode && baseline.api_mode !== (harness === 'claude-code' ? 'anthropic_messages' : 'responses')) throw new Error(`${name}: ${harness} does not implement declared API mode ${baseline.api_mode}`);
    const route = (m: any) => [m.provider ?? '', m.endpoint ?? null, m.base_url ?? null, m.credential ?? null, m.placeholder_key ?? null, m.api_mode ?? null];
    for (const [key, model] of Object.entries(inference.models ?? {})) {
      for (const field of Object.keys(model)) if (!['provider', 'model', 'endpoint', 'base_url', 'credential', 'placeholder_key', 'api_mode'].includes(field)) throw new Error(`${name}: model ${key} has unsupported field ${field}`);
      if (!model.model || typeof model.model !== 'string') throw new Error(`${name}: model ${key} is not a nonempty string`);
      if (!same(route(model), route(baseline))) throw new Error(`${name}: model ${key} requires a different native provider/endpoint/credential/API route`);
    }
    if (inference.unattended) {
      if (!inference.models[inference.unattended]) throw new Error(`${name}: unattended names an undeclared model`);
      for (const job of Object.values(spec.jobs ?? {})) if (object(job) && job.model === undefined && job.no_agent !== true) job.model = inference.unattended;
      delete inference.unattended; // native job model above, never an unused Hermes cron field
    }
  }
  for (const [key, job] of Object.entries(spec.jobs ?? {})) {
    if (!object(job)) throw new Error(`${name}: job ${key} must be an object`);
    for (const field of Object.keys(job)) if (!JOB_FIELDS.has(field)) throw new Error(`${name}: native job ${key} does not implement ${field}`);
  }
  // The external applier owns its unit/base comparison; only these reviewed mappings enter its config units.
  for (const key of Object.keys(settings)) if (WORKER.has(key) && !written.has(key.slice('worker.'.length))) { withheld.push([key, settings[key]]); delete settings[key]; }
  spec.extensions = { hermes: { config: settings } };
  return spec;
}

function effective(profile: NativeProfile, spec: Package, units: Array<{ values?: Unit; error?: string }>, name: string): void {
  for (const unit of units) if (unit.error) throw new Error(`${name}: ${unit.error}`);
  const want = Object.assign({}, ...units.map(u => u.values ?? {}));
  for (const key of Object.keys(want)) read(profile, key);
  // The native Claude Code route refuses provider anthropic without an endpoint for a worker in the user's home
  // (worker-route claudeRoute): that worker already runs on the user's own login, declared with no provider.
  const home = want['worker.home'] ?? read(profile, 'worker.home');
  const harness = want['worker.harness'] ?? read(profile, 'worker.harness');
  if (('model.provider' in want || 'worker.home' in want) && harness === 'claude-code' && home === 'user' && (want['model.provider'] ?? read(profile, 'model.provider')) === 'anthropic' && !(want['model.base_url'] ?? read(profile, 'model.base_url')))
    throw new Error(`${name}: a Claude Code worker in the user's home (worker.home user) runs on that user's own login with no provider; the native route refuses provider anthropic without an endpoint there (a harness-login model with worker.home user declared is written with none)`);
  const defaultModel = want['model.default'];
  if (defaultModel !== undefined && profile.worker?.model && profile.worker.model !== defaultModel) throw new Error(`${name}: unmanaged worker.model overrides the declared default model`);
  if (spec.inference) for (const key of ['model.base_url', 'model.api_key', 'model.api_mode']) if (!(key in want) && read(profile, key) !== null) throw new Error(`${name}: unmanaged ${key} changes the declared native route`);
  const permission = profile.worker?.permission;
  if ('approvals.mode' in want && permission) {
    // This adapter does not own custom prompt timeouts/defaults or unattended authority.
    if ((permission.timeout_seconds ?? 300) !== 300 || (permission.default ?? 'deny') !== 'deny' || (permission.unattended ?? 'deny') !== 'deny') throw new Error(`${name}: custom worker.permission conflicts with the adapter's launch-policy mapping`);
  }
}

/** What the live profile holds, undeclared, that the native runtime refuses at launch: said, never refused here (the
 *  start did not fail on it before, and it is not this declaration's to change). */
function liveWarnings(profile: NativeProfile, units: ConfigUnit[], name: string): string[] {
  const want = Object.assign({}, ...units.map(u => u.values ?? {}));
  const harness = want['worker.harness'] ?? read(profile, 'worker.harness');
  if ('worker.home' in want || read(profile, 'worker.home') !== 'user' || harness === 'claude-code') return [];
  return [`warning: ${name}'s live worker is ${harness} with worker.home user, which agent.json does not declare; the native runtime runs only Claude Code in the user's home, so its conversation and headless launches will refuse it (clear worker.home in that profile's config.yaml)`];
}

type NodeRequest = { operation: 'validate'; profile: NativeProfile; args: Unit; now: string }
  | { operation: 'create' | 'update' | 'pause' | 'remove'; root: string; profile: string; args: unknown[] };
type NativeSafety = { blocked?: string };
function requireEffects(safety: NativeSafety): void { if (safety.blocked) throw new Error(safety.blocked); }
async function nativeNodeCall(request: NodeRequest, workspace: string, safety: NativeSafety, prefix: string[] = []): Promise<unknown> {
  requireEffects(safety);
  // The owning exports/cold job CLI require Node. Keep their validation, effects and readback on that runtime.
  const moduleUrl = orchestratorModule();
  const sdkUrl = harnessSdkModule();
  const program = `import { readFileSync } from 'node:fs';
let client;
try { const owner = await import(process.argv[1]); const request = JSON.parse(readFileSync(0, 'utf8')); let result;
if(request.operation === 'validate') owner.buildJob(request.profile, request.args, request.now);
else { if(!['create','update','pause','remove'].includes(request.operation)) throw Error('Unsupported native job operation');
const { SupercodeHarnessClient } = await import(process.argv[2]);
client = new SupercodeHarnessClient({command:process.env.SUPERCODE_BIN,args:['harness','serve']});
const door = await owner.orchestratorDoor({root:request.root,profile:request.profile,
load:async()=>({state:(await client.orchestrationLoad({root:request.root,flavor:'orchestrator'})).orchestration})});
result = await door[request.operation](...request.args); }
process.stdout.write(JSON.stringify({ok:true,result})); }
catch(error) { process.stdout.write(JSON.stringify({ok:false,message:String(error.message).slice(0,2048)})); process.exitCode=1; }
finally { await client?.close(); }`;
  const child = (() => {
    try { return Bun.spawn({ cmd: [...prefix, 'node', '--input-type=module', '-e', program, moduleUrl, sdkUrl], cwd: workspace,
      env: { ...process.env, SUPERCODE_BIN: supercodeBin() },
      detached: true, stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' }); }
    catch (error) { if (request.operation !== 'validate') safety.blocked = 'Native job transport unavailable; no further effects allowed'; throw error; }
  })();
  let interrupted = false, expired = false, settled = false, terminating = false, killTimer: ReturnType<typeof setTimeout> | undefined;
  const signalOwned = (signal: 'SIGTERM' | 'SIGKILL') => {
    try { process.kill(-child.pid, signal); } catch { try { child.kill(signal); } catch { /* already exited */ } }
  };
  const terminate = () => {
    terminating = true;
    signalOwned('SIGTERM');
    killTimer ??= setTimeout(() => signalOwned('SIGKILL'), 5000);
  };
  const interrupt = () => { interrupted = true; safety.blocked = 'Native setup cancelled; no further effects allowed; retained intents require owning readback'; terminate(); };
  const timeout = setTimeout(() => { expired = true; safety.blocked = 'Native setup timed out; no further effects allowed; retained intents require owning readback'; terminate(); }, 60_000);
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) process.on(signal, interrupt);
  const outcome = request.operation === 'validate' ? 'no setup effects applied' : 'job outcome may be uncertain; retained applier intent/state requires owning readback';
  try {
    child.stdin.write(JSON.stringify(request)); child.stdin.end();
    const [code, stdout] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
    settled = true;
    if (interrupted || expired) throw new Error(`Native job ${request.operation} ${expired ? 'timed out' : 'was cancelled'}; ${outcome}`);
    let reply: { ok?: boolean; result?: unknown; message?: string };
    try { reply = JSON.parse(stdout); } catch { throw new Error(`Native job ${request.operation} exited ${code} without its response; ${outcome}`); }
    if (code !== 0 || reply.ok !== true) throw new Error(`Owning native job ${request.operation} refused: ${redactSecrets(reply.message ?? `exit ${code}`)}; ${outcome}`);
    return reply.result;
  } catch (error) {
    if (request.operation !== 'validate') safety.blocked ??= 'Native job outcome uncertain/refused; no further effects allowed; retained intents require owning readback';
    throw error;
  } finally {
    if (!settled) { terminate(); await child.exited; }
    // A direct Node exit does not prove its SDK/CLI descendants exited; finish the owned group before disarming cleanup.
    if (terminating) signalOwned('SIGKILL');
    clearTimeout(timeout); clearTimeout(killTimer);
    for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) process.off(signal, interrupt);
  }
}

export async function applyNative(options: { setup: Setup; root: string; homeId: string; stateRoot: string; workspace: string; asAgent?: string[] }): Promise<string[]> {
  const safety: NativeSafety = {};
  const applier = await import(orchestratorModule('./apply'));
  const { orchestratorDoor } = await import(orchestratorModule('./apply/doors'));
  const command = [...(options.asAgent ?? []), supercodeBin(), 'harness', 'serve'];
  const sc = new HarnessClient({ command: command[0], args: command.slice(1) });
  const notices: string[] = [];
  const runtime = new NativeRuntime({ kind: 'orchestrator', root: options.root }, sc);
  type Row = { key: string; action: string; detail?: string; differs?: string[]; patch?: Unit };
  try {
    // Which worker fields this machine's supercode saves: its harness service's own answer (`orchestration.worker_fields`,
    // supercode d9c92add1 and later), else what every earlier service writes.
    const advertised = ((await sc.capabilities()) as { orchestration?: { worker_fields?: unknown } }).orchestration?.worker_fields;
    const written = new Set(Array.isArray(advertised) ? advertised.map(String) : UNADVERTISED_WORKER_FIELDS);
    const prepared = [];
    // Every profile and operation is preflighted before any native write or job effect.
    for (const [name, raw] of Object.entries(options.setup.profiles)) {
      const withheld: Array<[string, unknown]> = [];
      const spec = applier.validate(applier.resolveParameters(nativeSpec(options.setup, name, raw, written, withheld) as never, { workspace: options.workspace })) as Package;
      checkJobNames(spec, name); // aliases in moved/removed must be checked after owning parameter resolution, too
      const units = applier.hermesConfig(spec as never) as unknown as ConfigUnit[];
      const get = async () => {
        const result = await runtime.load();
        const profile = result.profiles[name];
        if (!profile) throw new Error(`${name}: native profile is missing; give it content under home/profiles/${name}`);
        return { ...result, profile };
      };
      const current = (await get()).profile;
      effective(current, spec, units, name);
      for (const [key, value] of withheld) notices.push(same(read(current, key), value)
        ? `${key} ${value} is declared for ${name} and is in its config.yaml, but this machine's supercode does not save it yet, so it is left as it is, not applied here, and the next save of this profile drops it; update supercode`
        : `${key} ${value} is declared for ${name}; this machine's supercode does not save it yet, so it is not applied; update supercode`);
      notices.push(...liveWarnings(current, units, name));
      const door = Object.assign(await orchestratorDoor({ root: options.root, profile: name, load: async () => ({ state: (await runtime.load()).orchestration }) }) as NativeJobDoor, {
        create: (key: string, want: Unit) => nativeNodeCall({ operation: 'create', root: options.root, profile: name, args: [key, want] }, options.workspace, safety, options.asAgent),
        update: (id: string, values: Unit) => nativeNodeCall({ operation: 'update', root: options.root, profile: name, args: [id, values] }, options.workspace, safety, options.asAgent),
        pause: (id: string) => nativeNodeCall({ operation: 'pause', root: options.root, profile: name, args: [id] }, options.workspace, safety, options.asAgent),
        remove: (id: string) => nativeNodeCall({ operation: 'remove', root: options.root, profile: name, args: [id] }, options.workspace, safety, options.asAgent),
        readInference: async (keys: string[]) => { const { profile } = await get(); return Object.fromEntries(keys.map(key => [key, read(profile, key)])); },
        writeInference: async (values: Unit) => {
          requireEffects(safety);
          const loaded = await get(); requireEffects(safety); effective(loaded.profile, spec, units, name); patch(loaded.profile, values, profileHarness(options.setup, name));
          requireEffects(safety);
          await sc.orchestrationSave({ root: options.root, orchestration: loaded.orchestration });
        },
      });
      const homeId = `${options.homeId}.${name}`.replace(/[^A-Za-z0-9._-]/g, '_');
      const common = { door, homeId, root: options.stateRoot, spec: spec as never };
      const first = await applier.plan(common);
      const preview = structuredClone((await get()).profile);
      patch(preview, Object.assign({}, ...units.map(unit => unit.values ?? {})), profileHarness(options.setup, name));
      for (const [key, job] of Object.entries(spec.jobs ?? {})) {
        const args = door.fields(job, spec.inference);
        await nativeNodeCall({ operation: 'validate', profile: preview, args: { ...args, name: key }, now: new Date().toISOString() }, options.workspace, safety); // pure owning validation before any config/job effect
      }
      const bad = first.rows.filter((row: Row) => ['refused', 'conflict', 'not-applied'].includes(row.action));
      if (bad.length) throw new Error(`${name}: native setup preflight refused: ${bad.map((r: Row) => `${r.key} ${r.action}${r.detail ? ` (${r.detail})` : ''}`).join('; ')}`);
      const live = await door.list();
      for (const row of first.rows as Row[]) if (row.action === 'unowned') {
        const carriers = live.filter(record => record.name === row.key);
        if (carriers.length !== 1) throw new Error(`${name}: native job ${row.key} has ambiguous adoption`);
        const want = door.fields(spec.jobs![row.key], spec.inference);
        const unsupported = door.differs(want, carriers[0].managed).filter((key: string) => !UPDATABLE.has(key));
        if (unsupported.length) throw new Error(`${name}: adopting native job ${row.key} would require unsupported update ${unsupported.join(', ')}`);
      }
      // Job act rows carry a patch; config act rows carry values. Never classify an operation by its name.
      for (const row of first.rows as Row[]) if (row.action === 'act' && row.patch !== undefined) {
        const fields = row.differs ?? Object.keys(row.patch ?? {});
        const unsupported = fields.filter(key => !UPDATABLE.has(key));
        if (unsupported.length) throw new Error(`${name}: native jobs.update cannot change ${unsupported.join(', ')}`);
      }
      prepared.push({ name, common, first });
    }
    const lines: string[] = [];
    for (const { name, common, first } of prepared) {
      if (first.planOnly) {
        const keys = first.rows.filter((row: Row) => row.action === 'unowned').map((row: Row) => row.key);
        if (keys.length) for (const row of await applier.adopt({ ...common, keys })) lines.push(`${name}: ${row.key} ${row.action}`);
        applier.provision({ homeId: common.homeId, root: common.root });
      }
      const done = await applier.apply(common);
      const rows = [...done.rows, ...done.applied] as Row[];
      const refused = rows.filter(row => ['refused', 'conflict', 'not-applied', 'plan-only'].includes(row.action));
      if (refused.length) throw new Error(`${name}: native setup did not apply: ${refused.map(row => `${row.key} ${row.action}${row.detail ? ` (${row.detail})` : ''}`).join('; ')}`);
      for (const row of done.applied) lines.push(`${name}: ${row.key} ${row.action}`);
    }
    return [...notices, ...lines];
  } finally { await sc.close(); }
}
