// The hermes substrate's runner: drives Hermes' kanban kernel through its own CLI. Every verb of the core
// Runner contract has a native realization — nothing here is emulated:
//
//   launch  -> `kanban create --assignee <actor>`  (the kernel then dispatches it; a card id is the handle)
//   get     -> `kanban show <id> --json`
//   list    -> `kanban list --json`
//   update  -> `kanban block/unblock/complete`
//   cancel  -> `kanban reclaim` + `kanban archive`
//
// It talks to the CLI rather than opening kanban.db because the schema is Hermes' private business and
// the CLI is its published surface — the same choice the proving run made, for the same reason.
//
// A NOTE ON CANCEL, because it was recorded as "no native realization" first and that was wrong: the
// kanban TOOL surface has no cancel, which is true and irrelevant — the tool surface is what an AGENT may
// call, not what the substrate can do. `kanban reclaim` frees the card AND calls
// `_terminate_reclaimed_worker`. Proven against a real process: a worker's pid was alive while its card
// ran and gone after reclaim, with the card back to `ready`. Cancel being an operator/substrate verb
// rather than an agent-callable tool is the CORRECT shape, and it matches OA's own reading of the
// capability: cancel is authority over a run, not a move an agent makes.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LaunchParams, Runner, Session, SessionStatus } from '@open-autonomy/core';

/** Hermes' card statuses (kanban_db.VALID_STATUSES). */
type CardStatus = 'triage' | 'todo' | 'scheduled' | 'ready' | 'running' | 'blocked' | 'review' | 'done' | 'archived';

interface Card {
  id: string;
  title: string;
  body: string | null;
  assignee: string | null;
  status: CardStatus;
  workspace_kind?: string | null;
  branch_name?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
}

interface CardRun {
  id: string;
  profile: string | null;
  status: string | null;
  outcome: string | null;
  summary: string | null;
  metadata: unknown;
  worker_pid: number | null;
  started_at: string | null;
  ended_at: string | null;
}

/** The namespace an OA result envelope occupies inside a Hermes completion's metadata. It CANNOT be the
 *  metadata object itself: Hermes stamps its own `worker_session_id` into every completion's metadata, so
 *  an envelope declaring `additionalProperties: false` (both of hermes-sdlc's do, as does the standard
 *  `open-autonomy.review.v1`) is invalidated by the substrate's own bookkeeping. Discovered by running it. */
export const RESULT_NAMESPACE = 'open_autonomy';

// The marker that lets opaque LaunchParams round-trip through a card. The Runner contract says params are
// pass-through — the runner never interprets them — so they are stored WHOLE as JSON rather than mapped
// onto card fields (which would be interpretation, and would lose any param the mapping didn't anticipate).
const PARAMS_MARKER = '<!-- open-autonomy:params -->';

function encodeParams(agent: string, params: LaunchParams): string {
  return `Launched by open-autonomy for actor \`${agent}\`.\n\n${PARAMS_MARKER}\n\`\`\`json\n${JSON.stringify(params, null, 2)}\n\`\`\`\n`;
}

function decodeParams(body: string | null | undefined): LaunchParams | undefined {
  if (!body) return undefined;
  const at = body.indexOf(PARAMS_MARKER);
  if (at < 0) return undefined;
  const json = body.slice(at + PARAMS_MARKER.length).match(/```json\n([\s\S]*?)\n```/);
  if (!json) return undefined;
  try {
    const parsed = JSON.parse(json[1]!) as LaunchParams;
    return Object.keys(parsed).length ? parsed : undefined;
  } catch {
    return undefined;
  }
}

// Card status -> the contract's vocabulary (running|paused|cancelled|done|failed), with the finer
// distinction carried in `note` — the same discipline TermfleetRunner uses. Everything from `triage`
// through `review` is a session the launcher considers IN FLIGHT: the work item exists and the system owns
// it, whether or not a worker has claimed it yet. `blocked` is Hermes' human seam (a worker called
// kanban_block and the card is waiting on a person), which is precisely `paused`.
const STATUS_NOTE: Record<CardStatus, [SessionStatus, string | undefined]> = {
  triage: ['running', 'queued for triage — a specifier will flesh out the spec'],
  todo: ['running', 'waiting on a dependency (the kernel promotes it when its parents finish)'],
  scheduled: ['running', 'parked until a time, not on human input'],
  ready: ['running', 'eligible — not yet claimed by a worker'],
  running: ['running', undefined],
  review: ['running', 'awaiting review'],
  blocked: ['paused', 'blocked — awaiting a human (`hermes kanban unblock <id>`)'],
  done: ['done', undefined],
  archived: ['cancelled', undefined],
};

function sessionOf(card: Card): Session {
  const [status, note] = STATUS_NOTE[card.status] ?? (['running', `unmapped card status "${card.status}"`] as const);
  const params = decodeParams(card.body);
  return {
    id: card.id,
    agent: card.assignee ?? '',
    status,
    ref: card.id, // the card IS the backend handle; there is no second identifier to lose
    ...(params ? { params } : {}),
    ...(note ? { note } : {}),
  };
}

/** What the manifest says about an actor — the only thing the runner reads from it. Kept to the two
 *  PORTABLE typed fields (`execution.workspace`, `timeout`); everything else about the actor is the
 *  profile's business, and the runner interpreting more would be the runner acquiring domain knowledge. */
interface ManifestAgent {
  execution?: { workspace?: 'shared' | 'isolated' };
  timeout?: number;
  /** the trigger's declared param bindings, e.g. `{ ZTRACK_ISSUE: "subject.ref" }` — see `subjectRefOf` */
  params?: Record<string, string>;
  /** `review: <role>` — the merge-boundary edge. Realized as a LINKED CHILD CARD; see `launch`. */
  review?: string;
}

/** The launch's subject ref (the tracker issue this card is a run OF), or undefined.
 *
 *  This is NOT the runner interpreting an opaque param — the runner still never assigns meaning to a param
 *  itself. The MANIFEST declares which param carries the subject (`params: { ZTRACK_ISSUE: subject.ref }`),
 *  and this honors that declaration. A profile that binds no `subject.ref` simply gets no branch and no
 *  idempotency key, and nothing downstream changes. */
function subjectRefOf(declared: ManifestAgent | undefined, params: LaunchParams): string | undefined {
  const key = Object.entries(declared?.params ?? {}).find(([, source]) => source === 'subject.ref')?.[0];
  const value = key ? params[key] : undefined;
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export interface HermesRunnerOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** the `hermes` executable; defaults to $HERMES_BIN, else `hermes` on PATH */
  bin?: string;
  /** `kanban --board <slug>`; defaults to Hermes' own resolution ($HERMES_KANBAN_BOARD, then current board) */
  board?: string;
  /** where `.open-autonomy/autonomy.json` lives; defaults to `cwd` */
  installDir?: string;
}

export class HermesRunner implements Runner {
  // Enforcement this substrate genuinely realizes, advertised to the conformance battery. Each is a real
  // kernel mechanism, not a promise: max_in_progress caps concurrent dispatch; `--max-runtime` makes the
  // dispatcher SIGTERM (then SIGKILL) an overrunning worker and re-queue its card (enforce_max_runtime);
  // `--workspace worktree` gives each launch its own git worktree. Budget and permissions have no kernel
  // expression, so they are not claimed.
  readonly supports = ['maxConcurrent', 'timeout', 'isolation'];

  private readonly cwd: string;
  private readonly env: NodeJS.ProcessEnv;
  private readonly bin: string;
  private readonly board?: string;
  private readonly installDir: string;

  constructor(opts: HermesRunnerOptions = {}) {
    this.env = opts.env ?? process.env;
    this.cwd = opts.cwd ?? process.cwd();
    this.bin = opts.bin ?? this.env.HERMES_BIN ?? 'hermes';
    this.board = opts.board ?? undefined;
    this.installDir = opts.installDir ?? this.cwd;
  }

  private kanban(args: string[]): { ok: boolean; stdout: string; stderr: string } {
    const argv = ['kanban', ...(this.board ? ['--board', this.board] : []), ...args];
    const r = spawnSync(this.bin, argv, { cwd: this.cwd, env: this.env, encoding: 'utf8' });
    if (r.error) {
      throw new Error(
        `open-autonomy: cannot run \`${this.bin} ${argv.join(' ')}\` (${r.error.message}). Set HERMES_BIN to ` +
          `the hermes executable, or install Hermes on PATH.`,
      );
    }
    return { ok: r.status === 0, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
  }

  private manifestAgent(agent: string): ManifestAgent | undefined {
    const path = join(this.installDir, '.open-autonomy', 'autonomy.json');
    if (!existsSync(path)) return undefined;
    try {
      const manifest = JSON.parse(readFileSync(path, 'utf8')) as { agents?: Record<string, ManifestAgent> };
      return manifest.agents?.[agent];
    } catch {
      return undefined; // an unreadable manifest degrades to substrate defaults; it never fails a launch
    }
  }

  async launch(agent: string, params: LaunchParams = {}): Promise<Session> {
    const declared = this.manifestAgent(agent);
    // The two portable typed execution fields, realized natively. `isolated` -> a git worktree the kernel
    // creates and owns per card; `timeout` (minutes) -> the dispatcher's own runtime cap.
    const workspace = declared?.execution?.workspace === 'isolated' ? 'worktree' : 'scratch';
    const args = [
      'create',
      // Title is derived from the ACTOR alone. Params are opaque to the runner (docs/SPEC.md#the-runner),
      // so none of them may become a title — that would be the runner giving a param a meaning.
      `open-autonomy: ${agent}`,
      '--assignee',
      agent,
      '--workspace',
      workspace,
      '--body',
      encodeParams(agent, params),
      '--created-by',
      'open-autonomy',
    ];
    if (typeof declared?.timeout === 'number') args.push('--max-runtime', `${declared.timeout}m`);

    // THE JOIN BETWEEN THE TWO PLANES, and it is only a branch name. Hermes' kanban owns DISPATCH; ztrack
    // owns VERIFICATION; neither reads the other's storage. `kanban create --branch <ref>` names the card's
    // worktree branch after the tracker issue, which is exactly what `ztrack check --auto-scope` resolves
    // from ("built for per-worktree Stop-hook gates", per ztrack's own help). That one flag is what lets
    // the done-gate (ztrack-gate.ts) run with no arguments and still check the right issue.
    const ref = subjectRefOf(declared, params);
    if (ref && workspace === 'worktree') args.push('--branch', ref);
    // A card is a RUN OF an issue, so re-launching the same actor for the same issue must not stack a
    // second card. Keyed by actor+ref because develop and review legitimately each get one.
    if (ref) args.push('--idempotency-key', `open-autonomy:${agent}:${ref}`);

    const r = this.kanban(args);
    // `kanban create` has no --json, so its one-line receipt is the contract: "Created <id>  (<status>, ...)".
    const id = r.stdout.match(/^Created\s+(\S+)/m)?.[1];
    if (!r.ok || !id) {
      throw new Error(
        `open-autonomy: hermes kanban create failed for actor "${agent}" — ${(r.stderr || r.stdout).trim() || 'no output'}`,
      );
    }
    if (declared?.review) this.openReviewCard(declared.review, id, agent, ref, params);
    const card = this.readCard(id);
    // The id is RECEIVED from the kernel, never invented here — the card is the single handle, so `ref`
    // and `id` are deliberately the same value rather than two identifiers that can drift apart.
    return card ? { ...sessionOf(card), params: Object.keys(params).length ? params : undefined } : { id, agent, status: 'running', ref: id, ...(Object.keys(params).length ? { params } : {}) };
  }

  /** `review: <role>` — the merge boundary — realized as a LINKED CHILD CARD, opened at launch.
   *
   *  The IR's own comment says why this must not be left to the model: "requesting review is mechanical, so
   *  the substrate triggers the reviewer when the proposal lands rather than trusting a model to remember."
   *  So the edge is made STRUCTURAL at launch: `kanban create --parent <proposal-card>` puts the review card
   *  in `todo`, where the KERNEL holds it (`recompute_ready` promotes a child exactly when its last parent
   *  reaches done) and then dispatches the reviewer. No model memory, no scheduler of ours, no upstream
   *  change — Hermes' dependency gate already is this edge.
   *
   *  (Hermes also has a native `review` COLUMN — `dispatch_once` claims `status='review'` cards and spawns a
   *  reviewer with an `sdlc-review` skill. It is unreachable today: nothing in the published CLI or tool
   *  surface moves a card INTO `review`, and the `sdlc-review` skill does not exist in the repo. That lane
   *  wants one upstream verb; the parent/child edge needs nothing, so it is what this realizes.)
   *
   *  Deliberately NO `--branch`: the reviewer's workspace must not name the proposal's branch, because git
   *  refuses to check out one branch in two worktrees and a failed workspace resolution auto-blocks the card.
   *  The reviewer reads committed history, so a scratch workspace is the right shape (see the profile). */
  private openReviewCard(
    reviewer: string,
    parentId: string,
    agent: string,
    ref: string | undefined,
    params: LaunchParams,
  ): void {
    const workspace = this.manifestAgent(reviewer)?.execution?.workspace === 'isolated' ? 'worktree' : 'scratch';
    const args = [
      'create',
      `open-autonomy: ${reviewer} of ${agent}${ref ? ` (${ref})` : ''}`,
      '--assignee',
      reviewer,
      '--parent',
      parentId,
      '--workspace',
      workspace,
      '--body',
      encodeParams(reviewer, params),
      '--created-by',
      'open-autonomy',
    ];
    if (ref) args.push('--idempotency-key', `open-autonomy:${reviewer}:${ref}`);
    const r = this.kanban(args);
    if (!r.ok) {
      // Loud, not best-effort. A launch that quietly loses its review edge is a merge boundary that stopped
      // existing while every surface still says it does — the exact silent failure this edge prevents.
      throw new Error(
        `open-autonomy: launched "${agent}" as card ${parentId} but could not open its "${reviewer}" review ` +
          `card — ${(r.stderr || r.stdout).trim() || 'no output'}. The proposal card exists and is UNREVIEWED; ` +
          `cancel it (\`hermes kanban archive ${parentId}\`) or open the review card by hand.`,
      );
    }
  }

  private childIds(id: string): string[] {
    const r = this.kanban(['show', id, '--json']);
    if (!r.ok) return [];
    try {
      return (JSON.parse(r.stdout) as { children?: string[] }).children ?? [];
    } catch {
      return [];
    }
  }

  private readCard(id: string): Card | undefined {
    const r = this.kanban(['show', id, '--json']);
    if (!r.ok) return undefined;
    try {
      return (JSON.parse(r.stdout) as { task: Card }).task;
    } catch {
      return undefined;
    }
  }

  async get(id: string): Promise<Session | undefined> {
    const card = this.readCard(id);
    return card ? sessionOf(card) : undefined;
  }

  async list(): Promise<Session[]> {
    const r = this.kanban(['list', '--json']);
    if (!r.ok) return [];
    let cards: Card[];
    try {
      cards = JSON.parse(r.stdout) as Card[];
    } catch {
      return [];
    }
    // The contract's `list` is the RUNNING set. `--archived` is omitted above so a cancelled card is
    // already gone; `done` is filtered here.
    return cards.map(sessionOf).filter((s) => s.status === 'running' || s.status === 'paused');
  }

  async update(id: string, patch: { status?: SessionStatus }): Promise<boolean> {
    if (!patch.status) return !!this.readCard(id);
    switch (patch.status) {
      case 'paused':
        // `needs_input` is the kind that parks a card for a HUMAN. `dependency` would put it in todo for the
        // kernel to auto-promote, which is not a pause at all — it is the kernel's own dependency gate.
        return this.kanban(['block', id, 'paused by the open-autonomy runner', '--kind', 'needs_input']).ok;
      case 'running':
        return this.kanban(['unblock', id]).ok;
      case 'done':
        return this.kanban(['complete', id]).ok;
      case 'failed':
        return this.kanban(['block', id, 'failed', '--kind', 'transient']).ok;
      case 'cancelled':
        return this.cancel(id);
    }
  }

  async cancel(id: string): Promise<boolean> {
    // TWO steps, and both are needed. `reclaim` stops the WORKER (it frees the claim and calls
    // `_terminate_reclaimed_worker`) but deliberately leaves the CARD on the board, back in `ready` for
    // someone else to pick up — which is right for the kernel's own recovery path and wrong for a cancel,
    // where the contract requires the session to leave the running set. So reclaim, then archive the card.
    // Reclaim is best-effort: a card that was never claimed (still `ready`, never dispatched) has no worker
    // to stop and reclaim reports that as a failure. Archiving is what actually makes the cancel true.
    // Children first. A cancelled proposal must take its review card with it — a linked review card whose
    // parent was archived would sit in `todo` forever waiting on a parent that will never reach done, and
    // the contract requires cancel to remove the session from `list`.
    for (const child of this.childIds(id)) {
      this.kanban(['reclaim', child, '--reason', 'parent cancelled by the open-autonomy runner']);
      this.kanban(['archive', child]);
    }
    this.kanban(['reclaim', id, '--reason', 'cancelled by the open-autonomy runner']);
    return this.kanban(['archive', id]).ok;
  }

  /** The substrate's realization of `result.schema` — beyond the Runner contract, because the contract's
   *  session vocabulary carries no result. Returns the OA envelope the worker completed with, read back
   *  from the durable run record. This is the seam that makes "done is verified, not presumed" true here:
   *  the kernel marks a card done when a worker RETURNS, and a worker that fell over mid-turn returns just
   *  the same — so the envelope, not the card status, is what a caller routes on. */
  async result(id: string): Promise<{ value: unknown; run: CardRun } | undefined> {
    const r = this.kanban(['show', id, '--json']);
    if (!r.ok) return undefined;
    let runs: CardRun[];
    try {
      runs = (JSON.parse(r.stdout) as { runs?: CardRun[] }).runs ?? [];
    } catch {
      return undefined;
    }
    for (const run of [...runs].reverse()) {
      const metadata = typeof run.metadata === 'string' ? safeJson(run.metadata) : run.metadata;
      const value = (metadata as Record<string, unknown> | undefined)?.[RESULT_NAMESPACE];
      if (value !== undefined) return { value, run };
    }
    return undefined;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
