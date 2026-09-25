const SUMMARY_LEVELS = new Set(["stats", "auto", "inline"]);

export interface OutputMode {
  /** The --output/-o value twg was invoked with (defaults to "text"). */
  format: string;
  /** Whether --output-summary was passed, which makes twg emit a YAML envelope instead of raw JSON. */
  summary: boolean;
}

/**
 * Scans raw argv for twg's global --output/-o and --output-summary flags without
 * reimplementing twg's own argument parser. Used only to decide whether stdout will
 * carry raw JSON that needs TOON conversion; the argv is always forwarded to twg unchanged.
 */
export function parseOutputMode(argv: string[]): OutputMode {
  let format = "text";
  let summary = false;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];

    if (token === "--output" || token === "-o") {
      format = argv[i + 1] ?? format;
      i++;
      continue;
    }

    if (token.startsWith("--output=")) {
      format = token.slice("--output=".length);
      continue;
    }

    if (token.startsWith("-o") && token.length > 2) {
      format = token.slice(2);
      continue;
    }

    if (token === "--output-summary") {
      summary = true;
      const next = argv[i + 1];
      if (next !== undefined && SUMMARY_LEVELS.has(next)) i++;
      continue;
    }

    if (token.startsWith("--output-summary=")) {
      summary = true;
      continue;
    }
  }

  return { format, summary };
}

/** twg only emits raw JSON on stdout for --output json/jsonl without --output-summary. */
export function needsToonConversion(mode: OutputMode): boolean {
  return (mode.format === "json" || mode.format === "jsonl") && !mode.summary;
}
