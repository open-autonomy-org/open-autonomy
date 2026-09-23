// The layout change of docs/decisions/0007: a project made before `.open-autonomy/agent.json` carries its
// agent setup as Hermes's own files — hermes/config.yaml, the treasurer's, hermes/cron/jobs.seed.json — and
// the seed hook that turned them into jobs. The upgrade derives the package from the project's own files, so
// its choices (a Codex model, a Discord binding, a changed schedule) are kept, and retires those files.
//
//   legacyAgent(dir)   the derived setup, or null when the project already has one or has nothing to derive
//   LEGACY_FILES       what the upgrade retires once the setup is derived
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const LEGACY_FILES = [
  'hermes/config.yaml',
  'hermes/profiles/treasurer/config.yaml',
  'hermes/cron/jobs.seed.json',
  'hermes/hooks/seed/HOOK.yaml',
  'hermes/hooks/seed/handler.py',
];

type Json = Record<string, unknown>;

/** A Hermes schedule string the seed hook passed through, as a declared schedule. */
function schedule(text: string): Json {
  const s = String(text).trim();
  const every = /^every\s+(\d+)\s*([mhd])$/i.exec(s);
  if (every) return { kind: 'interval', minutes: Number(every[1]) * ({ m: 1, h: 60, d: 1440 } as Record<string, number>)[every[2].toLowerCase()] };
  if (/^(\S+\s+){4}\S+$/.test(s)) return { kind: 'cron', expr: s };
  if (!Number.isNaN(Date.parse(s))) return { kind: 'once', run_at: s };
  throw new Error(`jobs.seed.json: schedule ${JSON.stringify(text)} is not one this migration reads (every N[m|h|d], five-field cron, or an instant)`);
}

/** `${NAME}` as the custody name NAME, or null for anything else. */
const custody = (v: unknown): string | null => (typeof v === 'string' ? /^\$\{([A-Z][A-Z0-9_]*)\}$/.exec(v.trim())?.[1] ?? null : null);

/** Every non-model key of a Hermes config as dotted names: mappings flatten, lists and scalars are values. */
function flatten(tree: Json, prefix = '', out: Json = {}): Json {
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length) flatten(v as Json, key, out);
    else out[key] = v;
  }
  return out;
}

/** One profile's package from its config.yaml (and the default profile's jobs from the seed). */
function profilePackage(config: Json, seed: Json[] | null, workspace: boolean): Json {
  const model = (config.model ?? {}) as Json;
  const route: Json = typeof model === 'string' ? { model } : {
    provider: model.provider ?? undefined,
    model: model.default ?? undefined,
    ...(custody(model.base_url) ? { endpoint: custody(model.base_url) } : model.base_url ? { base_url: model.base_url } : {}),
    ...(custody(model.api_key) ? { credential: custody(model.api_key) } : model.api_key ? { placeholder_key: model.api_key } : {}),
    ...(model.api_mode ? { api_mode: model.api_mode } : {}),
  };
  const unknownModelKeys = typeof model === 'object' ? Object.keys(model).filter((k) => !['provider', 'default', 'base_url', 'api_key', 'api_mode'].includes(k)) : [];
  if (unknownModelKeys.length) throw new Error(`config.yaml: model.${unknownModelKeys.join(', model.')} has no place in the setup's named model; move it or drop it before upgrading`);
  const rest: Json = { ...config };
  delete rest.model;
  const settings = flatten(rest);
  const pkg: Json = { schema_version: 1 };
  if (workspace) pkg.parameters = { workspace: {} };
  // a provider without a model (a Hermes home that inherits) declares no route; the rest still applies
  if (route.model) pkg.inference = { models: { project: route }, default: 'project', ...(route.provider ? { unattended: 'project' } : {}) };
  if (Object.keys(settings).length) pkg.extensions = { hermes: { config: settings } };
  if (seed?.length) {
    const jobs: Json = {};
    for (const job of seed) {
      const name = String(job.name ?? '');
      if (!name) continue;
      const declared: Json = { schedule: schedule(String(job.schedule)) };
      for (const k of ['prompt', 'skills', 'deliver', 'script', 'no_agent', 'monitor_script', 'monitor_url', 'enabled_toolsets', 'context_from']) {
        if (job[k] !== undefined) declared[k === 'enabled_toolsets' ? 'toolsets' : k] = job[k];
      }
      // what the seed hook supplied from the running stack, declared: the route's model, the checkout
      if (!job.no_agent && route.model) declared.model = 'project';
      declared.workdir = '{{workspace}}';
      jobs[name] = declared;
    }
    pkg.jobs = jobs;
  }
  return pkg;
}

export function legacyAgent(dir: string): { profiles: Record<string, Json> } | null {
  if (existsSync(join(dir, '.open-autonomy', 'agent.json'))) return null;
  const main = join(dir, 'hermes', 'config.yaml');
  if (!existsSync(main)) return null;
  const read = (rel: string): Json => (Bun.YAML.parse(readFileSync(join(dir, rel), 'utf8')) ?? {}) as Json;
  const seedFile = join(dir, 'hermes', 'cron', 'jobs.seed.json');
  const seedJson = existsSync(seedFile) ? JSON.parse(readFileSync(seedFile, 'utf8')) : null;
  const seed = (Array.isArray(seedJson) ? seedJson : seedJson?.jobs ?? null) as Json[] | null;
  const profiles: Record<string, Json> = { default: profilePackage(read('hermes/config.yaml'), seed, Boolean(seed?.length)) };
  if (existsSync(join(dir, 'hermes', 'profiles', 'treasurer', 'config.yaml'))) profiles.treasurer = profilePackage(read('hermes/profiles/treasurer/config.yaml'), null, false);
  return { profiles };
}
