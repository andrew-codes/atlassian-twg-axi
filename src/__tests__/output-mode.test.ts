import { describe, expect, it } from "vitest";
import { needsToonConversion, parseOutputMode } from "../output-mode.js";

describe("parseOutputMode", () => {
  it("defaults to text when --output is absent", () => {
    expect(parseOutputMode(["jira", "issue", "list"])).toEqual({ format: "text", summary: false });
  });

  it("reads --output <value>", () => {
    expect(parseOutputMode(["--output", "json"])).toEqual({ format: "json", summary: false });
  });

  it("reads -o <value>", () => {
    expect(parseOutputMode(["-o", "jsonl"])).toEqual({ format: "jsonl", summary: false });
  });

  it("reads --output=<value>", () => {
    expect(parseOutputMode(["--output=json"])).toEqual({ format: "json", summary: false });
  });

  it("reads attached short form -ojson", () => {
    expect(parseOutputMode(["-ojson"])).toEqual({ format: "json", summary: false });
  });

  it("detects a bare --output-summary flag", () => {
    expect(parseOutputMode(["--output", "json", "--output-summary"])).toEqual({
      format: "json",
      summary: true,
    });
  });

  it("detects --output-summary with a level argument", () => {
    expect(parseOutputMode(["--output", "json", "--output-summary", "stats"])).toEqual({
      format: "json",
      summary: true,
    });
  });

  it("detects --output-summary=<level>", () => {
    expect(parseOutputMode(["--output=jsonl", "--output-summary=inline"])).toEqual({
      format: "jsonl",
      summary: true,
    });
  });
});

describe("needsToonConversion", () => {
  it("is false for text output", () => {
    expect(needsToonConversion({ format: "text", summary: false })).toBe(false);
  });

  it("is true for json output without a summary", () => {
    expect(needsToonConversion({ format: "json", summary: false })).toBe(true);
  });

  it("is true for jsonl output without a summary", () => {
    expect(needsToonConversion({ format: "jsonl", summary: false })).toBe(true);
  });

  it("is false when --output-summary requests the YAML envelope instead", () => {
    expect(needsToonConversion({ format: "json", summary: true })).toBe(false);
  });
});
