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
import { CODE_HOST_ONLY_RESULT_FIELDS } from './lowering';

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
    // A required field this substrate cannot source is REMOVED from the contract before the worker ever
    // sees it. Leaving it in is what produced the live `"pr": 4`: the prose below tells the model to fill
    // every required field from what it ACTUALLY did AND that an envelope which does not validate counts
    // for nothing — so when a required field has no honest value, those two instructions make FABRICATING
    // strictly better than omitting. The substrate wrote that trap, so the substrate removes it rather
    // than asking a model to resolve a contradiction. The removal is not silent: `loweringFindings`
    // reports the same field, so an operator reads it at compile time.
    const unsourceable = ((schema.required as string[] | undefined) ?? []).filter(
      (f) => CODE_HOST_ONLY_RESULT_FIELDS.has(f) && ir.codeHost !== 'github',
    );
    // Removing it from `required` alone was NOT enough, and the same reviewer that ran the loop caught the
    // same fabricated `"pr": 4` AFTER that fix shipped: the field was still listed in `properties`, and a
    // property a schema documents reads as a field worth filling. Prose loses to a schema. So the field is
    // removed from BOTH — and because these envelopes declare `additionalProperties: false`, deleting it
    // from `properties` makes the fabrication actually INVALID rather than merely discouraged.
    // A RELAXED CONTRACT NEEDS ITS OWN ID. Keeping `$id: open-autonomy.review.v1` (and the `const` that
    // pins `schema` to it) would have the worker stamp a versioned cross-substrate contract onto a value
    // that does not satisfy it — the standard still requires the field we removed. Any consumer that
    // validates by id discards every verdict, and this file's own rule is "an envelope that does not
    // validate is treated as no envelope at all". Silently forking an id-bearing contract is a worse trap
    // than the fabricated value it replaces.
    // Gated on something actually being relaxed. Computed unconditionally, the PROSE named a forked id
    // while the schema kept the standard one, so a worker on a code host would stamp an id its own `const`
    // rejects — and by this file's rule that is no envelope at all.
    const relaxedId = unsourceable.length && namedIdOf(declared) ? `${namedIdOf(declared)}+hermes-no-code-host` : undefined;
    // `properties` is computed ONCE: drop the unsourceable fields AND, if this is a named standard
    // contract, re-pin the `schema` const to the forked id. Two separate spreads silently clobbered each
    // other — the $id said fork, the const still said standard.
    const props = schema.properties as Record<string, unknown> | undefined;
    const relaxedProps = props
      ? Object.fromEntries(
          Object.entries(props)
            .filter(([k]) => !unsourceable.includes(k))
            .map(([k, v]) => (k === 'schema' && relaxedId && (v as { const?: unknown })?.const ? [k, { const: relaxedId }] : [k, v])),
        )
      : undefined;
    const relaxed = unsourceable.length
      ? {
          ...schema,
          ...(relaxedId ? { $id: relaxedId } : {}),
          required: (schema.required as string[]).filter((f) => !unsourceable.includes(f)),
          ...(relaxedProps ? { properties: relaxedProps } : {}),
        }
      : schema;
    out[role] = contractProse(role, relaxed, relaxedId ?? namedIdOf(declared), unsourceable);
  }
  return out;
}

const namedIdOf = (declared: unknown): string | undefined => (typeof declared === 'string' ? declared : undefined);

function contractProse(
  role: string,
  schema: Record<string, unknown>,
  namedId?: string,
  relaxed: readonly string[] = [],
): string {
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

${namedId ? `This is the standard \`${namedId}\` contract.\n\n` : ''}${
    relaxed.length
      ? `**${relaxed.map((f) => `\`${f}\``).join(', ')} ${relaxed.length === 1 ? 'has' : 'have'} been REMOVED from this
contract's required fields.** The standard schema requires ${relaxed.length === 1 ? 'it' : 'them'}, but
${relaxed.length === 1 ? 'it names something that exists' : 'they name things that exist'} only on a code host,
and this project has none — so there is no honest value to give. ${relaxed.length === 1 ? 'It has' : 'They have'}
also been removed from \`properties\`, and this envelope forbids extra properties, so sending
${relaxed.length === 1 ? 'it' : 'them'} anyway makes the envelope INVALID. Do not invent
${relaxed.length === 1 ? 'a number or identifier' : 'numbers or identifiers'} to make a schema pass; that is
the exact failure this envelope exists to prevent.

`
      : ''
  }Your envelope must satisfy this JSON Schema:

\`\`\`json
${JSON.stringify(schema, null, 2)}
\`\`\`
`;
}
