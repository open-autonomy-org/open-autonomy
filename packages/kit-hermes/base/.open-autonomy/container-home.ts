// Prepare the existing container checkout and native Hermes home before startup.
// Values travel on Docker stdin, never command arguments or inherited host env.
import { spawn } from 'node:child_process';

async function python(container: string, script: string, input: unknown, bound = 60_000): Promise<string> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(container)) throw new Error('A container name or ID is required.');
  const child = spawn('docker', ['exec', '-i', '--user', 'hermes', container, '/opt/hermes/.venv/bin/python', '-c', script], { stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.on('error', () => {});
  child.stdin.end(JSON.stringify(input));
  const output: Buffer[] = [];
  child.stdout.on('data', chunk => output.push(chunk));
  // Scripts print only fixed diagnostics; input and environment values never appear.
  let diagnostic = '';
  child.stderr.on('data', chunk => { diagnostic = (diagnostic + chunk.toString()).slice(-2000); });
  const timer = setTimeout(() => child.kill('SIGKILL'), bound);
  try {
    const code = await new Promise<number>(resolve => { child.once('error', () => resolve(1)); child.once('exit', code => resolve(code ?? 1)); });
    if (code !== 0) throw new Error(`Executor preparation failed; Hermes was not started. ${diagnostic.trim()}`);
    return Buffer.concat(output).toString();
  } finally { clearTimeout(timer); }
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
# The image's own account of what it lacks (a slim image's plugin denylist, seeded at /opt/hermes/cli-config.yaml.example)
# joins a committed config that says nothing about plugins, so a removed capability is reported off, never failed at call time.
seed=pathlib.Path('/opt/hermes/cli-config.yaml.example')
cfg=home/'config.yaml'
if seed.is_file() and cfg.is_file():
    disabled=((yaml.safe_load(seed.read_text()) or {}).get('plugins') or {}).get('disabled')
    text=cfg.read_text()
    if disabled and 'plugins:' not in text: cfg.write_text(text.rstrip('\n')+'\n\n# From the image: the plugins it does not carry.\n'+yaml.safe_dump({'plugins':{'disabled':disabled}},sort_keys=False))
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

/** A workspace volume that holds no checkout yet is cloned from the project's origin, inside the executor; a populated
 *  one is left. With a `door` (the valve's GitHub port for this repository, as the executor reaches it), Git under the
 *  profile's home is told to reach the canonical origin through it — the clone's remote stays the canonical address,
 *  and every fetch and push under HOME=<home> (the prepare step's, a job's) goes through the door, credential-free. */
export async function ensureContainerClone(options: { container: string; workspace: string; origin: string; home?: string; door?: string }): Promise<'cloned' | 'present'> {
  if (!/^(https?:\/\/|git@)[\w.@:/-]+$/.test(options.origin)) throw new Error('The origin must be an https or ssh Git address');
  if (options.door && !/^https?:\/\/[\w.-]+(:\d+)?\/[\w.-]+\/[\w.-]+$/.test(options.door)) throw new Error('The door must be an http address naming owner/repo');
  const output = await python(options.container, String.raw`
import json,os,pathlib,subprocess,sys
s=json.load(sys.stdin);workspace=pathlib.Path(s['workspace']);assert workspace.is_absolute() and workspace != pathlib.Path('/')
env={**os.environ,'GIT_TERMINAL_PROMPT':'0'}
door=s.get('door');home=s.get('home')
if door and home:
    home=pathlib.Path(home);assert home.is_absolute() and home != pathlib.Path('/');home.mkdir(parents=True,exist_ok=True)
    env['HOME']=str(home)
    canon=s['origin'];bare=canon[:-4] if canon.endswith('.git') else canon
    path=bare.split('github.com',1)[1].lstrip(':/') if 'github.com' in bare else None
    forms=[canon,bare]+([f'https://github.com/{path}',f'https://github.com/{path}.git',f'git@github.com:{path}',f'git@github.com:{path}.git',f'ssh://git@github.com/{path}'] if path else [])
    have=subprocess.run(['git','config','--global','--get-all',f'url.{door}.insteadOf'],env=env,capture_output=True,text=True).stdout.split()
    for f in dict.fromkeys(forms):
        if f not in have: subprocess.check_call(['git','config','--global','--add',f'url.{door}.insteadOf',f],env=env)
if (workspace/'.git').exists(): print('present'); sys.exit(0)
assert not any(workspace.iterdir()) if workspace.exists() else True
subprocess.check_call(['git','clone','-q',s['origin'],str(workspace)],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=1500)
print('cloned')
`, options, 1_560_000); // a first clone of a large repository takes minutes; nothing else here does
  return output.trim() as 'cloned' | 'present';
}

/** A file the host composes into a home: the fleet's default profile config, nothing a project committed. */
export async function writeContainerText(options: { container: string; home: string; name: string; text: string }): Promise<void> {
  if (!/^[a-z][a-z0-9_.-]*$/.test(options.name)) throw new Error('A plain file name is required');
  await python(options.container, String.raw`
import json,os,pathlib,sys,tempfile
s=json.load(sys.stdin);home=pathlib.Path(s['home']);assert home.is_absolute() and home != pathlib.Path('/')
home.mkdir(parents=True,exist_ok=True)
path=home/s['name'];assert not path.is_symlink()
fd,temp=tempfile.mkstemp(prefix='.'+s['name']+'-',dir=home)
try:
    with os.fdopen(fd,'w') as stream: stream.write(s['text'])
    os.replace(temp,path)
finally:
    if os.path.exists(temp): os.unlink(temp)
`, options);
}

/** The kit's seed hook fires once, on the default profile, at gateway startup; a served profile's schedule is seeded
 *  by the host running that same hook under the profile's home, in the project's checkout (a job's working directory
 *  is the seeding process's). */
export async function seedContainerProfile(options: { container: string; home: string; workspace: string }): Promise<string> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(options.container)) throw new Error('A container name or ID is required.');
  const { spawn } = await import('node:child_process');
  const child = spawn('docker', ['exec', '-i', '--user', 'hermes', '-w', options.workspace, '-e', `HERMES_HOME=${options.home}`, '-e', `HOME=${options.home}`, options.container, '/opt/hermes/.venv/bin/python', '-c', String.raw`
import asyncio,importlib.util,logging,os,pathlib,sys
logging.basicConfig(level=logging.INFO,format='%(message)s',stream=sys.stdout)
sys.path.insert(0,'/opt/hermes')
home=pathlib.Path(os.environ['HERMES_HOME'])
hook=home/'hooks'/'seed'/'handler.py'
if not hook.is_file(): print('seed: no hook in this home'); sys.exit(0)
spec=importlib.util.spec_from_file_location('seed_handler',hook);mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
asyncio.run(mod.handle('gateway:startup',{}))
`], { stdio: ['ignore', 'pipe', 'pipe'] });
  const out: Buffer[] = []; let err = '';
  child.stdout.on('data', (c) => out.push(c)); child.stderr.on('data', (c) => { err = (err + c.toString()).slice(-2000); });
  const timer = setTimeout(() => child.kill('SIGKILL'), 60_000);
  try {
    const code = await new Promise<number>((resolve) => { child.once('error', () => resolve(1)); child.once('exit', (c) => resolve(c ?? 1)); });
    if (code !== 0) throw new Error(`seeding the profile's schedule failed: ${err.trim()}`);
    return Buffer.concat(out).toString().trim();
  } finally { clearTimeout(timer); }
}
