/** @jsxImportSource preact */
// The dashboard, served: the app rendered on the worker with its data beside it for the browser to hydrate, the
// kit's sheet and this page's, and the client bundle. The data is what the page shows and nothing more: the
// router gated it for this viewer before it got here.
import { render } from 'preact-render-to-string';
import { esc } from '../ui.js';
import { DASH_CSS, DashApp, titleOf } from './app.js';
import type { DashData } from './model.js';

export * from './model.js';
export { Agent, Board, Books, DASH_CSS, DashApp, Overview, Sessions, Team, titleOf } from './app.js';

export function dashDocument(d: DashData): string {
  const body = render(<DashApp d={d} />);
  const data = JSON.stringify(d).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><title>${esc(titleOf(d))} · ${esc(d.v.account.split('/')[1] ?? d.v.account)} · ${esc(d.brand)}</title><link rel="stylesheet" href="/assets/dashboard.css"><style>${DASH_CSS}</style></head><body><div id="dash">${body}</div><script type="application/json" id="dash-data">${data}</script><script type="module" src="/assets/dashboard.js"></script></body></html>`;
}
