// The page's design system, zero-based: one type scale, one spacing scale, one coral, and cards that are quiet
// until something is live. A stranger reads one screen; every detail is a link away.
export const T = {
  ink: '#16171a', body: '#3d3f44', muted: '#76787d', faint: '#a3a5aa', line: '#e9e6e1', wash: '#f7f6f3', panel: '#ffffff',
  accent: '#ff424d', accentInk: '#d8323c', accentWash: '#fff1f2', green: '#0a8754', greenWash: '#e8f5ee', amber: '#b86e00', amberWash: '#fff5e6', gray: '#8a8c91',
} as const;

export const FONTS = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Fraunces:opsz,wght@9..144,500;9..144,600&display=swap';
export const CSS = `
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:${T.wash};color:${T.ink};font:15px/1.55 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
a:hover{text-decoration:underline;text-underline-offset:3px}
h1,h2,h3,p,ul,ol{margin:0}
ul,ol{padding:0;list-style:none}
.topbar{background:${T.panel};border-bottom:1px solid ${T.line};position:sticky;top:0;z-index:5}
.topbar .in{max-width:1120px;margin:0 auto;padding:0 24px;height:60px;display:flex;align-items:center;gap:22px}
.brand{display:flex;align-items:center;gap:9px;font-weight:800;font-size:17px;letter-spacing:-.01em}
.brand svg{width:24px;height:24px}
.topbar nav{display:flex;gap:18px;color:${T.muted};font-weight:500}
.topbar .grow{flex:1}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:40px;padding:0 18px;border-radius:999px;border:1.5px solid ${T.accent};background:${T.accent};color:#fff;font-weight:700;font-size:14px;white-space:nowrap;cursor:pointer}
.btn:hover{background:${T.accentInk};border-color:${T.accentInk};text-decoration:none}
.btn.quiet{background:#fff;color:${T.accentInk}}
.btn.quiet:hover{background:${T.accentWash}}
.btn.wide{width:100%}
.btn.small{height:32px;padding:0 12px;font-size:13px}
.page{max-width:1120px;margin:0 auto;padding:0 24px 64px}
.cover{height:220px;border-radius:0 0 20px 20px;background-size:cover;background-position:center}
.hero{display:grid;grid-template-columns:96px minmax(0,1fr);gap:22px;align-items:start;padding:0 8px}
.avatar{width:96px;height:96px;border-radius:24px;border:4px solid ${T.wash};background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.08);object-fit:cover;flex:none;margin-top:-44px;position:relative}
.hero .who{min-width:0;padding-top:16px}
.hero h1{font-family:Fraunces,Georgia,serif;font-size:40px;font-weight:600;letter-spacing:-.015em;line-height:1.05;margin:0 0 8px;font-variation-settings:"opsz" 40}
.hero .built{color:${T.muted};font-size:13.5px;margin-top:8px}
.hero .built b{color:${T.body};font-weight:600}
.hero .tag{color:${T.body};font-size:16px;max-width:60ch}
.hero .meta,.acct .meta{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;margin-top:12px;color:${T.muted};font-size:14px}
.hero .meta b,.acct .meta b{color:${T.ink};font-weight:700}
.pill{display:inline-flex;align-items:center;gap:7px;height:28px;padding:0 11px 0 9px;border-radius:999px;font-size:13px;font-weight:600;background:${T.wash};color:${T.body};border:1px solid ${T.line}}
.pill .dot{width:8px;height:8px;border-radius:50%;background:${T.gray}}
.pill.live{background:${T.greenWash};color:${T.green};border-color:transparent}
.pill.live .dot{background:${T.green};box-shadow:0 0 0 0 rgba(10,135,84,.5);animation:pulse 1.6s infinite}
.pill.ok .dot{background:${T.green}}
.pill.warn{background:${T.amberWash};color:${T.amber};border-color:transparent}
.pill.warn .dot{background:${T.amber}}
.pill.off{background:${T.accentWash};color:${T.accentInk};border-color:transparent}
.pill.off .dot{background:${T.accent}}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(10,135,84,.45)}70%{box-shadow:0 0 0 8px rgba(10,135,84,0)}100%{box-shadow:0 0 0 0 rgba(10,135,84,0)}}
.front{padding:48px 8px 0}
.front h1{font-family:Fraunces,Georgia,serif;font-size:44px;font-weight:600;letter-spacing:-.02em;line-height:1.05;font-variation-settings:"opsz" 44;max-width:22ch}
.front .lede{color:${T.body};font-size:17px;line-height:1.5;max-width:62ch;margin-top:14px}
.stripe{display:flex;gap:36px;flex-wrap:wrap;padding:20px 8px;margin-top:28px;border-top:1px solid ${T.line};border-bottom:1px solid ${T.line}}
.stripe .n{display:flex;align-items:center;gap:8px;font-family:Fraunces,Georgia,serif;font-size:26px;font-weight:600;letter-spacing:-.01em;line-height:1.1}
.stripe .n .pulse{width:9px;height:9px;border-radius:50%;background:${T.green};animation:pulse 1.6s infinite}
.stripe .k{display:block;color:${T.muted};font-size:13px;margin-top:2px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:18px;margin-top:28px}
.grid.two{grid-template-columns:repeat(auto-fill,minmax(260px,1fr));margin-top:0}
.pcard{display:flex;flex-direction:column;background:${T.panel};border:1px solid ${T.line};border-radius:18px;overflow:hidden;transition:transform .15s,box-shadow .15s}
.pcard:hover{text-decoration:none;transform:translateY(-2px);box-shadow:0 14px 32px -20px rgba(22,23,26,.35)}
.pcard.live{border-color:rgba(10,135,84,.4);box-shadow:0 0 0 3px ${T.greenWash}}
.pcard .strip{height:76px;background-size:cover;background-position:center}
.pcard .body{padding:0 18px 18px;display:flex;flex-direction:column;flex:1}
.pcard .top{display:flex;align-items:flex-end;justify-content:space-between;margin-top:-22px}
.pcard .av{width:48px;height:48px;border-radius:14px;border:3px solid ${T.panel};background:#fff;object-fit:cover;box-shadow:0 2px 8px rgba(0,0,0,.08)}
.pcard .name{font-weight:700;font-size:17px;letter-spacing:-.01em;margin-top:10px}
.pcard .own{color:${T.muted};font-size:12.5px}
.pcard .tag{color:${T.body};font-size:14px;line-height:1.5;margin-top:8px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.pcard .facts{display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:auto;padding-top:14px;color:${T.muted};font-size:13px}
.pcard .facts b{color:${T.ink};font-weight:700}
.acct{display:flex;gap:22px;align-items:center;padding:40px 8px 0}
.acct .av{width:84px;height:84px;border-radius:50%;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.08);flex:none}
.acct .who{min-width:0}
.acct h1{font-family:Fraunces,Georgia,serif;font-size:36px;font-weight:600;letter-spacing:-.015em;line-height:1.05;font-variation-settings:"opsz" 36}
.acct .line{color:${T.body};font-size:15.5px;margin-top:6px}
.gifts .who a{color:inherit}
.cols{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:28px;margin-top:28px;align-items:start}
.side{position:sticky;top:76px;display:flex;flex-direction:column;gap:16px}
.main{display:flex;flex-direction:column;gap:16px;min-width:0}
.card{background:${T.panel};border:1px solid ${T.line};border-radius:18px;padding:22px 24px}
.card h2{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${T.muted};margin-bottom:14px}
.card .more{display:inline-block;margin-top:12px;color:${T.accentInk};font-weight:600;font-size:14px}
.prose{color:${T.body};font-size:15.5px;line-height:1.6}
.prose p+p{margin-top:10px}
.prose b,.prose strong{color:${T.ink}}
.shop{background:#1b171d;color:#f2efea;border-radius:18px;padding:20px 22px 18px;position:relative;overflow:hidden;box-shadow:0 18px 40px -24px rgba(27,23,29,.55)}
.shop:before{content:"";position:absolute;inset:auto -60px -120px auto;width:280px;height:280px;border-radius:50%;background:radial-gradient(circle, rgba(255,66,77,.32), transparent 65%);pointer-events:none}
.shop .head{display:flex;align-items:center;gap:10px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#b9b3ad}
.shop .head .pulse{width:8px;height:8px;border-radius:50%;background:${T.accent};box-shadow:0 0 0 0 rgba(255,66,77,.6);animation:pulse2 1.5s infinite}
.shop .head .pulse.still{background:#6f6a72;animation:none;box-shadow:none}
.shop .head .spacer{flex:1}
.shop .head a{color:#d9d3cc;font-weight:600;letter-spacing:0;text-transform:none;font-size:13px}
@keyframes pulse2{0%{box-shadow:0 0 0 0 rgba(255,66,77,.55)}70%{box-shadow:0 0 0 9px rgba(255,66,77,0)}100%{box-shadow:0 0 0 0 rgba(255,66,77,0)}}
.shop .sess{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-top:12px}
.shop .sess .name{font-family:Fraunces,Georgia,serif;font-size:24px;font-weight:600;letter-spacing:-.01em}
.shop .sess .sub{color:#b9b3ad;font-size:14px}
.shop .sess .sub b{color:#f2efea;font-weight:600}
.ticker{margin-top:14px;display:flex;flex-direction:column;gap:6px;font:13px/1.5 "SF Mono",SFMono-Regular,Menlo,Consolas,monospace}
.ticker li{display:grid;grid-template-columns:78px minmax(0,1fr);gap:12px;padding:6px 0;border-top:1px solid rgba(255,255,255,.07)}
.ticker li:first-child{border-top:0}
.ticker .role{color:#8f8891;font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;padding-top:2px}
.ticker .role.a{color:${T.accent}}
.ticker .line{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#e8e3dc}
.ticker .line.tool{color:#a9a3a6}
.ticker .line.tool:before{content:"▸ ";color:${T.accent}}
.shop .quote{margin-top:12px;font-family:Fraunces,Georgia,serif;font-size:19px;line-height:1.4;font-weight:500;color:#f7f4ef;max-width:52ch}
.shop .quote:before{content:"“";color:${T.accent};margin-right:2px}
.shop .quote:after{content:"”";color:${T.accent};margin-left:2px}
.shop .next{margin-top:12px;color:#b9b3ad;font-size:13.5px}
.spark{display:flex;align-items:flex-end;gap:3px;height:40px;margin-top:16px}
.spark i{flex:1;display:block;background:rgba(255,66,77,.28);border-radius:2px 2px 0 0;min-height:2px}
.spark i.hot{background:${T.accent}}
.spark i.zero{background:rgba(255,255,255,.08)}
.shop .sparklabel{display:flex;justify-content:space-between;color:#8f8891;font-size:11.5px;margin-top:6px;letter-spacing:.02em}
.feed{margin-top:14px;display:flex;flex-direction:column}
.feed li{display:grid;grid-template-columns:104px 104px minmax(0,1fr);gap:12px;align-items:baseline;padding:10px 0;border-top:1px solid ${T.line};font-size:14px}
.feed li:first-child{border-top:0}
.feed .when{color:${T.muted};font-size:13px;white-space:nowrap}
.feed .src{font-weight:600;white-space:nowrap;display:flex;align-items:center;gap:6px}
.feed .src i{width:7px;height:7px;border-radius:50%;background:${T.green};flex:none}
.feed .src i.bad{background:${T.accent}}
.feed .src i.none{background:${T.faint}}
.feed .said{color:${T.body};overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.feed .said a{color:inherit}
.rows{display:flex;flex-direction:column}
.row{display:flex;align-items:baseline;gap:14px;padding:11px 0;border-top:1px solid ${T.line}}
.row:first-child{border-top:0;padding-top:0}
.row .t{flex:1;min-width:0;font-weight:500;color:${T.ink};overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.row .n{flex:none;color:${T.muted};font-size:13px}
.row .n.k{color:${T.accentInk};font-weight:600}
.wall{display:flex;flex-wrap:wrap;gap:8px}
.chip{display:inline-flex;align-items:center;gap:8px;height:34px;padding:0 12px 0 4px;border-radius:999px;border:1px solid ${T.line};background:#fff;font-size:13px;font-weight:600}
.chip img{width:26px;height:26px;border-radius:50%}
.empty{color:${T.muted};font-size:14px}
.fund .big{font-family:Fraunces,Georgia,serif;font-size:36px;font-weight:600;letter-spacing:-.01em;line-height:1.05;font-variation-settings:"opsz" 36}
.fund .big span{font-size:15px;font-weight:600;color:${T.muted};letter-spacing:0}
.fund .line{color:${T.body};font-size:14px;margin-top:4px}
.track{height:8px;border-radius:999px;background:${T.wash};margin:14px 0 8px;overflow:hidden}
.track .fill{height:100%;border-radius:999px;background:${T.green}}
.track .fill.warn{background:${T.amber}}
.track .fill.off{background:${T.accent}}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:14px}
.stat{background:${T.wash};border-radius:12px;padding:10px 12px}
.stat .v{font-weight:700;font-size:15px}
.stat .l{color:${T.muted};font-size:12px;margin-top:1px}
.fund .btn{margin-top:16px}
.fine{color:${T.muted};font-size:12.5px;margin-top:10px;line-height:1.45}
.fine a{color:${T.accentInk};font-weight:600;white-space:nowrap}
.form{display:flex;flex-direction:column;gap:8px}
.form input{height:38px;border:1px solid ${T.line};border-radius:10px;padding:0 12px;font:inherit;font-size:14px}
.form .fine{color:${T.muted};font-size:12.5px;line-height:1.45}
.form .field{display:flex;flex-direction:column;gap:5px;font-size:13.5px;font-weight:600;color:${T.body};border:0;padding:0;margin:0}
.form .field input,.form .field textarea{font-weight:400;width:100%;border:1px solid ${T.line};border-radius:10px;padding:8px 12px;font:inherit;font-size:14px;color:${T.ink}}
.form .field textarea{min-height:90px;resize:vertical}
.form .check{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:400}
.foot{margin-top:40px;color:${T.muted};font-size:13px;display:flex;gap:16px;flex-wrap:wrap}
.tabs{display:flex;gap:4px;margin:22px 0 0;border-bottom:1px solid ${T.line};padding:0 8px;overflow-x:auto;scrollbar-width:none}
.tabs::-webkit-scrollbar{display:none}
.tabs a{display:inline-flex;align-items:center;gap:7px;padding:10px 12px 12px;font-weight:600;font-size:14px;color:${T.body};border-bottom:2px solid transparent;margin-bottom:-1px;white-space:nowrap}
.tabs a:hover{text-decoration:none;color:${T.ink}}
.tabs a.on{color:${T.ink};border-bottom-color:${T.accent}}
.tabs .count{background:${T.wash};border:1px solid ${T.line};border-radius:999px;padding:0 7px;font-size:12px;color:${T.muted};font-weight:600}
.tabs a.on .count{color:${T.ink}}
.ledger{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.ledger .stat .v{font-family:Fraunces,Georgia,serif;font-size:24px;font-weight:600}
.gifts li{display:grid;grid-template-columns:36px minmax(0,1fr) auto;gap:12px;align-items:center;padding:10px 0;border-top:1px solid ${T.line};font-size:14px}
.gifts li:first-child{border-top:0}
.gifts img,.gifts .ph{width:36px;height:36px;border-radius:50%;background:${T.wash}}
.gifts .who b{font-weight:600}
.gifts .who span{display:block;color:${T.muted};font-size:12.5px}
.gifts .amt{font-weight:700;color:${T.green};white-space:nowrap}
.table{width:100%;border-collapse:collapse;font-size:13.5px}
.table th{text-align:left;color:${T.muted};font-weight:600;font-size:12px;letter-spacing:.04em;text-transform:uppercase;padding:0 14px 8px 0;border-bottom:1px solid ${T.line}}
.table th.n{text-align:right}
.table td{padding:9px 14px 9px 0;border-bottom:1px solid ${T.line};vertical-align:top}
.table th:last-child,.table td:last-child{padding-right:0}
.table td.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.table td.mono{font:12.5px "SF Mono",SFMono-Regular,Menlo,monospace;color:${T.body}}
.board{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
.board h3{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${T.muted};margin-bottom:10px}
.brief{border:1px solid ${T.line};border-radius:12px;padding:12px 14px;margin-bottom:10px;background:#fff}
.brief .t{font-weight:600;font-size:14px;line-height:1.35}
.brief .m{color:${T.muted};font-size:12.5px;margin-top:4px}
.brief.hot{border-color:${T.accent};box-shadow:0 8px 24px -16px rgba(255,66,77,.5)}
.turns{display:flex;flex-direction:column;gap:2px;font:13px/1.5 "SF Mono",SFMono-Regular,Menlo,monospace}
.turns li{display:grid;grid-template-columns:84px minmax(0,1fr);gap:12px;padding:8px 0;border-top:1px solid ${T.line}}
.turns .role{color:${T.muted};font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;padding-top:2px}
.turns .role.a{color:${T.accentInk}}
.turns .body{white-space:pre-wrap;word-break:break-word;color:${T.ink}}
.turns .body.tool{color:${T.muted}}
@media(max-width:900px){.board{grid-template-columns:1fr}.ledger{grid-template-columns:repeat(2,1fr)}}
@media(max-width:900px){.front h1{font-size:32px}.stripe{gap:22px}.acct h1{font-size:28px}.acct .av{width:64px;height:64px}.cols{grid-template-columns:1fr}.side{position:static}.cover{height:150px}.hero{grid-template-columns:72px 1fr;gap:14px}.avatar{width:72px;height:72px;border-radius:18px;margin-top:-30px}.hero .who{padding-top:6px}.hero h1{font-size:26px}}
`;
