import { test } from "node:test";
import assert from "node:assert/strict";
import { resetCommands } from "../src/reset.ts";

test("resets by opening the base URL and clearing storage", () => {
  const cmds = resetCommands("http://127.0.0.1:8100/");
  assert.equal(cmds.length, 2);
  assert.equal(cmds[0], "agent-browser open http://127.0.0.1:8100/");
  assert.match(cmds[1], /^agent-browser eval --base64 /);
  const b64 = cmds[1].replace("agent-browser eval --base64 ", "");
  const decoded = Buffer.from(b64, "base64").toString("utf8");
  assert.match(decoded, /sessionStorage\.clear\(\)/);
  assert.match(decoded, /localStorage\.clear\(\)/);
});

test("is deterministic for the same base URL", () => {
  assert.deepEqual(resetCommands("http://x/"), resetCommands("http://x/"));
});
