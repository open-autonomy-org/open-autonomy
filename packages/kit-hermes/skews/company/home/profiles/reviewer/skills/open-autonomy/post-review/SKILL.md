---
name: post-review
description: The reviewer's bar for a go-to-market card: the funnel story, claims against evidence, the voice against the donors, platform rules and sameness, links against the release hold, and a blind walk of the whole funnel that must end in a lead.
version: 1.0.0
---

# Reviewing a post

A post is reviewed as a pull request is, "using the rigor of proven process", before any hand posts it. Read the card,
its pull request whole, and each changeset it names in the lane's World (the post as it would be rendered, per channel).
The lane's configuration is `gtm:` in `.open-autonomy/config.yaml`.

## The bar

1. **The funnel story.** The card names the stage the post brings people into, through which next piece, how that is
   counted (its tracked link `?ref=<card>-<channel>` on every link), the action it drives and the audience it is for. A
   post that would add reach and no leads fails: "it has to be a post that drives some provable action from an audience
   we're interested in".
2. **Claims against evidence.** Every claim in every channel's text is checked at its cited source. No stars, votes or
   positions are asked for or traded; nothing asks friends to upvote.
3. **The voice against the donors.** The text reads as its hand writes, measured against the donor posts the lane keeps
   for that account, not as a template.
4. **Platform rules and sameness.** Each channel's own rules (the channels file names them) and its format. Read the
   last posts on the same channel: a post that repeats their template, hook or shape fails; agents left alone fall into
   one template.
5. **Links.** Every link resolves, carries its tracked ref, and points to no private repository the release hold
   (`gtm.release_hold`) does not allow.
6. **The changesets.** Each channel's changeset in the World holds exactly the reviewed text and media, and its content
   hash is the one the card names.

## The blind walk

Every post gets one. The walker sees only what a stranger sees and follows the post to the end of the funnel.

1. Give it the post as rendered in the World's mirror for that channel, and nothing else: no card, no story, no name of
   ours it would not see. Where a channel has no mirror, give it the post's tracked link and judge the rendered text
   yourself.
2. Start it through supercode in a pane of its own, in the walker's profile folder (`<home>/profiles/walker`):
   `supercode open --new claude --cwd <that folder> --input "<the post's rendered address and the test identity under gtm.walker, nothing else>"`.
3. Read its report: where it stalled, what confused it, and whether it ended as a lead. When it did, read the CRM
   (`sqlite3 -readonly` at `gtm.crm`) for the walker's identity's row and its events since the walk began.
4. **A walk that does not reach a lead, or whose lead has no CRM row, holds the post.** Name each stall as a finding with its owning task.
5. Record the walk's CRM row ids on the card as its evidence; the manager removes those rows through the deletion door.

A launch-sized post (the card says so) also gets a person's walk, through the organization's own door for a human
tester, when the card's owner asked for one.

Your verdict names the PR head commit, each changeset's content hash, the walk's report and its row ids.
