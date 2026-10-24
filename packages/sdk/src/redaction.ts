// Everything the platform publishes about a session is public. Secret-shaped text is stripped at intake,
// before the books keep it: the agent's environment holds nothing that matters, and this is the second
// wall behind that.
const PATTERNS: Array<[RegExp, string]> = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[redacted private key]'],
  [/\b(Bearer)\s+[A-Za-z0-9._~+/=-]{16,}/g, '$1 [redacted]'],
  [/\b([A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASS|CREDENTIALS?)[A-Z0-9_]*)\s*[=:]\s*["']?[^\s"'\n]{6,}["']?/g, '$1=[redacted]'],
  [/\b(sk|rk|pk)[-_](live|test|proj|ant|or)[-_][A-Za-z0-9_-]{12,}\b/g, '[redacted]'],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, '[redacted]'],
  [/\bxox[abp]-[A-Za-z0-9-]{20,}\b/g, '[redacted]'],
  [/\b[A-Za-z0-9_-]{23,28}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}\b/g, '[redacted]'], // Discord bot tokens
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]{10,})?\b/g, '[redacted]'], // JWT-shaped
];

export function redactSecrets(text: string): string {
  let out = text;
  for (const [re, rep] of PATTERNS) out = out.replace(re, rep);
  return out;
}

export function redactDeep(v: unknown): unknown {
  if (typeof v === 'string') return redactSecrets(v);
  if (Array.isArray(v)) return v.map(redactDeep);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, redactDeep(x)]));
  return v;
}
