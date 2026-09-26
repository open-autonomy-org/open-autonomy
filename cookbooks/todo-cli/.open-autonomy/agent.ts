// The project's agent setup (docs/decisions/0007): `.open-autonomy/agent.json` declares each profile's
// Inference, jobs and Hermes-only settings; Volter Harness's applier renders them into the Hermes home before
// the gateway starts, through Hermes's own functions, owning each record by its Hermes id against a base
// kept beside the home. Content (the persona, skills, plugins, scripts) is copied from hermes/ as before.
//
//   readAgent(project)          the package, or null for a project still on the committed config
//   parseAgent(text, where)     the same checks over a setup read anywhere else
//   agentModels(setup)          every named model, for the start's Codex detection
//   applyAgent({...})           per profile: adopt the jobs a home already has (the seed hook's, once),
//                               provision a new home, then apply; returns the lines the start logs
//   agentHarness(setup)         the harness the owner picks: `hermes` (the default) runs itself; any other runs as
//                               Volter Harness's orchestrator's worker on the same home (ADR 0007, as amended)
//   renderWorkerForms(from, to) that target's content: the persona and skills in the workers' forms
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';

type Model = { provider?: string; model?: string; endpoint?: string; base_url?: string; credential?: string; placeholder_key?: string };
type Package = { schema_version: 1; inference?: { models?: Record<string, Model>; default?: string }; jobs?: Record<string, unknown>; extensions?: Record<string, { config?: Record<string, unknown> }> };
export type Setup = { harness?: string; profiles: Record<string, Package> };

const PROFILE = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export function readAgent(project: string): Setup | null {
  const file = resolve(project, '.open-autonomy', 'agent.json');
  return existsSync(file) ? parseAgent(readFileSync(file, 'utf8'), file) : null;
}

/** The setup from its text, wherever it was read (a checkout, origin/main, an executor): its profile names become paths. */
export function parseAgent(text: string, where: string): Setup {
  const setup = JSON.parse(text) as Setup;
  if (!setup?.profiles?.default) throw new Error(`${where}: a setup declares at least the default profile`);
  for (const name of Object.keys(setup.profiles)) if (!PROFILE.test(name)) throw new Error(`${where}: ${name} is not a Hermes profile name`);
  if (setup.harness !== undefined && !/^[a-z][a-z0-9-]{0,31}$/.test(String(setup.harness))) throw new Error(`${where}: harness ${JSON.stringify(setup.harness)} is not a harness id`);
  return setup;
}

export function agentHarness(setup: Setup | null): string {
  return setup?.harness ?? 'hermes';
}

/**
 * The persona and skills of hermes/ (at `from`) in the workers' forms, into the home at `to` and each of its
 * profiles (docs/plans/hermes-compat.md in Volter Harness, row 15): `SOUL.md` as `AGENTS.md`, with `SOUL.md` a link to
 * it; each skill, flat or under a category, as `.agents/skills/<name>/`, its copy under `skills/` removed. The kit's
 * rendering is mirrored: a skill it rendered last time and the checkout no longer has leaves (`.agents/skills/
 * .open-autonomy-rendered` names them). What the agent wrote itself stays; the orchestrator adopts it at load.
 */
export function renderWorkerForms(from: string, to: string): string[] {
  const lines: string[] = [];
  const pairs: Array<[string, string]> = [[from, to]];
  const profiles = resolve(from, 'profiles');
  if (existsSync(profiles)) for (const name of readdirSync(profiles)) if (lstatSync(resolve(profiles, name)).isDirectory()) pairs.push([resolve(profiles, name), resolve(to, 'profiles', name)]);
  for (const [src, home] of pairs) {
    mkdirSync(home, { recursive: true });
    const soul = resolve(src, 'SOUL.md');
    if (existsSync(soul)) {
      writeFileSync(resolve(home, 'AGENTS.md'), readFileSync(soul));
      rmSync(resolve(home, 'SOUL.md'), { force: true });
      symlinkSync('AGENTS.md', resolve(home, 'SOUL.md'));
    }
    const tree = resolve(src, 'skills');
    const shelf = resolve(home, '.agents', 'skills');
    const manifest = resolve(shelf, '.open-autonomy-rendered');
    const before: string[] = existsSync(manifest) ? readFileSync(manifest, 'utf8').split('\n').filter(Boolean) : [];
    const skills = existsSync(tree) ? skillDirs(tree) : [];
    const names = skills.map((dir) => basename(dir));
    // the workers' form is flat: two categories holding one name would be one skill there, so they refuse by name
    const twice = names.find((name, i) => names.indexOf(name) !== i);
    if (twice) throw new Error(`${relative(from, tree)} holds two skills named ${twice}; the workers' .agents/skills/ is flat, so rename one`);
    for (const name of before) if (!names.includes(name)) rmSync(resolve(shelf, name), { recursive: true, force: true });
    for (const dir of skills) {
      const rel = relative(tree, dir);
      rmSync(resolve(home, 'skills', rel), { recursive: true, force: true });
      const category = dirname(rel);
      if (category !== '.' && existsSync(resolve(home, 'skills', category)) && readdirSync(resolve(home, 'skills', category)).length === 0) rmSync(resolve(home, 'skills', category), { recursive: true, force: true });
      rmSync(resolve(shelf, basename(dir)), { recursive: true, force: true });
      cpSync(dir, resolve(shelf, basename(dir)), { recursive: true });
    }
    if (skills.length || before.length) {
      mkdirSync(shelf, { recursive: true });
      writeFileSync(manifest, names.length ? `${names.join('\n')}\n` : '');
    }
    lines.push(`${relative(to, home) || 'home'}: ${existsSync(soul) ? 'AGENTS.md from SOUL.md, ' : ''}${names.length} skill(s) under .agents/skills`);
  }
  return lines;
}

/** Every skill directory of a Hermes skills tree: `<name>/SKILL.md` or `<category>/<name>/SKILL.md`. */
function skillDirs(tree: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(tree)) {
    const dir = resolve(tree, entry);
    if (!lstatSync(dir).isDirectory()) continue;
    if (existsSync(resolve(dir, 'SKILL.md'))) { found.push(dir); continue; }
    for (const inner of readdirSync(dir)) if (existsSync(resolve(dir, inner, 'SKILL.md'))) found.push(resolve(dir, inner));
  }
  return found;
}

export function agentModels(setup: Setup | null): Model[] {
  return Object.values(setup?.profiles ?? {}).flatMap((p) => Object.values(p.inference?.models ?? {}));
}

/**
 * Apply every profile's package to its home. `homeOf(profile)` is the home the
 * door addresses (a container path when `container` is set); the applier's
 * state lives on the host under `stateRoot`, keyed `<homeId>.<profile>`.
 */
export async function applyAgent(options: {
  setup: Setup; homeOf: (profile: string) => string; homeId: string; stateRoot: string; workspace: string; container?: string;
  /** Bare mode's privilege drop (setpriv): what Hermes writes into the home stays the agent's. */
  asAgent?: string[];
}): Promise<string[]> {
  const applier = await import('@volter-ai-dev/supercode-orchestrator/apply');
  const doors = await import('@volter-ai-dev/supercode-orchestrator/apply/doors');
  const lines: string[] = [];
  const harness = agentHarness(options.setup);
  for (const [profile, declared] of Object.entries(options.setup.profiles)) {
    // another harness than Hermes is each profile's worker: the orchestrator's `worker:` key, which Hermes keeps
    const spec: Package = harness === 'hermes' ? declared : { ...declared, extensions: { ...declared.extensions, hermes: { ...declared.extensions?.hermes, config: { ...declared.extensions?.hermes?.config, 'worker.harness': harness } } } };
    const home = options.homeOf(profile);
    // a named profile's home is made by its content (hermes/profiles/<name>/, copied in before this); Hermes's cron
    // never makes one, so a declared profile without it is said here, not as Hermes's missing cron directory
    if (!options.container && !existsSync(home)) throw new Error(`the ${profile} profile has no home at ${home}: give it content under hermes/profiles/${profile}/ (its SOUL.md)`);
    const door = options.container
      ? doors.hermesDoor({ home, runner: doors.containerRunner({ container: options.container }) })
      : doors.hermesDoor({ home, ...doors.locateHermes(), prefix: options.asAgent ?? [] });
    const homeId = `${options.homeId}.${profile}`.replace(/[^A-Za-z0-9._-]/g, '_');
    const common = { door, homeId, root: options.stateRoot };
    const params = { workspace: options.workspace };
    const first = await applier.plan({ ...common, spec: spec as never, params });
    if (first.planOnly) {
      // A home the applier has never seen: the jobs it already carries under a declared key (the seed hook
      // made them before this layout) are adopted, once, the runtime's own act; the rest is provisioned.
      const keys = first.rows.filter((r: { action: string }) => r.action === 'unowned').map((r: { key: string }) => r.key);
      if (keys.length) for (const r of await applier.adopt({ ...common, keys })) lines.push(`${profile}: ${r.key} ${r.action}${r.detail ? ` (${r.detail})` : ''}`);
      applier.provision({ homeId, root: options.stateRoot });
    }
    const done = await applier.apply({ ...common, spec: spec as never, params });
    type Row = { key: string; action: string; detail?: string };
    const line = (r: Row) => `${profile}: ${r.key} ${r.action}${r.detail ? ` (${r.detail})` : ''}`;
    // every act, and every row apply reports rather than does (a conflict to capture back, a refusal to fix): only
    // a converged row goes unsaid, and the acts' own rows are said once, by what they did
    const acted = new Set(done.applied.map((r: Row) => r.key));
    for (const r of done.applied as Row[]) lines.push(line(r));
    for (const r of done.rows as Row[]) if (r.action !== 'stamp' && !acted.has(r.key) && !['act', 'create'].includes(r.action)) lines.push(line(r));
    // a model that did not land is a gateway on Hermes's default: the start stops rather than run it
    const unrendered = [...done.rows, ...done.applied].filter((r: Row) => r.key.startsWith('inference') && ['refused', 'not-applied', 'plan-only'].includes(r.action));
    if (unrendered.length) throw new Error(`the ${profile} profile's Inference was not applied: ${unrendered.map(line).join('; ')}`);
  }
  return lines;
}
