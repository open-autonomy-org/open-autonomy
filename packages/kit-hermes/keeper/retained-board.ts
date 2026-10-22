// Acquire the native board's lifetime owner. It is detached from kit stacks; only native handover changes its writer.
import { spawn } from 'node:child_process';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

type Options = { home: string; entry: string; native: string; env: Record<string, string>; command: (args: string[]) => string[] };
async function door(options: Options) {
  const require = createRequire(options.entry);
  const module = await import(pathToFileURL(require.resolve('@volter/teams/board-owner')).href);
  return (argv: string[]) => module.askBoardOwner(options.home, { argv }, { waitMs: 0, timeoutMs: 8000 });
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
  const child = spawn(command[0]!, command.slice(1), { cwd: options.home, env: options.env, detached: true, stdio: ['ignore', log, log] });
  closeSync(log);
  let failure: Error | null = null;
  child.once('error', error => { failure = error; });
  // A startup contender may lose the lifetime lock to another keeper. Only the public native receipt admits reuse.
  try {
    const until = Date.now() + 8000;
    while (Date.now() < until) {
      const status = await probe(options);
      if (status?.state === 'serving') { requireSelection(options, status); child.unref(); return; }
      if (failure) throw failure;
      await Bun.sleep(25);
    }
    throw new Error('the native board did not report serving readiness; its retained log names the startup failure');
  } catch (error) { if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM'); throw error; }
}
