// The page's design system, zero-based: one type scale, one spacing scale, one coral, and cards that are quiet
// until something is live. A stranger reads one screen; every detail is a link away.
export const T = {
  ink: '#16171a', body: '#3d3f44', muted: '#76787d', faint: '#a3a5aa', line: '#e9e6e1', wash: '#f7f6f3', panel: '#ffffff',
  accent: '#ff424d', accentInk: '#d8323c', accentWash: '#fff1f2', green: '#0a8754', greenWash: '#e8f5ee', amber: '#b86e00', amberWash: '#fff5e6', gray: '#8a8c91',
} as const;

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
.hero h1{font-size:32px;font-weight:800;letter-spacing:-.02em;line-height:1.15;margin:0 0 6px}
.hero .tag{color:${T.body};font-size:16px;max-width:60ch}
.hero .meta{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;margin-top:12px;color:${T.muted};font-size:14px}
.hero .meta b{color:${T.ink};font-weight:700}
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
.cols{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:28px;margin-top:28px;align-items:start}
.side{position:sticky;top:76px;display:flex;flex-direction:column;gap:16px}
.main{display:flex;flex-direction:column;gap:16px;min-width:0}
.card{background:${T.panel};border:1px solid ${T.line};border-radius:18px;padding:22px 24px}
.card h2{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${T.muted};margin-bottom:14px}
.card .more{display:inline-block;margin-top:12px;color:${T.accentInk};font-weight:600;font-size:14px}
.prose{color:${T.body};font-size:15.5px;line-height:1.6}
.prose p+p{margin-top:10px}
.prose b,.prose strong{color:${T.ink}}
.now{display:flex;align-items:center;gap:12px;flex-wrap:wrap;font-size:15px}
.now .what{font-weight:600}
.now .sub{color:${T.muted}}
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
.fund .big{font-size:30px;font-weight:800;letter-spacing:-.02em;line-height:1.1}
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
.tiers{display:flex;flex-direction:column;gap:10px}
.tier{border:1.5px solid ${T.line};border-radius:14px;padding:16px 18px}
.tier.feat{border-color:${T.accent};background:${T.accentWash}}
.tier .th{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px}
.tier .tn{font-weight:700;font-size:15px}
.tier .tp{font-weight:800;font-size:18px;letter-spacing:-.02em}
.tier .tp span{font-weight:500;font-size:12.5px;color:${T.muted}}
.tier p{color:${T.body};font-size:13.5px;margin-bottom:12px}
.tier .btn{width:100%}
.ladder{display:flex;flex-direction:column;gap:0;border:1.5px solid ${T.line};border-radius:14px;overflow:hidden;margin-bottom:12px}
.ladder .rung{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:12px 16px;border-top:1px solid ${T.line}}
.ladder .rung:first-child{border-top:0}
.ladder .rung .tn{font-weight:700;font-size:14.5px}
.ladder .rung .tn span{display:block;font-weight:400;font-size:13px;color:${T.muted}}
.ladder .rung .tp{font-weight:800;font-size:16px;white-space:nowrap}
.ladder .rung .tp span{font-weight:500;font-size:12px;color:${T.muted}}
details.more{border-top:1px solid ${T.line};margin-top:16px;padding-top:12px}
details.more summary{cursor:pointer;color:${T.muted};font-size:13.5px;font-weight:600;list-style:none;display:flex;align-items:center;gap:6px}
details.more summary::-webkit-details-marker{display:none}
details.more summary::before{content:"";width:6px;height:6px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(-45deg);margin-right:4px;transition:transform .15s}
details.more[open] summary::before{transform:rotate(45deg)}
details.more .body{padding-top:12px;display:flex;flex-direction:column;gap:12px}
.form{display:flex;flex-direction:column;gap:8px}
.form input{height:38px;border:1px solid ${T.line};border-radius:10px;padding:0 12px;font:inherit;font-size:14px}
.form .fine{color:${T.muted};font-size:12.5px;line-height:1.45}
.foot{margin-top:40px;color:${T.muted};font-size:13px;display:flex;gap:16px;flex-wrap:wrap}
@media(max-width:900px){.cols{grid-template-columns:1fr}.side{position:static}.cover{height:150px}.hero{grid-template-columns:72px 1fr;gap:14px}.avatar{width:72px;height:72px;border-radius:18px;margin-top:-30px}.hero .who{padding-top:6px}.hero h1{font-size:26px}}
`;
