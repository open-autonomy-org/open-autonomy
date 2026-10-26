#!/usr/bin/env bun
// The game skew's doors, for whatever coding agent sits at the computer and for the game's owners. Every door is the
// owning service's own: the Room's conversations and Tasks on the Workplace, the roadmap, a card's budget and key and
// the books on Open Autonomy, the builds, members' channel and releases on the store. Nothing here decides anything:
// which ask is worth queuing, what a card should be and how to build it are the agent's and the owners' judgment
// (home/skills/open-autonomy/game/SKILL.md says how). Credentials are files under .open-autonomy/keys/ (never printed,
// never committed); where the game lives is `game:` in .open-autonomy/config.yaml.
//
//   bun .open-autonomy/game.ts asks                         new lines in `feedback` since the last look
//   bun .open-autonomy/game.ts queue <messageId> <title>    file the ask as a Task in each owner's Inbox
//   bun .open-autonomy/game.ts tasks                        the owners' queue: open Tasks in the Room
//   bun .open-autonomy/game.ts card <id> <title> <cents> --owner <dir> [--task <taskId>] [--model <m>]   (owner) roadmap + budget + key
//   bun .open-autonomy/game.ts cards                        the roadmap, each card's budget, spend and what is left
//   bun .open-autonomy/game.ts start <id> [--session <published session>]  the card's work begins: its session on the books, a line in `build`
//   bun .open-autonomy/game.ts say <id> <text>              progress: an update on the card and a line in `build`
//   bun .open-autonomy/game.ts show <key> <url> <name>      a page every member of the Room sees (the game running, the session)
//   bun .open-autonomy/game.ts questions                    lines in `build` the agent has not answered
//   bun .open-autonomy/game.ts answer <messageId> <text>    answer a line in `build`, quoting it
//   bun .open-autonomy/game.ts ask <id> <prompt>            one model call paid from the card's budget, on its key
//   bun .open-autonomy/game.ts check <id> --cdp <browser origin> --target <tab id> --commit <SHA> [--goal <goal>]   read the bot's retained outcome once
//   bun .open-autonomy/game.ts release <id> <version> --members | --public --owner <dir>   (owner) members first, then everyone
//   bun .open-autonomy/game.ts ship <id> --owner <dir>      (owner) the card is done: shipped on the roadmap
//   bun .open-autonomy/game.ts end <id> [done|failed]       the card's session ends
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const HERE = import.meta.dir, ROOT = resolve(HERE, '..'), KEYS = join(HERE, 'keys'), STATE = join(HERE, 'game-state.json');
interface Game {
  platform: string; account: string;
  store: string; storeGame: string; uploader?: string;
  workplace: string; organization: string; room: string; owners: string[]; self?: string;
  conversations: { general: string; feedback: string; build: string };
  std?: string; signaling?: string; goal?: string; models?: string[];
  board?: {root: string; program: string; context: string; profile: string; project: string};
}
const yaml = readFileSync(join(HERE, 'config.yaml'), 'utf8');
// A computer's own values (a local World's addresses and ids) may stand beside it in .open-autonomy/game.local.json,
// which is never committed and wins key by key.
const LOCAL = join(HERE, 'game.local.json');
const game = { ...JSON.parse(/^game:\s*(\{.*\})\s*$/m.exec(yaml)?.[1] ?? 'null'), ...(existsSync(LOCAL) ? JSON.parse(readFileSync(LOCAL, 'utf8')) : {}) } as Game;
if (!game.workplace || !game.room) throw new Error('.open-autonomy/config.yaml (or game.local.json) names no `game:` Room: the store, the Room and the books this game lives on');
const account = game.account ?? /^account:\s*(\S+)/m.exec(yaml)?.[1];
const platform = (game.platform ?? /^platform:\s*(\S+)/m.exec(yaml)?.[1]).replace(/\/$/, '');
// The owner's credentials (the steer key, the store's publisher session) are never in this checkout: an owner's act
// (card, ship, release) names the directory that holds them, `--owner <dir>`, kept wherever the owner keeps it. The
// agent's own are here: its Workplace token and the keys of the cards the owners made.
const OWNER_ONLY = new Set(['steer.key', 'store.session']);
const ownerAt = (() => { const i = process.argv.indexOf('--owner'); if (i < 0) return undefined; const dir = process.argv[i + 1]; process.argv.splice(i, 2); return dir; })();
const key = (name: string, needed = true): string => {
  if (OWNER_ONLY.has(name) && !ownerAt) throw new Error(`${name === 'steer.key' ? "the owner's steer key" : "the owner's store session"} is the owner's: run this as the owner, with --owner <the directory holding it>`);
  const file = join(OWNER_ONLY.has(name) ? resolve(ownerAt!) : KEYS, name);
  if (OWNER_ONLY.has(name) && resolve(ownerAt!).startsWith(ROOT)) throw new Error("the owner's credentials are kept outside this checkout");
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  if (needed) throw new Error(`${file} is missing (${name.startsWith('card-') ? 'this card has no key yet: the owner makes the card with `card`' : name === 'workplace.token' ? "the agent's Workplace token" : "the owner's credential"})`);
  return '';
};
// What this checkout remembers of its game on the store (sessions, checks, released builds): one store game's, started
// over when the checkout is wired to another (a World made again).
const state = (): Record<string, any> => {
  const kept = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
  return kept.storeGame === game.storeGame ? kept : {};
};
const remember = (patch: Record<string, any>) => writeFileSync(STATE, JSON.stringify({ ...state(), ...patch, storeGame: game.storeGame }, null, 2) + '\n');

// The native board is optional for an adopter; when configured it owns the cards.
// Open Autonomy owns their allocations, keys and metered spend. Workplace apps
// project the native board through Teams; this kit creates no projection itself.
const native = (...args: string[]): string => {
  if (!game.board) return '';
  const run = spawnSync(game.board.program, ['workflow', '--root', game.board.root, ...args], {
    cwd: ROOT, encoding: 'utf8', env: {...process.env, SUPERCODE_CONTEXT: game.board.context},
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (run.status !== 0) throw new Error(`Native board ${args[0]}: ${String(run.stderr || run.stdout).trim().slice(-700)}`);
  return run.stdout.trim();
};
const nativeId = (id: string): string => {
  const value = JSON.parse(native('list', '--json'));
  const cards = Array.isArray(value) ? value : value.tasks ?? value.cards ?? [];
  const card = cards.find((item: any) => item.readable_id === id);
  if (!card) throw new Error(`Native card ${id} is missing`);
  return card.id;
};

async function call(base: string, path: string, init: { method?: string; body?: unknown; headers?: Record<string, string>; ok?: number[] } = {}): Promise<any> {
  const response = await fetch(base.replace(/\/$/, '') + path, { method: init.method ?? 'GET', redirect: 'error', signal: AbortSignal.timeout(30_000),
    headers: { 'content-type': 'application/json', ...init.headers }, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
  const text = await response.text();
  let body: any; try { body = JSON.parse(text); } catch { body = text; }
  if (!response.ok && !init.ok?.includes(response.status)) throw new Error(`${init.method ?? 'GET'} ${path.split('?')[0]} → ${response.status} ${typeof body === 'object' ? body?.error?.message ?? body?.message ?? body?.error?.code ?? body?.error ?? '' : String(body).slice(0, 200)}`);
  return body?.data ?? body;
}
const room = (path: string, init: Parameters<typeof call>[2] = {}) => call(game.workplace, path, { ...init, headers: { authorization: `Bearer ${key('workplace.token')}`, origin: game.workplace, 'x-rh2-organization': game.organization, ...init.headers } });
const books = (path: string, keyName: string, init: Parameters<typeof call>[2] = {}) => call(platform, path, { ...init, headers: { authorization: `Bearer ${key(keyName)}`, ...init.headers } });
const post = (conversation: string, body: string, correlationId: string = crypto.randomUUID()) => room(`/api/v3/rooms/${game.room}/conversations/${encodeURIComponent(conversation)}/messages`, { method: 'POST', body: { body, correlationId } });
const messages = async (conversation: string): Promise<any[]> => { const r = await room(`/api/v3/rooms/${game.room}/conversations/${encodeURIComponent(conversation)}/messages?limit=100`); return r.messages ?? r.items ?? (Array.isArray(r) ? r : []); };
const textOf = (m: any): string => String(m.body ?? m.text ?? m.content ?? '');
const idOf = (m: any): string => String(m.messageId ?? m.id);
const roadmap = async () => (await call(platform, `/v1/accounts/${encodeURIComponent(account)}/roadmap`, { ok: [404] }))?.revision?.roadmap ?? { schema: 'open-autonomy.timeline.v1', items: [] };
const usd = (cents: number) => `$${(Number(cents) / 100).toFixed(Number(cents) > 0 && Number(cents) < 100 && !Number.isInteger(Number(cents)) ? 4 : 2)}`;
const event = (type: string, subject: string, data: Record<string, unknown>, item: string) =>
  books('/v1/agent/events', `card-${item}.key`, { method: 'POST', body: { specversion: '1.0', id: crypto.randomUUID(), source: `game/${account}`, type, subject, time: new Date().toISOString(), data } });
const session = (item: string) => state().sessions?.[item] as string | undefined;
// The agent's own principal in the Room (game.local.json or config `self`): its own lines are never questions to it.
const me = async () => game.self ?? '';
const who = (m: any): string => String(m.author?.name ?? m.author?.displayName ?? m.authorPrincipalId ?? '?');
const authorOf = (m: any): string => String(m.authorPrincipalId ?? m.author?.principalId ?? '');

const [command, ...args] = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const has = (name: string) => { const i = args.indexOf(name); if (i >= 0) args.splice(i, 1); return i >= 0; };

switch (command) {
  case 'asks': {
    // What players asked in `feedback` since the last look. Which of them are asks for the owners is the agent's call.
    const seen = new Set<string>(state().asksSeen ?? []);
    const fresh = (await messages(game.conversations.feedback)).filter((m) => !seen.has(idOf(m)) && !m.deletedAt);
    for (const m of fresh) console.log(`${idOf(m)}  ${who(m)}: ${textOf(m).replace(/\s+/g, ' ').slice(0, 400)}`);
    if (!fresh.length) console.log('No new lines in feedback.');
    remember({ asksSeen: [...seen, ...fresh.map(idOf)].slice(-1000) });
    break;
  }
  case 'queue': {
    // An ask reaches the owners' queue: a Task at the player's own line, in each owner's Inbox, and a reply saying so.
    const [messageId, ...title] = args;
    if (!messageId || !title.length) throw new Error('queue <messageId> <title>');
    for (const owner of game.owners) await room(`/api/v3/rooms/${game.room}/tasks`, { method: 'POST', body: { messageId, title: title.join(' '),
      instructions: 'A player asked for this in feedback. If it should be built, make it a card with a budget: `bun .open-autonomy/game.ts card <id> <title> <cents> --task <this task>`. If not, close this Task and say why in the thread.',
      target: { kind: 'principal', principalId: owner } } });
    // The answer goes in the conversation, naming whose ask it was: a bot's line in a player's thread is not the Room's to allow.
    const ask = (await messages(game.conversations.feedback)).find((m) => idOf(m) === messageId);
    await post(game.conversations.feedback, `${ask ? `${who(ask)}, thanks` : 'Thanks'}: your ask is in the owners' queue as “${title.join(' ')}”. They decide what gets built; if they make it a card, it shows on the game's page under What's next.`);
    console.log(`Queued for ${game.owners.length} owner(s).`);
    break;
  }
  case 'tasks': {
    // The owners' queue: open Tasks in the Room, each at the line it was filed at.
    const r = await room(`/api/v3/rooms/${game.room}/tasks`);
    const open = (r.tasks ?? []).filter((t: any) => !t.ended && true);
    for (const t of open) console.log(`${t.taskId}  ${t.status ?? 'todo'}  ${t.title}`);
    if (!open.length) console.log("The owners' queue is empty.");
    break;
  }
  case 'card': {
    // The owner's act: the card on the roadmap, its budget set aside from the game's own money, and a key bound to it.
    const task = flag('--task'), model = flag('--model');
    const [id, ...rest] = args, cents = Number(rest.pop()), title = rest.join(' ');
    if (!id || !title || !Number.isInteger(cents) || cents < 1) throw new Error('card <id> <title> <budget in cents> [--task <taskId>] [--model <model>]');
    if (game.board) native('create', `[${game.board.project}] ${title}`, '--readable-id', id,
      '--idempotency-key', `game:${account}:${id}`, '--assignee', game.board.profile,
      '--initial-status', 'ready', '--no-start', '--tag', `project:${game.board.project}`,
      '--body', `Owner card: ${title}\nBudget: ${usd(cents)}. The card's envelope and metered spend are on the game's Open Autonomy books.`);
    const road = await roadmap();
    if (!road.items.some((item: any) => item.id === id)) road.items.push({ id, title, tense: 'future', status: 'planned', proposed_at: new Date().toISOString(), by: 'owner', acceptance: [] });
    await books('/v1/agent/roadmap', 'steer.key', { method: 'POST', body: { source: 'game', roadmap: road, by: 'owner' } });
    const set = await books('/v1/agent/allocate', 'steer.key', { method: 'POST', body: { item: id, usd_cents: cents, key: `card:${id}:${cents}` } });
    const minted = await books('/v1/keys/item', 'steer.key', { method: 'POST', body: { item: id, models: model ? [model] : game.models } });
    mkdirSync(KEYS, { recursive: true, mode: 0o700 });
    writeFileSync(join(KEYS, `card-${id}.key`), `${minted.token}\n`, { mode: 0o600 });
    if (task) await room(`/api/v3/rooms/${game.room}/tasks/${encodeURIComponent(task)}/close`, { method: 'POST', body: { note: `Made card ${id} with a budget of ${usd(cents)}.` }, ok: [400, 404, 409] });
    console.log(`Card ${id} is on What's next with ${usd(set.envelope_usd_cents ?? cents)} set aside; its key is .open-autonomy/keys/card-${id}.key.`);
    break;
  }
  case 'cards': {
    for (const item of (await roadmap()).items) {
      const view = await call(platform, `/v1/accounts/${encodeURIComponent(account)}/items/${encodeURIComponent(item.id)}`, { ok: [404] });
      const b = view?.budget;
      console.log(`${item.id}  ${item.status}  ${item.title}${b ? `  · budget ${usd(b.allocated_usd_cents)}, spent ${usd(b.spent_usd_cents)}, left ${usd(b.left_usd_cents)}` : ''}`);
    }
    break;
  }
  case 'start': {
    const liveSession = flag('--session');
    const [id] = args, item = (await roadmap()).items.find((x: any) => x.id === id);
    if (!item) throw new Error(`no card ${id} on the roadmap`);
    if (game.board) {
      const cardId = nativeId(id);
      // External harnesses already exist. Taking a card never launches or signs in to one.
      const listing = JSON.parse(native('list', '--json'));
      const current = (Array.isArray(listing) ? listing : listing.tasks ?? listing.cards ?? []).find((row: any) => row.id === cardId);
      if (current?.status !== 'running') native('claim', cardId);
      native('deliver');
      if (liveSession) {
        const frames = native('events', '--once', '--json').split('\n').filter(Boolean).map(line => JSON.parse(line));
        const card = frames.find(frame => frame.type === 'snapshot_item' && frame.data?.card?.id === cardId)?.data.card;
        const agent = card?.agents?.find((row: any) => row.role === 'implementer' && row.state === 'active');
        if (!agent) throw new Error('The native card has no declared implementer yet. Deliver its pending declaration and retry start.');
        const recorded = spawnSync(game.board.program, ['teams', 'agent', 'record', '--session', liveSession, '--agent', agent.id, '--main', '--context', game.board.context], {cwd: ROOT, encoding: 'utf8', stdio: ['ignore','pipe','pipe']});
        if (recorded.status !== 0) throw new Error(`The existing session could not join its native card agent: ${String(recorded.stderr || recorded.stdout).slice(-700)}`);
      }
    }
    const existing = session(id);
    const key = existing && !state().endedSessions?.[existing] ? existing : `game-${id}-${crypto.randomUUID()}`;
    // Retain the subject before the request: OA's session-start door is idempotent by this key.
    remember({ sessions: { ...(state().sessions ?? {}), [id]: key } });
    await event('org.open-autonomy.session.started', key, { session_kind: 'run', title: item.title, source: 'game', item_id: id }, id);
    if (!state().announcedSessions?.[key]) {
      await post(game.conversations.build, `Starting “${item.title}”. I post what I do here; ask me anything in this conversation.`, `start:${key}`);
      remember({announcedSessions: {...(state().announcedSessions ?? {}), [key]: true}});
    }
    console.log(`Session ${key} is live on the card.`);
    break;
  }
  case 'say': {
    const [id, ...words] = args, text = words.join(' ');
    if (!id || !text) throw new Error('say <id> <text>');
    await event('org.open-autonomy.item.update', id, { text, ...(session(id) ? { session: session(id) } : {}) }, id);
    await post(game.conversations.build, text);
    if (game.board) native('comment', nativeId(id), text);
    console.log('Said on the card and in build.');
    break;
  }
  case 'show': {
    // Show something to the Room as a page every member frames: the running game, the card's session on the books.
    const [key, url, ...name] = args;
    if (!key || !url || !name.length) throw new Error('show <key> <url> <name>');
    await room(`/api/v3/rooms/${game.room}/surfaces`, { method: 'POST', body: { key, kind: 'page', name: name.join(' '), config: { url, on: 'everyone' } } });
    console.log(`${name.join(' ')} is shown in the Room.`);
    break;
  }
  case 'questions': {
    // Lines in `build` from someone else that nobody has answered in their thread yet.
    const self = await me(), answered = new Set<string>(state().answered ?? []);
    const open = (await messages(game.conversations.build)).filter((m) => authorOf(m) !== self && m.author?.kind !== 'automation' && !answered.has(idOf(m)) && !m.deletedAt);
    for (const m of open) console.log(`${idOf(m)}  ${who(m)}: ${textOf(m).replace(/\s+/g, ' ').slice(0, 400)}`);
    if (!open.length) console.log('No unanswered lines in build.');
    break;
  }
  case 'answer': {
    const [messageId, ...words] = args;
    if (!messageId || !words.length) throw new Error('answer <messageId> <text>');
    const question = (await messages(game.conversations.build)).find((m) => idOf(m) === messageId);
    await post(game.conversations.build, `${question ? `${who(question)} asked “${textOf(question).replace(/\s+/g, ' ').slice(0, 140)}”: ` : ''}${words.join(' ')}`);
    remember({ answered: [...(state().answered ?? []), messageId].slice(-1000) });
    console.log('Answered in build.');
    break;
  }
  case 'ask': {
    // One metered model call on the card's key: it draws the card's budget and nothing else, and is refused once the
    // budget is spent. The agent's own coding may run on its own model; what is paid from the card goes through here.
    const [id, ...words] = args;
    const model = flag('--model') ?? game.models?.[0] ?? 'zai/glm-5.3-flash';
    const response = await fetch(`${platform}/v1/chat/completions`, { method: 'POST', signal: AbortSignal.timeout(120_000),
      headers: { authorization: `Bearer ${key(`card-${id}.key`)}`, 'content-type': 'application/json', ...(session(id) ? { 'session-id': session(id)! } : {}) },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: words.join(' ') }], max_tokens: 800 }) });
    const body = await response.json().catch(() => ({})) as any;
    if (!response.ok) { console.log(`Refused (${response.status} ${body.error?.code ?? body.error ?? ''}): ${body.error?.message ?? body.message ?? ''}`); process.exit(2); }
    console.log(body.choices?.[0]?.message?.content ?? '');
    console.error(`balance after: ${response.headers.get('x-open-autonomy-balance-usd-cents') ?? '?'} cents`);
    break;
  }
  case 'check': {
    // Read an already-running bot's retained console once. The operator starts and records the real dev tab;
    // this command never launches a browser, waits for a goal, polls, or turns a missing result into a failure.
    const cdp = flag('--cdp'), target = flag('--target'), commit = flag('--commit');
    const goal = flag('--goal') ?? game.goal ?? 'do the quest', [id] = args;
    const head = spawnSync('git', ['rev-parse', 'HEAD'], {cwd: ROOT, encoding: 'utf8'}).stdout.trim();
    if (!id || !cdp || !target || commit !== head) throw new Error('check <id> --cdp <http://127.0.0.1:port> --target <recorded tab id> --commit <current full SHA> [--goal <goal>]');
    const browser = new URL(cdp);
    if (browser.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(browser.hostname)) throw new Error('Read only the operator’s local browser.');
    const tabs = await fetch(new URL('/json/list', browser), {signal: AbortSignal.timeout(2000)}).then(r => r.json()) as any[];
    const tab = tabs.find(row => row.id === target && row.type === 'page');
    if (!tab?.webSocketDebuggerUrl || new URL(tab.url).searchParams.get('autopilot') !== goal) throw new Error('Choose the recorded game tab running this exact autopilot goal.');
    const lines = await new Promise<string[]>((resolveLines, reject) => {
      const socket = new WebSocket(tab.webSocketDebuggerUrl), lines: string[] = [];
      const timer = setTimeout(() => { socket.close(); reject(new Error('The browser supplied no retained console within five seconds.')); }, 5000);
      const finish = (error?: Error) => { clearTimeout(timer); socket.close(); if (error) reject(error); else resolveLines(lines); };
      socket.onopen = () => socket.send(JSON.stringify({id: 1, method: 'Runtime.enable'}));
      socket.onerror = () => finish(new Error('The browser console connection failed.'));
      socket.onmessage = event => {
        const message = JSON.parse(String(event.data));
        if (message.method === 'Runtime.consoleAPICalled') lines.push(message.params.args.map((arg: any) => arg.value ?? arg.description ?? '').join(' '));
        // Runtime.enable replays retained console entries before its reply. No goal watcher is installed.
        if (message.id === 1) finish(message.error ? new Error(message.error.message) : undefined);
      };
    });
    // A served client's console wraps game output in these runtime tags; bare native output has none.
    const gameLines = lines.map(line => line.replace(/^(?:\[(?:client|log|dev)\] )+/, ''));
    const outcome = gameLines.findLast(line => line.startsWith(`[autopilot] ✓ ${goal} (`) || line.startsWith(`[autopilot] ✗ ${goal} (`) || line.startsWith(`[bot] ✓ ${goal} (`) || line.startsWith(`[bot] ✗ ${goal} (`));
    if (!outcome) throw new Error('This tab has no completed outcome for the goal. Keep its take; read again only after the bot has finished.');
    const result = outcome.includes('] ✓ ') ? 'passed' : 'failed', detail = outcome.replace(/^\[\w+\] /, '').slice(0, 300);
    remember({checks: {...(state().checks ?? {}), [id]: {goal, result, detail, commit, at: new Date().toISOString(), target, url: tab.url}}});
    console.log(`The bot played “${goal}” on ${commit.slice(0, 7)}: ${result} (${detail}).`);
    break;
  }
  case 'release': {
    // Members first: the build uploaded to the store and set on the Members beta channel. Then everyone: the same build
    // released to the game's public page. The bot's result for the build is recorded on the store beside it.
    const [id, version] = args, members = has('--members'), everyone = has('--public');
    if (!id || !version || members === everyone) throw new Error('release <id> <version> --members | --public [--despite "<why>"]');
    // A release follows the bot's passing check of this commit; one that failed goes out only on the owner's word, its
    // reason recorded beside the result on the store.
    const check = state().checks?.[id], head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
    const despite = flag('--despite');
    if (!check || check.commit !== head) throw new Error(`the bot has not played ${id} on ${head.slice(0, 7)}: run check first`);
    if (check.result !== 'passed' && !despite) throw new Error(`the bot's check of ${head.slice(0, 7)} failed (${check.detail}): release after a passing check, or give the owner's reason with --despite "<why>"`);
    const sessionToken = key('store.session');
    const store = (path: string, init: Parameters<typeof call>[2] = {}) => call(game.store, `/api${path}`, { ...init, headers: { origin: game.store, cookie: `relay_session=${sessionToken}`, ...init.headers } });
    const releases = state().releases ?? {};
    let build: string | undefined = releases[version];
    if (!build) {
      if (!game.uploader) throw new Error("config.yaml `game.uploader` names the store's folder uploader (scripts/upload-build.mjs)");
      const folder = join(ROOT, 'build', 'web');
      // The release names the signaling service its players' browsers use: the game's own (config `signaling`), else
      // game-std's choice for a build.
      const built = spawnSync('node', [join(game.std!, 'packages/web/run/dev.ts'), ROOT, '--build', '--out-dir', folder, ...(game.signaling ? ['--signaling', game.signaling] : [])], { cwd: game.std, stdio: 'inherit' });
      if (built.status !== 0) throw new Error('the build failed');
      const player = (await store('/me')).user.id;
      for (let step = 0; step < 400 && !build; step++) {
        const run = spawnSync('node', [game.uploader, '--origin', game.store, '--player', player, '--game', game.storeGame, '--version', version, '--branch', 'default', '--folder', folder, '--journal', join(ROOT, 'build', `upload-${game.storeGame}-${version}`)],
          { env: { ...process.env, RELAY_PUBLISHER_SESSION: sessionToken }, encoding: 'utf8' });
        if (run.status === 0) build = JSON.parse(run.stdout.trim().split('\n').pop()!).build;
        else if (run.status !== 75) throw new Error(`the uploader stopped: ${(run.stderr || run.stdout).trim().slice(0, 400)}`);
      }
      if (!build) throw new Error('the upload did not finish; its journal keeps its progress, run release again');
      remember({ releases: { ...releases, [version]: build } });
    }
    // The bot's result goes on the store beside the build once it is public (the store lists results on released builds
    // only), with the owner's reason when it failed.
    const recordCheck = async () => {
      if (state().recorded?.[build!]) return;
      const detail = despite ? `${check.detail} · released by the owner despite it: ${despite}` : check.detail;
      await store(`/developers/apps/${game.storeGame}/builds/${build}/checks`, { method: 'POST', body: { goal: check.goal, result: check.result, detail, commit: check.commit } });
      remember({ recorded: { ...(state().recorded ?? {}), [build!]: true } });
    };
    if (members) {
      const listed = await store(`/developers/apps/${game.storeGame}/betas`);
      const channel = (listed.channels ?? listed.items ?? listed.betas ?? []).find((c: any) => c.name === 'Members');
      if (!channel) throw new Error('the store has no Members beta channel for this game');
      await store(`/developers/betas/${channel.id}`, { method: 'PATCH', body: { build_id: build, revision: channel.revision, state: 'active', name: channel.name, description: channel.description ?? '' } });
      await post(game.conversations.build, `${version} is out for members: they play it first, from their library's betas. Everyone gets it next.`);
      console.log(`${version} (${build}) is on the Members channel.`);
    } else {
      const app = await store(`/developers/apps/${game.storeGame}`);
      await store(`/developers/apps/${game.storeGame}/release-plans`, { method: 'POST', body: { protocol: 1, clientId: crypto.randomUUID(), confirmed: true, mode: 'now',
        build, currentBuild: app.submission.build, publisherGeneration: app.storePage.ownerGeneration, releaseRevision: app.submission.releaseRevision, executeAt: 0,
        notes: `${version}: ${(await roadmap()).items.find((x: any) => x.id === id)?.title ?? id}${check ? ` · the bot played “${check.goal}”: ${check.result}` : ''}` } });
      await post(game.conversations.build, `${version} is out for everyone.`);
      await recordCheck();
      console.log(`${version} (${build}) is released to everyone.`);
    }
    break;
  }
  case 'ship': {
    // The owner's act: the card is done. Its budget's remainder goes back to the game's free money.
    const [id] = args, road = await roadmap(), item = road.items.find((x: any) => x.id === id);
    if (!item) throw new Error(`no card ${id} on the roadmap`);
    Object.assign(item, { status: 'done', tense: 'past', done_at: new Date().toISOString() });
    await books('/v1/agent/roadmap', 'steer.key', { method: 'POST', body: { source: 'game', roadmap: road, by: 'owner' } });
    if (game.board) native('complete', nativeId(id), '--result', 'Shipped to members, then released to everyone.');
    console.log(`${id} is shipped on What's next.`);
    break;
  }
  case 'end': {
    const [id, outcome = 'done'] = args;
    if (!session(id)) throw new Error(`card ${id} has no session started here`);
    await event('org.open-autonomy.session.ended', session(id)!, { outcome, item_id: id }, id);
    remember({endedSessions: {...(state().endedSessions ?? {}), [session(id)!]: true}});
    console.log(`Session ${session(id)} ended (${outcome}).`);
    break;
  }
  default:
    console.log(readFileSync(import.meta.path, 'utf8').split('\n').filter((l) => l.startsWith('//   bun')).map((l) => l.slice(5)).join('\n'));
}
