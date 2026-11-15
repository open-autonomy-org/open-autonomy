import { spawnWork, stopWorkChild } from './work-ledger.ts';
// A Docker exec client is not the lifetime of the process it starts. Keep stdin
// open as a lease; EOF (including host death) stops the owned container process group.
import { spawn } from 'node:child_process';
import type { MachineSupercode } from './machine-supercode.ts';

/** Resolve executor programs in their own filesystem and environment, independently of host SDK imports. */
export async function containerPrograms(container: string, signal?: AbortSignal): Promise<{
  fleet: MachineSupercode; coding: MachineSupercode; node: string;
}> {
  signal?.throwIfAborted();
  const inspect = `import {machineSupercode,machineCodingProgram,machineNode} from '/opt/agent/.open-autonomy/machine-supercode.ts';
process.stdout.write(JSON.stringify({fleet:machineSupercode(),coding:machineCodingProgram(),node:machineNode()}));`;
  const native = startContainerProcess({ container, cwd: '/opt/agent', command: ['bun', '--eval', inspect], captureOutput: true });
  let stdout = '', stderr = '', interrupted = false;
  let retirement: Promise<void> | undefined;
  const failures: unknown[] = [];
  const stop = () => {
    interrupted = true;
    retirement ??= native.close();
    void retirement.catch(error => { failures.push(error); });
  };
  const onError = (error: Error) => { failures.push(error); stop(); };
  native.stdout!.setEncoding('utf8'); native.stderr!.setEncoding('utf8');
  native.stdout!.on('data', data => { stdout += data; }); native.stderr!.on('data', data => { stderr += data; });
  native.stdout!.on('error', onError); native.stderr!.on('error', onError);
  const signals = signal ? [] : ['SIGTERM', 'SIGINT', 'SIGHUP'] as const;
  for (const name of signals) process.on(name, stop);
  signal?.addEventListener('abort', stop, { once: true });
  if (signal?.aborted) stop();
  try {
    const code = await native.exited;
    if (retirement) await retirement;
    if (failures.length) throw new AggregateError(failures, 'executor program inspection failed');
    if (interrupted) throw signal?.reason ?? new Error('executor program inspection cancelled');
    if (code !== 0) throw new Error(`executor program inspection exited ${code}: ${stderr.trim()}`);
    return JSON.parse(stdout);
  } finally {
    signal?.removeEventListener('abort', stop);
    for (const name of signals) process.off(name, stop);
  }
}

const RUNNER = String.raw`
import json,os,select,signal,subprocess,sys,time
stream=os.fdopen(0,"rb",buffering=0)
spec=json.loads(stream.readline())
child=subprocess.Popen(spec["command"],cwd=spec["cwd"],env={**os.environ,**spec["env"]},stdin=subprocess.DEVNULL,start_new_session=True)
stopping=False
signal.signal(signal.SIGTERM,lambda *_: stop())
signal.signal(signal.SIGINT,lambda *_: stop())
def stop():
    global stopping
    stopping=True
def send(sig):
    try: os.killpg(child.pid,sig)
    except ProcessLookupError: pass
try:
    while child.poll() is None and not stopping:
        if select.select([stream],[],[],0.1)[0]:
            line=stream.readline()
            if line == b"restart\n": send(signal.SIGUSR1)
            else: stopping=True
finally:
    send(signal.SIGTERM)
    deadline=time.monotonic()+10
    while child.poll() is None and time.monotonic()<deadline: time.sleep(0.05)
    send(signal.SIGKILL)
    child.wait()
sys.exit(0 if stopping else child.returncode if child.returncode >= 0 else 1)
`;

/** No host environment is forwarded: Docker supplies the container environment. */
export function startContainerProcess(options: {
  container: string; command: string[]; cwd: string; env?: Record<string, string>; stoppedExitCodes?: readonly number[]; captureOutput?: true;
}) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(options.container)) throw new Error('A container name or ID is required.');
  const child = spawnWork(() => spawn('docker', ['exec', '-i', '--user', 'hermes', options.container,
    'python3', '-u', '-c', RUNNER], { stdio: ['pipe', options.captureOutput ? 'pipe' : 'inherit', options.captureOutput ? 'pipe' : 'inherit'] }), 'node', { stoppedExitCodes: options.stoppedExitCodes });
  let ended = false;
  let failure: Error | undefined, closing: Promise<void> | undefined;
  const exited = new Promise<number>(resolve => {
    child.once('error', error => { failure = error; });
    // Docker's error/exit alone does not join its inherited output or prove
    // the owned exec client closed. Its runner still owns remote group cleanup.
    child.once('close', code => { ended = true; resolve(failure ? 1 : code ?? 1); });
  });
  child.stdin!.on('error', error => { failure ??= error; });
  child.stdin!.write(JSON.stringify({ command: options.command, cwd: options.cwd, env: options.env ?? {} }) + '\n');
  return {
    exited, stdout: child.stdout, stderr: child.stderr,
    restart() { if (!ended) child.stdin!.write('restart\n'); },
    close() { return closing ??= Promise.resolve().then(async () => {
      try { if (!ended) stopWorkChild(child, () => child.stdin!.end()); } catch (error) { failure ??= error as Error; }
      await exited;
      if (failure) throw new AggregateError([failure], 'container exec cleanup failed');
    }); },
  };
}

