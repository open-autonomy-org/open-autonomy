// The core's document: the one stylesheet, the fonts, a title. The front, a name's page and a message page wear it.
import { esc } from '../ui.js';
import { CSS, FONTS } from './theme.js';

export function document(title: string, brand: string, body: string, styles = ''): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="preconnect" href="https://fonts.googleapis.com"><link href="${FONTS}" rel="stylesheet"><title>${esc(title)} · ${esc(brand)}</title><style>${CSS}${styles}</style></head><body>${body}</body></html>`;
}
