// The core's document: the one stylesheet, the fonts, a title. The front, a name's page and a message page wear it.
import { esc } from '../ui.js';
import { CSS, FONTS } from './theme.js';

// What a page says about itself to a link preview and a feed reader: its description, the card a shared link
// shows, and the project's feed when it has one. Text only; the pages publish no picture of their own.
export interface PageMeta { description?: string; feed?: string }
export function headMeta(title: string, brand: string, meta: PageMeta = {}): string {
  const full = `${title} · ${brand}`;
  const d = meta.description ? esc(meta.description.replace(/\s+/g, ' ').trim().slice(0, 300)) : '';
  return `<title>${esc(full)}</title>${d ? `<meta name="description" content="${d}">` : ''}<meta property="og:type" content="website"><meta property="og:site_name" content="${esc(brand)}"><meta property="og:title" content="${esc(title)}">${d ? `<meta property="og:description" content="${d}">` : ''}<meta name="twitter:card" content="summary"><meta name="twitter:title" content="${esc(title)}">${d ? `<meta name="twitter:description" content="${d}">` : ''}${meta.feed ? `<link rel="alternate" type="application/atom+xml" title="${esc(title)} updates" href="${esc(meta.feed)}">` : ''}`;
}
export function document(title: string, brand: string, body: string, styles = '', meta: PageMeta = {}): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="preconnect" href="https://fonts.googleapis.com"><link href="${FONTS}" rel="stylesheet">${headMeta(title, brand, meta)}<style>${CSS}${styles}</style></head><body>${body}</body></html>`;
}
