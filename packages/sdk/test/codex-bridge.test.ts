// Project authority at the host boundary: no account/config access, cross-session
// history, arbitrary execution environment, or secret-bearing host diagnostics.
import { expect, test } from 'bun:test';
import { PassThrough } from 'node:stream';
import { CodexBridgeSession, forwardCodexStdio, serveCodexBridge } from '../src/codex-bridge.ts';
const policy = { model: 'agreed-model', modelProvider: 'openai', workspace: '/work/project', environmentId: 'remote' };
function fixture() {
  const client: any[] = [], server: any[] = []; let closed = false;
  const session = new CodexBridgeSession(policy, { client: p => client.push(p), server: p => server.push(p), close: () => { closed = true; } });
  const send = (p: any) => session.fromClient(JSON.stringify(p));
  const receive = (p: any) => session.fromServer(JSON.stringify(p));
  const initialize = () => { send({ id: 1, method: 'initialize', params: { capabilities: { arbitrary: true } } }); receive({ id: 1, result: { codexHome: '/host/private', userAgent: 'native' } }); send({ method: 'initialized' }); };
  const ready = () => {
    while (server.at(-1)?.method?.startsWith('environment/')) {
      const p = server.at(-1);
      receive({ id: p.id, result: p.method === 'environment/info' ? { shell: { name: 'bash', path: '/bin/bash' } } : { status: p.params.environmentId === 'local' ? 'unknown' : 'ready' } });
    }
  };
  const thread = () => { initialize(); send({ id: 2, method: 'thread/start', params: { cwd: '/work/project' } }); ready(); receive({ id: 2, result: { thread: { id: 'owned-thread', path: '/host/private/session.json' } } }); };
  return { session, client, server, send, receive, initialize, thread, ready, closed: () => closed };
}
test('the host pins thread execution and withholds host metadata', () => {
  const f = fixture(); f.thread();
  expect(f.server.find(p => p.method === 'thread/start').params).toEqual({ cwd: '/work/project', model: 'agreed-model', modelProvider: 'openai', ephemeral: true, approvalPolicy: 'never', environments: [{ environmentId: 'remote', cwd: '/work/project' }] });
  expect(JSON.stringify(f.client)).not.toContain('/host/private');
  f.send({ id: 3, method: 'turn/start', params: { threadId: 'owned-thread', input: [{ type: 'text', text: 'implement the task' }] } });
  f.ready(); f.receive({ id: 3, result: { turn: { id: 'turn-1' } } });
  f.receive({ method: 'item/agentMessage/delta', params: { threadId: 'owned-thread', delta: 'done' } });
  expect(f.client.at(-1).params.delta).toBe('done');
});
test('container requests cannot reach account, configuration, filesystem or history APIs', () => {
  for (const method of ['account/read', 'account/login/start', 'account/logout', 'config/read', 'config/value/write', 'fs/readFile', 'command/exec', 'thread/list', 'thread/read', 'thread/resume', 'mcpServer/oauth/login']) {
    const f = fixture(); f.thread(); const before = f.server.length;
    f.send({ id: 3, method, params: {} });
    expect(f.server.length).toBe(before);
    expect(f.client.at(-1).error).toBeDefined();
  }
});
test('scope changes, forged responses and crossed thread IDs fail closed', () => {
  for (const params of [{ cwd: '/host' }, { cwd: '/work/project/../secrets' }, { cwd: '/work/project-other' }, { cwd: '/work/project', config: { mcp_servers: { hostile: {} } } }, { cwd: '/work/project', environments: [{ environmentId: 'local' }] }]) {
    const f = fixture(); f.initialize(); const before = f.server.length;
    f.send({ id: 2, method: 'thread/start', params });
    expect(f.closed()).toBe(true); expect(f.server.length).toBe(before);
  }
  const f = fixture(); f.thread(); const count = f.client.length;
  f.receive({ method: 'item/agentMessage/delta', params: { threadId: 'another-project', delta: 'private' } });
  expect(f.client.length).toBe(count);
  f.send({ id: 9, method: 'turn/start', params: { threadId: 'another-project', input: [{ type: 'text', text: 'read' }] } });
  expect(f.closed()).toBe(true);
  const g = fixture(); g.send({ id: 1, result: { approved: true } }); expect(g.closed()).toBe(true);
});
test('host callbacks and diagnostics do not leak into the container', () => {
  const f = fixture(); f.thread(); const count = f.client.length;
  f.receive({ id: 100, method: 'account/chatgptAuthTokens/refresh', params: { private: 'synthetic-secret' } });
  expect(f.client.length).toBe(count); expect(f.server.at(-1).error).toBeDefined();
  f.send({ id: 3, method: 'turn/start', params: { threadId: 'owned-thread', input: [{ type: 'text', text: 'check' }] } });
  f.ready(); f.receive({ id: 3, error: { message: 'synthetic-secret' } });
  f.receive({ method: 'turn/completed', params: { threadId: 'owned-thread', turn: { id: 'turn-1', status: 'failed', error: { message: 'synthetic-secret' } } } });
  f.receive({ method: 'configWarning', params: { message: 'synthetic-secret' } });
  expect(JSON.stringify(f.client)).not.toContain('synthetic-secret');
});
test('forwarding authenticates before opening a backend and closes it on disconnect', async () => {
  const token = 'synthetic_project_capability_0123456789';
  let opened = 0, closed = 0;
  const server = serveCodexBridge({ token, policy, connect(receive) {
    opened++;
    return { write(p) { if (p.method === 'initialize') receive(JSON.stringify({ id: p.id, result: { userAgent: 'native', codexHome: '/host/private' } })); }, close() { closed++; } };
  } });
  const input = new PassThrough(), output = new PassThrough();
  let received = '';
  output.on('data', chunk => { received += chunk.toString(); input.end(); });
  try {
    const response = await fetch(server.url.replace('ws:', 'http:'), { headers: { authorization: 'Bearer wrong' } });
    expect(response.status).toBe(401); expect(opened).toBe(0);
    const browser = await fetch(server.url.replace('ws:', 'http:'), { headers: { authorization: `Bearer ${token}`, origin: 'https://unrelated.example' } });
    expect(browser.status).toBe(401); expect(opened).toBe(0);
    const forwarding = forwardCodexStdio({ url: server.url, token, input, output });
    input.write(JSON.stringify({ id: 1, method: 'initialize', params: {} }) + '\n');
    await forwarding;
    expect(JSON.parse(received).result.userAgent).toBe('open-autonomy-codex-bridge');
    expect(received).not.toContain('/host/private');
    // The close frame is processed asynchronously by the server.
    for (let i = 0; i < 20 && !closed; i++) await Bun.sleep(5);
    expect(opened).toBe(1); expect(closed).toBe(1);
  } finally { server.close(); input.destroy(); output.destroy(); }
});

test('executor loss or an available local environment prevents dispatch', () => {
  for (const status of ['pending', 'disconnected', 'unknown']) {
    const f = fixture(); f.thread();
    f.send({ id: 3, method: 'turn/start', params: { threadId: 'owned-thread', input: [{ type: 'text', text: 'work' }] } });
    f.receive({ id: f.server.at(-1).id, result: { status: 'unknown' } });
    f.receive({ id: f.server.at(-1).id, result: { status, error: 'private-host-diagnostic' } });
    expect(f.closed()).toBe(true);
    expect(f.server.some(p => p.method === 'turn/start')).toBe(false);
    expect(f.client.at(-1).error.message).toContain('executor is unavailable');
    expect(JSON.stringify(f.client)).not.toContain('private-host-diagnostic');
  }
  const f = fixture(); f.initialize();
  f.send({ id: 2, method: 'thread/start', params: { cwd: policy.workspace } });
  f.receive({ id: f.server.at(-1).id, result: { shell: {} } });
  f.receive({ id: f.server.at(-1).id, result: { status: 'ready' } });
  expect(f.closed()).toBe(true);
  expect(f.server.some(p => p.method === 'thread/start')).toBe(false);
});

test('a completed turn cannot hide executor disconnection', () => {
  const f = fixture(); f.thread();
  f.receive({ method: 'turn/completed', params: { threadId: 'owned-thread', turn: { id: 'turn-1', status: 'completed' } } });
  expect(f.client.at(-1).method).not.toBe('turn/completed');
  f.receive({ id: f.server.at(-1).id, result: { status: 'unknown' } });
  f.receive({ id: f.server.at(-1).id, result: { status: 'disconnected' } });
  expect(f.client.at(-1).params.turn.status).toBe('failed');
  expect(f.client.at(-1).params.turn.error.message).toContain('executor is unavailable');
  expect(f.closed()).toBe(true);
});

test('a backend disconnect closes the authenticated forwarder without fallback', async () => {
  const token = 'synthetic_project_capability_0123456789';
  let disconnect: () => void = () => {}; let closed = 0;
  const server = serveCodexBridge({ token, policy, connect(receive, disconnected) {
    disconnect = disconnected;
    return { write(p) { receive(JSON.stringify({ id: p.id, result: {} })); }, close() { closed++; } };
  } });
  const input = new PassThrough(), output = new PassThrough();
  output.once('data', () => disconnect());
  try {
    const forwarding = forwardCodexStdio({ url: server.url, token, input, output });
    input.write(JSON.stringify({ id: 1, method: 'initialize', params: {} }) + '\n');
    await expect(forwarding).rejects.toThrow('host execution fallback is unavailable');
    expect(closed).toBe(1);
  } finally { server.close(); input.destroy(); output.destroy(); }
});
