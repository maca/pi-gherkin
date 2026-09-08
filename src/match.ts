// Placeholder pattern matching: align a canonical step pattern against a
// concrete step's text, capturing `{placeholders}`.
//
// Tokens are quoted strings, `{placeholders}`, or bare words:
//   pattern  I fill the "{label}" field with "{value}"
//   text     I fill the "item" field with "Wonder Widget"
//            -> { label: "item", value: "Wonder Widget" }
//
// A quoted placeholder ("{name}") captures either a quoted value (quotes
// stripped) or a bare word, so `I should be on the "{page}"` matches both
// `I should be on the "dashboard"` and `I should be on the dashboard`.

const TOKEN = /"[^"]*"|\{[A-Za-z_][A-Za-z0-9_]*\}|[^\s"]+/g;

export function tokenize(s: string): string[] {
  return s.match(TOKEN) ?? [];
}

const BARE = /^\{(\w+)\}$/;
const QUOTED = /^"\{(\w+)\}"$/;

export function matchPattern(
  pattern: string,
  text: string,
): Record<string, string> | null {
  const pt = tokenize(pattern);
  const tt = tokenize(text);
  if (pt.length !== tt.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pt.length; i++) {
    const p = pt[i];
    const t = tt[i];
    const bare = BARE.exec(p);
    const quoted = QUOTED.exec(p);
    if (bare) {
      params[bare[1]] = t;
    } else if (quoted) {
      params[quoted[1]] = t.startsWith('"') ? t.slice(1, -1) : t;
    } else if (p !== t) {
      return null;
    }
  }
  return params;
}
