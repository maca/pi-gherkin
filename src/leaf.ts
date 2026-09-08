// Code-leaf resolution: turn a concrete step matching a `step:` leaf's
// pattern into a runnable command, on the least-power ladder's last two
// rungs — a fenced code block, run in-page (```js) or locally (```bash).
//
// Leaves execute as the "action" phase always: they seed/mutate state, they
// are not a judged Then. A leaf with a Gherkin body is rejected by
// validateDefinitions before this ever runs (use Composite: instead).

import { matchPattern } from "./match.ts";
import type { Definition } from "./parse.ts";

export type LeafChannel = "js" | "bash";

export interface ResolvedLeaf {
  channel: LeafChannel;
  /** The exact shell command to run via the injected Runner. */
  command: string;
}

const FENCE = /^```(\w+)?/;

function substitute(lines: string[], params: Record<string, string>): string {
  let code = lines.join("\n");
  for (const [k, v] of Object.entries(params)) code = code.split(`{${k}}`).join(v);
  return code;
}

/** Extract the fenced code block's language + content lines from a leaf body. */
function fencedBlock(body: string[]): { lang: string; lines: string[] } | null {
  const start = body.findIndex((l) => FENCE.test(l));
  if (start === -1) return null;
  const lang = FENCE.exec(body[start])![1] ?? "";
  const end = body.findIndex((l, i) => i > start && FENCE.test(l));
  if (end === -1) return null;
  return { lang, lines: body.slice(start + 1, end) };
}

/**
 * Resolve a concrete step against the project's `step:` leaf definitions.
 * Returns the runnable command for its code channel, or null if no leaf
 * matches (a core verb should be tried first; this is the fallback).
 */
export function resolveLeaf(step: string, defs: Definition[]): ResolvedLeaf | null {
  for (const d of defs) {
    if (d.kind !== "leaf") continue;
    const params = matchPattern(d.pattern, step);
    if (!params) continue;
    const block = fencedBlock(d.body);
    if (!block) continue;
    const code = substitute(block.lines, params);
    if (block.lang === "js") {
      const b64 = Buffer.from(code, "utf8").toString("base64");
      return { channel: "js", command: `agent-browser eval --base64 ${b64}` };
    }
    if (block.lang === "bash") {
      return { channel: "bash", command: code };
    }
    // Unknown fence language: no execution channel defined for it (yet).
    continue;
  }
  return null;
}
