// Host orchestration of the existing container checkout and native Hermes home.
// Values travel on Docker stdin, never command arguments or inherited host env.
import { spawn } from 'node:child_process';

async function python(container: string, script: string, input: unknown): Promise<string> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(container)) throw new Error('A container name or ID is required.');
  const child = spawn('docker', ['exec', '-i', '--user', 'hermes', container, 'python3', '-c', script], { stdio: ['pipe', 'pipe', 'ignore'] });
  child.stdin.on('error', () => {});
  child.stdin.end(JSON.stringify(input));
  const output: Buffer[] = [];
  child.stdout.on('data', chunk => output.push(chunk));
  const timer = setTimeout(() => child.kill('SIGKILL'), 60_000);
  try {
    const code = await new Promise<number>(resolve => { child.once('error', () => resolve(1)); child.once('exit', code => resolve(code ?? 1)); });
    if (code !== 0) throw new Error('Container home preparation failed; Hermes was not started. Check the committed configuration and Git connection.');
    return Buffer.concat(output).toString();
  } finally { clearTimeout(timer); }
}

/** Always load configuration from fetched main, including after an interrupted task. */
export async function prepareContainerHome(options: { container: string; home: string; workspace: string }): Promise<{ revision: string; dirty: boolean; config: string }> {
  const output = await python(options.container, String.raw`
import io,json,os,pathlib,shutil,subprocess,sys,tarfile,tempfile
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
print(json.dumps({'revision':revision,'dirty':dirty,'config':config}))
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
