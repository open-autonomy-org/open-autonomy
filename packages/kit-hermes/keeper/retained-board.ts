// Acquire the native board's lifetime owner. It is detached from kit stacks; only native handover changes its writer.
import { startWork, spawnWork } from '../base/.open-autonomy/work-ledger.ts';
import { spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

type Options = { home: string; entry: string; native: string; env: Record<string, string>; command: (args: string[]) => string[] };
async function door(options: Options) {
  const require = createRequire(options.entry);
  const module = await import(pathToFileURL(require.resolve('@volter/teams/board-owner')).href);
  // The owner refuses a card verb whose request names no Teams context (@volter/teams/board-owner: `facts`); the
  // keeper names the one its environment carries, else `local`, as the owner's own handover readback does.
  const facts = { SUPERCODE_CONTEXT: options.env.SUPERCODE_CONTEXT || 'local' };
  return async (argv: string[]) => {
    const finish = startWork('call', 'keeper.board');
    try {
      const answer = await module.askBoardOwner(options.home, { argv, facts }, { waitMs: 0, timeoutMs: 8000 });
      finish({ ok: answer.code === 0 && !answer.unanswered }); return answer;
    } catch (error) { finish({ ok: false }); throw error; }
  };
}
async function probe(options: Options): Promise<any | null> {
  const answer = await (await door(options))(['handover', '--action', 'status']);
  if (answer.down) return null;
  if (answer.code !== 0 || answer.unanswered) throw new Error(answer.stderr || 'the board owner gave no generation receipt');
  const status = JSON.parse(answer.stdout);
  if (status.protocol !== 1) throw new Error('the board owner predates generation handovers');
  return status;
}
function requireSelection(options: Options, status: any): void {
  if (status.state !== 'serving' || status.selected?.entry !== options.entry || status.selected?.native !== options.native)
    throw new Error('the serving board does not match the selected native release; use the coordinated machine upgrade door');
}
// Whether any board owner answers for this home, whatever selection it serves: a handover's board is not a gone one.
export async function boardOwnerAnswers(options: Options): Promise<boolean> {
  return await probe(options) !== null;
}
export async function retainedBoard(options: Options): Promise<any | null> {
  const status = await probe(options);
  if (status) requireSelection(options, status);
  return status;
}
export async function boardDeclaration(options: Options): Promise<any> {
  const answer = await (await door(options))(['declaration', '--json']);
  if (answer.code !== 0 || answer.unanswered) throw new Error(answer.stderr || 'board declaration was unanswered');
  return JSON.parse(answer.stdout);
}
export async function acquireBoard(options: Options): Promise<void> {
  if (await retainedBoard(options)) return;
  mkdirSync(resolve(options.home, 'logs'), { recursive: true });
  const log = openSync(resolve(options.home, 'logs/board-owner.log'), 'a', 0o600);
  const command = options.command([options.env.SUPERCODE_NODE_BIN || Bun.which('node')!, options.entry, 'workflow', 'serve', '--root', options.home]);
  const child = spawnWork(() => spawn(command[0]!, command.slice(1), { cwd: options.home,
    env: { ...options.env, SUPERCODE_BOARD_START_OWNER: String(process.pid) }, detached: true,
    stdio: ['ignore', log, log, 'ipc'] }), 'node');
  closeSync(log);
  // A startup contender may lose the lifetime lock to another keeper. Only the public native receipt admits reuse.
  try {
    await new Promise<void>((done, reject) => {
      const finish = (error?: Error) => { clearTimeout(timer); child.off('message', ready); child.off('error', failed); child.off('exit', exited); error ? reject(error) : done(); };
      const ready = (frame: any) => { if (frame?.type === 'board-owner-ready' && frame.owner === child.pid) finish(); };
      const failed = (error: Error) => finish(error);
      const exited = () => finish(); // A lock contender can exit; only the public serving receipt admits reuse.
      const timer = setTimeout(() => finish(new Error('the native board did not report serving readiness; its retained log names the startup failure')), 120000);
      child.on('message', ready); child.once('error', failed); child.once('exit', exited);
    });
    if (!await retainedBoard(options)) throw new Error('the native board ended before reporting serving readiness');
    child.unref();
  } catch (error) { if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM'); throw error; }
  finally { if (child.connected) child.disconnect(); }
}
