import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { encode } from "@toon-format/toon";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_BIN = path.resolve(__dirname, "../../dist/bin/twg-axi.js");
const FAKE_TWG = path.resolve(__dirname, "fixtures/fake-twg.mjs");

function runTwgAxi(args: string[]) {
  const result = spawnSync(process.execPath, [DIST_BIN, ...args], {
    env: { ...process.env, TWG_AXI_BIN: FAKE_TWG },
    encoding: "utf8",
  });
  return result;
}

function argvSeenBy(stderr: string): string[] {
  const line = stderr.split("\n").find((l) => l.startsWith("ARGV:"));
  if (!line) throw new Error(`fixture did not report ARGV, stderr was:\n${stderr}`);
  return JSON.parse(line.slice("ARGV:".length));
}

describe("command and flag pass-through", () => {
  it("forwards every argument to twg unchanged", () => {
    const args = ["jira", "issue", "list", "--project", "ABC", "--limit", "10"];
    const result = runTwgAxi(args);

    expect(argvSeenBy(result.stderr)).toEqual(args);
    expect(result.status).toBe(0);
  });

  it("preserves nonzero exit codes and stderr from twg", () => {
    const result = runTwgAxi(["jira", "issue", "list", "--fail"]);

    expect(result.status).toBe(3);
    expect(result.stderr).toContain("boom: something went wrong");
  });
});

describe("JSON-to-TOON conversion", () => {
  it("converts --output json payloads to TOON", () => {
    const result = runTwgAxi(["jira", "issue", "list", "--output", "json"]);
    const expected = encode({
      ok: true,
      items: [
        { id: 1, name: "a" },
        { id: 2, name: "b" },
      ],
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toBe(`${expected}\n`);
  });

  it("converts -o json short flag payloads to TOON", () => {
    const result = runTwgAxi(["jira", "issue", "list", "-o", "json"]);
    const expected = encode({
      ok: true,
      items: [
        { id: 1, name: "a" },
        { id: 2, name: "b" },
      ],
    });

    expect(result.stdout).toBe(`${expected}\n`);
  });

  it("converts each --output jsonl record to TOON", () => {
    const result = runTwgAxi(["jira", "issue", "list", "--output", "jsonl"]);
    const expected = [encode({ id: 1, name: "a" }), encode({ id: 2, name: "b" })].join("\n");

    expect(result.stdout).toBe(`${expected}\n`);
  });

  it("falls back to raw passthrough when stdout isn't valid JSON", () => {
    const result = runTwgAxi(["jira", "issue", "list", "--output", "json", "--emit-invalid-json"]);

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("not actually json\n");
  });
});

describe("non-JSON passthrough", () => {
  it("passes plain text output through unchanged", () => {
    const result = runTwgAxi(["jira", "issue", "list"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("plain text output\nline two\n");
  });

  it("passes --output-summary's YAML envelope through unchanged, not as TOON", () => {
    const result = runTwgAxi(["jira", "issue", "list", "--output", "json", "--output-summary"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("summary: /tmp/payload.json\nstats:\n  count: 2\n");
  });
});
