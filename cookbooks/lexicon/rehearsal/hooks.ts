// What the kit's rehearsal cannot know about this project: the community, seeded on the GitHub twin before the brain is
// up — a question and a request as issues, an idea as a discussion. (A person in the channel speaks after the brain is
// up: `run.ts say …`.) The condition a story reads: an issue's comments.
import { ACCOUNT, api } from '../.open-autonomy/rehearsal/lib.ts';
import type { Hooks } from '../.open-autonomy/rehearsal/lib.ts';

const hooks: Hooks = {
  async seed(ctx) {
    const gh = api(ctx.world.GITHUB_TWIN_URL, { authorization: 'Bearer alice' });
    const issue = async (title: string, body: string): Promise<number> => {
      const r = await gh.post(`/repos/${ACCOUNT}/issues`, { title, body });
      if (r.status !== 201) throw new Error(`github twin: issue → ${r.status} ${r.text.slice(0, 200)}`);
      return r.body.number as number;
    };
    const q = await issue('question: what is a lexicon?', 'I found the project page. What is this, and how do I add a word?');
    const r = await issue('request: add the term "twin"', "A local stand-in for a vendor's API that a program talks to unmodified — the same SDK, the same wire, no key, no spend. A world is a set of them. Source: https://github.com/volter-ai/twin");
    const d = await gh.post(`/repos/${ACCOUNT}/discussions`, { title: 'idea: a term of the week', body: 'Could the homepage feature one term each week?', category: 'general' });
    if (d.status !== 201) throw new Error(`github twin: discussion → ${d.status} ${d.text.slice(0, 200)}`);
    ctx.log(`the community — issues #${q} (a question) and #${r} (a request), discussion #${d.body.number} (an idea)`);
  },
  conditions: {
    // A comment on an issue of the project's repository ({"answered":{"issue":1,"includes":"glossary"}}).
    answered: async (ctx, want) => { const w = want as { issue: number; includes: string }; const rows = (await api(ctx.world.GITHUB_TWIN_URL).get(`/repos/${ACCOUNT}/issues/${w.issue}/comments`)).body ?? []; return rows.some((c: any) => String(c.body ?? '').includes(w.includes)); },
    // A phrase on main's ROADMAP.md.
    roadmap: async (ctx, want) => { const r = await api(ctx.world.GITHUB_TWIN_URL).get(`/repos/${ACCOUNT}/contents/ROADMAP.md?ref=main`); return r.status === 200 && Buffer.from(r.body.content, 'base64').toString().includes(String(want)); },
  },
};
export default hooks;
