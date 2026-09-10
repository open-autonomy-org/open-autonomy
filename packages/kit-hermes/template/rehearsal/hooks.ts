// What the kit's rehearsal cannot know about this project. Every export is optional:
//   custody(ctx)   writes whatever the project's own scripts read as their credentials, from the twins' addresses
//   seed(ctx)      what the project seeds beyond itself (a client's repository on the GitHub twin, a tracker's board)
//   acts           the project's own story acts:        {"act":"<name>", …}
//   conditions     the project's own story conditions:  {"until":{"<name>": …}}
//   stackEnv(ctx)  extra environment for the brain's stack (twin addresses its channels need)
//   ticks          the monitor jobs a story ticks after each act (default: every monitor job)
// The starter has one condition: `roadmap`, a substring of ROADMAP.md on the project's main as the GitHub twin holds
// it — what the PM landed, read through the vendor's own API, never a twin's files.
import { ACCOUNT, api, type Hooks } from '../.open-autonomy/rehearsal/lib.ts';

export default {
  conditions: {
    async roadmap(ctx, want) {
      const r = await api(ctx.world.GITHUB_TWIN_URL!, { authorization: 'Bearer world-bot' }).get(`/repos/${ACCOUNT}/contents/ROADMAP.md?ref=main`);
      if (r.status !== 200 || !r.body?.content) return false;
      return Buffer.from(String(r.body.content), 'base64').toString('utf8').includes(String(want));
    },
  },
} satisfies Hooks;
