// Canonical core vocabulary -> agent-browser command renderings.
//
// The thin baseline the harness provides (rather than shipping as a data
// file). Each verb maps a step pattern to the exact agent-browser invocation
// that executes it. "action" verbs drive the UI; "observe" verbs gather
// evidence at a Then stop-point (the agent later judges that evidence).
//
// renderStep returns command line strings (for display and later, argv).
// Unknown phrasing returns null so the caller can fall back to a project
// definition or mark the step UNDEFINED.

import { matchPattern } from "./match.ts";

export type Phase = "action" | "observe";

export interface CoreVerb {
  pattern: string;
  phase: Phase;
  render: (p: Record<string, string>, ctx: RenderCtx) => string[];
}

export interface RenderCtx {
  /** App base URL; relative paths in `open` resolve against it. */
  baseUrl?: string;
}

const q = (s: string) => `"${s}"`;

const VERBS: CoreVerb[] = [
  {
    pattern: 'I open the page "{path}"',
    phase: "action",
    render: (p, ctx) => [`agent-browser open ${resolveUrl(p.path, ctx.baseUrl)}`],
  },
  { pattern: "I reload the page", phase: "action", render: () => ["agent-browser reload"] },
  {
    pattern: 'I click "{name}"',
    phase: "action",
    render: (p) => [`agent-browser find text ${q(p.name)} click`],
  },
  {
    pattern: 'I fill the "{label}" field with "{value}"',
    phase: "action",
    render: (p) => [`agent-browser find label ${q(p.label)} fill ${q(p.value)}`],
  },
  {
    pattern: 'I press "{key}"',
    phase: "action",
    render: (p) => [`agent-browser press ${p.key}`],
  },
  {
    pattern: 'I check "{label}"',
    phase: "action",
    render: (p) => [`agent-browser find label ${q(p.label)} check`],
  },
  {
    pattern: 'I uncheck "{label}"',
    phase: "action",
    render: (p) => [`agent-browser find label ${q(p.label)} uncheck`],
  },
  {
    pattern: 'I select "{value}" in the "{label}" field',
    phase: "action",
    render: (p) => [`agent-browser find label ${q(p.label)} select ${q(p.value)}`],
  },
  {
    pattern: 'I should see the message "{text}"',
    phase: "observe",
    render: (p) => [`agent-browser wait --text ${q(p.text)}`],
  },
  {
    pattern: 'I should see "{text}"',
    phase: "observe",
    render: (p) => [`agent-browser wait --text ${q(p.text)}`],
  },
  {
    pattern: 'I should be on the "{page}"',
    phase: "observe",
    render: () => ["agent-browser get url"],
  },
];

export function renderStep(step: string, ctx: RenderCtx = {}): string[] | null {
  for (const verb of VERBS) {
    const params = matchPattern(verb.pattern, step);
    if (params) return verb.render(params, ctx);
  }
  return null;
}

export function listCore(): Array<{ pattern: string; phase: Phase }> {
  return VERBS.map(({ pattern, phase }) => ({ pattern, phase }));
}

function resolveUrl(path: string, baseUrl?: string): string {
  if (!baseUrl) return path;
  if (/^https?:\/\//i.test(path)) return path;
  const base = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";
  return base + path.replace(/^\//, "");
}
