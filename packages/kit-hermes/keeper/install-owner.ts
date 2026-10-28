// The keeper's retained lifecycle door. Kit stacks may restart; their board owner and host Codex listener are acquired
// independent services and are never in a stack's child list. The native machine owner coordinates their selections.
import { startWork, spawnSyncWork, spawnWork, stopWorkChild } from '../base/.open-autonomy/work-ledger.ts';
import { sourceReceiptProgram, publishedProgram, sourceJson } from '../base/.open-autonomy/source-program.ts';
import { Database } from 'bun:sqlite';
import { createServer } from 'node:net';
import { chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { constants } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { prepareInstall, readInstall, type InstallReceipt } from '../base/.open-autonomy/prepare-install.ts';
import { machinePublishedBinding, runtimeInstallIdentity } from '../base/.open-autonomy/install-runtime.ts';

type Selection = { receipt: string; source: string | null; release?: string | null; native: string | null };
type Stack = { process: ReturnType<typeof Bun.spawn>; selected: Selection; ready: string };
const json = (path: string): any => { try { return JSON.parse(readFileSync(path, 'utf8')); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; } };
// The control protocol's native field is a legacy selected-program pathname.
const sourceProgram = (path: string): string => sourceReceiptProgram(path).program;
export async function serveInstallOwner({ project, home, argv }: { project: string; home: string; argv: string[] }): Promise<number> {
  if (argv.includes('--as')) throw new Error('prepared kit handovers require the keeper user; --as needs a separately prepared privilege-separated installation');
  if (process.platform === 'win32') throw new Error('prepared kit handovers require Unix owner sockets');
  mkdirSync(home, { recursive: true, mode: 0o700 });
  home = realpathSync(home);
  const lifetime = new Database(resolve(home, 'kit-owner.sqlite'), { create: true });
  try { lifetime.exec('PRAGMA busy_timeout=0; BEGIN EXCLUSIVE'); } catch (error) { lifetime.close(); throw new Error(`another kit owner holds this home: ${(error as Error).message}`); }
  const inside = resolve(home, 'kit-owner.sock'), uid = process.getuid?.() ?? 'user';
  const socketPath = Buffer.byteLength(inside) <= 100 ? inside : resolve('/tmp', `supercode-machine-${uid}`, `${createHash('sha256').update(inside).digest('hex').slice(0, 24)}.sock`);
  mkdirSync(dirname(socketPath), { recursive: true, mode: 0o700 });
  if (socketPath !== inside) { const owned = statSync(dirname(socketPath)); if (owned.uid !== uid || (owned.mode & 0o077) !== 0) { lifetime.close(); throw new Error('kit socket directory must belong only to the keeper user'); } }
  const recordPath = resolve(home, 'kit-install.json');
  try {
  // No occupied listener is unlinked. A stale path is removed only after connect proves it is not serving.
  if (existsSync(socketPath)) {
    const { createConnection } = await import('node:net');
    const present = await new Promise<boolean>((done, reject) => { const socket = createConnection(socketPath);
      const timer = setTimeout(() => { socket.destroy(); reject(new Error('kit owner socket did not answer; it was left alone')); }, 1000);
      socket.once('connect', () => { clearTimeout(timer); socket.destroy(); done(true); });
      socket.once('error', error => { clearTimeout(timer); ['ECONNREFUSED','ENOENT'].includes((error as NodeJS.ErrnoException).code ?? '') ? done(false) : reject(error); }); });
    if (present) throw new Error('another kit owner serves this home');
    rmSync(socketPath, { force: true });
  }
  let active: Stack | null = null, previous: Selection | null = null, stopping = false, failure: string | null = null;
  let pending: { id: string; selected: Selection; predecessor: Selection; phase: string } | null = null;
  let busy: Promise<unknown> | null = null, starting: Stack | null = null, restartSelection: Selection | null = null;
  const changes = new Set<() => void>();
  const wake = () => { for (const done of changes) done(); changes.clear(); };
  const write = () => { const temporary = `${recordPath}.${process.pid}.tmp`; writeFileSync(temporary, JSON.stringify({ version: 1, owner: process.pid,
    active: active?.selected ?? null, previous, transaction: pending, failure }) + '\n', { mode: 0o600 }); const fd = openSync(temporary, 'r'); try { fsyncSync(fd); } finally { closeSync(fd); }
    renameSync(temporary, recordPath); const dir = openSync(home, 'r'); try { fsyncSync(dir); } finally { closeSync(dir); } };
  const envFor = (selected: Selection) => { const env = { ...process.env } as Record<string, string>; delete env.SUPERCODE_SOURCE_CANDIDATE; delete env.SUPERCODE_RELEASE_RECEIPT; delete env.SUPERCODE_RELEASE_VERSION;
    if (selected.release) env.SUPERCODE_RELEASE_RECEIPT = selected.release;
    if (selected.source || selected.release) {
      if (selected.source) { env.SUPERCODE_SOURCE_CANDIDATE = selected.source; const runtime = sourceReceiptProgram(selected.source).node; if (runtime) env.SUPERCODE_NODE_BIN = runtime; }
      delete env.OPEN_AUTONOMY_SUPERCODE_BIN; delete env.OPEN_AUTONOMY_ORCHESTRATOR_BIN; delete env.OPEN_AUTONOMY_HARNESS_SDK;
    }
    delete env.SUPERCODE_BIN; delete env.SUPERCODE_ORCHESTRATOR_ENTRY; delete env.SUPERCODE_TEAMS_ENTRY;
    if (selected.native) env.SUPERCODE_BIN = selected.native;
    return env; };
  const validate = (selected: Selection): InstallReceipt => {
    const receipt = readInstall(selected.receipt, home);
    if ((receipt.source ?? null) !== selected.source || (receipt.release ?? null) !== (selected.release ?? null)) throw new Error('kit inputs were not prepared against this complete source selection');
    if (selected.source && selected.release) throw new Error('kit inputs require one complete machine selection');
    const native = selected.source ? sourceProgram(selected.source) : selected.release ? machinePublishedBinding(envFor(selected))?.program : null;
    if (native && (!selected.native || realpathSync(selected.native) !== realpathSync(native))) throw new Error('kit native differs from its complete machine selection');
    const identity = runtimeInstallIdentity({ directory: dirname(receipt.entry), environment: envFor(selected),
      registry: receipt.registry, archive: receipt.archive ?? undefined });
    if (identity !== receipt.runtimeIdentity || readFileSync(resolve(dirname(receipt.entry), 'node_modules/.open-autonomy-install'), 'utf8').trim() !== identity)
      throw new Error('kit installation identity changed since preparation');
    return receipt;
  };
  const start = async (selected: Selection, progress: (phase: string) => void = () => {}): Promise<Stack> => {
    const receipt = validate(selected), ready = resolve(home, `.kit-ready-${randomUUID()}.json`);
    const args = [...argv];
    for (const flag of ['--project', '--home', '--prepared-install']) { const at = args.indexOf(flag); if (at >= 0) args.splice(at, 2); }
    const child = spawnWork(() => Bun.spawn({ cmd: [process.execPath, receipt.entry, ...args, '--project', receipt.project, '--home', home, '--stack-child'],
      env: { ...envFor(selected), OPEN_AUTONOMY_INSTALL_RECEIPT: receipt.receipt, OPEN_AUTONOMY_PROJECT_SOURCE: receipt.sourceProject,
        OPEN_AUTONOMY_KIT_READY_FILE: ready }, stdin: 'ignore', stdout: 'inherit', stderr: 'inherit' }), 'bun', { stoppedExitCodes: [75] });
    const stack = { process: child, selected, ready }; starting = stack; restartSelection = selected;
    child.exited.then(code => { if (active !== stack || stopping) return;
      active = null; failure = `kit stack ended (${code})`; write(); wake(); });
    try {
      let until = Date.now() + 8000, observed = 0;
      while (!stopping && Date.now() < until) {
        const proof = json(ready);
        if (proof?.pid === child.pid && proof.receipt === receipt.receipt) {
          if (proof.ready === true) return stack;
          if (Number.isSafeInteger(proof.deadline_ms) && proof.deadline_ms > observed && ['starting', 'kit-command'].includes(proof.progress)) {
            // A running setup/clone command has its own existing work bound. The readiness probe must not terminate
            // that work after eight seconds; an idle startup still has only eight seconds to answer its next phase.
            observed = proof.deadline_ms;
            until = Math.min(proof.deadline_ms, Date.now() + (proof.progress === 'kit-command' ? 605000 : 8000));
            progress(proof.progress);
          }
        }
        if (child.exitCode !== null || child.signalCode !== null) throw new Error(`prepared kit stack ended (${child.exitCode ?? child.signalCode})`);
        await Bun.sleep(25);
      }
      throw new Error(stopping ? 'kit owner is stopping' : 'prepared kit stack did not answer its owned readiness door');
    } catch (error) {
      await stopStack(stack); throw error;
    } finally { starting = null; }
  };

  const stopStack = async (stack: Stack | null) => {
    if (!stack) return;
    stopWorkChild(stack.process, () => stack.process.kill(constants.signals.SIGTERM), { signal: constants.signals.SIGTERM });
    // The inner stack gives every exact child its own stop and bounded cleanup. It never owns the board or proxy.
    const bound = setTimeout(() => stopWorkChild(stack.process, () => stack.process.kill('SIGKILL'), { signal: 'SIGKILL' }), 18000);
    try { await stack.process.exited; } finally { clearTimeout(bound); rmSync(stack.ready, { force: true }); }
  };
  const status = () => ({ version: 1, protocol: 1, runtime: process.execPath, owner: process.pid, pid: active?.process.pid, state: active && active.process.exitCode === null && active.process.signalCode === null ? 'serving' : 'transitioning',
    selected: active?.selected, previous, transaction: pending?.id ?? null, phase: pending?.phase ?? null, failure });
  const rollback = async (progress: (phase: string) => void = () => {}) => {
    if (!pending) return status();
    const held = pending;
    if (held.phase !== 'prepared' || !active || active.process.exitCode !== null || active.process.signalCode !== null) {
      held.phase = 'rolling_back'; write();
      const stopped = active; active = null;
      progress('stopping-predecessor'); await stopStack(stopped);
      progress('starting-predecessor'); active = await start(held.predecessor, progress);
    }
    pending = null; failure = null; write(); wake(); return status();
  };
  const sourceDecision = (id: string, selected: Selection, predecessor: Selection, action: string) => {
    if (selected.receipt === predecessor.receipt && selected.source === predecessor.source && (selected.release ?? null) === (predecessor.release ?? null) && selected.native === predecessor.native) return;
    const journal = selected.release ? json(resolve(dirname(selected.release), '../..', 'release-handover.json'))
      : selected.source ? json(resolve(dirname(selected.source), 'activation.json')) : null;
    const allowed = action === 'finish' ? 'committed' : ['rollback','abort'].includes(action) ? 'restored' : 'prepared';
    if (journal?.transaction !== id || journal.candidate !== (selected.release ?? selected.source) || journal.closed || journal.state !== allowed) throw new Error(`kit ${action} requires its matching ${allowed} source decision`);
  };
  const control = async (request: any, progress: (phase: string) => void) => {
    const action = request.action;
    if (action === 'status') return status();
    if (typeof request.transaction !== 'string' || !request.transaction) throw new Error('kit handover needs its transaction id');
    if (action === 'prepare') {
      if (pending) { if (pending.id === request.transaction) {
        if (pending.selected.receipt !== resolve(request.candidate) || pending.selected.source !== (request.source ? resolve(request.source) : null) || (pending.selected.release ?? null) !== (request.release ? resolve(request.release) : null) || pending.selected.native !== (request.native ? resolve(request.native) : null)) throw new Error('kit transaction already names different inputs');
        return status(); } throw new Error('another kit input is prepared'); }
      if (!active || active.process.exitCode !== null) throw new Error('kit has no serving predecessor');
      const selected = { receipt: resolve(request.candidate), source: request.source ? resolve(request.source) : null, release: request.release ? resolve(request.release) : null, native: request.native ? resolve(request.native) : null };
      sourceDecision(request.transaction, selected, active.selected, 'prepare');
      validate(selected); pending = { id: request.transaction, selected, predecessor: active.selected, phase: 'prepared' }; write(); return status();
    }
    if (!pending || pending.id !== request.transaction) throw new Error('kit holds no matching handover transaction');
    sourceDecision(request.transaction, pending.selected, pending.predecessor, action);
    if (action === 'rollback' || action === 'abort') return rollback(progress);
    if (action === 'activate') {
      if (pending.phase === 'activated') return status();
      pending.phase = 'activating'; write();
      progress('stopping-predecessor'); await stopStack(active); active = null; progress('starting-successor');
      try { active = await start(pending.selected, progress); previous = pending.predecessor; pending.phase = 'activated'; failure = null; write(); return status(); }
      catch (error) {
        // Native machine and boards still select the successor. Keep the reservation until the coordinator has
        // restored/read back their predecessors; an eager local restart would refuse that mixed selection.
        failure = (error as Error).message; pending.phase = 'activation_failed'; write(); throw error;
      }
    }
    if (action === 'finish') {
      if (pending.phase !== 'activated') throw new Error('kit successor was never activated');
      if (!active || active.process.exitCode !== null || active.process.signalCode !== null) { progress('starting-successor'); active = await start(pending.selected, progress); }
      pending = null; failure = null; write(); return status();
    }
    throw new Error('unknown kit handover action');
  };
  const server = createServer(socket => {
    let input = '';
    socket.on('data', chunk => { input += chunk; if (input.length > 65536) return socket.destroy(); if (!input.includes('\n')) return;
      socket.removeAllListeners('data');
      const finish = startWork('door', 'keeper.request');
      const units = { bytes: Buffer.byteLength(input), events: 1 };
      let request: any; try { request = JSON.parse(input.trim()); } catch { finish({ ok: false, units }); socket.end(JSON.stringify({ error: 'invalid kit request' }) + '\n'); return; }
      const progress = (phase: string) => { if (!socket.destroyed) socket.write(JSON.stringify({ progress: phase }) + '\n'); };
      const respond = (work: Promise<unknown>) => { void work.then(result => { finish({ ok: true, units }); if (!socket.destroyed) socket.end(JSON.stringify({ result }) + '\n'); },
        error => { finish({ ok: false, units }); if (!socket.destroyed) socket.end(JSON.stringify({ error: error.message }) + '\n'); }); };
      if (request.action === 'status') return respond(Promise.resolve(status()));
      // A rollback of the held transaction waits behind the transition in flight (its own bound ends it) and says so,
      // so recovery after a lost coordinator is never refused for arriving while the kit was still activating.
      const behind = busy && ['rollback', 'abort'].includes(request.action) && pending?.id === request.transaction ? busy : null;
      if (busy && !behind) return respond(Promise.reject(new Error('a kit transition is in progress; read status')));
      let narrate: ReturnType<typeof setInterval> | undefined;
      if (behind) { progress('awaiting-transition'); narrate = setInterval(() => progress('awaiting-transition'), 5000); }
      const work: Promise<unknown> = (behind ?? Promise.resolve()).catch(() => {}).then(() => { clearInterval(narrate); return control(request, progress); });
      busy = work; respond(work); void work.catch(() => {}).finally(() => { if (busy === work) busy = null; wake(); });
    });
    socket.on('error', () => {});
  });
  const stop = () => { stopping = true; wake(); };
  for (const signal of ['SIGTERM','SIGINT','SIGHUP'] as const) process.on(signal, stop);
  try {
    await new Promise<void>((done, reject) => { server.once('error', reject); server.listen(socketPath, done); }); chmodSync(socketPath, 0o600);
    const saved = json(recordPath);
    let initial: Selection | null;
    if (saved?.transaction || saved?.active) {
      previous = saved.previous ?? null;
      if (saved.transaction) {
        const held = saved.transaction;
        const ledger = resolve(process.env.SUPERCODE_HOME || resolve(process.env.XDG_CONFIG_HOME || resolve(process.env.HOME!, '.config'), 'supercode'), 'source-lock.json');
        let sourceCommitted = false;
        if (held.selected.source) {
          const receiptText = readFileSync(held.selected.source, 'utf8'), identity = JSON.parse(receiptText).lock;
          const codec = sourceJson(identity.root, identity.binding), selected = codec.parse(receiptText).lock;
          const primary = codec.parse(readFileSync(ledger, 'utf8'));
          sourceCommitted = primary.serving_handover?.transaction === held.id
            && ['root','commit','supercode','binding','graph'].every(key => codec.equal(selected[key] ?? null, primary[key] ?? null));
        }
        const published = held.selected.release ? json(resolve(dirname(held.selected.release), '../..', 'active-release.json')) : null;
        const committed = held.selected.release ? published?.transaction === held.id : sourceCommitted;
        // Recovery owns the native ordering after an owner restart too. An uncommitted transaction must not
        // start its predecessor before the coordinator restores the machine and boards.
        initial = committed ? held.selected : null;
        pending = { ...held, phase: committed ? 'activated' : held.phase };
      } else initial = saved.active;
    } else if (argv.includes('--prepared-install')) {
      const at = argv.indexOf('--prepared-install'), named = argv[at + 1];
      if (!named) throw new Error('--prepared-install needs the complete install receipt');
      const prepared = readInstall(named, home);
      initial = { receipt: prepared.receipt, source: prepared.source, release: prepared.release, native: prepared.source ? sourceProgram(prepared.source) : prepared.release ? publishedProgram(json(prepared.release)) : process.env.SUPERCODE_BIN ?? null };
      validate(initial);
    } else {
      const head = spawnSyncWork(() => Bun.spawnSync(['git','-C',project,'rev-parse','HEAD']));
      if (head.exitCode !== 0) throw new Error('kit owner needs an existing committed project');
      const prepared = await prepareInstall({ project, home, revision: head.stdout.toString().trim(), source: process.env.SUPERCODE_SOURCE_CANDIDATE ?? null,
        registry: argv[argv.indexOf('--runtime-registry') + 1] && argv.includes('--runtime-registry') ? argv[argv.indexOf('--runtime-registry') + 1] : undefined,
        archive: argv[argv.indexOf('--runtime-package') + 1] && argv.includes('--runtime-package') ? argv[argv.indexOf('--runtime-package') + 1] : undefined });
      initial = { receipt: prepared.receipt, source: prepared.source, release: prepared.release, native: prepared.source ? sourceProgram(prepared.source) : prepared.release ? publishedProgram(json(prepared.release)) : process.env.SUPERCODE_BIN ?? null };
    }
    if (initial) active = await start(initial);
    write();
    while (!stopping) {
      await new Promise<void>(done => changes.add(done));
      if (!stopping && !active && !busy && !pending) { try { active = await start(restartSelection!); failure = null; write(); } catch (error) { failure = (error as Error).message; write(); throw error; } }
    }
    return 0;
  } finally {
    stopping = true;
    try { await busy; } catch { /* The transition's original caller retains its failure. */ }
    await stopStack(starting); await stopStack(active); server.close(); rmSync(socketPath, { force: true });
    for (const signal of ['SIGTERM','SIGINT','SIGHUP'] as const) process.off(signal, stop);
  }
  } finally { lifetime.close(); }
}
