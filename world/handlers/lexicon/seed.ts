// The community, seeded on the GitHub twin before the agent is up: a question and a request as issues, an idea as a
// discussion. (A person in the channel speaks after the agent is up: `bun world/run.ts say …`.)
import { ACCOUNT, api, need } from '../../lib.ts';

const gh = api(need('GITHUB_TWIN_URL'), { authorization: 'Bearer alice' });
const issue = async (title: string, body: string): Promise<number> => {
  const r = await gh.post(`/repos/${ACCOUNT}/issues`, { title, body });
  if (r.status !== 201) throw new Error(`github twin: issue → ${r.status} ${r.text.slice(0, 200)}`);
  return r.body.number as number;
};
const q = await issue('question: what is a lexicon?', 'I found the project page. What is this, and how do I add a word?');
const r = await issue('request: add the term "twin"', "A local stand-in for a vendor's API that a program talks to unmodified — the same SDK, the same wire, no key, no spend. A world is a set of them. Source: https://github.com/volter-ai/twin");
const d = await gh.post(`/repos/${ACCOUNT}/discussions`, { title: 'idea: a term of the week', body: 'Could the homepage feature one term each week?', category: 'general' });
if (d.status !== 201) throw new Error(`github twin: discussion → ${d.status} ${d.text.slice(0, 200)}`);
console.log(`seed: the community — issues #${q} (a question) and #${r} (a request), discussion #${d.body.number} (an idea)`);
