// Manual runtime regression: operate only a disposable home/repository and owned
// processes in an existing World executor. Never touch its real fleet home or board.
// Run attached to that executor's World: bun <this file> <container>.
import { prepareContainerHome, verifyContainer } from '../../../../packages/sdk/src/container-home.ts';
import { startContainerProcess } from '../../../../packages/sdk/src/container-process.ts';

if (!process.env.VOLTER_WORLD) throw new Error('Run through volter-world attach');
const container = process.argv[2];
if (!container || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(container)) throw new Error('Name the existing World executor');
function python(script: string, ...args: string[]): string {
  const r = Bun.spawnSync({ cmd: ['docker', 'exec', '--user', 'hermes', container,
    '/opt/hermes/.venv/bin/python', '-c', script, ...args], stdout: 'pipe', stderr: 'pipe', timeout: 30_000 });
  if (r.exitCode !== 0) throw new Error(r.stderr.toString());
  return r.stdout.toString().trim();
}
const root = python(String.raw`
import pathlib,tempfile,subprocess
r=pathlib.Path(tempfile.mkdtemp(prefix='kit-runtime-',dir='/opt/data/artifact-verification'))
source=r/'source';source.mkdir();home=r/'home';home.mkdir();origin=r/'origin.git'
def git(*args): subprocess.run(['git',*args],cwd=source,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
git('init','-b','main');git('config','user.name','Synthetic owner');git('config','user.email','owner@example.test')
for name in ['hermes/config.yaml','hermes/profiles/treasurer/config.yaml']:
 p=source/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text('model:\n  provider: custom\n  default: synthetic\n')
(source/'.open-autonomy').mkdir();(source/'.open-autonomy/config.yaml').write_text('account: cookbook/setup-proof\n')
(source/'work.txt').write_text('committed work\n')
git('add','.');git('commit','-m','synthetic opening');git('init','--bare',str(origin));git('remote','add','origin',str(origin));git('push','origin','main')
git('clone','-b','main',str(origin),str(r/'checkout'))
(home/'state.db').write_bytes(b'synthetic native state sentinel')
print(r)
`);
const home = `${root}/home`, workspace = `${root}/checkout`;
await verifyContainer({ container, home, workspace });
const first = await prepareContainerHome({ container, home, workspace });
if (first.dirty || first.models[0].provider !== 'custom') throw new Error('Fresh preparation changed the selected provider');
python(String.raw`
import pathlib,sys
r=pathlib.Path(sys.argv[1]);(r/'checkout/work.txt').write_text('unfinished worker edit\n')
(r/'checkout/hermes/config.yaml').write_text('model:\n  provider: unlanded\n')
`, root);
const resumed = await prepareContainerHome({ container, home, workspace });
if (!resumed.dirty || resumed.revision !== first.revision || resumed.models[0].provider !== 'custom') throw new Error('Resume used unlanded configuration');
python(String.raw`
import pathlib,sys
r=pathlib.Path(sys.argv[1])
assert (r/'checkout/work.txt').read_text() == 'unfinished worker edit\n'
assert 'unlanded' in (r/'checkout/hermes/config.yaml').read_text()
assert (r/'home/state.db').read_bytes() == b'synthetic native state sentinel'
`, root);
console.log('PASS executable scratch, native tools/write roots, committed configuration, dirty work and state preservation');

const owned = startContainerProcess({ container, cwd: root, command: ['python3', '-c',
  'import os,pathlib,time; pathlib.Path("owned.pid").write_text(str(os.getpid())); time.sleep(120)'] });
try {
  const deadline = Date.now() + 15_000;
  while (python('import pathlib,sys;print((pathlib.Path(sys.argv[1])/"owned.pid").exists())', root) !== 'True') {
    if (Date.now() > deadline) throw new Error('Owned process did not signal readiness');
    await Bun.sleep(50);
  }
} finally { await owned.close(); }
python(String.raw`
import os,pathlib,sys
pid=int((pathlib.Path(sys.argv[1])/'owned.pid').read_text())
try: os.kill(pid,0)
except ProcessLookupError: pass
else: raise RuntimeError('Closing the host control stream left its child alive')
`, root);
console.log('PASS closing host control stream terminates the owned gateway substitute');

python(String.raw`
import os,pathlib,subprocess,time
# Each owned parent exits after its child has reported adoption by PID 1.
code='''import os,time
r,w=os.pipe();pid=os.fork()
if pid:
 os.close(w);os.read(r,1);os._exit(0)
os.close(r);os.write(w,b"r");os.close(w)
deadline=time.monotonic()+3
while os.getppid()!=1 and time.monotonic()<deadline: time.sleep(.01)
print(str(os.getpid())+":"+str(os.getppid()),flush=True)
'''
pids=[]
for _ in range(16):
 out=subprocess.check_output(['python3','-c',code],timeout=5).decode().strip()
 pid,parent=map(int,out.split(':'));assert parent==1;pids.append(pid)
deadline=time.monotonic()+5
while any(pathlib.Path('/proc/'+str(pid)).exists() for pid in pids) and time.monotonic()<deadline: time.sleep(.01)
assert all(not pathlib.Path('/proc/'+str(pid)).exists() for pid in pids),'Orphan children were not reaped'
`);
console.log('PASS 16 owned orphan children adopted and reaped by PID 1');
console.log(`Evidence retained in disposable executor directory ${root}`);
