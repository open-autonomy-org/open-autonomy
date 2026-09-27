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
        <div class="note-page">
          <img class={`mark${ok ? '' : ' no'}`} src={pageConfig().logo} alt="" />
          <p class="label" style="margin-bottom:12px">{ok ? 'Done' : 'Not done'}</p>
          <h1>{title}</h1>
          <p class="prose">{message}</p>
          <a class="btn quiet" href={at(account)}><span class="arr">←</span>Back to {account.replace(/^@/, '')}</a>
        </div>
      </div>
      <Foot brand={brand} />
    </>,
  );
  return document(title, brand, body);
}
