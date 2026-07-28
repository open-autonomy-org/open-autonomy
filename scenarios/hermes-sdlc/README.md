# `scenarios/hermes-sdlc`

open-autonomy's side of the **hermes-sdlc proof**. The proof itself is not here — it lives in the twin
repo, because it needs a sealed world:

```sh
cd ../twin && bun cookbook/hermes-sdlc/run.ts
```

That run compiles `profiles/hermes-sdlc` with the real compiler, seeds a **real** Hermes gateway whose
profile roster is derived from the compiled manifest, and drives the loop with Anthropic, GitHub and Slack
twinned. Nothing about Hermes is simulated. What it found is written up in
`../twin/cookbook/hermes-sdlc/LOWERING-NOTES.md`.

## Why `json-schema.ts` is here

The proof needs to check a returned value against the `result.schema` the compiled manifest declares — and
open-autonomy has no code that does that. `resolveResultSchema` hands back a schema; nothing consumes one.
`REVIEW_RESULT_JSON_SCHEMA` has no reader outside `ir.ts` and its own test.

So this directory carries a minimal validator covering exactly the JSON Schema subset the IR uses
(`type`/`required`/`properties`/`additionalProperties`/`const`/`enum`/`minLength`/`maxLength`/`pattern`/
`minimum`/`minItems`/`maxItems`/`items`/`allOf`/`if`-`then`-`else`/`not`), so the claim "done is verified,
not presumed" could be tested rather than asserted.

**It should not stay here.** It belongs in `@open-autonomy/core` beside `resolveResultSchema`, which is
what would make `result.schema` load-bearing instead of decorative. That is a change to the published
package surface, so it is left as a proposal rather than made silently as part of a proof.
