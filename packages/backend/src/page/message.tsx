// One outcome on a page of its own: a gift given, a coupon refused, nothing found. Back to where it came from.
import { render } from '../ui.js';
import { pageConfig } from './brand.js';
import { Foot, TopBar, at } from './parts.js';
import { document } from './document.js';

export function renderMessage(account: string, ok: boolean, title: string, message: string): string {
  const { brand } = pageConfig();
  const body = render(
    <>
      <TopBar brand={brand} />
      <div class="page">
        <div class="card" style="max-width:520px;margin:64px auto 0;text-align:center;padding:40px 36px">
          <div style="font-size:40px;margin-bottom:6px">{ok ? '🎉' : '😕'}</div>
          <h1 style="font-family:Fraunces,Georgia,serif;font-size:28px;font-weight:600;letter-spacing:-.01em;margin-bottom:10px">{title}</h1>
          <p class="prose" style="margin-bottom:22px">{message}</p>
          <a class="btn quiet" href={at(account)}>← Back to {account.replace(/^@/, '')}</a>
        </div>
        <Foot brand={brand} />
      </div>
    </>,
  );
  return document(title, brand, body);
}
