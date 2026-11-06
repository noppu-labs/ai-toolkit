export interface InlineRun {
  code: boolean;
  text: string;
}

function push(runs: InlineRun[], run: InlineRun): void {
  const last = runs.at(-1);
  if (last !== undefined && !last.code && !run.code) {
    last.text += run.text;
  } else if (run.text.length > 0) {
    runs.push(run);
  }
}

/**
 * Splits text on paired backticks into plain and code runs. An unpaired
 * backtick and an empty pair stay in the plain text.
 */
export function splitInlineCode(text: string): InlineRun[] {
  const parts = text.split("`");
  const ticks = parts.length - 1;
  const runs: InlineRun[] = [];
  parts.forEach((part, index) => {
    const inside = index % 2 === 1;
    const closed = index < ticks;
    if (inside && closed && part.length > 0) {
      push(runs, { code: true, text: part });
    } else if (inside) {
      push(runs, { code: false, text: `\`${part}${closed ? "`" : ""}` });
    } else {
      push(runs, { code: false, text: part });
    }
  });
  return runs;
}
