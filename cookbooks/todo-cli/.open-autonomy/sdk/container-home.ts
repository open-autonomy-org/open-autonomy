// Host orchestration of the existing container checkout and native Hermes home.
// Values travel on Docker stdin, never command arguments or inherited host env.
import { spawn } from 'node:child_process';

async function python(container: string, script: string, input: unknown): Promise<string> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(container)) throw new Error('A container name or ID is required.');
  const child = spawn('docker', ['exec', '-i', '--user', 'hermes', container, '/opt/hermes/.venv/bin/python', '-c', script], { stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.on('error', () => {});
  child.stdin.end(JSON.stringify(input));
  const output: Buffer[] = [];
  child.stdout.on('data', chunk => output.push(chunk));
  // Scripts print only fixed diagnostics; input and environment values never appear.
  let diagnostic = '';
  child.stderr.on('data', chunk => { diagnostic = (diagnostic + chunk.toString()).slice(-2000); });
  const timer = setTimeout(() => child.kill('SIGKILL'), 60_000);
  try {
    const code = await new Promise<number>(resolve => { child.once('error', () => resolve(1)); child.once('exit', code => resolve(code ?? 1)); });
    if (code !== 0) throw new Error(`Executor preparation failed; Hermes was not started. ${diagnostic.trim()}`);
    return Buffer.concat(output).toString();
  } finally { clearTimeout(timer); }
}

/** Check the actual execution boundary, including exec permission rather than mode bits alone. */
export async function verifyContainer(options: { container: string; home: string; workspace: string }): Promise<void> {
  await python(options.container, String.raw`
import json,os,pathlib,shutil,subprocess,sys,tempfile
s=json.load(sys.stdin)
def require(ok,message):
    if not ok: print(message,file=sys.stderr);sys.exit(1)
require(pathlib.Path('/proc/1/comm').read_text().strip() in ['docker-init','tini'], 'Recreate the World executor with --init; PID 1 must reap orphaned children.')
for name in ['bun','git','hermes','supercode','volter-world']:
    require(shutil.which(name), 'Executor is missing required tool: '+name)
home=pathlib.Path(s['home']);workspace=pathlib.Path(s['workspace'])
require(home.is_absolute() and workspace.is_absolute() and home != workspace and home != pathlib.Path('/'), 'Use separate absolute home and checkout paths.')
roots=os.environ.get('HERMES_WRITE_SAFE_ROOT','').split(':')
require(all(any(root and pathlib.Path(root).is_absolute() and path.resolve().is_relative_to(pathlib.Path(root).resolve()) for root in roots) for path in [home,workspace]), 'Native write roots must include the Hermes home and checkout.')
scratch=home/'artifact-verification'
require(not scratch.is_symlink(), 'Verification scratch must not be a symlink.')
scratch.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory(prefix='exec-check-',dir=scratch) as temp:
    command=pathlib.Path(temp)/'probe';command.write_text('#!/bin/sh\nexit 0\n');command.chmod(0o700)
    try: subprocess.run([str(command)],check=True,timeout=5,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    except (OSError,subprocess.SubprocessError): require(False, 'Verification scratch is not executable; choose an executable home volume before activation.')
`, options);
}

/** Always load configuration from fetched main, including after an interrupted task. */
export async function prepareContainerHome(options: { container: string; home: string; workspace: string }): Promise<{ revision: string; dirty: boolean; config: string; models: Array<{ provider?: string; default?: string }> }> {
  const output = await python(options.container, String.raw`
import io,json,os,pathlib,shutil,subprocess,sys,tarfile,tempfile,yaml
s=json.load(sys.stdin)
home=pathlib.Path(s['home']);workspace=pathlib.Path(s['workspace'])
assert home.is_absolute() and workspace.is_absolute() and home != workspace and home != pathlib.Path('/')
env={**os.environ,'HOME':str(home),'GIT_TERMINAL_PROMPT':'0'}
def git(*args): return subprocess.check_output(['git','-C',str(workspace),*args],env=env,stderr=subprocess.DEVNULL,timeout=30)
assert pathlib.Path(git('rev-parse','--show-toplevel').decode().strip()).resolve() == workspace.resolve()
dirty=bool(git('status','--porcelain').strip())
git('fetch','--no-tags','origin','+refs/heads/main:refs/remotes/origin/main')
revision=git('rev-parse','origin/main').decode().strip()
config=git('show',revision+':.open-autonomy/config.yaml').decode()
# YAML is validated by the host before publishing or starting the gateway.
archive=git('archive','--format=tar',revision,'hermes')
with tempfile.TemporaryDirectory(prefix='oa-home-') as temp:
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        # Configuration may contain files and directories, never links or devices.
        for member in tar.getmembers():
            assert (member.isfile() or member.isdir()) and not pathlib.PurePosixPath(member.name).is_absolute() and '..' not in pathlib.PurePosixPath(member.name).parts
        tar.extractall(temp,filter='data')
    source=pathlib.Path(temp)/'hermes'
    assert (source/'config.yaml').is_file() and (source/'profiles/treasurer/config.yaml').is_file()
    if not dirty: git('checkout','--detach',revision)
    home.mkdir(parents=True,exist_ok=True)
    for family in ['skills/open-autonomy','hooks','plugins/escalate']:
        target=home/family
        if target.is_symlink(): target.unlink()
        elif target.exists(): shutil.rmtree(target)
    # State databases, cron execution state and native .env files belong to the runtime.
    shutil.copytree(source,home,dirs_exist_ok=True,ignore=shutil.ignore_patterns('.env'))
models=[(yaml.safe_load((home/p).read_text()) or {}).get('model',{}) for p in ['config.yaml','profiles/treasurer/config.yaml']]
print(json.dumps({'revision':revision,'dirty':dirty,'config':config,'models':models}))
`, options);
  return JSON.parse(output);
}

/** Native cron workers load the home .env as well as gateway process variables. */
export async function writeContainerEnvironment(options: { container: string; home: string; env: Record<string, string> }): Promise<void> {
  for (const name of Object.keys(options.env)) if (!/^[A-Z][A-Z0-9_]*$/.test(name)) throw new Error('Invalid runtime environment name.');
  await python(options.container, String.raw`
import json,os,pathlib,sys,tempfile
s=json.load(sys.stdin);home=pathlib.Path(s['home']);assert home.is_absolute() and home != pathlib.Path('/')
path=home/'.env';assert not path.is_symlink()
kept=[line for line in path.read_text().splitlines() if line.split('=',1)[0] not in s['env']] if path.exists() else []
lines=kept+[key+'='+json.dumps(value,ensure_ascii=False) for key,value in s['env'].items()]
fd,temp=tempfile.mkstemp(prefix='.env-',dir=home)
try:
    with os.fdopen(fd,'w') as stream: stream.write('\n'.join(lines)+'\n')
    os.replace(temp,path)
finally:
    if os.path.exists(temp): os.unlink(temp)
`, options);
}

/** The existing maintenance record identifies the host kit starting this gateway. */
export async function writeContainerKitRecord(options: { container: string; home: string; version: string }): Promise<void> {
  if (!/^\d+\.\d+\.\d+$/.test(options.version)) throw new Error('The installed host kit must have a stable version.');
  await python(options.container, String.raw`
import json,os,pathlib,sys,tempfile
s=json.load(sys.stdin);home=pathlib.Path(s['home']);assert home.is_absolute() and home != pathlib.Path('/')
fd,temp=tempfile.mkstemp(prefix='running-kit-',dir=home)
try:
    with os.fdopen(fd,'w') as stream: json.dump({'version':s['version']},stream)
    os.replace(temp,home/'running-kit.json')
finally:
    if os.path.exists(temp): os.unlink(temp)
`, options);
}

/** Hermes's native provider uses the host valve; no subscription credential enters the executor. */
export async function prepareContainerSubscription(options: { container: string; home: string; baseUrl: string }): Promise<void> {
  await python(options.container, String.raw`
import json,os,pathlib,sys
s=json.load(sys.stdin);home=pathlib.Path(s['home']);assert home.is_absolute() and home != pathlib.Path('/')
(home/'codex-home-none').mkdir(exist_ok=True)
for profile in [home,home/'profiles/treasurer']:
    path=profile/'auth.json';assert not path.is_symlink()
    store=json.loads(path.read_text()) if path.exists() else {}
    store.setdefault('providers',{}).pop('openai-codex',None)
    store.setdefault('credential_pool',{})['openai-codex']=[{'id':'valve','label':'the forwarded subscription','source':'manual:valve','priority':0,'access_token':'valve','refresh_token':'valve','base_url':s['baseUrl'],'inference_base_url':s['baseUrl']}]
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
    with os.fdopen(fd,'w') as stream:json.dump(store,stream)
`, options);
}
