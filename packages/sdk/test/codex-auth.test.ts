import { expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { codexAccess } from '../src/codex-auth.ts';

// Protocol fixture, no vendor or real login. Each new client must use the current
// Codex account, leave storage untouched and delegate rejected-token refresh.
test('Codex owns login selection and refresh; logout and protocol errors fail closed', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oa-codex-auth-'));
  const path = process.env.PATH;
  writeFileSync(join(dir, 'codex'), `#!/usr/bin/env python3
import sys,os,json,base64
from pathlib import Path
home=Path(os.environ['CODEX_HOME'])
for line in sys.stdin:
 m=json.loads(line)
 if not m.get('id'): continue
 with (home/'calls').open('a') as f: f.write(m['method']+':'+str(bool(m.get('params',{}).get('refreshToken'))).lower()+'\\n')
 result={}
 if m['method']=='getAuthStatus':
  current=json.loads((home/'current').read_text())
  if current.get('error'):
   print(json.dumps({'id':m['id'],'error':{'message':'synthetic-secret-do-not-publish'}}),flush=True)
   continue
  claims={'exp':4102444800,'https://api.openai.com/auth':{'chatgpt_account_id':current.get('account')}}
  token='synthetic.'+base64.urlsafe_b64encode(json.dumps(claims).encode()).decode()+'.'+('renewed' if m['params']['refreshToken'] else 'original')
  result={'authMethod':current.get('mode','chatgpt'),'authToken':token if current.get('account') else None}
 print(json.dumps({'id':m['id'],'result':result}),flush=True)
`, { mode: 0o700 });
  process.env.PATH = `${dir}:${path}`;
  const current = join(dir, 'current');
  try {
    writeFileSync(current, JSON.stringify({ account: 'first' }));
    const first = await codexAccess({ home: dir });
    expect(first.accountId).toBe('first');
    writeFileSync(current, JSON.stringify({ account: 'second' }));
    const second = await codexAccess({ home: dir, rejectedToken: first.accessToken });
    expect(second.accountId).toBe('second');
    expect(second.accessToken.endsWith('.original')).toBe(true);
    const renewed = await codexAccess({ home: dir, rejectedToken: second.accessToken });
    expect(renewed.accessToken.endsWith('.renewed')).toBe(true);
    expect(JSON.parse(readFileSync(current, 'utf8'))).toEqual({ account: 'second' });
    expect(readFileSync(join(dir, 'calls'), 'utf8').match(/getAuthStatus:true/g)).toHaveLength(1);
    for (const record of [{ account: null }, { account: 'api', mode: 'apikey' }, { error: true }]) {
      writeFileSync(current, JSON.stringify(record));
      await expect(codexAccess({ home: dir })).rejects.toThrow('Codex login unavailable.');
    }
  } finally { process.env.PATH = path; rmSync(dir, { recursive: true, force: true }); }
});
