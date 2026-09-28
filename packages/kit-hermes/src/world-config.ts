// The World definitions the kit writes (the executor's runtime, its image build, a fleet): one external
// service whose lifecycle World runs, in World's format 2 (@volter/world-runtime).

export type ExternalService = { id: string; cwd?: string; up: string[]; status: string[]; down: string[] };

export function worldConfig(opts: { id: string; description: string; env: Record<string, string>; strip?: string[]; service: ExternalService }) {
  const { id, cwd, up, status, down } = opts.service;
  return {
    schemaVersion: 2,
    metadata: { id: opts.id, description: opts.description },
    runtime: { environment: { values: opts.env, ...(opts.strip ? { strip: opts.strip } : {}) } },
    services: [{ id, type: 'external', execution: { lifecycle: { up, status, down }, ...(cwd ? { cwd } : {}) } }],
  };
}
