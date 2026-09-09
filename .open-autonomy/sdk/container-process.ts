// A Docker exec client is not the lifetime of the process it starts. Keep stdin
// open as a lease; EOF (including host death) stops the owned container process group.
import { spawn } from 'node:child_process';

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
  container: string; command: string[]; cwd: string; env?: Record<string, string>;
}) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(options.container)) throw new Error('A container name or ID is required.');
  const child = spawn('docker', ['exec', '-i', '--user', 'hermes', options.container,
    'python3', '-u', '-c', RUNNER], { stdio: ['pipe', 'inherit', 'inherit'] });
  let ended = false;
  const exited = new Promise<number>(resolve => {
    child.once('error', () => { ended = true; resolve(1); });
    child.once('exit', code => { ended = true; resolve(code ?? 1); });
  });
  child.stdin.on('error', () => {}); // Docker exit is reported by exited.
  child.stdin.write(JSON.stringify({ command: options.command, cwd: options.cwd, env: options.env ?? {} }) + '\n');
  return {
    exited,
    restart() { if (!ended) child.stdin.write('restart\n'); },
    async close() { if (!ended) child.stdin.end(); await exited; },
  };
}
