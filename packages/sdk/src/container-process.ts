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

/** Verify the prepared checkout's actual Git routes, without changing any ref. */
export async function checkContainerGit(options: { container: string; home: string; workspace: string; account: string; baseUrl: string }): Promise<void> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(options.container) || !/^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(options.account)) throw new Error('A container and project GitHub account are required.');
  const url = new URL(options.baseUrl);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'host.docker.internal'].includes(url.hostname) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Git verification requires the local project valve address.');
  const script = String.raw`
import os,subprocess,sys,urllib.request
home,workspace,account,base=sys.argv[1:]
env={**os.environ,'HOME':home,'GIT_TERMINAL_PROMPT':'0'}
expected=base.rstrip('/')+'/'+account
try:
    routes=[]
    for mode in [[],['--push']]:
        routes.append(subprocess.check_output(['git','-C',workspace,'remote','get-url','--all',*mode,'origin'],env=env,stderr=subprocess.DEVNULL,timeout=10).decode().strip())
    if any(route not in [expected,expected+'.git'] for route in routes):
        print('Configure both origin fetch and push through this project valve before startup.');sys.exit(1)
    for route,service in zip(routes,['git-upload-pack','git-receive-pack']):
        with urllib.request.urlopen(route+'/info/refs?service='+service,timeout=15) as response:
            if response.status != 200 or response.headers.get_content_type() != 'application/x-'+service+'-advertisement' or ('# service='+service).encode() not in response.read(96):
                raise ValueError('Invalid Git advertisement')
except Exception:
    print('Project Git verification failed. Check the container mapping and the installed App Contents: write grant; Hermes was not started.');sys.exit(1)
`;
  const child = spawn('docker', ['exec', '--user', 'hermes', options.container, 'python3', '-c', script,
    options.home, options.workspace, options.account, url.origin], { stdio: ['ignore', 'ignore', 'ignore'] });
  const timer = setTimeout(() => child.kill('SIGKILL'), 35_000);
  try {
    const code = await new Promise<number>(resolve => { child.once('error', () => resolve(1)); child.once('exit', code => resolve(code ?? 1)); });
    if (code !== 0) throw new Error('Project Git is not ready: verify both container origin mappings and the App Contents: write grant before starting Hermes.');
  } finally { clearTimeout(timer); }
}
