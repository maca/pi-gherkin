// Steps-file definition parser.
//
// A `.steps` file contains step definitions:
//
//   Composite: the user "{name}" is logged in     <- col-0 header
//     When I open the page "index.html"            <- indented body lines
//
// Two header kinds, both col-0 and case-insensitive:
//   Composite:  a pure group of step references (expanded at plan time)
//   step:       a leaf bound to an implementation channel (drive time)
//
// Body lines are indented. Blank lines and `#` comments are skipped, except
// inside fenced code blocks (```), where lines are preserved verbatim so
// code keeps its shape. Stray top-level text is skipped leniently.

export type DefinitionKind = "composite" | "leaf";

export interface Definition {
  kind: DefinitionKind;
  /** The step pattern, e.g. `the user "{name}" is logged in` */
  pattern: string;
  /** Raw body lines (indentation stripped, fences kept) */
  body: string[];
}

const HEADER = /^(Composite|step)\s*:\s*(.*)$/i;
const FENCE = /^```/;

export function parseDefinitions(text: string): Definition[] {
  const entries: Definition[] = [];
  let cur: Definition | null = null;
  let inFence = false;

  const pushBody = (line: string) => {
    if (cur) cur.body.push(line);
  };

  for (const raw of text.split(/\r?\n/)) {
    const trimmed = raw.trim();
    const indented = raw.startsWith(" ") || raw.startsWith("\t");

    // Blank: skipped outside fences, preserved (as "") inside them.
    if (!trimmed) {
      if (inFence) pushBody("");
      continue;
    }

    if (!indented) {
      // A col-0 header always starts a new entry.
      const m = HEADER.exec(raw);
      if (m) {
        if (cur) entries.push(cur);
        const pattern = m[2].trim();
        cur = {
          kind: m[1].toLowerCase() === "composite" ? "composite" : "leaf",
          pattern,
          body: [],
        };
        inFence = false;
        continue;
      }
      // Top-level comments and stray prose: skipped.
      continue;
    }

    // Indented body line.
    if (!cur) continue; // stray indentation before any header
    if (trimmed.startsWith("#")) {
      if (inFence) pushBody(trimmed); // real code line inside a fence
      continue; // otherwise a comment
    }
    if (FENCE.test(trimmed)) {
      pushBody(trimmed);
      inFence = !inFence;
      continue;
    }
    pushBody(trimmed);
  }

  if (cur) entries.push(cur);
  return entries;
}
