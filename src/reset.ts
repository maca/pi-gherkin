// Per-scenario reset: the deterministic commands run between scenarios so
// one scenario's leftover browser state (still logged in, still on a
// sub-page, stale storage) cannot leak into the next and produce a false
// pass or a confusing failure.
//
// Not run before the very first scenario in a feature — its own Given steps
// establish the starting state. Run before every scenario after that.

const RESET_JS = "sessionStorage.clear(); localStorage.clear();";

export function resetCommands(baseUrl: string): string[] {
  const b64 = Buffer.from(RESET_JS, "utf8").toString("base64");
  return [`agent-browser open ${baseUrl}`, `agent-browser eval --base64 ${b64}`];
}
