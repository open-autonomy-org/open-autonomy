// A minimal JSON Schema validator — the subset the autonomy IR's `result.schema` actually uses:
// type / required / properties / additionalProperties:false / const / enum / minLength / maxLength /
// pattern / minimum / minItems / maxItems / items / allOf / if-then-else / not.
//
// WHY THIS FILE EXISTS, and why it should not exist for long: open-autonomy declares typed result
// envelopes in the IR (`result: { schema }`), resolves them (`resolveResultSchema`), and compiles them
// verbatim into the installed manifest — but there is NO code anywhere in the repository that validates a
// VALUE against one. Grep for a consumer of REVIEW_RESULT_JSON_SCHEMA outside of ir.ts and its own test:
// there is none. So today `result.schema` is a declaration nothing enforces, which means "done is verified,
// not presumed" is, at the substrate layer, still presumed.
//
// This scenario needs a real check to make its central claim testable, so it carries one. If the claim
// holds up, this belongs in @open-autonomy/core beside resolveResultSchema, not in a scenario folder.

export interface ValidationError {
  path: string;
  message: string;
}

type Schema = Record<string, unknown>;

export function validate(schema: Schema, value: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  check(schema, value, '$', errors);
  return errors;
}

function check(schema: Schema, value: unknown, path: string, errors: ValidationError[]): void {
  if (typeof schema !== 'object' || schema === null) return;

  if ('const' in schema && !deepEqual(value, schema.const))
    errors.push({ path, message: `must equal ${JSON.stringify(schema.const)} (got ${JSON.stringify(value)})` });

  if (Array.isArray(schema.enum) && !schema.enum.some((c) => deepEqual(value, c)))
    errors.push({ path, message: `must be one of ${JSON.stringify(schema.enum)} (got ${JSON.stringify(value)})` });

  if (typeof schema.type === 'string' && !typeMatches(schema.type, value)) {
    errors.push({ path, message: `must be ${schema.type} (got ${describe(value)})` });
    return; // every keyword below assumes the type held; cascading them adds noise, not information
  }

  if (typeof value === 'string') {
    if (typeof schema.minLength === 'number' && value.length < schema.minLength)
      errors.push({ path, message: `must be at least ${schema.minLength} character(s) (got ${value.length})` });
    if (typeof schema.maxLength === 'number' && value.length > schema.maxLength)
      errors.push({ path, message: `must be at most ${schema.maxLength} character(s) (got ${value.length})` });
    if (typeof schema.pattern === 'string' && !new RegExp(schema.pattern).test(value))
      errors.push({ path, message: `must match /${schema.pattern}/ (got ${JSON.stringify(value)})` });
  }

  if (typeof value === 'number' && typeof schema.minimum === 'number' && value < schema.minimum)
    errors.push({ path, message: `must be >= ${schema.minimum} (got ${value})` });

  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems)
      errors.push({ path, message: `must have at least ${schema.minItems} item(s) (got ${value.length})` });
    if (typeof schema.maxItems === 'number' && value.length > schema.maxItems)
      errors.push({ path, message: `must have at most ${schema.maxItems} item(s) (got ${value.length})` });
    if (isSchema(schema.items))
      value.forEach((item, i) => check(schema.items as Schema, item, `${path}[${i}]`, errors));
  }

  if (isPlainObject(value)) {
    const properties = isPlainObject(schema.properties) ? schema.properties : {};
    for (const name of Array.isArray(schema.required) ? schema.required : [])
      if (!(String(name) in value)) errors.push({ path, message: `missing required property "${String(name)}"` });
    if (schema.additionalProperties === false)
      for (const key of Object.keys(value))
        if (!(key in properties)) errors.push({ path: `${path}.${key}`, message: 'unexpected property' });
    for (const [key, sub] of Object.entries(properties))
      if (key in value && isSchema(sub)) check(sub as Schema, (value as Record<string, unknown>)[key], `${path}.${key}`, errors);
  }

  // Conditional composition — this is what makes an envelope schema a GATE rather than a shape. The
  // review contract's "human-required implies a humanTask" and this profile's "proposed implies evidence"
  // both live here; a validator that skipped allOf/if-then would pass the exact values that matter.
  if (Array.isArray(schema.allOf))
    for (const sub of schema.allOf) if (isSchema(sub)) check(sub as Schema, value, path, errors);

  if (isSchema(schema.if)) {
    const matched = check2(schema.if as Schema, value).length === 0;
    const branch = matched ? schema.then : schema.else;
    if (isSchema(branch)) check(branch as Schema, value, path, errors);
  }

  if (isSchema(schema.not) && check2(schema.not as Schema, value).length === 0)
    errors.push({ path, message: 'must NOT match the forbidden shape' });
}

/** Validate without collecting into the caller's list — used by if/not, whose failures are not errors. */
function check2(schema: Schema, value: unknown): ValidationError[] {
  const errors: ValidationError[] = [];
  check(schema, value, '$', errors);
  return errors;
}

function typeMatches(type: string, value: unknown): boolean {
  switch (type) {
    case 'object':
      return isPlainObject(value);
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'number':
      return typeof value === 'number';
    case 'boolean':
      return typeof value === 'boolean';
    case 'null':
      return value === null;
    default:
      return true;
  }
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isSchema = (v: unknown): boolean => isPlainObject(v);

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    return deepEqual(ka, kb) && ka.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}
