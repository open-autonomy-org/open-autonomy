// The pages' shared parts: addresses, the top bar, the one word on the agent, and what several pages read from a
// record. Nothing here reads the books; a page hands each part the view it already has.
import { raw } from 'hono/html';
import type { Roadmap } from '@open-autonomy/sdk/roadmap';
import type { EnvelopePurpose, ProjectView } from '../ledger.js';
import { LOGO_SVG } from '../ui.js';

export const nameOf = (account: string): string => account.split('/')[1] ?? account;
export const ownerOf = (account: string): string => account.split('/')[0];
// Addresses follow GitHub's: /name for a login (an org or a person; the books call a person's account `@login`),
// /owner/project for a project, /owner/project/dashboard and beneath for its work. `accountAt` reads an address back.
export const at = (account: string, ...rest: string[]): string => `/${account.replace(/^@/, '').split('/').map(encodeURIComponent).join('/')}${rest.length ? `/${rest.map(encodeURIComponent).join('/')}` : ''}`;
export const accountAt = (owner: string, project?: string): string => (project ? `${owner}/${project}` : `@${owner}`);
// What the project is, as its substrate published it: the first paragraphs of its document.
export function leadParagraphs(md: string | undefined, max = 2): string {
  if (!md) return '';
  return md.split('\n').filter((l) => !/^#/.test(l)).join('\n').trim().split(/\n{2,}/).slice(0, max).join('\n\n').trim();
}
// An earmark's purpose as a sentence: what a gift is for.
export function purposeSentence(account: string, purpose: EnvelopePurpose, roadmap?: Roadmap): string {
  if (purpose.type === 'item') return `the task '${roadmap?.items.find((i) => i.id === purpose.item)?.title ?? purpose.item}'`;
  if (purpose.type === 'models') return `model calls on ${purpose.models.join(', ')}`;
  if (purpose.type === 'model') return 'model calls only';
  return purpose.type === 'any' ? 'anything the agent spends on' : `whatever ${nameOf(account)} needs`;
}


// ---- the top bar -----------------------------------------------------------------------------------------------
export function TopBar({ brand, nav, cta }: { brand: string; nav?: unknown; cta?: unknown }) {
  return (
    <div class="topbar"><div class="in">
      <a href="/" class="brand">{raw(LOGO_SVG)}<span>{brand}</span></a>
      {nav ? <nav>{nav}</nav> : null}
      <span class="grow" />
      {cta}
    </div></div>
  );
}

// ---- the one word on the agent ----------------------------------------------------------------------------------
export type Standing = 'live' | 'running' | 'requested' | 'paused' | 'exhausted' | 'unfunded';
export function standingOf(v: Pick<ProjectView, 'funded' | 'exhausted' | 'control'>, live: string[]): Standing {
  const desired = v.control?.desired?.state ?? 'running', observed = v.control?.observed?.state;
  if (desired === 'paused' && observed === 'paused') return 'paused';
  if (desired === 'paused') return 'requested';
  if (observed === 'paused') return 'paused';
  // A session in flight is the one fact that outranks the books: an agent on its owner's own subscription works
  // with no platform funds at all, and a working agent is working.
  if (live.length) return 'live';
  if (v.exhausted) return 'exhausted';
  if (!v.funded) return 'unfunded';
  return 'running';
}
const STANDING: Record<Standing, { cls: string; word: string }> = {
  live: { cls: 'live', word: 'Working now' }, running: { cls: 'ok', word: 'Running' }, requested: { cls: 'warn', word: 'Pause requested' },
  paused: { cls: 'off', word: 'Paused by the owner' }, exhausted: { cls: 'off', word: 'Spending stopped' }, unfunded: { cls: '', word: 'Not yet funded' },
};
export const Pill = ({ standing }: { standing: Standing }) => <span class={`pill ${STANDING[standing].cls}`}><span class="dot" />{STANDING[standing].word}</span>;

// ---- the hero ---------------------------------------------------------------------------------------------------
// A URL from a record is untrusted: https, or a path on this deployment; no quote, paren, angle bracket, backslash or space.
export const safeUrl = (u: string | undefined): string | undefined => (u && /^(?:https:\/\/|\/(?!\/))[^\s'"()<>\\]*$/.test(u) ? u : undefined);
export function coverStyle(url: string | undefined, seed = ''): string {
  const safe = safeUrl(url);
  if (safe) return `background-image:url('${safe}')`;
  let h = 0; for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = h % 360;
  return `background:radial-gradient(ellipse at ${25 + (hue % 50)}% 45%, hsl(${350 + (hue % 20)} 85% 58%), #2a0f14 75%)`;
}
export const runwayWords = (days: number | null): string | null => (days === null ? null : days > 365 ? 'over a year of runway' : days === 1 ? '1 day of runway' : `${days} days of runway`);
// ---- a session's turns as a page holds them ----------------------------------------------------------------------
export type Turn = { seq?: number; ts?: string; role: string; text?: string; tool?: string; args?: string; result?: string };
export interface SessionTail { key: string; turns: Turn[] }
export const firstLine = (s: string | undefined, max = 140): string => { const l = (s ?? '').split('\n').map((x) => x.trim()).find((x) => x && !/^[#\-*\[]/.test(x)) ?? (s ?? '').trim(); return l.length > max ? `${l.slice(0, max - 1)}…` : l; };
export const Foot = ({ brand }: { brand: string }) => <div class="foot"><span>Every spend on these books is metered as it happens. {brand} shows; it does not steer.</span></div>;
