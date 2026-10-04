// The World definitions the kit writes (the executor's runtime, its image build, a fleet): external services whose
// lifecycle World runs, in World's format 2 (@volter/world-runtime). A project's runtime has two, the agent's executor
// and the treasurer's (docs/decisions/0021).

export type ExternalService = { id: string; cwd?: string; up: string[]; status: string[]; down: string[] };

export function worldConfig(opts: { id: string; description: string; env: Record<string, string>; strip?: string[]; service: ExternalService | ExternalService[] }) {
  return {
    schemaVersion: 2,
    metadata: { id: opts.id, description: opts.description },
    runtime: { environment: { values: opts.env, ...(opts.strip ? { strip: opts.strip } : {}) } },
    services: [opts.service].flat().map(({ id, cwd, up, status, down }) => ({ id, type: 'external', execution: { lifecycle: { up, status, down }, ...(cwd ? { cwd } : {}) } })),
  };
}
