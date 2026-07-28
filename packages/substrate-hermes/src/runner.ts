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
  workspace_path?: string | null;
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
  // `triage` is NOT benign here. Nothing in this substrate ever files a card into triage deliberately, so
  // in practice a card only lands there via the kernel's unblock-loop breaker — it is wedged, undispatchable,
  // and unreachable by every Runner verb except cancel. Reporting it as ordinary progress hid that.
  triage: ['paused', 'in Hermes `triage` — not dispatchable; needs a human decision or `cancel`'],
  todo: ['running', 'waiting on a dependency (the kernel promotes it when its parents finish)'],
  scheduled: ['running', 'parked until a time, not on human input'],
  ready: ['running', 'eligible — not yet claimed by a worker'],
  running: ['running', undefined],
  review: ['running', 'awaiting review'],
  // `blocked` covers BOTH a worker's deliberate `kanban_block(needs_input)` (the human seam) and the
  // kernel's circuit breaker giving up after repeated crashes. Those need different responses, so the note
  // is resolved from the card rather than assumed — see `noteForBlocked`.
  blocked: ['paused', 'blocked — awaiting a human (`hermes kanban unblock <id>`)'],
  done: ['done', undefined],
  archived: ['cancelled', undefined],
};

/** Kinds the KERNEL emits when it gives up on a card, verified against `kanban_db.py`'s own event writes —
 *  not guessed. A `blocked` card is otherwise a worker's deliberate `kanban_block(needs_input)`, i.e. the
 *  human seam, and reporting a dead worker as a considered handoff sends an operator looking for a decision
 *  nobody asked for. `block_loop_detected` is the unblock-loop breaker, which lands the card in `triage`. */
const KERNEL_GAVE_UP: ReadonlySet<string> = new Set([
  'block_loop_detected',
  'crashed',
  'gave_up',
  'reclaimed',
  'spawn_failed',
  'timed_out',
]);

function sessionOf(card: Card, events: ReadonlyArray<{ kind?: string | null }> = []): Session {
  const [status, base] = STATUS_NOTE[card.status] ?? (['running', `unmapped card status "${card.status}"`] as const);
  // A `blocked` card is EITHER a worker's deliberate kanban_block(needs_input) — the human seam — or the
  // kernel's circuit breaker giving up after repeated crashes/timeouts. Those want opposite responses, and
  // reporting both as "awaiting a human" made a dead worker look like a considered handoff. The card
  // carries the distinguishing data; read it rather than assume.
  // TWICE this was dead code. First it read `consecutive_failures`, which `kanban show --json` does not
  // serialize at all. Then it read `card.events`, which does not exist either — `events` is a TOP-LEVEL key
  // of the show payload, a sibling of `task`, never a field on the card — and matched kinds by a guessed
  // regex that hit none of the six the kernel really writes. Both versions read exactly like a live check.
  // So the events are now passed in from where they actually live, and matched against a set taken from
  // the kernel's own event writes.
  const note = events.some((e) => KERNEL_GAVE_UP.has(String(e?.kind ?? '')))
    ? `${base ?? 'blocked'} — but the KERNEL parked this, not a worker: it gave up after repeated failures. Not a human decision; see \`hermes kanban show ${card.id} --json\` events.`
    : base;
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
/** The worktree branch for a launch: the issue ref plus a per-create token.
 *
 *  BOTH halves are load-bearing, and the first version of this shipped only the first half.
 *   - The REF must appear because that is the entire join to the verification plane: `ztrack check
 *     --auto-scope` resolves the issue by matching an id ANYWHERE in the branch name (verified: both
 *     `LOCAL-1-t_abc123` and `oa/t_abc123/LOCAL-1` resolve to `LOCAL-1`). No env var, no card lookup, no
 *     change to the gate — the branch name IS the wiring.
 *   - The TOKEN must appear because git refuses to check out one branch in two worktrees, and Hermes
 *     creates a worktree PER CARD and never removes it (`complete_task`/`archive_task` do no cleanup; the
 *     only sweep is a 24-72h stale prune gated on unpushed commits). So a bare `--branch <ref>` makes the
 *     FIRST card for an issue permanently poison every later one — rework after a review, or a retry after
 *     a crash, fails to spawn with "fatal: '<ref>' is already used by worktree" and the dispatcher
 *     auto-blocks the card. Observed live, not theorized.
 *
 *  The token would ideally be the card id, which is what a reader expects — but the id is the RETURN VALUE
 *  of `kanban create` while `--branch` is an argument to it, and no CLI verb sets a branch afterward
 *  (`kanban edit` takes only result/summary/metadata). A creation-time timestamp has the property that
 *  actually matters: distinct per card. Re-launching the same actor for the same issue does not stack a
 *  branch, because `--idempotency-key` returns the EXISTING card without creating one. */
/** The `--workspace` argument for an actor. BOTH kinds carry an explicit absolute path, and both had to
 *  learn that the hard way from a live dispatch:
 *
 *   - `isolated` -> `worktree:<repo>`. A BARE `worktree` defers the repo to the BOARD's `default_workdir`,
 *     and a board without one spawn-fails every card it dispatches, then trips the consecutive-failure
 *     breaker and auto-blocks it.
 *   - `shared` -> `dir:<repo>`, NOT `scratch`. Hermes' `scratch` is a fresh EMPTY directory under
 *     `<board-root>/workspaces/<card-id>/`, auto-deleted on completion — not the checkout. The live
 *     reviewer was dispatched into one and had to go hunting for the repo by path. `dir:<path>` is Hermes'
 *     own third workspace kind and means precisely "run in this existing directory".
 *
 *  The runner already knows the repo — it is the cwd it was invoked in. Conformance never caught either of
 *  these because conformance never DISPATCHES; only a live worker does. */
export function hermesWorkspace(declared: ManifestAgent | undefined, repo: string): string {
  return `${declared?.execution?.workspace === 'isolated' ? 'worktree' : 'dir'}:${repo}`;
}

/** Where Hermes materializes a card's linked worktree. Its own rule, quoted from `resolve_workspace`'s
 *  docstring: "If `workspace_path` names a repo root, Hermes treats it as an anchor and materializes a
 *  linked worktree at `<repo>/.worktrees/<task-id>`". Named here rather than inlined because relying on a
 *  convention should be visible, and because `openReviewCard` must PREDICT the path before the kernel
 *  resolves it (the review card is opened at the proposal's launch; the worktree does not exist until the
 *  kernel claims it). Verified live: the predicted path matched byte-for-byte. */
export function hermesWorktreePath(repo: string, cardId: string): string {
  return join(repo, '.worktrees', cardId);
}

let branchNonce = 0;
export function branchFor(ref: string, now: number = Date.now()): string {
  // The timestamp alone collides: two launches for one ref inside the same millisecond mint the same branch
  // and the second worktree spawn fails. Idempotency masked that until a `done` hit stopped being treated as
  // a launch (`createCard`) — its retry loop issues several creates back to back, which is exactly the
  // sub-millisecond case. A per-process counter closes it deterministically.
  branchNonce = (branchNonce + 1) % 46656;
  return `${ref}-${now.toString(36)}-${branchNonce.toString(36)}`;
}

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
    // The two portable typed execution fields, realized natively (see `hermesWorkspace` for the workspace
    // kinds and the two live failures that shaped them); `timeout` (minutes) -> the dispatcher's runtime cap.
    const workspace = hermesWorkspace(declared, this.cwd);
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
    if (ref && workspace.startsWith('worktree')) args.push('--branch', branchFor(ref));
    // A card is a RUN OF an issue, so re-launching the same actor for the same issue must not stack a
    // second card. Keyed by actor+ref because develop and review legitimately each get one.
    if (ref) args.push('--idempotency-key', `open-autonomy:${agent}:${ref}`);

    const id = this.createCard(args, ref ? `${agent}:${ref}` : agent, ref);
    if (declared?.review) this.openReviewCard(declared.review, id, agent, ref, params);
    const card = this.readCard(id);
    // The id is RECEIVED from the kernel, never invented here — the card is the single handle, so `ref`
    // and `id` are deliberately the same value rather than two identifiers that can drift apart.
    return card ? { ...sessionOf(card), params: Object.keys(params).length ? params : undefined } : { id, agent, status: 'running', ref: id, ...(Object.keys(params).length ? { params } : {}) };
  }

  /** Create a card, and REFUSE to accept a stale idempotency hit as a launch.
   *
   *  Hermes' `create_task` resolves `--idempotency-key` with
   *  `WHERE idempotency_key = ? AND status != 'archived'` — only ARCHIVED is excluded, so a **`done`** card
   *  is returned as a hit, with the same `Created <id>` receipt and exit 0. That silently breaks the one
   *  workflow the doctrine promises: after a reviewer returns changes-requested the proposal card is `done`,
   *  so "rework is re-filing" re-files nothing. No card, no worker, no error — and because `list` filters
   *  `done` out, the PM sees no in-flight session and re-files again on the very next tick, forever.
   *  (Verified against the real kernel: re-running the exact launch argv printed
   *  `Created t_74c5e682  (done, assignee=develop)` and spawned nothing.)
   *
   *  So a hit on a finished card is treated as "this key is SPENT" and the launch retries under a
   *  discriminated key. That makes re-filing genuinely idempotent per ATTEMPT while still collapsing the
   *  duplicate-launch case the key exists for: a hit on a card that is still in flight is returned as-is. */
  private createCard(args: string[], what: string, ref: string | undefined): string {
    const keyAt = args.indexOf('--idempotency-key');
    for (let attempt = 1; ; attempt++) {
      const r = this.kanban(args);
      // `kanban create` has no --json, so its one-line receipt is the contract: "Created <id>  (<status>, ...)".
      const id = r.stdout.match(/^Created\s+(\S+)/m)?.[1];
      if (!r.ok || !id) {
        throw new Error(
          `open-autonomy: hermes kanban create failed for ${what} — ${(r.stderr || r.stdout).trim() || 'no output'}`,
        );
      }
      // No key, or the card is genuinely in flight -> this launch is the launch.
      if (keyAt < 0 || !ref) return id;
      const status = this.readCard(id)?.status;
      if (status !== 'done') return id;
      if (attempt >= 20) {
        throw new Error(
          `open-autonomy: every idempotency key for ${what} resolves to a completed card (${attempt} attempts). ` +
            `Refusing to report a launch that started nothing.`,
        );
      }
      args[keyAt + 1] = `${args[keyAt + 1]!.replace(/ \(attempt \d+\)$/, '')} (attempt ${attempt + 1})`;
      // ...and MINT A FRESH BRANCH for the retry. The args were built once, so without this every attempt
      // re-uses the first branch name — and a branch already checked out in the previous card's worktree
      // (which Hermes never removes) makes the spawn fail and auto-blocks the new card. The retry would
      // have turned "rework silently did nothing" into "rework reliably wedges", which is not an
      // improvement. Caught by review, not by a test; the equivalence guard compares argv, and both
      // implementations were wrong in the same way.
      const branchAt = args.indexOf('--branch');
      if (branchAt >= 0 && ref) args[branchAt + 1] = branchFor(ref);
    }
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
   *  THE REVIEWER STANDS IN THE PROPOSAL'S OWN WORKTREE, and getting this wrong twice is what taught it:
   *
   *   - `worktree` (its own) is impossible: git refuses to check out one branch in two worktrees, and a
   *     failed workspace resolution auto-blocks the card. So no `--branch` here, ever.
   *   - `dir:<repo>` — the plain shared checkout — RUNS, which is what made it look right. It is wrong for a
   *     reason no single card shows: the reviewer's verdict is a tracker write, `.volter/tracker/` is
   *     committed, and the proposal's branch carries its own tracker commits. A verdict written on trunk
   *     conflicts with the branch at integration, EVERY TIME. The PM's conflict rule would then escalate
   *     every issue to a human — a merge boundary that blocks on itself.
   *   - `dir:<the proposal's worktree>` is the one that is actually right, and it needs nothing new: by the
   *     time the kernel releases this card its parent is DONE, so the worktree is idle and its branch is
   *     checked out there. The reviewer lands on the branch — `--auto-scope` resolves, `git show` reads the
   *     commits, and the verdict commits where the evidence already lives, exactly as on the local
   *     substrate. That is also what `execution.workspace: shared` MEANS for a review-edge launch: not "its
   *     own tree", i.e. the tree of the thing it reviews.
   *
   *  A reviewer declared `isolated` still gets its own worktree (`hermesWorkspace`); only the `shared`
   *  reading is redirected, and only when this launch actually has a proposal to point at. */
  private openReviewCard(
    reviewer: string,
    parentId: string,
    agent: string,
    ref: string | undefined,
    params: LaunchParams,
  ): void {
    const declared = this.manifestAgent(reviewer);
    const proposalIsIsolated = this.manifestAgent(agent)?.execution?.workspace === 'isolated';
    const workspace =
      declared?.execution?.workspace !== 'isolated' && proposalIsIsolated
        ? `dir:${hermesWorktreePath(this.cwd, parentId)}`
        : hermesWorkspace(declared, this.cwd);
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
    // Keyed on the PARENT, not just the ref: a review card belongs to one proposal. Keying it on the ref
    // alone made a re-filed proposal adopt the PREVIOUS proposal's review card — which is still parented to
    // the dead card, so it is released by that card's archival and the new proposal ships unreviewed.
    if (ref) args.push('--idempotency-key', `open-autonomy:${reviewer}:${ref}:${parentId}`);
    const r = this.kanban(args);
    if (!r.ok) {
      // Loud, not best-effort. A launch that quietly loses its review edge is a merge boundary that stopped
      // existing while every surface still says it does — the exact silent failure this edge prevents.
      throw new Error(
        `open-autonomy: launched "${agent}" as card ${parentId} but could not open its "${reviewer}" review ` +
          `card — ${(r.stderr || r.stdout).trim() || 'no output'}. The proposal card exists and is UNREVIEWED; ` +
          `remove it with \`bun scripts/runner.ts cancel ${parentId}\` (which archives its children FIRST) ` +
          `or open the review card by hand. Do NOT \`hermes kanban archive\` the proposal on its own: ` +
          `\`recompute_ready\` treats an archived parent as SATISFIED, so any orphan review card is ` +
          `released to the dispatcher and spawns a reviewer into a worktree that will never exist.`,
      );
    }
  }

  private childIds(id: string): string[] {
    return this.readShow(id)?.children ?? [];
  }

  /** The card's worktree branch, or undefined for a shared/`dir` workspace that has none.
   *
   *  Beyond the Runner contract (like `result`), and load-bearing for the PM: integration means merging the
   *  branch a proposal was built on, and on this substrate the runner NAMES that branch (`branchFor` — issue
   *  ref plus a per-create token, because Hermes never removes a card's worktree and git refuses one branch
   *  in two of them). A PM that CONSTRUCTS `agent/issue-<id>` the way the local substrate's does would be
   *  naming a branch that does not exist here. So the rule the doctrine follows is: ask the runner. */
  async branchOf(id: string): Promise<string | undefined> {
    return this.readCard(id)?.branch_name ?? undefined;
  }

  /** The card's resolved workspace path. Beyond the contract, and needed for the same reason as `branchOf`:
   *  integrating a proposal means removing its worktree afterwards — nothing else ever does, since
   *  `complete`/`archive` do no cleanup and `kanban gc` prunes only events, logs and *scratch* workspaces —
   *  and the doctrine forbids constructing paths. Note this is only populated once the kernel has RESOLVED
   *  the workspace (at claim time); before that it holds the anchor the card was created with. */
  async workspaceOf(id: string): Promise<string | undefined> {
    return this.readCard(id)?.workspace_path ?? undefined;
  }

  /** NOTE on the error path, because the obvious one is dead code: `hermes kanban show <missing>` prints
   *  "no such task: <id>" and exits **0**, so `r.ok` is true for a card that does not exist. The JSON parse
   *  is what actually detects it. That also means a REAL failure (locked db, bad --board) is
   *  indistinguishable from a missing card here — both surface as `undefined` — so callers must treat
   *  `undefined` as "unknown", never as "definitely absent". */
  private readCard(id: string): Card | undefined {
    return this.readShow(id)?.task;
  }

  /** The whole `kanban show --json` payload. `events`/`children`/`runs` are SIBLINGS of `task`, not fields
   *  on it — reading them off the card silently yields undefined, which is how the auto-blocked
   *  discriminator managed to be dead code twice. */
  private readShow(id: string): { task: Card; events?: Array<{ kind?: string | null }>; children?: string[] } | undefined {
    const r = this.kanban(['show', id, '--json']);
    try {
      return JSON.parse(r.stdout);
    } catch {
      return undefined;
    }
  }

  async get(id: string): Promise<Session | undefined> {
    const shown = this.readShow(id);
    return shown?.task ? sessionOf(shown.task, shown.events ?? []) : undefined;
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
    // `cards.map(sessionOf)` would hand map's INDEX to the events parameter — caught by the compiler here,
    // but the same shape is exactly how the events bug got in. `kanban list --json` returns bare cards with
    // no events, so a listed session cannot carry the kernel-gave-up note; `get` is where that shows up.
    return cards.map((c) => sessionOf(c)).filter((s) => s.status === 'running' || s.status === 'paused');
  }

  async update(id: string, patch: { status?: SessionStatus }): Promise<boolean> {
    if (!patch.status) return !!this.readCard(id);
    switch (patch.status) {
      case 'paused':
        // `needs_input` is the kind that parks a card for a HUMAN. `dependency` would put it in todo for the
        // kernel to auto-promote, which is not a pause at all — it is the kernel's own dependency gate.
        // Guarded like `failed`: Hermes' unblock-loop breaker does not care WHICH kind repeats, so
        // pause -> running -> pause wedges the card into `triage` just the same. The first version of this
        // fix guarded only the sibling branch.
        return this.blockGuarded(id, 'paused by the open-autonomy runner', 'needs_input');
      case 'running':
        return this.kanban(['unblock', id]).ok;
      case 'done':
        return this.kanban(['complete', id]).ok;
      case 'failed':
        return this.blockGuarded(id, 'failed', 'transient');
      case 'cancelled':
        return this.cancel(id);
    }
  }

  /** Block a card, and REFUSE to report success if the kernel's unblock-loop breaker wedged it.
   *
   *  Hermes routes a repeated SAME-KIND block-after-unblock to `triage` (BLOCK_RECURRENCE_LIMIT = 2, and
   *  `unblock` deliberately does not reset the counter). A `triage` card is never dispatched, and
   *  `unblock_task` matches `status IN ('blocked','scheduled')` so it cannot come back that way either —
   *  only a human decision or `cancel` moves it. Verified: block/unblock/block put a card in triage while
   *  the call still returned TRUE. Both `paused` and `failed` route here; guarding only one was the bug. */
  private blockGuarded(id: string, reason: string, kind: string): boolean {
    const before = this.readCard(id)?.status;
    const ok = this.kanban(['block', id, reason, '--kind', kind]).ok;
    if (this.readCard(id)?.status === 'triage' && before !== 'triage') {
      throw new Error(
        `open-autonomy: blocking ${id} (${kind}) pushed it into Hermes' \`triage\` column — the kernel's ` +
          `unblock-loop breaker fired on a repeated same-kind block. A triage card is never dispatched and ` +
          `\`kanban unblock\` will not move it; it needs a human decision (\`kanban specify\`) or \`cancel\`.`,
      );
    }
    return ok;
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
