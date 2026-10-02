// The pay boundary in container mode (docs/decisions/0021): the treasurer in its own executor. The developer's executor
// runs every other profile and holds no treasurer, no pay address and no pay credential; this one runs the treasurer
// alone, on its own home volume at /opt/data, with the developer's home volume at /opt/board for the shared board and
// nothing else. The pay port's caller credential (valve.ts --caller) is written only here.
//
// What crosses from the developer's side is data: the board's rows. Nothing the developer can write is executed here.
// The treasurer's persona and setup come from the host's own copy of the kit (the runtime's release, cut from a landed
// revision), never from the developer's checkout, which could otherwise point the treasurer's model, and the credential
// it presents, anywhere. Its tasks run in its own workspace and log into its own home, whatever workspace a request
// names: a worktree there would run the developer's Git hooks, and a log on the board's volume would put the
// treasurer's transcript (a card's number among it) where the developer reads. The owner's bounds it reads before paying
// (.open-autonomy/config.yaml) are the host's committed copy, written into that workspace; the platform enforces them.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { spawn } from 'node:child_process';

export const TREASURER = 'treasurer';
export const BOARD = '/opt/board';

/** The treasurer's executor is the developer's, named apart. */
export const treasurerContainer = (container: string) => `${container}-${TREASURER}`;

/** The treasurer's persona as the host's kit carries it: every regular file under <content>/profiles/treasurer. */
export function treasurerPersona(kitDir: string): Record<string, string> | null {
  const dir = ['home', 'hermes'].map((content) => resolve(kitDir, '..', content, 'profiles', TREASURER)).find((d) => existsSync(resolve(d, 'SOUL.md')));
  if (!dir) return null;
  const files: Record<string, string> = {};
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const path = resolve(d, name), stat = statSync(path);
      if (stat.isDirectory()) walk(path);
      else if (stat.isFile() && name !== '.env') files[relative(dir, path)] = readFileSync(path, 'utf8');
    }
  };
  walk(dir);
  return files;
}

function python(container: string, script: string, input: unknown): Promise<string> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(container)) throw new Error('A container name or ID is required.');
  const child = spawn('docker', ['exec', '-i', '--user', 'hermes', container, '/opt/hermes/.venv/bin/python', '-c', script], { stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.on('error', () => {});
  child.stdin.end(JSON.stringify(input));
  const output: Buffer[] = [];
  child.stdout.on('data', (chunk) => output.push(chunk));
  let diagnostic = '';
  child.stderr.on('data', (chunk) => { diagnostic = (diagnostic + chunk.toString()).slice(-2000); });
  const timer = setTimeout(() => child.kill('SIGKILL'), 60_000);
  return new Promise<string>((done, fail) => {
    child.once('error', () => { clearTimeout(timer); fail(new Error('The treasurer\'s executor could not be prepared; nothing pays.')); });
    child.once('exit', (code) => { clearTimeout(timer); if (code === 0) done(Buffer.concat(output).toString()); else fail(new Error(`The treasurer's executor could not be prepared; nothing pays. ${diagnostic.trim()}`)); });
  });
}

/** The treasurer's home in its executor: the host kit's persona over what is there (its sessions and state stay), its
 *  workspace holding the owner's committed config, and both mounts present. */
export async function prepareTreasurerHome(options: { container: string; persona: Record<string, string>; config: string }): Promise<void> {
  await python(options.container, String.raw`
import json,os,pathlib,shutil,sys,tempfile
s=json.load(sys.stdin)
root=pathlib.Path('/opt/data');profile=root/'profiles'/'treasurer';board=pathlib.Path('/opt/board')
assert os.path.ismount(root) and os.path.ismount(board), 'the treasurer executor needs its own home at /opt/data and the board at /opt/board'
# the persona's families are mirrored: a skill the kit no longer carries leaves
for family in ['skills','SOUL.md','AGENTS.md']:
    target=profile/family
    if target.is_symlink() or target.is_file(): target.unlink()
    elif target.exists(): shutil.rmtree(target)
for name,text in s['persona'].items():
    path=pathlib.PurePosixPath(name)
    assert not path.is_absolute() and '..' not in path.parts
    target=profile/path
    target.parent.mkdir(parents=True,exist_ok=True)
    fd,temp=tempfile.mkstemp(dir=target.parent)
    with os.fdopen(fd,'w') as stream: stream.write(text)
    os.replace(temp,target)
for d in ['work','logs']: (profile/d).mkdir(exist_ok=True)
bounds=profile/'work'/'.open-autonomy';bounds.mkdir(exist_ok=True)
fd,temp=tempfile.mkstemp(dir=bounds)
with os.fdopen(fd,'w') as stream: stream.write(s['config'])
os.replace(temp,bounds/'config.yaml')
`, { persona: options.persona, config: options.config });
}

// The treasurer's dispatcher: Hermes's own tick on the shared board, spawning only the treasurer's lane. Hermes skips an
// assignee that is no profile of its home (a lane another host serves), and the developer's home has no treasurer, so
// each side runs its own lanes; a claim names its host, so neither reaps the other's workers. Every task runs in the
// treasurer's own workspace and logs into its own home.
const DISPATCH = String.raw`
import dataclasses,os,pathlib,signal,sys,time
from hermes_cli import kanban_db as kb, profiles
LANE='treasurer'
profile=pathlib.Path('/opt/data/profiles')/LANE
work=profile/'work';logs=profile/'logs'
profiles.profile_exists=lambda name: profiles.normalize_profile_name(name)==LANE
def own(task, board=None):
    work.mkdir(parents=True,exist_ok=True);return work
kb.resolve_workspace=own
kb._resolve_worktree_workspace=lambda task, board=None: (own(task), task.branch_name or '')
kb.worker_logs_dir=lambda board=None: logs
# the treasurer's model is its own setup's: a request cannot choose another model or provider for it
def spawn(task, workspace, board=None):
    return kb._default_spawn(dataclasses.replace(task,model_override=None,provider_override=None),workspace,board=board)
stopping=False
def stop(*_):
    global stopping
    stopping=True
signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
print('treasurer: dispatching the treasurer lane of the board at '+str(kb.kanban_db_path()),flush=True)
while not stopping:
    try:
        conn=kb.connect()
        try: kb.dispatch_once(conn,spawn_fn=spawn,max_in_progress_per_profile=1,reconcile_orphans=False)
        finally: conn.close()
    except Exception as error:
        print('treasurer: dispatch failed: '+str(error),file=sys.stderr,flush=True)
    for _ in range(15):
        if stopping: break
        time.sleep(1)
`;

/** The process that runs the treasurer's lane, for startContainerProcess. */
export const treasurerDispatch = ['/opt/hermes/.venv/bin/python', '-u', '-c', DISPATCH];

/** The environment of the treasurer's side: its own home, the board pinned to the developer's volume. */
export const treasurerBoardEnvironment = {
  HERMES_HOME: '/opt/data', HOME: '/opt/data', TERMINAL_CWD: `/opt/data/profiles/${TREASURER}/work`,
  HERMES_KANBAN_HOME: BOARD, HERMES_KANBAN_DB: `${BOARD}/kanban.db`, HERMES_KANBAN_WORKSPACES_ROOT: `/opt/data/profiles/${TREASURER}/work`,
};
