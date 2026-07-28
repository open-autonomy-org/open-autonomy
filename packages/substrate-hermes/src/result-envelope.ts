// `result.schema` -> prose the worker actually reads. The missing half of the result envelope.
//
// THE DEFECT, found by running a full loop and then asking the runner for the envelope: there wasn't one.
// The IR declares `result: { schema: ... }`, the core resolves it, the compile writes it into the installed
// manifest, `HermesRunner.result()` reads `metadata.open_autonomy` back — and NOTHING ANYWHERE TOLD THE
// WORKER TO PRODUCE IT. The live develop worker completed with thoughtful freeform metadata
// (`changed_files`, `tests_run`, `commits`) under no namespace and matching no schema, because that is what
// a competent model does when given a metadata field and no contract. So `result.schema` was decorative:
// declared, compiled, and read by a consumer that would never find anything.
//
// A Hermes profile is directed by prose, and `kanban_complete` already accepts arbitrary metadata. So the
// realization is prose: the schema the actor declared, stated as an instruction, appended to its SOUL.md by
// the installer. Nothing else is needed and nothing upstream changes.
//
// WHY `metadata.open_autonomy` AND NOT `metadata` ITSELF — this cost a run to learn: Hermes stamps its own
// `worker_session_id` into every completion's metadata, which invalidates any envelope declaring
// `additionalProperties: false` (both of hermes-sdlc's do, as does the standard `open-autonomy.review.v1`).
// The namespace is not decoration; it is what keeps the substrate's bookkeeping out of the actor's contract.
//
// This is emitted as a SEPARATE file the installer appends rather than being spliced into the SKILL.md at
// compile time, because a profile's SOUL.md is its SKILL.md VERBATIM (`copies`, not `generated`) — a
// portable skill must stay portable, and the envelope requirement is this substrate's realization of a
// portable declaration, not new doctrine.
import { resolveResultSchema, type AutonomyIR } from '@open-autonomy/core';

export const RESULT_CONTRACT_FILE = 'RESULT-CONTRACT.md';

/** Roles that declare a `result.schema` this substrate can resolve, mapped to the contract prose appended
 *  to their soul. An actor with no `result` gets no file — a completion with no declared shape is not
 *  improved by inventing one. */
export function resultContracts(ir: AutonomyIR, lowered: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const role of lowered) {
    const declared = ir.agents[role]?.result?.schema;
    if (!declared) continue;
    const schema = resolveResultSchema(declared);
    if (!schema) continue; // an unresolvable schema is already a core-level finding; don't paper over it
    out[role] = contractProse(role, schema, typeof declared === 'string' ? declared : undefined);
  }
  return out;
}

function contractProse(role: string, schema: Record<string, unknown>, namedId?: string): string {
  return `
---

# Your result envelope (required)

This is not optional and it is not the same thing as your \`OUTCOME:\` line. When you complete your card,
pass a **structured result** alongside the completion, under the key \`open_autonomy\`:

\`\`\`
kanban_complete(
  summary = "<your one-paragraph summary, as usual>",
  metadata = { "open_autonomy": { ...your envelope... } }
)
\`\`\`

The envelope MUST go under \`open_autonomy\` and not at the top level of \`metadata\`: the board writes its
own \`worker_session_id\` into every completion's metadata, which would break an envelope that forbids extra
properties — and this one does.

Whoever routes your work reads this envelope, not your prose. A summary that says "done" and an envelope
that says \`outcome: blocked\` disagree, and the envelope wins — so make it the truth, and fill every
required field from what you ACTUALLY did (real commit SHAs, the ACs you really proved). An envelope that
does not validate is treated as no envelope at all.

${namedId ? `This is the standard \`${namedId}\` contract.\n\n` : ''}Your envelope must satisfy this JSON Schema:

\`\`\`json
${JSON.stringify(schema, null, 2)}
\`\`\`
`;
}
