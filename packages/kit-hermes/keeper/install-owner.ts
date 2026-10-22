// The keeper's retained lifecycle door. Kit stacks may restart; their board owner and host Codex listener are acquired
// independent services and are never in a stack's child list. The native machine owner coordinates their selections.
import { createServer } from 'node:net';
import { chmodSync, closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { constants } from 'node:os';
import { randomUUID } from 'node:crypto';
import { prepareInstall, readInstall, type InstallReceipt } from '../base/.open-autonomy/prepare-install.ts';
import { runtimeInstallIdentity } from '../base/.open-autonomy/install-runtime.ts';

type Selection = { receipt: string; source: string | null; native: string | null };
type Stack = { process: ReturnType<typeof Bun.spawn>; selected: Selection; ready: string };
const json = (path: string): any => { try { return JSON.parse(readFileSync(path, 'utf8')); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; } };
export async function serveInstallOwner({ project, home, argv }: { project: string; home: string; argv: string[] }): Promise<number> {
  if (argv.includes('--as')) throw new Error('prepared kit handovers require the keeper user; --as needs a separately prepared privilege-separated installation');
  if (process.platform === 'win32') throw new Error('prepared kit handovers require Unix owner sockets');
  mkdirSync(home, { recursive: true, mode: 0o700 });
  const socketPath = resolve(home, 'kit-owner.sock'), recordPath = resolve(home, 'kit-install.json');
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
  const envFor = (selected: Selection) => { const env = { ...process.env } as Record<string, string>; delete env.SUPERCODE_SOURCE_CANDIDATE;
    if (selected.source) {
      env.SUPERCODE_SOURCE_CANDIDATE = selected.source;
      delete env.OPEN_AUTONOMY_SUPERCODE_BIN; delete env.OPEN_AUTONOMY_ORCHESTRATOR_BIN; delete env.OPEN_AUTONOMY_HARNESS_SDK;
    }
    delete env.SUPERCODE_BIN; delete env.SUPERCODE_ORCHESTRATOR_ENTRY; delete env.SUPERCODE_TEAMS_ENTRY;
    if (selected.native) env.SUPERCODE_BIN = selected.native;
    return env; };
  const validate = (selected: Selection): InstallReceipt => {
    const receipt = readInstall(selected.receipt, home);
    if ((receipt.source ?? null) !== selected.source) throw new Error('kit inputs were not prepared against this complete source selection');
    const identity = runtimeInstallIdentity({ directory: dirname(receipt.entry), environment: envFor(selected),
      registry: receipt.registry, archive: receipt.archive ?? undefined });
    if (identity !== receipt.runtimeIdentity || readFileSync(resolve(dirname(receipt.entry), 'node_modules/.open-autonomy-install'), 'utf8').trim() !== identity)
      throw new Error('kit installation identity changed since preparation');
    return receipt;
  };
  const start = async (selected: Selection): Promise<Stack> => {
    const receipt = validate(selected), ready = resolve(home, `.kit-ready-${randomUUID()}.json`);
    const args = [...argv];
    for (const flag of ['--project', '--home']) { const at = args.indexOf(flag); if (at >= 0) args.splice(at, 2); }
    const child = Bun.spawn({ cmd: [process.execPath, receipt.entry, ...args, '--project', receipt.project, '--home', home, '--stack-child'],
      env: { ...envFor(selected), OPEN_AUTONOMY_INSTALL_RECEIPT: receipt.receipt, OPEN_AUTONOMY_PROJECT_SOURCE: receipt.sourceProject,
        OPEN_AUTONOMY_KIT_READY_FILE: ready }, stdin: 'ignore', stdout: 'inherit', stderr: 'inherit' });
    const stack = { process: child, selected, ready }; starting = stack; restartSelection = selected;
    child.exited.then(code => { if (active !== stack || stopping) return;
      active = null; failure = `kit stack ended (${code})`; write(); wake(); });
    try {
      const until = Date.now() + 8000;
      while (!stopping && Date.now() < until) {
        const proof = json(ready);
        if (proof?.pid === child.pid && proof.receipt === receipt.receipt && proof.ready === true) return stack;
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
    stack.process.kill(constants.signals.SIGTERM);
    // The inner stack gives every exact child its own stop and bounded cleanup. It never owns the board or proxy.
    const bound = setTimeout(() => stack.process.kill('SIGKILL'), 18000);
    try { await stack.process.exited; } finally { clearTimeout(bound); rmSync(stack.ready, { force: true }); }
  };
  const status = () => ({ version: 1, protocol: 1, runtime: process.execPath, owner: process.pid, pid: active?.process.pid, state: active && active.process.exitCode === null ? 'serving' : 'transitioning',
    selected: active?.selected, previous, transaction: pending?.id ?? null, phase: pending?.phase ?? null, failure });
  const rollback = async () => {
    if (!pending) return status();
    const held = pending;
    if (held.phase !== 'prepared') { await stopStack(active); active = await start(held.predecessor); }
    pending = null; failure = null; write(); wake(); return status();
  };
  const control = async (request: any, progress: (phase: string) => void) => {
    const action = request.action;
    if (action === 'status') return status();
    if (typeof request.transaction !== 'string' || !request.transaction) throw new Error('kit handover needs its transaction id');
    if (action === 'prepare') {
      if (pending) { if (pending.id === request.transaction) {
        if (pending.selected.receipt !== resolve(request.candidate) || pending.selected.source !== (request.source ? resolve(request.source) : null) || pending.selected.native !== (request.native ? resolve(request.native) : null)) throw new Error('kit transaction already names different inputs');
        return status(); } throw new Error('another kit input is prepared'); }
      if (!active || active.process.exitCode !== null) throw new Error('kit has no serving predecessor');
      const selected = { receipt: resolve(request.candidate), source: request.source ? resolve(request.source) : null, native: request.native ? resolve(request.native) : null };
      validate(selected); pending = { id: request.transaction, selected, predecessor: active.selected, phase: 'prepared' }; write(); return status();
    }
    if (pending?.id !== request.transaction) throw new Error('kit holds no matching handover transaction');
    if (action === 'rollback' || action === 'abort') return rollback();
    if (action === 'activate') {
      if (pending.phase === 'activated') return status();
      pending.phase = 'activating'; write();
      progress('stopping-predecessor'); await stopStack(active); active = null; progress('starting-successor');
      try { active = await start(pending.selected); previous = pending.predecessor; pending.phase = 'activated'; failure = null; write(); return status(); }
      catch (error) { failure = (error as Error).message; await rollback(); throw error; }
    }
    if (action === 'finish') {
      if (pending.phase !== 'activated') throw new Error('kit successor was never activated');
      if (!active || active.process.exitCode !== null) active = await start(pending.selected);
      pending = null; failure = null; write(); return status();
    }
    throw new Error('unknown kit handover action');
  };
  const server = createServer(socket => {
    let input = '';
    socket.on('data', chunk => { input += chunk; if (input.length > 65536) return socket.destroy(); if (!input.includes('\n')) return;
      socket.removeAllListeners('data');
      let request: any; try { request = JSON.parse(input.trim()); } catch { socket.end(JSON.stringify({ error: 'invalid kit request' }) + '\n'); return; }
      const progress = (phase: string) => { if (!socket.destroyed) socket.write(JSON.stringify({ progress: phase }) + '\n'); };
      const respond = (work: Promise<unknown>) => { void work.then(result => { if (!socket.destroyed) socket.end(JSON.stringify({ result }) + '\n'); },
        error => { if (!socket.destroyed) socket.end(JSON.stringify({ error: error.message }) + '\n'); }); };
      if (request.action === 'status') return respond(Promise.resolve(status()));
      if (busy) return respond(Promise.reject(new Error('a kit transition is in progress; read status')));
      busy = control(request, progress); respond(busy); void busy.catch(() => {}).finally(() => { busy = null; wake(); });
    });
    socket.on('error', () => {});
  });
  const stop = () => { stopping = true; wake(); };
  for (const signal of ['SIGTERM','SIGINT','SIGHUP'] as const) process.on(signal, stop);
  try {
    await new Promise<void>((done, reject) => { server.once('error', reject); server.listen(socketPath, done); }); chmodSync(socketPath, 0o600);
    const saved = json(recordPath);
    let initial: Selection;
    if (saved?.transaction || saved?.active) {
      previous = saved.previous ?? null;
      if (saved.transaction) {
        const held = saved.transaction;
        const ledger = resolve(process.env.SUPERCODE_HOME || resolve(process.env.XDG_CONFIG_HOME || resolve(process.env.HOME!, '.config'), 'supercode'), 'source-lock.json');
        const primary = json(ledger), selected = held.selected.source ? json(held.selected.source)?.lock : null;
        const committed = primary?.serving_handover?.transaction === held.id && selected
          && ['root','commit','supercode','graph'].every(key => JSON.stringify(selected[key] ?? null) === JSON.stringify(primary[key] ?? null));
        initial = committed ? held.selected : held.predecessor;
        pending = { ...held, phase: committed ? 'activated' : 'prepared' };
      } else initial = saved.active;
    } else {
      const head = Bun.spawnSync(['git','-C',project,'rev-parse','HEAD']);
      if (head.exitCode !== 0) throw new Error('kit owner needs an existing committed project');
      const prepared = await prepareInstall({ project, home, revision: head.stdout.toString().trim(), source: process.env.SUPERCODE_SOURCE_CANDIDATE ?? null,
        registry: argv[argv.indexOf('--runtime-registry') + 1] && argv.includes('--runtime-registry') ? argv[argv.indexOf('--runtime-registry') + 1] : undefined,
        archive: argv[argv.indexOf('--runtime-package') + 1] && argv.includes('--runtime-package') ? argv[argv.indexOf('--runtime-package') + 1] : undefined });
      initial = { receipt: prepared.receipt, source: prepared.source, native: process.env.SUPERCODE_BIN ?? null };
    }
    active = await start(initial); write();
    while (!stopping) {
      await new Promise<void>(done => changes.add(done));
      if (!stopping && !active && !busy && !pending) { try { active = await start(restartSelection!); failure = null; write(); } catch (error) { failure = (error as Error).message; write(); throw error; } }
    }
    return 0;
  } finally {
    stopping = true; await busy?.catch(() => {}); await stopStack(starting); await stopStack(active); server.close(); rmSync(socketPath, { force: true });
    for (const signal of ['SIGTERM','SIGINT','SIGHUP'] as const) process.off(signal, stop);
  }
}
