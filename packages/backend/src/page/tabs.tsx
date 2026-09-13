// The project's depths, one panel each at full size: the work, the sessions, the books, the agent, the team, a document.
import type { ItemView, SessionRecord, SessionSummary } from '../ledger.js';
import type { TeamFile } from '../team.js';
import { TEAM_SCOPES, type TeamMember } from '@open-autonomy/sdk/team';
import { tenseOf, type RoadmapItem } from '@open-autonomy/sdk/roadmap';
import { fmtAgo, fmtDur, fmtWhen, mdToSafeHtml, shortSha, usd } from '../ui.js';
import { Pill, Workshop, at, firstLine, safeUrl, standingOf, type Turn } from './parts.js';
import { Shell, parseSchedule, type ProjectPageData } from './project.js';
import { sees } from './model.js';

// ---- work: the timeline as a board, Kickstarter's promises with GitHub's proof --------------------------------
const brief = (i: RoadmapItem, account: string, now: number, hot = false) => (
  <div class={`brief${hot ? ' hot' : ''}`}>
    <div class="t"><a href={at(account, 'work', i.id)}>{i.title}</a></div>
    <div class="m">{i.status === 'active' ? 'in progress' : i.status}{i.by ? ` · ${i.by}` : ''}{i.release ? ` · ${i.release}` : ''}{i.done_at ? ` · ${fmtAgo(i.done_at, now)}` : i.started_at ? ` · since ${fmtAgo(i.started_at, now)}` : ''}{i.commit ? ` · ${shortSha(i.commit)}` : ''}{i.acceptance.length ? ` · ${i.acceptance.length} acceptance line${i.acceptance.length === 1 ? '' : 's'}` : ''}</div>
  </div>
);
export function Work(d: ProjectPageData) {
  const a = d.v.account;
  const items = d.roadmap.items;
  const future = items.filter((i) => tenseOf(i) === 'future');
  const present = items.filter((i) => tenseOf(i) === 'present');
  const past = items.filter((i) => tenseOf(i) === 'past').sort((x, y) => Date.parse(y.done_at ?? '') - Date.parse(x.done_at ?? '') || 0);
  return (
    <Shell d={d} current="work">
      <div class="card" style="margin-top:20px">
        <div class="board">
          <div><h3>Promised · {future.length}</h3>{future.length ? future.map((i) => brief(i, a, d.now)) : <p class="empty">Nothing promised yet.</p>}</div>
          <div><h3>In progress · {present.length}</h3>{present.length ? present.map((i) => brief(i, a, d.now, i.status === 'active')) : <p class="empty">Nothing in progress.</p>}</div>
          <div><h3>Shipped · {past.length}</h3>{past.slice(0, 12).map((i) => brief(i, a, d.now))}{past.length > 12 ? <details class="rest"><summary>The other {past.length - 12}</summary>{past.slice(12).map((i) => brief(i, a, d.now))}</details> : null}</div>
        </div>
      </div>
    </Shell>
  );
}
export function Item({ d, view, tail }: { d: ProjectPageData; view: ItemView; tail?: Turn[] }) {
  const a = d.v.account;
  const item = d.roadmap.items.find((i) => i.id === view.item_id);
  const live = view.sessions.filter((s) => view.live.includes(s.key));
  return (
    <Shell d={d} current="work">
      <div class="cols" style="grid-template-columns:minmax(0,1fr) 340px">
        <div class="main">
          <div class="card">
            <h2>{item ? (tenseOf(item) === 'past' ? 'Shipped' : item.status === 'active' ? 'In progress' : 'Promised') : 'Item'}</h2>
            <div class="hero" style="grid-template-columns:1fr;padding:0"><div class="who" style="padding:0"><h1 style="font-size:30px">{item?.title ?? view.item_id}</h1><p class="tag">{item?.release ? `${item.release} · ` : ''}{item?.done_at ? `shipped ${fmtWhen(item.done_at)}` : item?.started_at ? `started ${fmtWhen(item.started_at)}` : ''}{item?.commit ? ` · ${shortSha(item.commit)}` : ''}</p></div></div>
            {item?.acceptance.length ? <><h2 style="margin-top:18px">Done means</h2><ul class="rows">{item.acceptance.map((l) => <li class="row"><span class="t" style="white-space:normal">{l}</span></li>)}</ul></> : null}
            {item?.links?.some((l) => safeUrl(l.url)) ? <div class="wall" style="margin-top:14px">{item.links.filter((l) => safeUrl(l.url)).map((l) => <a class="chip" href={safeUrl(l.url)}>{l.label ?? l.kind} ↗</a>)}</div> : null}
          </div>
          <div class="card"><h2>Sessions on it · {view.sessions.length}</h2>{view.sessions.length ? <ul class="feed">{view.sessions.map((s) => <li><span class="when">{fmtAgo(s.started_at, d.now)}</span><span class="src"><i class={s.status === 'live' ? '' : s.outcome === 'failed' ? 'bad' : s.outcome ? '' : 'none'} />{s.source ?? s.kind}</span><span class="said"><a href={at(a, 'sessions', s.key)}>{s.status === 'live' ? `live · ${s.turn_count} turns` : s.report && s.report !== '[SILENT]' ? firstLine(s.report, 120) : `${s.turn_count} turns`}</a></span></li>)}</ul> : <p class="empty">No session has worked on it yet.</p>}</div>
          {view.updates.length ? <div class="card"><h2>Notes</h2><ul class="feed">{view.updates.map((u) => <li><span class="when">{fmtAgo(u.ts, d.now)}</span><span class="src">note</span><span class="said">{u.text}</span></li>)}</ul></div> : null}
        </div>
        <div class="side">
          <div class="card"><h2>Spent on it</h2><div class="fund"><div class="big">{usd(view.usd_cents)}</div><div class="line">{view.sessions.length} session{view.sessions.length === 1 ? '' : 's'}{view.purchases.length ? ` · ${view.purchases.length} purchase${view.purchases.length === 1 ? '' : 's'}` : ''}{live.length ? ' · live now' : ''}</div></div></div>
        </div>
      </div>
    </Shell>
  );
}

// ---- sessions: the stream, the live ones first ---------------------------------------------------------------
export function Sessions(d: ProjectPageData) {
  const a = d.v.account;
  const standing = standingOf(d.v, d.live);
  const rest = d.sessions.filter((s) => !d.live.includes(s.key));
  return (
    <Shell d={d} current="sessions">
      <div class="main" style="margin-top:20px">
        <Workshop sessions={d.sessions} live={d.live} tail={sees(d.viewer, d.visibility.transcripts) ? d.tail : undefined} schedule={parseSchedule(d.v.profile.schedule_json)} standing={standing} control={d.v.control} daily={d.daily} account={a} now={d.now} feed={false} />
        <div class="card">
          <h2>Every session</h2>
          <table class="table"><thead><tr><th>when</th><th>job</th><th>on</th><th>what it said</th><th class="n">turns</th><th class="n">cost</th></tr></thead>
            <tbody>{rest.map((s) => <tr><td style="white-space:nowrap">{fmtAgo(s.started_at, d.now)}</td><td><b>{s.source ?? s.kind}</b>{s.kind !== 'run' ? <span class="empty"> · chat</span> : null}</td><td>{s.item_id ? <a href={at(a, 'work', s.item_id)}>{s.item_id}</a> : <span class="empty">—</span>}</td><td><a href={at(a, 'sessions', s.key)}>{s.report && s.report !== '[SILENT]' ? firstLine(s.report, 110) : <span class="empty">{s.outcome === 'failed' ? 'failed' : 'quiet'}</span>}</a></td><td class="n">{s.turn_count}</td><td class="n">{usd(s.usd_cents)}</td></tr>)}</tbody></table>
        </div>
      </div>
    </Shell>
  );
}
// One session: the transcript in full, live when it is live. The same ticker as the workshop, at length.
export function Session({ d, s }: { d: ProjectPageData; s: SessionRecord }) {
  const a = d.v.account;
  const line = (t: Turn) => t.role === 'assistant' && t.tool ? { role: 'agent', cls: 'a', body: `${t.tool}${t.args ? ` ${t.args}` : ''}`, tool: true } : t.role === 'assistant' ? { role: 'agent', cls: 'a', body: t.text ?? '', tool: false } : t.role === 'tool' ? { role: t.tool ?? 'tool', cls: '', body: t.result ?? '', tool: true } : { role: t.role, cls: '', body: t.text ?? '', tool: false };
  return (
    <Shell d={d} current="sessions">
      <div class="cols" style="grid-template-columns:minmax(0,1fr) 300px">
        <div class="main">
          <div class="card">
            <div class="now" style="margin-bottom:10px"><span class="pill live" style={s.status === 'live' ? '' : 'display:none'}><span class="dot" />live</span><span class="what" style="font-family:Fraunces,Georgia,serif;font-size:22px">{s.source ?? s.kind}</span><span class="sub">{fmtWhen(s.started_at)}{s.ended_at ? ` → ${fmtDur(s.started_at, s.ended_at, d.now)}` : ` · ${fmtDur(s.started_at, undefined, d.now)} so far`}{s.item_id ? <> · on <a href={at(a, 'work', s.item_id)}>{s.item_id}</a></> : null}</span></div>
            {s.report && s.report !== '[SILENT]' ? <div class="prose" dangerouslySetInnerHTML={{ __html: mdToSafeHtml(s.report) }} /> : null}
          </div>
          <div class="card"><h2>Transcript · <span data-turns>{s.turns.length}</span> turns</h2><ul class="turns" data-transcript data-account={a} data-session={s.key} data-seq={String(s.turns.reduce((m, t) => (typeof t.seq === 'number' && t.seq > m ? t.seq : m), -1))} style={s.status === 'live' ? '' : undefined}>{s.turns.map((t) => { const l = line(t); return <li><span class={`role ${l.cls}`}>{l.role}</span><span class={`body${l.tool ? ' tool' : ''}`}>{l.body}</span></li>; })}</ul></div>
        </div>
        <div class="side"><div class="card"><h2>This session</h2><div class="stats" style="grid-template-columns:1fr 1fr"><div class="stat"><div class="v" data-cents>{usd(s.usd_cents)}</div><div class="l">metered</div></div><div class="stat"><div class="v">{s.calls}</div><div class="l">model calls</div></div></div>{s.commit_sha ? <p class="fine">landed as {shortSha(s.commit_sha)}</p> : null}</div></div>
      </div>
    </Shell>
  );
}

// ---- books: the ledger, GitHub's precision ----------------------------------------------------------
export function Books({ d, calls }: { d: ProjectPageData; calls: Array<{ ts: string; model?: string; rail?: string; usd_cents: number; session?: string; merchant?: string }> }) {
  const a = d.v.account;
  const gifts = [...(d.v.feed ?? [])].filter((f) => f.kind === 'grant' || f.kind === 'mint');
  return (
    <Shell d={d} current="books">
      <div class="main" style="margin-top:20px">
        <div class="card">
          <h2>The books</h2>
          <div class="ledger">
            <div class="stat"><div class="v">{usd(d.v.granted_in_usd_cents)}</div><div class="l">put in</div></div>
            <div class="stat"><div class="v">{usd(d.v.consumed_usd_cents)}</div><div class="l">spent, every cent metered</div></div>
            <div class="stat"><div class="v">{usd(d.v.balance_usd_cents)}</div><div class="l">balance</div></div>
            <div class="stat"><div class="v">{d.v.runway_days === null ? '—' : d.v.runway_days > 365 ? '1y+' : `${Math.round(d.v.runway_days)}d`}</div><div class="l">runway · goal {d.v.goal_days}d</div></div>
          </div>
        </div>
        <div class="cols" style="margin-top:0">
          <div class="main">
            <div class="card"><h2>Money in</h2>{gifts.length || d.slots?.moneyIn ? <ul class="gifts">{d.slots?.moneyIn}{gifts.map((g) => <li><span class="ph" /><span class="who"><b>{g.from ? g.from.replace(/^@/, '') : 'the operator'}</b><span>{g.kind === 'grant' ? 'a grant' : 'added'}{g.by ? ` · passed on by ${g.by}` : ''} · {fmtAgo(g.ts, d.now)}</span></span><span class="amt">+{usd(g.amount_usd_cents)}</span></li>)}</ul> : <p class="empty">{d.v.granted_in_usd_cents > 0 ? `${usd(d.v.granted_in_usd_cents)} was minted by ${d.brand} before gifts named their giver.` : 'Nothing yet.'}</p>}</div>
            {d.slots?.give}
            {d.v.envelopes.length ? <div class="card"><h2>Earmarked</h2><ul class="rows">{d.v.envelopes.map((e) => <li class="row"><span class="t">{e.purpose.type === 'item' ? <>for <a href={at(a, 'work', e.purpose.item)}>{e.purpose.item}</a></> : e.purpose.type === 'models' ? `for ${e.purpose.models.join(', ')}` : e.purpose.type === 'model' ? 'for model calls' : 'for anything'}{e.from ? ` · from ${e.from}` : ''}</span><span class="n">{usd(e.balance_usd_cents)} left</span></li>)}</ul></div> : null}
            {sees(d.viewer, d.visibility.calls) ? <div class="card"><h2>Every metered call</h2>{calls.length ? <table class="table"><thead><tr><th>when</th><th>what</th><th>session</th><th class="n">cost</th></tr></thead><tbody>{calls.map((c) => <tr><td style="white-space:nowrap">{fmtAgo(c.ts, d.now)}</td><td>{c.rail === 'card' ? `card · ${c.merchant ?? ''}` : c.rail === 'partner' ? 'partner' : c.model ?? 'model'}</td><td class="mono">{c.session ? <a href={at(a, 'sessions', c.session)}>{c.session.slice(0, 24)}</a> : '—'}</td><td class="n">{usd(c.usd_cents)}</td></tr>)}</tbody></table> : <p class="empty">No call yet.</p>}<a class="more" href={`/v1/accounts/${encodeURIComponent(a)}/calls`}>The audit trail as JSON →</a></div> : null}
          </div>
          <div class="side">
            <div class="card"><h2>The owner's bounds</h2><ul class="rows">{d.v.bounds.models.length ? <li class="row"><span class="t">models</span><span class="n">{d.v.bounds.models.join(', ')}</span></li> : null}{d.v.bounds.limits.map((l) => <li class="row"><span class="t">{l.model ? `${l.model} · ` : ''}{l.usd_cents !== undefined ? `${usd(l.usd_cents)} a ${l.window}` : l.calls !== undefined ? `${l.calls} calls a ${l.window}` : `${l.tokens} tokens a ${l.window}`}</span><span class="n">{l.usd_cents !== undefined ? `${usd(l.used.usd_cents)} used` : l.calls !== undefined ? `${l.used.calls} used` : `${l.used.tokens} used`}</span></li>)}</ul><p class="fine">Read from the repository's committed config. A key can spend within these, never widen them.</p></div>
          </div>
        </div>
      </div>
    </Shell>
  );
}

// ---- the agent: who it is, how it runs, its state, the owner's one control -------------------------------------
export function Agent(d: ProjectPageData) {
  const a = d.v.account;
  const standing = standingOf(d.v, d.live);
  const schedule = parseSchedule(d.v.profile.schedule_json);
  const skills = (d.v.profile.agent_skills ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const rt = (() => { try { return JSON.parse(d.v.profile.agent_runtime ?? '') as { mode?: string; kit?: string; executor?: string; host?: string }; } catch { return undefined; } })();
  const desired = d.v.control?.desired?.state ?? 'running';
  return (
    <Shell d={d} current="agent">
      <div class="cols" style="grid-template-columns:minmax(0,1fr) 340px">
        <div class="main">
          <div class="card"><h2>Who it is</h2>{d.v.profile.soul_md ? <div class="prose" dangerouslySetInnerHTML={{ __html: mdToSafeHtml(d.v.profile.soul_md) }} /> : <p class="empty">Not published yet.</p>}</div>
          <div class="card"><h2>How it runs</h2>{d.v.profile.setup_md ? <div class="prose" dangerouslySetInnerHTML={{ __html: mdToSafeHtml(d.v.profile.setup_md) }} /> : <p class="empty">Not published yet.</p>}</div>
        </div>
        <div class="side">
          <div class="card"><h2>State</h2><div class="now"><Pill standing={standing} /></div>{d.v.control?.observed ? <p class="fine">The agent last said <b>{d.v.control.observed.state}</b>{d.v.control.observed.note ? `: ${d.v.control.observed.note}` : ''} · {fmtAgo(d.v.control.observed.at, d.now)}</p> : <p class="fine">The agent has not reported its state.</p>}{d.v.control?.desired ? <p class="fine">The owner asked for <b>{d.v.control.desired.state}</b> · {fmtAgo(d.v.control.desired.at, d.now)}{d.v.control.desired.reason ? `: ${d.v.control.desired.reason}` : ''}</p> : null}</div>
          <div class="card"><h2>Runs on</h2><ul class="rows"><li class="row"><span class="t">{d.v.profile.agent_harness ?? 'its harness'}</span><span class="n">{d.v.profile.agent_model ?? 'a model'}{d.v.profile.agent_provider ? ` · ${d.v.profile.agent_provider}` : ''}</span></li>{schedule.map((j) => <li class="row"><span class="t">{j.name ?? 'job'}</span><span class="n">fires {j.schedule ?? '?'}</span></li>)}{skills.length ? <li class="row"><span class="t">knows</span><span class="n">{skills.join(' · ')}</span></li> : null}{rt?.mode ? <li class="row"><span class="t">{rt.mode === 'container' ? 'in a container' : 'bare on a host'}</span><span class="n">{[rt.executor, rt.host].filter(Boolean).join(' · ') || '—'}</span></li> : null}{rt?.kit ? <li class="row"><span class="t">kit</span><span class="n">{rt.kit}</span></li> : null}</ul></div>
          {sees(d.viewer, 'owner') ? <div class="card"><h2>Owner</h2><p class="fine" style="margin:0 0 10px">The one word of control. The agent applies it its own way and answers; the page shows the request beside the answer. A steer key says the same through <code>POST /v1/agent/state</code>.</p><form class="form" method="post" action={`${at(a)}/state`}><input name="reason" placeholder={desired === 'paused' ? 'why resume (optional)' : 'why pause (optional)'} maxlength={400} /><button class={`btn${desired === 'paused' ? '' : ' quiet'}`} type="submit" name="state" value={desired === 'paused' ? 'running' : 'paused'}>{desired === 'paused' ? 'Resume the agent' : 'Pause the agent'}</button></form></div> : null}
        </div>
      </div>
    </Shell>
  );
}

// ---- a document in full: what the project is -------------------------------------------------------------------
export function Doc({ d, title, md }: { d: ProjectPageData; title: string; md?: string }) {
  return (
    <Shell d={d} current="overview">
      <div class="card" style="margin-top:20px;max-width:760px"><h2>{title}</h2>{md?.trim() ? <div class="prose" dangerouslySetInnerHTML={{ __html: mdToSafeHtml(md) }} /> : <p class="empty">Not published yet.</p>}</div>
    </Shell>
  );
}

// ---- the team: the roster the repository commits, and the door to change it -------------------------------------
const TEAM_LABELS: Record<string, string> = { owner: 'Owner', direction: 'Project direction', moderation: 'Moderation', 'release-review': 'Release review' };
export function Team({ d, file, editing, failure, configured }: { d: ProjectPageData; file?: TeamFile; editing?: string; failure?: string; configured: boolean }) {
  const a = d.v.account;
  const base = at(a, 'team');
  const member = file?.team.members.find((m) => m.id === editing);
  const edit = Boolean(file?.team.members.length && (editing === 'new' || member));
  const input = (name: string, title: string, value = '', required = false, max = 80) => <label class="field">{title}<input name={name} value={value} required={required} maxlength={max} /></label>;
  return (
    <Shell d={d} current="team">
      <div class="cols" style="grid-template-columns:minmax(0,1fr) 340px">
        <div class="main">
          {failure ? <div class="card" role="alert"><p class="empty">{failure}</p></div> : null}
          {!file ? <div class="card"><p class="empty">The committed roster is unavailable. Changes are disabled until it can be read.</p></div>
            : !file.team.members.length ? <div class="card"><h2>Team</h2><p class="empty">No team recorded yet. The setup agent establishes the first owner's verified accounts and authority; then owners manage the team here.</p></div>
            : file.team.members.map((m: TeamMember) => <div class="card">
              <div class="row" style="padding:0;border:0"><span class="t" style="font-size:17px;font-weight:700">{m.name}</span><span class="n">{m.scopes.length ? m.scopes.map((x) => TEAM_LABELS[x] ?? x).join(' · ') : 'Contributor'}</span></div>
              <div class="wall" style="margin-top:10px">{m.github ? <a class="chip" href={`https://github.com/${encodeURIComponent(m.github.login)}`}><img src={`https://github.com/${encodeURIComponent(m.github.login)}.png?size=52`} alt="" />@{m.github.login}</a> : null}{m.discord ? <a class="chip" href={`https://discord.com/users/${encodeURIComponent(m.discord.id)}`}>Discord · {m.discord.name}</a> : null}</div>
              <p class="fine" style="overflow-wrap:anywhere">{m.source}</p>
              <p class="fine"><a href={`${base}?edit=${encodeURIComponent(m.id)}`}>Edit {m.name} →</a></p>
            </div>)}
          {edit && file ? <div class="card" id="editor">
            <h2>{member ? `Edit ${member.name}` : 'Add teammate'}</h2>
            <form class="form" method="post" action={base}>
              <input type="hidden" name="sha" value={file.sha} /><input type="hidden" name="id" value={member?.id ?? ''} />
              {input('name', 'Name', member?.name, true)}
              {input('github_login', 'GitHub username', member?.github?.login)}
              {input('github_id', 'GitHub account ID (kept for a renamed account; clear it only to link a different one)', member?.github?.id, false, 20)}
              {input('discord_id', 'Discord user ID or profile link', member?.discord?.id)}
              {input('discord_name', 'Discord name', member?.discord?.name)}
              <fieldset class="field"><legend>Authority</legend>{TEAM_SCOPES.map((scope) => <label class="check"><input type="checkbox" name="scopes" value={scope} checked={member?.scopes.includes(scope)} /> {TEAM_LABELS[scope]}</label>)}</fieldset>
              <label class="field">Identity and authority source<textarea name="source" required maxlength={500}>{member?.source ?? ''}</textarea></label>
              <p class="fine">A public source link or a specific owner confirmation establishing whose accounts these are and what they may decide.</p>
              <label class="check"><input type="checkbox" name="attest" value="yes" required /> I confirm these account links and permissions, or the removal of this person.</label>
              <p class="fine">Continue with GitHub to open a draft pull request. Only a recorded owner can authorize this change; it takes effect when merged on GitHub. GitHub asks for public repository access to create the change under your account.</p>
              {configured ? <div class="wall"><button class="btn" name="operation" value="save">Continue with GitHub</button>{member ? <button class="btn quiet" name="operation" value="remove">Remove teammate</button> : null}</div> : <p class="empty" role="status">GitHub sign-in is not configured on this deployment.</p>}
              <p class="fine"><a href={base}>Cancel</a></p>
            </form>
          </div> : null}
        </div>
        <div class="side">
          <div class="card"><h2>The roster</h2><p class="fine" style="margin:0">{file ? <>From the <a href={`https://github.com/${a}/blob/${encodeURIComponent(file.head)}/.open-autonomy/config.yaml`}>committed roster</a>. Release authority still requires human review of the specific release.</> : 'The people behind the project and the decisions they can make, from the repository.'}</p>{file?.team.members.length && !edit ? <a class="btn quiet wide" style="margin-top:14px" href={`${base}?edit=new`}>Add teammate</a> : null}</div>
        </div>
      </div>
    </Shell>
  );
}
