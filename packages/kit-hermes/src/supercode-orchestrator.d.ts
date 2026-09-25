// Types for the two entry points of @volter-ai-dev/supercode-orchestrator that `.open-autonomy/agent.ts` imports. The
// package (0.3.13) declares types for its root export only; `./apply` and `./apply/doors` ship as plain .mjs, so this
// check declares what agent.ts uses, as the package's sources (sdk/orchestrator/apply/*.mjs) define it.
declare module '@volter-ai-dev/supercode-orchestrator/apply' {
  import type { Door } from '@volter-ai-dev/supercode-orchestrator/apply/doors';
  export type Row = { key: string; action: string; detail?: string };
  type Target = { door: Door; homeId: string; root?: string };
  export type Plan = { homeId: string; planOnly: boolean; rows: Row[]; hash: string };
  export function plan(options: Target & { spec: unknown; params?: Record<string, unknown> }): Promise<Plan>;
  export function apply(options: Target & { spec: unknown; params?: Record<string, unknown>; planHash?: string | null; reviewedPlan?: boolean }): Promise<Plan & { applied: Row[] }>;
  export function adopt(options: Target & { keys: string[] }): Promise<Row[]>;
  export function provision(options: { homeId: string; root?: string }): void;
}

declare module '@volter-ai-dev/supercode-orchestrator/apply/doors' {
  export type Runner = unknown;
  export type Door = { target: string; list(): Promise<unknown[]>; readInference?(keys: string[]): Promise<Record<string, unknown>> };
  export function locateHermes(options?: { python?: string | null; source?: string | null; env?: Record<string, string | undefined> }): { python: string; source: string };
  export function containerRunner(options: { container: string; user?: string; python?: string; source?: string; docker?: string }): Runner;
  export function hermesDoor(options: { home: string; python?: string | null; source?: string | null; runner?: Runner | null; prefix?: string[] }): Door;
}
