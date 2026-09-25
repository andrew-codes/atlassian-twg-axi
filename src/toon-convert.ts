import { encode } from "@toon-format/toon";

/**
 * Converts captured twg stdout to TOON. Falls back to returning the input unchanged
 * when it isn't valid JSON (e.g. twg exited before writing a payload) so the wrapper
 * never fabricates output that didn't come from twg.
 */
export function convertToToon(raw: string, format: string): string {
  const text = raw.trim();
  if (!text) return raw;

  try {
    if (format === "jsonl") {
      const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
      const blocks = lines.map((line) => encode(JSON.parse(line)));
      return `${blocks.join("\n")}\n`;
    }

    const data = JSON.parse(text);
    return `${encode(data)}\n`;
  } catch {
    return raw;
  }
}
