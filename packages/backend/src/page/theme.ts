// The pages' design system, in the Plotter Logic direction (branding/rebrand-references): warm paper, fine ink
// rules, square controls, an extended display face over a quiet grotesk, tracked capitals for labels, and
// restrained lime, lilac and orange. Generative drawings (./art.ts) are the only pictures. A stranger reads one
// screen; every detail is a link away.
export const T = {
  ink: '#161a24', body: '#3d4150', muted: '#737882', faint: '#a9adb2', line: '#dcddda', rule: '#b4b7ba', wash: '#f8f9f5', panel: '#fbfbf8', stone: '#f1f1ec',
  lime: '#e3f5a3', limeInk: '#58761a', lilac: '#e8e4f0', lilacInk: '#5d5387', hot: '#ff5a1f', hotWash: '#ffe7dc',
  // Kept for the few places that name a state by its old word: positive, pending, stopped.
  accent: '#161a24', accentInk: '#161a24', accentWash: '#f1f1ec', green: '#58761a', greenWash: '#eef8d2', amber: '#a2600a', amberWash: '#fcf0dc', gray: '#a9adb2',
} as const;

// The display face and the text face, from Google Fonts; the dashboard adds its mono from the deployment's assets.
export const FONTS = 'https://fonts.googleapis.com/css2?family=Michroma&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&display=swap';
export const DISPLAY = 'Michroma,"Eurostile","Microgramma",sans-serif';
export const TEXT = '"DM Sans",ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif';
export const MONO = '"Iosevka Slab",ui-monospace,SFMono-Regular,Menlo,monospace';

// The parts every page wears: the bar, the buttons, the one word on the agent, cards, rows and the footer band.
export const BASE_CSS = `
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:${T.wash};color:${T.ink};font:400 15px/1.55 ${TEXT};-webkit-font-smoothing:antialiased;font-variant-numeric:tabular-nums;--oa-hot:${T.hot}}
a{color:inherit;text-decoration:none}
a:hover{text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:1px}
h1,h2,h3,p,ul,ol{margin:0}
ul,ol{padding:0;list-style:none}
:focus-visible{outline:2px solid ${T.ink};outline-offset:2px}
.art{display:block;width:100%;height:100%;color:${T.ink}}
.mark{display:block;width:22px;height:22px;flex:none}
.label{font:500 10px/1.4 ${TEXT};letter-spacing:.28em;text-transform:uppercase;color:${T.muted}}
.topbar{background:${T.wash};position:sticky;top:0;z-index:5}
.topbar .in{max-width:1200px;margin:0 auto;padding:0 32px;height:64px;display:flex;align-items:center;gap:28px;border-bottom:1px solid ${T.rule}}
.brand{display:flex;align-items:center;gap:12px;font:400 17px/1 ${DISPLAY};letter-spacing:-.01em;white-space:nowrap;color:#000}
.brand:hover{text-decoration:none}
.brand svg{width:20px;height:20px}
.topbar nav{display:flex;align-items:center;gap:0;color:${T.body};font-size:13.5px;white-space:nowrap}
.topbar nav a{padding:0 16px;border-left:1px solid ${T.line}}
.topbar nav a:first-child{border-left:0;padding-left:0}
.topbar .grow{flex:1}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:12px;height:44px;padding:0 20px;border-radius:0;border:1px solid ${T.ink};background:${T.ink};color:${T.wash};font:500 14px/1 ${TEXT};white-space:nowrap;cursor:pointer}
.btn:hover{background:#000;text-decoration:none}
.btn:active{transform:translateY(1px)}
.btn.quiet{background:transparent;color:${T.ink}}
.btn.quiet:hover{background:${T.stone}}
.btn.wide{width:100%}
.btn.small{height:34px;padding:0 14px;font-size:13px}
.btn .arr{font-size:15px;line-height:1}
.btn[disabled]{opacity:.45;cursor:default}
.page{max-width:1200px;margin:0 auto;padding:0 32px 0}
.pill{display:inline-flex;align-items:center;gap:8px;height:24px;padding:0 9px;font:500 11.5px/1 ${TEXT};letter-spacing:.02em;background:${T.stone};color:${T.body}}
.pill .dot{width:7px;height:7px;background:${T.faint}}
.pill.live{background:${T.lime};color:${T.ink}}
.pill.live .dot{background:${T.ink};animation:pulse 1.4s steps(2) infinite}
.pill.ok .dot{background:#9fcb2a}
.pill.warn{background:${T.amberWash};color:${T.amber}}
.pill.warn .dot{background:${T.amber}}
.pill.off{background:${T.hotWash};color:#9b3510}
.pill.off .dot{background:${T.hot}}
@keyframes pulse{0%{opacity:1}100%{opacity:.25}}
.card{background:${T.panel};border:1px solid ${T.line};padding:22px 24px}
.card h2,.sech{font:500 10px/1.4 ${TEXT};letter-spacing:.28em;text-transform:uppercase;color:${T.muted};margin-bottom:16px}
.card .more,.more{display:inline-flex;gap:10px;margin-top:14px;color:${T.ink};font-weight:500;font-size:13.5px}
.prose{color:${T.body};font-size:15.5px;line-height:1.65}
.prose p+p{margin-top:12px}
.prose b,.prose strong{color:${T.ink};font-weight:600}
.prose a{text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:1px}
.prose code{font:13px ${MONO};background:${T.stone};padding:1px 4px}
.prose h1,.prose h2,.prose h3{font:400 17px/1.35 ${DISPLAY};color:${T.ink};margin:26px 0 10px}
.prose ul{list-style:square;padding-left:20px}.prose ol{list-style:decimal;padding-left:20px}
.prose li+li{margin-top:4px}
.rows{display:flex;flex-direction:column}
.row{display:flex;align-items:baseline;gap:14px;padding:12px 0;border-top:1px solid ${T.line}}
.row:first-child{border-top:0;padding-top:0}
.row .t{flex:1;min-width:0;color:${T.ink};overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.row .n{flex:none;color:${T.muted};font-size:13px;white-space:nowrap}
.row .n.k{color:${T.limeInk};font-weight:500}
.row .n.hot{color:#b3420f;font-weight:500}
.wall{display:flex;flex-wrap:wrap;gap:8px}
.chip{display:inline-flex;align-items:center;gap:9px;height:36px;padding:0 12px 0 4px;border:1px solid ${T.line};background:${T.panel};font-size:13px;font-weight:500}
.chip img,.chip .ph{width:28px;height:28px;border-radius:50%;background:${T.stone};object-fit:cover}
.chip small{color:${T.muted};font-weight:400;font-size:12px}
.empty{color:${T.muted};font-size:14px}
.fine{color:${T.muted};font-size:12.5px;margin-top:10px;line-height:1.5}
.fine a{color:${T.ink};font-weight:500;text-decoration:underline;text-underline-offset:3px;white-space:nowrap}
.track{height:6px;background:${T.stone};margin:14px 0 8px;overflow:hidden}
.track .fill{height:100%;background:#b9dd3a}
.track .fill.warn{background:#f2b04a}
.track .fill.off{background:${T.hot}}
.stats{display:grid;grid-template-columns:repeat(3,1fr);margin-top:16px;border:1px solid ${T.line}}
.stat{padding:10px 12px}
.stat+.stat{border-left:1px solid ${T.line}}
.stat .v{font-size:15px;font-weight:500}
.stat .l{color:${T.muted};font-size:11.5px;margin-top:1px}
.form{display:flex;flex-direction:column;gap:8px}
.form input,.form select,.form textarea{height:40px;border:1px solid ${T.rule};border-radius:0;background:${T.panel};padding:0 12px;font:inherit;font-size:14px;color:${T.ink}}
.form .fine{color:${T.muted};font-size:12.5px;line-height:1.5}
.form .field{display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:500;color:${T.body};border:0;padding:0;margin:0}
.form .field input,.form .field select,.form .field textarea{font-weight:400;width:100%}
.form .field textarea{min-height:90px;padding:10px 12px;resize:vertical}
.form .check{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:400}
.table{width:100%;border-collapse:collapse;font-size:13.5px}
.table th{text-align:left;font:500 10px/1.4 ${TEXT};letter-spacing:.24em;text-transform:uppercase;color:${T.muted};padding:0 14px 10px 0;border-bottom:1px solid ${T.rule}}
.table th.n{text-align:right}
.table td{padding:10px 14px 10px 0;border-bottom:1px solid ${T.line};vertical-align:top}
.table th:last-child,.table td:last-child{padding-right:0}
.table td.n{text-align:right;white-space:nowrap}
.table td.mono{font:12.5px ${MONO};color:${T.body}}
.foot{margin-top:88px}
.foot .band{display:flex;align-items:center;gap:28px;padding:26px max(32px,calc((100vw - 1136px) / 2));background:${T.lime}}
.foot .band .say{font:500 10.5px/1.9 ${TEXT};letter-spacing:.3em;text-transform:uppercase;color:${T.ink};max-width:34ch}
.foot .band .rule{flex:1;height:1px;background:${T.ink};opacity:.35}
.foot .band .mark{width:26px;height:26px}
.foot .base{max-width:1200px;margin:0 auto;padding:28px 32px 40px;display:flex;align-items:flex-start;gap:40px;flex-wrap:wrap;color:${T.muted};font-size:13px}
.foot .base .brand{font-size:15px}
.foot .base nav{display:flex;gap:28px;margin-left:auto;color:${T.body}}
.foot .base .note{flex-basis:100%;font-size:12px}
@media(max-width:900px){.page{padding:0 18px}.topbar .in{padding:0 18px;gap:16px}.foot .band{padding:22px 18px;flex-wrap:wrap}.foot .band .rule{display:none}.foot .base{padding:24px 18px 32px}.foot .base nav{margin-left:0}}
@media(max-width:560px){.topbar nav a{padding:0 10px}.brand{font-size:14px}.topbar .btn.small{display:none}}
`;

// The core's own pages: the front, a name's page and a message page.
export const CSS = `${BASE_CSS}
.front{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,440px);gap:48px;align-items:center;padding:64px 0 56px;border-bottom:1px solid ${T.line}}
.front .copy{min-width:0}
.front .label{margin-bottom:22px;line-height:2}
.front h1{font:400 clamp(38px,5.4vw,62px)/1.02 ${DISPLAY};letter-spacing:-.035em;color:#000;max-width:14ch}
.front .lede{color:${T.body};font-size:16.5px;line-height:1.6;max-width:52ch;margin-top:24px}
.front .acts{display:flex;gap:14px;flex-wrap:wrap;margin-top:32px}
.front .pic{position:relative;aspect-ratio:1;max-width:440px;width:100%;justify-self:end}
.front .pic .cap{position:absolute;font:500 9px/1.8 ${TEXT};letter-spacing:.3em;text-transform:uppercase;color:${T.body}}
.front .pic .cap.tr{top:-6px;right:-4px;text-align:left}
.front .pic .cap.br{bottom:-6px;right:-4px}
.front .pic .mark{position:absolute;top:58px;right:0;width:26px;height:26px}
.stripe{display:grid;grid-template-columns:repeat(3,minmax(0,max-content));gap:18px 0;margin-top:36px}
.stripe>div{padding:0 28px;border-left:1px solid ${T.rule}}
.stripe>div:nth-child(3n+1){padding-left:0;border-left:0}
.stripe .n{display:flex;align-items:center;gap:8px;font:500 17px/1.2 ${TEXT};color:${T.ink}}
.stripe .n .pulse{width:7px;height:7px;background:#9fcb2a;animation:pulse 1.4s steps(2) infinite}
.stripe .k{display:block;color:${T.body};font-size:12.5px;margin-top:2px}
.shelf{display:flex;align-items:baseline;justify-content:space-between;margin:56px 0 22px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:32px 28px}
.grid.two{grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:24px}
.pcard{display:flex;flex-direction:column;min-width:0}
.pcard:hover{text-decoration:none}
.pcard .pic{aspect-ratio:1/0.92;background:${T.stone};overflow:hidden;position:relative;transition:filter .12s}
.pcard .pic[data-ground=lime]{background:${T.lime}}
.pcard .pic[data-ground=lilac]{background:${T.lilac}}
.pcard .pic[data-ground=paper]{background:${T.panel};box-shadow:inset 0 0 0 1px ${T.line}}
.pcard .pic img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.pcard:hover .pic{filter:brightness(.97)}
.pcard .pic .pill{position:absolute;left:12px;top:12px}
.pcard .body{display:flex;flex-direction:column;flex:1;padding-top:16px}
.pcard .top{display:flex;align-items:center;gap:12px}
.pcard .av{width:26px;height:26px;border-radius:50%;object-fit:cover;background:${T.stone};flex:none}
.pcard .name{font:400 21px/1.2 ${TEXT};letter-spacing:-.01em;color:${T.ink}}
.pcard .own{color:${T.muted};font-size:12.5px;margin-top:2px}
.pcard .tag{color:${T.body};font-size:14px;line-height:1.5;margin-top:8px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.pcard .meter{height:6px;background:${T.stone};margin-top:18px;overflow:hidden}
.pcard .meter i{display:block;height:100%;background:#b9dd3a}
.pcard .meter i.warn{background:#f2b04a}.pcard .meter i.off{background:${T.hot}}
.pcard .facts{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 14px;margin-top:10px;color:${T.muted};font-size:12.5px}
.pcard .facts b{color:${T.ink};font-weight:500;font-size:14px}
.acct{display:flex;gap:24px;align-items:center;padding:56px 0 40px;border-bottom:1px solid ${T.line}}
.acct .av{width:84px;height:84px;border-radius:50%;background:${T.stone};flex:none}
.acct .who{min-width:0}
.acct .label{margin-bottom:10px}
.acct h1{font:400 clamp(30px,4vw,44px)/1.05 ${DISPLAY};letter-spacing:-.03em;color:#000}
.acct .line{color:${T.body};font-size:16px;margin-top:10px}
.head .meta,.acct .meta{display:flex;flex-wrap:wrap;align-items:center;gap:0;margin-top:16px;color:${T.muted};font-size:13.5px}
.acct .meta>*{padding:0 16px;border-left:1px solid ${T.line}}
.acct .meta>*:first-child{padding-left:0;border-left:0}
.head .meta b,.acct .meta b{color:${T.ink};font-weight:500}
.gifts .who a{color:inherit}
.cols{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:36px;margin-top:36px;align-items:start}
.side{position:sticky;top:88px;display:flex;flex-direction:column;gap:16px}
.main{display:flex;flex-direction:column;gap:20px;min-width:0}
.fund .big{font:300 36px/1.05 ${TEXT};letter-spacing:-.02em}
.fund .big span{font-size:14px;font-weight:400;color:${T.muted};letter-spacing:0}
.fund .line{color:${T.body};font-size:14px;margin-top:6px}
.ledger{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid ${T.line}}
.ledger .stat .v{font:300 24px/1.2 ${TEXT}}
.gifts li{display:grid;grid-template-columns:34px minmax(0,1fr) auto;gap:12px;align-items:center;padding:11px 0;border-top:1px solid ${T.line};font-size:14px}
.gifts li:first-child{border-top:0}
.gifts img,.gifts .ph{width:34px;height:34px;border-radius:50%;background:${T.stone}}
.gifts .who b{font-weight:500}
.gifts .who span{display:block;color:${T.muted};font-size:12.5px}
.gifts .amt{font-weight:500;color:${T.limeInk};white-space:nowrap}
.note-page{max-width:560px;margin:80px auto 0;text-align:left}
.note-page .mark{width:30px;height:30px;margin-bottom:28px}
.note-page .mark.no{color:${T.hot}}
.note-page h1{font:400 30px/1.15 ${DISPLAY};letter-spacing:-.03em;color:#000;margin-bottom:14px}
.note-page .prose{margin-bottom:28px}
.board{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.board h3{font:500 10px/1.4 ${TEXT};letter-spacing:.28em;text-transform:uppercase;color:${T.muted};margin-bottom:10px}
.turns{display:flex;flex-direction:column;gap:2px;font:13px/1.5 ${MONO}}
.turns li{display:grid;grid-template-columns:84px minmax(0,1fr);gap:12px;padding:8px 0;border-top:1px solid ${T.line}}
.turns .role{color:${T.muted};font-size:11px;letter-spacing:.2em;text-transform:uppercase;padding-top:2px}
.turns .body{white-space:pre-wrap;word-break:break-word;color:${T.ink}}
.turns .body.tool{color:${T.muted}}
@media(max-width:900px){.front{grid-template-columns:1fr;padding:40px 0;gap:32px}.front .pic{max-width:320px;justify-self:start}.stripe>div{padding:0 16px}.grid{gap:28px}.acct{padding:36px 0 28px;gap:16px}.acct .av{width:60px;height:60px}.cols{grid-template-columns:1fr}.side{position:static}.board{grid-template-columns:1fr}.ledger{grid-template-columns:repeat(2,1fr)}}
`;
