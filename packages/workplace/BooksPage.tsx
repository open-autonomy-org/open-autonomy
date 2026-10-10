import { door, session } from '@runhuman/workplace/api';
import { BooksView, type BooksSource, type BooksControl } from './BooksView.js';
import { useContributionRead } from '@runhuman/workplace/contributions/reader';
export function BooksPage() {
  const org = session()?.organizationId;
  const root = org ? `/api/v3/organizations/${encodeURIComponent(org)}/books` : undefined;
  const read = useContributionRead<{ sources: BooksSource[]; controls: BooksControl[] }>(root);
  return <section className="console-page"><header className="console-page__head"><h1>Books</h1></header>
    {read.error && <p role="alert">{read.error}</p>}
    {read.data ? <BooksView sources={read.data.sources} controls={read.data.controls} onFreeze={async (sourceKey, account, frozen, reason) => {
      await door(`${root}/${encodeURIComponent(sourceKey)}/controls`, { body: { action: frozen ? 'freeze' : 'unfreeze', targetKey: account, ...(reason ? { reason } : {}) } }); read.reload();
    }} /> : !read.error && <p role="status">Opening books…</p>}
  </section>;
}
