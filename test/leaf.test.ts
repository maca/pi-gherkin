import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDefinitions } from "../src/parse.ts";
import { resolveLeaf } from "../src/leaf.ts";

const JS_LEAF = `
step: the cart holds "{item}" for "{name}"
  \`\`\`js
  const key = 'cart:' + {name};
  cart.push({item});
  \`\`\`
`;

const BASH_LEAF = `
step: the api accepts order "{id}"
  \`\`\`bash
  curl -s -X POST http://x/orders \\
    -d '{"id": "{id}"}'
  \`\`\`
`;

test("resolves a js leaf: base64-encoded eval command, placeholders substituted", () => {
  const defs = parseDefinitions(JS_LEAF);
  const r = resolveLeaf('the cart holds "Widget" for "Macario"', defs);
  assert.ok(r);
  assert.equal(r!.channel, "js");
  assert.match(r!.command, /^agent-browser eval --base64 /);
  const b64 = r!.command.replace("agent-browser eval --base64 ", "");
  const decoded = Buffer.from(b64, "base64").toString("utf8");
  assert.match(decoded, /cart:' \+ Macario/);
  assert.match(decoded, /cart\.push\(Widget\)/);
});

test("resolves a bash leaf: raw substituted script, run as-is", () => {
  const defs = parseDefinitions(BASH_LEAF);
  const r = resolveLeaf('the api accepts order "ord-1"', defs);
  assert.ok(r);
  assert.equal(r!.channel, "bash");
  assert.match(r!.command, /curl -s -X POST/);
  assert.match(r!.command, /"id": "ord-1"/);
});

test("returns null when no leaf matches", () => {
  const defs = parseDefinitions(JS_LEAF);
  assert.equal(resolveLeaf("nothing matches this", defs), null);
});

test("ignores Composite: definitions (only leaves are code-executable)", () => {
  const defs = parseDefinitions(`
Composite: the cart holds "{item}" for "{name}"
  When I click "Add"
`);
  assert.equal(resolveLeaf('the cart holds "Widget" for "Macario"', defs), null);
});
