// Prepare the existing container checkout and native Hermes home before startup.
// Values travel on Docker stdin, never command arguments or inherited host env.
import { spawn } from 'node:child_process';

async function python(container: string, script: string, input: unknown, bound = 60_000, failed = 'Executor preparation failed; Hermes was not started.'): Promise<string> {
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
    if (code !== 0) throw new Error(`${failed} ${diagnostic.trim()}`);
    return Buffer.concat(output).toString();
  } finally { clearTimeout(timer); }
}

/** Always load configuration from fetched main, including after an interrupted task. */
export async function prepareContainerHome(options: { container: string; home: string; workspace: string }): Promise<{ revision: string; dirty: boolean; config: string; agent: string }> {
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
# the agent's setup (docs/decisions/0007): the applier renders it on the host's side after this copy
try: agent=git('show',revision+':.open-autonomy/agent.json').decode()
except subprocess.CalledProcessError: agent=''
# YAML is validated by the host before publishing or starting the gateway.
archive=git('archive','--format=tar',revision,'hermes')
with tempfile.TemporaryDirectory(prefix='oa-home-') as temp:
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        # Configuration may contain files and directories, never links or devices.
        for member in tar.getmembers():
            assert (member.isfile() or member.isdir()) and not pathlib.PurePosixPath(member.name).is_absolute() and '..' not in pathlib.PurePosixPath(member.name).parts
        tar.extractall(temp,filter='data')
    source=pathlib.Path(temp)/'hermes'
    if not dirty: git('checkout','--detach',revision)
    home.mkdir(parents=True,exist_ok=True)
    for family in ['skills/open-autonomy','hooks','plugins/escalate']:
        target=home/family
        if target.is_symlink(): target.unlink()
        elif target.exists(): shutil.rmtree(target)
    # A composed profile's link (fleet.ts) whose flat home is gone would stop the copy below; the fleet relinks it.
    for link in (home/'profiles').glob('*'):
        if link.is_symlink() and not link.exists(): link.unlink()
    # State databases, cron execution state and native .env files belong to the runtime.
    shutil.copytree(source,home,dirs_exist_ok=True,ignore=shutil.ignore_patterns('.env'))
print(json.dumps({'revision':revision,'dirty':dirty,'config':config,'agent':agent}))
`, options);
  return JSON.parse(output);
}

/**
 * Where main is now, for a running stack (start.ts's watch, read in the executor): a clean checkout fetches it and names
 * the files changed since `since`; where any changed, whether the board has a task running or in review (`busy`, null
 * when the board cannot be read). A checkout with tracked changes is a killed attempt's: nothing is fetched. A started
 * revision main no longer reaches (a rewritten history) names no files: `changed` is null, and the stack restarts.
 */
export async function containerMainMoved(options: { container: string; home: string; workspace: string; since: string }): Promise<{ main?: string; changed: string[] | null; busy?: boolean | null }> {
  if (!/^[0-9a-f]{40}$/.test(options.since)) throw new Error('The started revision must be a commit id');
  const output = await python(options.container, String.raw`
import json,os,pathlib,subprocess,sys
s=json.load(sys.stdin)
home=pathlib.Path(s['home']);workspace=pathlib.Path(s['workspace'])
env={**os.environ,'HOME':str(home),'HERMES_HOME':str(home),'GIT_TERMINAL_PROMPT':'0'}
def git(*args): return subprocess.check_output(['git','-C',str(workspace),*args],env=env,stderr=subprocess.DEVNULL,timeout=60).decode()
if git('status','--porcelain','--untracked-files=no').strip(): print(json.dumps({'changed':[]})); sys.exit(0)
git('fetch','-q','--no-tags','origin','+refs/heads/main:refs/remotes/origin/main')
main=git('rev-parse','origin/main').strip()
changed=[]
if main!=s['since']:
    diff=subprocess.run(['git','-C',str(workspace),'diff','--name-only',s['since'],main],env=env,capture_output=True,timeout=60)
    changed=diff.stdout.decode().split() if diff.returncode==0 else None
busy=None
if changed is None or changed:
    board=subprocess.run(['hermes','kanban','list','--json'],cwd=str(workspace),env=env,capture_output=True,timeout=60)
    try: tasks=json.loads(board.stdout) if board.returncode==0 else None
    except ValueError: tasks=None
    if isinstance(tasks,list): busy=any(isinstance(t,dict) and t.get('status') in ('running','review') for t in tasks)
print(json.dumps({'main':main,'changed':changed,'busy':busy}))
`, options, 150_000, 'Reading main in the executor failed.');
  return JSON.parse(output);
}

/**
 * For another harness than Hermes (ADR 0009), the persona and skills of the committed `hermes/` in the workers' forms,
 * rendered into the home inside the executor by the kit's own `renderWorkerForms` (agent.ts, in the image beside Bun), as
 * the bare start renders them on its host: `AGENTS.md` with `SOUL.md` its link, each skill under `.agents/skills/`.
 */
export async function renderContainerWorkerForms(options: { container: string; home: string; workspace: string; revision: string }): Promise<string[]> {
  const output = await python(options.container, String.raw`
import io,json,os,pathlib,subprocess,sys,tarfile,tempfile
s=json.load(sys.stdin)
home=pathlib.Path(s['home']);workspace=pathlib.Path(s['workspace'])
env={**os.environ,'HOME':str(home),'GIT_TERMINAL_PROMPT':'0'}
archive=subprocess.check_output(['git','-C',str(workspace),'archive','--format=tar',s['revision'],'hermes'],env=env,stderr=subprocess.DEVNULL,timeout=30)
with tempfile.TemporaryDirectory(prefix='oa-forms-') as temp:
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        for member in tar.getmembers():
            assert (member.isfile() or member.isdir()) and not pathlib.PurePosixPath(member.name).is_absolute() and '..' not in pathlib.PurePosixPath(member.name).parts
        tar.extractall(temp,filter='data')
    code="import { renderWorkerForms } from '/opt/agent/.open-autonomy/agent.ts'; console.log(JSON.stringify(renderWorkerForms(process.env.OA_FROM, process.env.OA_TO)))"
    out=subprocess.check_output(['bun','-e',code],env={**env,'OA_FROM':str(pathlib.Path(temp)/'hermes'),'OA_TO':str(home)},timeout=60)
print(out.decode().strip().splitlines()[-1])
`, options);
  return JSON.parse(output);
}

/**
 * Codex's own sandbox off in each profile's Codex home. In the executor Codex's bubblewrap cannot make its namespaces
 * and every command fails (measured: a PM run could run nothing); the executor is the boundary, as for Hermes's own
 * terminal there. The gate is the profile's approvals: where it keeps them (the treasurer, which pays) the
 * orchestrator starts its Codex worker with `approval_policy: untrusted`, so Codex asks before every command and
 * Hermes's approval rule answers (ADR 0009). The key is written at the top of the home's `config.toml`; the
 * orchestrator's tables are kept.
 */
export async function openContainerCodexSandbox(options: { container: string; home: string }): Promise<string[]> {
  const output = await python(options.container, String.raw`
import json,pathlib,re,sys,yaml
s=json.load(sys.stdin)
home=pathlib.Path(s['home'])
lines=[]
for profile in [home]+[p for p in sorted((home/'profiles').glob('*')) if p.is_dir()]:
    cfg=profile/'config.yaml'
    doc=(yaml.safe_load(cfg.read_text()) if cfg.exists() else None) or {}
    raw=(doc.get('approvals') or {}).get('mode')
    # YAML reads a bare off as false, which Hermes takes as off (tools/approval.py _normalize_approval_mode)
    mode='off' if raw is False else str(raw or 'manual').strip().lower()
    codex=profile/'codex'
    codex.mkdir(parents=True,exist_ok=True)
    f=codex/'config.toml'
    text=f.read_text() if f.exists() else ''
    first=re.search(r'(?m)^\s*\[',text)
    head,tail=(text[:first.start()],text[first.start():]) if first else (text,'')
    head=re.sub(r'(?m)^sandbox_mode\s*=.*\n?','',head)
    f.write_text('sandbox_mode = "danger-full-access"\n'+head+tail)
    lines.append(f"{profile.name if profile != home else 'home'}: Codex sandbox off; {'approvals off' if mode=='off' else 'approvals '+mode+': Codex asks before every command'}")
print(json.dumps(lines))
`, options);
  return JSON.parse(output);
}

/**
 * The image's own account of what it lacks (a slim image's plugin denylist, seeded at
 * /opt/hermes/cli-config.yaml.example) joins the rendered config when that says nothing about plugins, so a removed
 * capability is reported off, never failed at call time. Runs after the agent's setup is applied: the runtime's fact
 * about its image, beside the package's settings.
 */
export async function mergeImageDenylist(options: { container: string; home: string }): Promise<void> {
  await python(options.container, String.raw`
import json,pathlib,sys,yaml
s=json.load(sys.stdin)
home=pathlib.Path(s['home'])
seed=pathlib.Path('/opt/hermes/cli-config.yaml.example')
for cfg in [home/'config.yaml', *sorted((home/'profiles').glob('*/config.yaml'))]:
    if not (seed.is_file() and cfg.is_file()): continue
    disabled=((yaml.safe_load(seed.read_text()) or {}).get('plugins') or {}).get('disabled')
    text=cfg.read_text()
    if disabled and 'plugins:' not in text: cfg.write_text(text.rstrip('\n')+'\n\n# From the image: the plugins it does not carry.\n'+yaml.safe_dump({'plugins':{'disabled':disabled}},sort_keys=False))
`, options);
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
    if profile != home and not profile.is_dir(): continue  # a composed fleet home carries no treasurer
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

