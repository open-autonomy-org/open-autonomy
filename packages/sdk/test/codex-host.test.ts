// The subscription and worker boundary must survive separate sessions and shutdown.
import { expect, test } from 'bun:test';
import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startCodexHost } from '../src/codex-host.ts';

test('the host isolates session processes and worker context, and rejects changed authority', async () => {
  const root = mkdtempSync(join(tmpdir(), 'oa-host-test-'));
  const binary = join(root, 'codex');
  const token = 'synthetic_project_capability_0123456789';
  const originalHome = process.env.CODEX_HOME, originalKey = process.env.OPENAI_API_KEY;
  process.env.CODEX_HOME = root;
  process.env.OPENAI_API_KEY = 'synthetic-host-secret';
  writeFileSync(binary, `#!/usr/bin/env bun
import {createInterface} from 'node:readline';
import {writeFileSync,existsSync,appendFileSync} from 'node:fs';
const root=${JSON.stringify(root)};
const config={mcp_servers:{personal:{enabled:true}},model_providers:{}};
for(let i=0;i<process.argv.length;i++)if(process.argv[i]==='-c') {
 const value=process.argv[++i],at=value.indexOf('=');config[value.slice(0,at)]=Bun.TOML.parse('v='+value.slice(at+1)).v;
}
const trace={pid:process.pid,config,keyPresent:!!process.env.OPENAI_API_KEY,executor:process.env.CODEX_EXEC_SERVER_URL,methods:[]};
const path=root+'/'+process.pid+'.json';
process.on('SIGTERM',()=>{writeFileSync(root+'/'+process.pid+'.closed','closed');process.exit(0)});
for await(const line of createInterface({input:process.stdin})) {
 const p=JSON.parse(line);trace.methods.push(p.method);writeFileSync(path,JSON.stringify(trace));
 if(p.id===undefined)continue;
 let result={};
 if(p.method==='account/read')result={account:{type:existsSync(root+'/api-login')?'apiKey':'chatgpt',email:'private@example.test'}};
 if(p.method==='model/list')result={data:[{id:'agreed-model'}]};
 if(p.method==='config/read')result={config:existsSync(root+'/unsafe')?{...config,mcp_servers:{...config.mcp_servers,unexpected:{enabled:true}}}:config};
 if(p.method==='environment/info')result={};
 if(p.method==='environment/status')result={status:p.params.environmentId==='local'?'unknown':'ready'};
 if(p.method==='thread/start')result={thread:{id:'thread-'+process.pid}};
 console.log(JSON.stringify({id:p.id,result}));
}
`);
  chmodSync(binary, 0o700);
  let host: Awaited<ReturnType<typeof startCodexHost>> | undefined;
  const sockets: WebSocket[] = [];
  const traces = () => readdirSync(root).filter(p => p.endsWith('.json')).map(p => JSON.parse(readFileSync(join(root, p), 'utf8')));
  async function connect(context: object) {
    const WS = WebSocket as unknown as { new(url: string, options: Bun.WebSocketOptions): WebSocket };
    const socket = new WS(host!.url, { headers: { authorization: 'Bearer ' + token, 'x-open-autonomy-context': JSON.stringify(context) } });
    sockets.push(socket);
    const messages: any[] = [];
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Fixture handshake timed out')), 2000);
      socket.onopen = () => socket.send(JSON.stringify({ id: 1, method: 'initialize', params: {} }));
      socket.onmessage = event => { messages.push(JSON.parse(String(event.data))); clearTimeout(timer); resolve(); };
      socket.onclose = () => { clearTimeout(timer); resolve(); };
      socket.onerror = () => { clearTimeout(timer); reject(Error('Fixture connection failed')); };
    });
    return { socket, messages };
  }
  try {
    host = await startCodexHost({ binary, token, model: 'agreed-model', workspace: '/work/project', hermesHome: '/opt/data', executorUrl: 'ws://127.0.0.1:50000', stateDir: join(root, 'state') });
    const a = await connect({ HERMES_HOME: '/opt/data', HERMES_KANBAN_TASK: 't_alpha', HERMES_KANBAN_RUN_ID: '1', HERMES_KANBAN_DB: '/opt/data/kanban.db' });
    const b = await connect({ HERMES_HOME: '/opt/data/profiles/treasurer', HERMES_KANBAN_TASK: 't_beta', HERMES_KANBAN_RUN_ID: '2', HERMES_KANBAN_DB: '/opt/data/kanban.db' });
    expect(a.messages[0].result.userAgent).toBe('open-autonomy-codex-bridge');
    expect(b.messages[0].result.userAgent).toBe('open-autonomy-codex-bridge');
    const sessions = traces().filter(t => t.executor !== 'none');
    expect(sessions).toHaveLength(2);
    expect(new Set(sessions.map(t => t.pid)).size).toBe(2);
    expect(sessions.map(t => t.config.mcp_servers.open_autonomy_hermes.env.HERMES_KANBAN_TASK).sort()).toEqual(['t_alpha', 't_beta']);
    expect(sessions.every(t => !t.keyPresent && t.config.mcp_servers.personal.enabled === false)).toBe(true);
    expect(JSON.stringify([...a.messages, ...b.messages])).not.toContain('private@example.test');
    for (const context of [{ HERMES_HOME: '/host' }, { OPENAI_API_KEY: 'injected' }, { HERMES_KANBAN_TASK: 't_unowned' }, { HERMES_HOME: '/opt/data/../host' }]) {
      const response = await fetch(host.url.replace('ws:', 'http:'), { headers: { authorization: 'Bearer ' + token, 'x-open-autonomy-context': JSON.stringify(context) } });
      expect(response.status).toBe(400);
    }
    expect(traces()).toHaveLength(3); // Discovery plus exactly the two accepted sessions.
    writeFileSync(join(root, 'unsafe'), 'new unapproved MCP server');
    const refused = await connect({});
    expect(refused.messages).toEqual([]);
    expect(traces().every(t => !t.methods.includes('thread/start') && !t.methods.includes('turn/start'))).toBe(true);
    rmSync(join(root, 'unsafe'));
    writeFileSync(join(root, 'api-login'), 'changed login');
    expect((await connect({})).messages).toEqual([]);
    host.close();
    for (let i = 0; i < 50 && readdirSync(root).filter(p => p.endsWith('.closed')).length < traces().length; i++) await Bun.sleep(10);
    expect(readdirSync(root).filter(p => p.endsWith('.closed')).length).toBe(traces().length);
  } finally {
    host?.close(); for (const socket of sockets) socket.close();
    if (originalHome === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = originalHome;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey;
    rmSync(root, { recursive: true, force: true });
  }
});
