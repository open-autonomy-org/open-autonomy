#!/usr/bin/env node
// The autonomy runner (substrate primitive), vendored into this profile. Drives termfleet through its
// SDK (the `termfleet` npm package), not a `termfleet` binary on PATH. Its entire knowledge is: agents,
// running agents, and their lifecycle. It knows nothing about what an agent does or works on — no
// "issues", no states. That lives entirely in the agents (skills) and the profile's scripts.
//
// This is a plain-JS port of @open-autonomy/substrate-local's runner.ts (TermfleetRunner) + the core CLI.
// Keep the two in sync. The install must have `termfleet` (+ `@termfleet/core`) in node_modules.
//
//   launch <agent> [--k v ...]  ·  get <id>  ·  list  ·  update <id> --status <s>  ·  cancel <id>
//
// `launch` accepts arbitrary --key value params and passes them through verbatim; the system never
// interprets them (a profile gives them meaning, e.g. a ztrack-using profile declares ZTRACK_ISSUE).
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProviderClient, providerRefFromUrl } from 'termfleet';
import { resolveDefaultProvider } from '@termfleet/core/teams/local-providers.js';
import { RUNNER_DEFAULTS } from './runner-defaults.mjs';

/** One bounded retry for the provider's read-only observation pair. A virtual-tmux snapshot performs a
 * real tmux observation and can occasionally outlive the transport's request window under load; treating
 * one such read as the lifecycle truth produces noisy reap failures even though the provider is healthy.
 * Mutating operations are never retried here. */
export async function observeProvider(client, { attempts = 2, retryMs = 250, wait = (ms) => new Promise((done) => setTimeout(done, ms)) } = {}) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const [life, snapshot] = await Promise.all([client.lifecycle(), client.snapshot()]);
      return { life, snapshot };
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) await wait(retryMs);
    }
  }
  throw lastError;
}

// Real local backend: drives termfleet via its ProviderClient SDK. The window name IS the agent; the
// system never encodes anything else into it. Defaults come from RUNNER_DEFAULTS; TERMFLEET_* override.
export class TermfleetRunner {
  #env;
  #cwd;
  harness;
  #clientPromise;
  constructor({
    cwd = process.cwd(),
    env = process.env,
    client,
    continuationConfirmMs,
    continuationPollMs,
    interruptSettleMs,
    wait,
  } = {}) {
    this.#env = env;
    this.#cwd = cwd;
    this.harness = env.TERMFLEET_AGENT || RUNNER_DEFAULTS.harness; // claude|codex|gemini — the coding CLI, not our agent
    if (client) this.#clientPromise = Promise.resolve(client);
    this.continuationConfirmMs = continuationConfirmMs
      ?? Number(env.TERMFLEET_CONTINUATION_CONFIRM_MS || 20_000);
    this.continuationPollMs = continuationPollMs ?? 250;
    this.interruptSettleMs = interruptSettleMs
      ?? Number(env.TERMFLEET_INTERRUPT_SETTLE_MS || 1_000);
    this.wait = wait ?? ((ms) => new Promise((done) => setTimeout(done, ms)));
  }
  #client() {
    return (this.#clientPromise ??= resolveDefaultProvider({ url: this.#env.TERMFLEET_PROVIDER_URL }).then((p) => {
      // OA-09: log the effective provider + its origin on first resolve. The loop driver's own startup line
      // (emit.ts's LOOP_DRIVER) only covers processes it launches directly; a NESTED launch (the PM's own
      // `runner.ts launch developer ...`, or anyone driving this backend directly) resolves independently
      // and needs its own visibility. AUTONOMY_PROVIDER_URL_SOURCE (set by the loop driver, and re-exported
      // into every launched session's env below via the TERMFLEET_.*|AUTONOMY.* filter) distinguishes
      // `schedule` (the durable compile-time pin) from `env` (a genuine ambient override) when
      // TERMFLEET_PROVIDER_URL is set — both look identical here since schedule.env is already merged into
      // process.env by the time this runs (emit.ts's fireTick), so the hint is the only way to tell them
      // apart; `env` is the safe default when the hint is absent (e.g. this backend driven directly, outside
      // the loop). Unpinned, the SDK's own `source` (current-context | auto-local) is used verbatim.
      // TRIM (OA-09 Blocker 2): a set-but-empty/whitespace TERMFLEET_PROVIDER_URL is unset to the SDK (it
      // trims + falsy-checks `opts.url`), so it must read as unpinned here too — otherwise this line would
      // claim `env`/`schedule` while the SDK actually auto-discovered p.source.
      const pinnedEnv = (this.#env.TERMFLEET_PROVIDER_URL || '').trim();
      const source = pinnedEnv ? this.#env.AUTONOMY_PROVIDER_URL_SOURCE || 'env' : p.source;
      // stderr, never stdout — `list`/`launch`'s CLI output is a single JSON line on stdout that callers
      // (including this repo's own tests) parse directly; a diagnostic line ahead of it would corrupt that.
      console.error(`[runner] provider ${p.baseUrl} (${source})`);
      return new ProviderClient(providerRefFromUrl(p.baseUrl));
    }));
  }

  async launch(agent, params = {}) {
    // OA-08: verify the launch's skill invocation resolves in THIS cwd BEFORE spending anything on it —
    // deterministic and provider-independent (no termfleet call is needed to fail fast). The scheduler
    // launches the PM straight through THIS backend (emit.ts's LOOP_DRIVER -> run-agent.mjs ->
    // `autonomy-runner.mjs launch`), bypassing runner-frontend.ts's own pre-check entirely — so this is the
    // ONLY guard covering a tick-launched skill agent whose skill went missing post-compile (deleted,
    // renamed, wrong harness). The backend doesn't know the manifest's agent->behavior mapping (it stays
    // domain/manifest-blind by design), but every emitted skill-agent prompt IS the invocation name (`/name`
    // claude, `$name` codex — emit.ts:436-437), and the launch's prompt file is resolved right here anyway —
    // so read it once, early, and check the corresponding skills path. A bare-name prompt (no prompt file at
    // all — e.g. no AUTONOMY_PROMPT_DIR set) has nothing deterministic to verify: skip.
    const promptDir = this.#env.AUTONOMY_PROMPT_DIR;
    const promptFile = promptDir ? `${promptDir}/${agent}.txt` : '';
    const promptExists = !!promptFile && existsSync(promptFile);
    const prompt = promptExists ? readFileSync(promptFile, 'utf8') : agent;
    // Match the EXACT emitted skill-invocation shape (emit.ts's promptFiles: `/${behavior}\n` claude,
    // `$${behavior}\n` codex) — a leading `/` or `$` followed by a single skill-name token and nothing else.
    // Anchoring both ends (a lone token, valid skill-name chars only) is deliberate: a hand-authored custom
    // AUTONOMY_PROMPT_DIR whose prompt merely STARTS with a path-like token (e.g. "/tmp/notes.md summarize")
    // is NOT a skill invocation and must not be misread as behavior "tmp/notes.md" and false-refused — it has
    // spaces / extra path segments, so it fails this anchored match and skips the check (nothing to verify).
    const invocation = promptExists ? /^[/$]([A-Za-z0-9._-]+)$/.exec(prompt.trim()) : null;
    if (invocation) {
      const behavior = invocation[1];
      const skillsRoot = this.harness === 'codex' ? '.codex/skills' : '.claude/skills';
      const skillPath = join(this.#cwd, skillsRoot, behavior, 'SKILL.md');
      if (!existsSync(skillPath)) {
        throw new Error(
          `[runner] launch refused: ${agent}'s skill "${behavior}" is missing at ${skillPath} — the session ` +
            `would die at launch ("Unknown command: ${prompt.trim()}"). Commit the harness ` +
            `(docs/OPERATIONS.md#local-runner-quickstart, "Commit the harness"), or check the skill exists ` +
            `for harness "${this.harness}".`,
        );
      }
    }

    const client = await this.#client();
    // Re-export orchestration context so a nested `autonomy launch ...` reaches this provider, plus the
    // opaque params verbatim (a profile may read e.g. $ZTRACK_ISSUE; the system doesn't). The runner stays
    // CODE-HOST-BLIND: it injects no github/repo identity — a code-host agent resolves its own repo through
    // its own tool (e.g. `gh api repos/{owner}/{repo}/…`, which `gh` fills from the remote).
    const exported = {
      ...Object.fromEntries(Object.entries(this.#env).filter(([k]) => /^(TERMFLEET_.*|AUTONOMY.*|PATH)$/.test(k))),
      ...params,
    };
    // Put the repo's local node_modules/.bin first so the agent reaches repo-pinned CLIs (e.g. a `-D`
    // ztrack) — exactly what `npm run`/`bun run` do, without the substrate naming any tool. cwd is the
    // repo (createAgentWindow runs the session there), so this is where its node_modules lives.
    exported.PATH = `${this.#cwd}/node_modules/.bin:${exported.PATH ?? this.#env.PATH ?? ''}`;
    const setupCommand = Object.entries(exported)
      .map(([k, v]) => `export ${k}=${JSON.stringify(v ?? '')}`)
      .join('; ');
    // createAgentWindow blocks until the agent's first response; give its socket ack a generous timeout
    // (TERMFLEET_CREATE_TIMEOUT_MS overrides) so a real claude cold-start doesn't time out the launch and
    // lose the terminalId — the join key the post-session effect marker + the reaper depend on.
    const createTimeoutMs = Number(this.#env.TERMFLEET_CREATE_TIMEOUT_MS || RUNNER_DEFAULTS.createTimeoutMs);
    const ack = await client.createAgentWindow(
      { agent: this.harness, name: agent, cwd: this.#cwd, prompt, setupCommand, createTimeoutMs },
      { timeoutMs: createTimeoutMs },
    );
    const terminalId = ack.result?.terminalId;
    if (!terminalId) {
      throw new Error(`termfleet createAgentWindow returned no terminalId for agent "${agent}": ${ack.error ?? '(no error)'}`);
    }
    const controlSha = (this.#env.AUTONOMY_CONTROL_SHA || '').trim();
    if (controlSha) {
      const controlRoot = (this.#env.AUTONOMY_CONTROL_ROOT || this.#cwd).trim();
      const dir = join(controlRoot, '.open-autonomy', 'runner-state', 'control-sessions');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, `${terminalId.replace(/[^0-9A-Za-z._-]/g, '-')}.json`), `${JSON.stringify({
        schema: 'open-autonomy.control-session.v1', id: terminalId, agent, controlSha, launchedAt: new Date().toISOString(),
      }, null, 2)}\n`);
    }
    return {
      id: terminalId,
      agent,
      status: 'running',
      ...(ack.result?.agentSessionId ? { ref: ack.result.agentSessionId } : {}),
      ...(Object.keys(params).length ? { params } : {}),
      ...(controlSha ? { controlSha } : {}),
    };
  }
  /**
   * Continue one exact durable conversation. A live idle window receives the new tick directly; an ended
   * conversation is resumed by its harness session id. This primitive never launches a fresh conversation.
   */
  async continue(agent, options) {
    if (!options?.terminalId || !options?.cwd || !options?.instruction) {
      throw new Error('continue requires terminalId, cwd, and instruction');
    }
    if (this.harness === 'gemini') throw new Error('gemini does not support history-preserving continuation');
    const client = await this.#client();
    const snapshot = await client.snapshot();
    const explicitSessionId = options.agentSessionId || '';
    const live = snapshot.windows.find((window) =>
      window.terminalId === options.terminalId
      || (explicitSessionId && window.lifecycle?.currentSessionId === explicitSessionId),
    );
    const liveSessionId = live?.lifecycle?.currentSessionId;
    if (live?.terminalId && liveSessionId) {
      return await this.#sendLiveContinuation(client, liveSessionId, live.terminalId, options);
    }

    const agentSessionId = explicitSessionId || await this.#resolveEndedSession(client, options.cwd, options.anchorAt);
    if (!agentSessionId) throw new Error(`no ${this.harness} conversation found for ${options.cwd}`);
    const alreadyLive = snapshot.windows.find((window) => window.lifecycle?.currentSessionId === agentSessionId);
    if (alreadyLive?.terminalId) {
      return await this.#sendLiveContinuation(client, agentSessionId, alreadyLive.terminalId, options);
    }

    const bareSessionId = agentSessionId.replace(new RegExp(`^${this.harness}:`), '');
    const setupEnv = options.setupEnv && typeof options.setupEnv === 'object' ? options.setupEnv : {};
    const setupCommand = Object.entries(setupEnv)
      .filter(([key]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key))
      .map(([key, value]) => `export ${key}=${JSON.stringify(String(value ?? ''))}`)
      .join('; ');
    const createTimeoutMs = Number(this.#env.TERMFLEET_CREATE_TIMEOUT_MS || RUNNER_DEFAULTS.createTimeoutMs);
    const ack = await client.createAgentWindow({
      agent: this.harness,
      agentSessionId: bareSessionId,
      resume: true,
      cwd: options.cwd,
      name: agent,
      prompt: options.instruction.trim(),
      ...(setupCommand ? { setupCommand } : {}),
      createTimeoutMs,
    }, { timeoutMs: createTimeoutMs });
    const terminalId = ack.result?.terminalId;
    const resumedSessionId = ack.result?.agentSessionId || agentSessionId;
    if (!terminalId) throw new Error(ack.error || `Termfleet resumed ${agentSessionId} without a terminal id`);
    await this.#confirmInstruction(client, resumedSessionId, options.cwd, options.instruction, 0);
    return { mode: 'resumed', terminalId, agentSessionId: resumedSessionId };
  }
  async #sendLiveContinuation(client, agentSessionId, terminalId, options) {
    const before = await client.getAgentSession(this.harness, agentSessionId, { cwd: options.cwd });
    if (before?.endOfTurn !== true) {
      throw new Error(`conversation ${agentSessionId} is active; a scheduled tick must not interrupt it`);
    }
    const priorCount = await this.#messageCount(client, agentSessionId, options.cwd);
    const ack = await client.sendToSession(agentSessionId, `${options.instruction.trim()}\n`, { submitMode: 'retry' });
    if (ack?.ok === false) throw new Error(ack.error || `Termfleet refused input to ${agentSessionId}`);
    await this.#confirmInstruction(client, agentSessionId, options.cwd, options.instruction, priorCount);
    return { mode: 'sent', terminalId, agentSessionId };
  }
  async #messageCount(client, agentSessionId, cwd) {
    try {
      const session = await client.getAgentSession(this.harness, agentSessionId, { cwd });
      return Array.isArray(session?.messages) ? session.messages.length : 0;
    } catch {
      return 0;
    }
  }
  async #confirmInstruction(client, agentSessionId, cwd, instruction, priorCount) {
    const expected = instruction.trim();
    const deadline = Date.now() + this.continuationConfirmMs;
    let lastError;
    while (Date.now() <= deadline) {
      try {
        const session = await client.getAgentSession(this.harness, agentSessionId, { cwd });
        const messages = Array.isArray(session?.messages) ? session.messages : [];
        if (messages.slice(priorCount).some((message) =>
          message?.role === 'user' && String(message.text || '').trim() === expected)) return;
      } catch (error) {
        lastError = error;
      }
      await this.wait(this.continuationPollMs);
    }
    const detail = lastError instanceof Error ? ` Last transcript error: ${lastError.message}` : '';
    throw new Error(
      `Termfleet continuation was sent to ${agentSessionId} but the exact instruction never appeared ` +
      `in the durable transcript; delivery remains ambiguous and must not be acknowledged.${detail}`,
    );
  }
  async #resolveEndedSession(client, cwd, anchorAt) {
    const page = await client.listAgentSessions({ limit: 500, query: cwd });
    const anchorMs = Number.isFinite(Date.parse(anchorAt || '')) ? Date.parse(anchorAt) : Date.now();
    const candidates = (page.rows || [])
      .filter((row) => row.cwd === cwd && row.provider === this.harness && typeof row.sessionId === 'string')
      .sort((a, b) => {
        const distance = Math.abs(Date.parse(a.updatedAt) - anchorMs) - Math.abs(Date.parse(b.updatedAt) - anchorMs);
        return distance || b.updatedAt.localeCompare(a.updatedAt);
      });
    return candidates[0]?.sessionId || '';
  }
  async get(id) {
    return (await this.list()).find((s) => s.id === id);
  }
  // termfleet's process-tree lifecycle joined to the window list. A window points at a session via
  // `lifecycle.currentSessionId`; the session carries the real activity `state` (+ attention `signal`).
  async #view() {
    const client = await this.#client();
    const { life, snapshot } = await observeProvider(client);
    const byId = new Map((life.sessions || []).map((s) => [s.sessionId, s]));
    return { client, snapshot, byId };
  }
  async list() {
    const { snapshot, byId } = await this.#view();
    // id = the terminalId termfleet owns; agent = the window name we launched it under; status reflects
    // termfleet's real per-session activity (running | background | idle | awaiting-human).
    return snapshot.windows.filter((w) => !!w.terminalId).map((w) => sessionOf(w, byId, this.#env, this.#cwd));
  }
  // Close this install's OWN agent sessions that have been IDLE (termfleet `session_waiting`, no attention
  // signal) for >= idleMs — the local analogue of an ephemeral job ending when its work is done. Scope is
  // the `agents` name set (a human's own terminal or another loop's session is never touched). `since` is
  // the caller's persistent Map(sessionId -> firstIdleAtMs): a session that resumes work, is taken over
  // (signal `asking`), or errors is dropped from it and never reaped. Reaps via closeWindow (proven path).
  async reapIdle({ idleMs = 60000, agents, since = new Map(), now = Date.now() } = {}) {
    const { client, snapshot, byId } = await this.#view();
    const seen = new Set();
    const reaped = [];
    for (const w of snapshot.windows) {
      if (agents && agents.size && !agents.has(w.name)) continue;
      const sid = w.lifecycle?.currentSessionId;
      const s = sid ? byId.get(sid) : undefined;
      if (!s) continue;
      seen.add(sid);
      const idle = s.state === 'session_waiting' && !s.signal;
      if (!idle) {
        since.delete(sid);
        continue;
      }
      if (!since.has(sid)) since.set(sid, now);
      if (now - since.get(sid) >= idleMs) {
        const ack = await client.closeWindow(w.id).catch(() => null);
        if (ack && ack.ok !== false) {
          reaped.push({ id: w.terminalId, agent: w.name, sessionId: sid });
          since.delete(sid);
        }
      }
    }
    for (const sid of [...since.keys()]) if (!seen.has(sid)) since.delete(sid);
    return reaped;
  }
  async update(id, patch) {
    if (patch.status === 'cancelled') return this.cancel(id);
    return true;
  }
  async cancel(id) {
    const client = await this.#client();
    const snapshot = await client.snapshot();
    const window = snapshot.windows.find((w) => w.terminalId === id);
    if (!window) return false;
    const ack = await client.closeWindow(window.id);
    return ack.ok !== false;
  }
}

// Map a window + its lifecycle session into a Session, surfacing termfleet's real activity. The contract
// status vocab is running|paused|cancelled|done|failed, so: running/background -> running, idle
// (session_waiting, no signal) -> done, attention `asking` -> paused, `errored` -> failed; a note carries
// the finer distinction. No session yet (just launched) reads as running.
function sessionOf(w, byId, env = process.env, cwd = process.cwd()) {
  const s = w.lifecycle?.currentSessionId ? byId.get(w.lifecycle.currentSessionId) : undefined;
  let controlSha = '';
  try {
    const root = (env.AUTONOMY_CONTROL_ROOT || cwd).trim();
    const receipt = JSON.parse(readFileSync(join(root, '.open-autonomy', 'runner-state', 'control-sessions', `${w.terminalId.replace(/[^0-9A-Za-z._-]/g, '-')}.json`), 'utf8'));
    controlSha = typeof receipt.controlSha === 'string' ? receipt.controlSha : '';
  } catch { /* pre-generation session */ }
  const base = { id: w.terminalId, agent: w.name, ...(controlSha ? { controlSha } : {}) };
  if (!s) return { ...base, status: 'running' };
  const ref = s.sessionId;
  if (s.state === 'session_running') return { ...base, status: 'running', ref };
  if (s.state === 'session_stopped_background_running') return { ...base, status: 'running', ref, note: 'background work running' };
  if (s.signal === 'asking') return { ...base, status: 'paused', ref, note: 'awaiting human input' };
  if (s.signal === 'errored') return { ...base, status: 'failed', ref, note: 'errored, awaiting human' };
  return { ...base, status: 'done', ref, note: 'idle (turn complete)' };
}

function parseParams(args) {
  const params = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a?.startsWith('--')) {
      const key = a.slice(2);
      const next = args[i + 1];
      params[key] = next && !next.startsWith('--') ? (i++, next) : 'true';
    }
  }
  return params;
}

export async function runCli(runner, argv) {
  const [cmd, ...rest] = argv;
  const opt = (name) => {
    const i = rest.indexOf(name);
    return i >= 0 ? rest[i + 1] : undefined;
  };

  if (cmd === 'launch') {
    const agent = rest[0];
    if (!agent || agent.startsWith('--')) {
      console.error('usage: autonomy launch <agent> [--key value ...]');
      return 2;
    }
    console.log(JSON.stringify(await runner.launch(agent, parseParams(rest.slice(1)))));
    return 0;
  }
  if (cmd === 'continue') {
    const params = parseParams(rest);
    const terminalId = params['terminal-id'];
    const instruction = params.instruction;
    const agent = params.agent;
    const cwd = params.cwd;
    if (!terminalId || !instruction || !agent || !cwd) {
      console.error('usage: autonomy continue --terminal-id <id> --agent <name> --cwd <path> --instruction <direction> [--agent-session-id <id>]');
      return 2;
    }
    let setupEnv = {};
    try { setupEnv = params['setup-env'] ? JSON.parse(params['setup-env']) : {}; } catch { throw new Error('--setup-env must be JSON'); }
    console.log(JSON.stringify(await runner.continue(agent, {
      terminalId,
      instruction,
      cwd,
      setupEnv,
      ifIdleOnly: params['if-idle-only'] === 'true',
      ...(params['agent-session-id'] ? { agentSessionId: params['agent-session-id'] } : {}),
      ...(params['anchor-at'] ? { anchorAt: params['anchor-at'] } : {}),
    })));
    return 0;
  }
  if (cmd === 'get') {
    const session = await runner.get(rest[0] ?? '');
    if (!session) return 1;
    console.log(JSON.stringify(session));
    return 0;
  }
  if (cmd === 'list') {
    console.log(JSON.stringify(await runner.list()));
    return 0;
  }
  if (cmd === 'update') {
    const id = rest[0];
    const status = opt('--status');
    if (!id || !status) {
      console.error('usage: autonomy update <id> --status <running|paused|cancelled|done|failed>');
      return 2;
    }
    return (await runner.update(id, { status })) ? 0 : 1;
  }
  if (cmd === 'cancel') {
    const id = rest[0];
    if (!id) {
      console.error('usage: autonomy cancel <id>');
      return 2;
    }
    return (await runner.cancel(id)) ? 0 : 1;
  }
  console.error('usage: autonomy <launch|continue|get|list|update|cancel>');
  return 2;
}

// Entrypoint: compare canonical filesystem paths, not URL strings. On macOS `/var` and `/private/var`
// name the same file; a raw string comparison silently skipped the CLI when invoked through `/var`.
const isMain = (() => {
  try {
    return !!process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
})();
if (isMain) {
  process.exit(await runCli(new TermfleetRunner(), process.argv.slice(2)));
}
