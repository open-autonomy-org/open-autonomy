// The page keeps up with the books without a reload where it can: the workshop's ticker and the transcript append
// turns as the session narrates them; the money updates in place. It reloads once when the page's shape changes:
// a session starts or ends, the owner pauses or resumes, spending stops. Follows a transcript unless the reader
// has scrolled up. Served inline; nothing is fetched from anywhere but this worker.
export const LIVE = `(() => {
  if (!('EventSource' in window)) return;
  const enc = encodeURIComponent, $ = (s, r) => (r || document).querySelector(s);
  const usd = (c) => (c > 0 && c < 100 ? (c < 1 ? c.toFixed(2) : c.toFixed(1)) + '¢' : '$' + (c / 100).toFixed(2));
  const set = (sel, v) => { for (const el of document.querySelectorAll(sel)) el.textContent = v; };
  const one = (s, max) => { const t = String(s || '').replace(/\\s+/g, ' ').trim(); return t.length > max ? t.slice(0, max - 1) + '…' : t; };
  const arg = (a) => { try { const o = JSON.parse(a || '{}'); const c = o.command ?? o.cmd ?? o.path ?? o.query ?? o.url; return typeof c === 'string' ? c : ''; } catch { return ''; } };
  const later = () => setTimeout(() => location.reload(), 900);
  const row = (cls, role, text, tool) => { const li = document.createElement('li'); const r = document.createElement('span'); r.className = 'role ' + cls; r.textContent = role; const l = document.createElement('span'); l.className = tool ? 'line tool' : 'line'; l.textContent = text; li.append(r, l); return li; };
  // The workshop's ticker: the last five lines of the live session, in the page's own words for a turn.
  const ticker = $('[data-ticker]');
  if (ticker) {
    const es = new EventSource('/v1/accounts/' + enc(ticker.dataset.account) + '/sessions/' + enc(ticker.dataset.session) + '/events?after=' + ticker.dataset.seq);
    es.addEventListener('turn', (e) => {
      const t = JSON.parse(e.data); let li = null;
      if (t.role === 'assistant' && t.tool) { const a = arg(t.args); if (a) li = row('a', 'agent', one(t.tool + ': ' + a, 160), true); }
      else if (t.role === 'assistant') { const x = String(t.text || '').replace(/^#+\\s*/gm, '').replace(/\\*\\*/g, '').trim(); if (x) li = row('a', 'agent', one(x, 160), false); }
      else if (t.role === 'tool') { const r = String(t.result || '').trim(); if (r && !r.startsWith('{') && !r.startsWith('[')) li = row('', t.tool || 'tool', one(r.split('\\n')[0], 160), true); }
      else if (t.text && t.text.trim()) li = row('', t.role, one(t.text, 160), false);
      if (!li) return;
      ticker.append(li); while (ticker.children.length > 5) ticker.firstElementChild.remove(); ticker.style.display = '';
    });
    es.addEventListener('status', (e) => { const s = JSON.parse(e.data); set('[data-turns]', String(s.turn_count)); set('[data-cents]', usd(s.usd_cents)); if (s.status !== 'live') { es.close(); later(); } });
    es.onerror = () => {};
  }
  // A transcript: every turn as it lands, the counters with it.
  const turns = $('[data-transcript]');
  if (turns) {
    const es = new EventSource('/v1/accounts/' + enc(turns.dataset.account) + '/sessions/' + enc(turns.dataset.session) + '/events?after=' + turns.dataset.seq);
    const atBottom = () => window.innerHeight + window.scrollY >= document.body.scrollHeight - 80;
    es.addEventListener('turn', (e) => {
      const t = JSON.parse(e.data); const follow = atBottom();
      const li = document.createElement('li'); const r = document.createElement('span'); const b = document.createElement('span');
      const tool = t.role === 'tool' || (t.role === 'assistant' && t.tool);
      r.className = 'role' + (t.role === 'assistant' ? ' a' : ''); r.textContent = t.role === 'assistant' ? 'agent' : t.role === 'tool' ? (t.tool || 'tool') : t.role;
      b.className = 'body' + (tool ? ' tool' : ''); b.textContent = t.role === 'assistant' && t.tool ? t.tool + (t.args ? ' ' + t.args : '') : t.role === 'tool' ? (t.result || '') : (t.text || '');
      li.append(r, b); turns.append(li); set('[data-turns]', String(turns.children.length));
      if (follow) window.scrollTo(0, document.body.scrollHeight);
    });
    es.addEventListener('status', (e) => { const s = JSON.parse(e.data); set('[data-turns]', String(s.turn_count)); set('[data-cents]', usd(s.usd_cents)); if (s.status !== 'live') { es.close(); later(); } });
    es.onerror = () => {};
  }
  // The project: money in place; a new shape (a session starting or ending, a pause, spending stopped) reloads once.
  const project = $('[data-project]');
  if (project) {
    const es = new EventSource('/v1/accounts/' + enc(project.dataset.project) + '/events');
    es.addEventListener('project', (e) => {
      const d = JSON.parse(e.data);
      set('[data-balance]', usd(d.balance_usd_cents)); set('[data-spent]', usd(d.consumed_usd_cents)); set('[data-received]', usd(d.granted_in_usd_cents));
      const shape = JSON.parse(project.dataset.shape);
      const state = String(d.state || ''); const [desired, observed] = state.includes('/') ? state.split('/') : [state, ''];
      if (JSON.stringify(d.live) !== JSON.stringify(shape[0]) || (desired && desired !== shape[1]) || (observed && observed !== shape[2])) { es.close(); later(); }
    });
    es.onerror = () => {};
  }
})();`;
