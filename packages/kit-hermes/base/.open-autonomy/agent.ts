// The project's agent setup (docs/decisions/0007): `.open-autonomy/agent.json` declares each profile's
// Inference, jobs and Hermes-only settings; Supercode's applier renders them into the Hermes home before
// the gateway starts, through Hermes's own functions, owning each record by its Hermes id against a base
// kept beside the home. Content (the persona, skills, plugins, scripts) is copied from hermes/ as before.
//
//   readAgent(project)          the package, or null for a project still on the committed config
//   parseAgent(text, where)     the same checks over a setup read anywhere else
//   agentModels(setup)          every named model, for the start's Codex detection
//   applyAgent({...})           per profile: adopt the jobs a home already has (the seed hook's, once),
//                               provision a new home, then apply; returns the lines the start logs
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Package = { schema_version: 1; inference?: { models?: Record<string, { provider?: string }> }; jobs?: Record<string, unknown> };
export type Setup = { profiles: Record<string, Package> };

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
  return setup;
}

export function agentModels(setup: Setup | null): Array<{ provider?: string }> {
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
  for (const [profile, spec] of Object.entries(options.setup.profiles)) {
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
