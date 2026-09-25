import { describe, expect, it } from "vitest";
import { encode } from "@toon-format/toon";
import { convertToToon } from "../toon-convert.js";

describe("convertToToon", () => {
  it("converts a JSON object to TOON", () => {
    const payload = { ok: true, items: [{ id: 1, name: "a" }] };
    const result = convertToToon(JSON.stringify(payload), "json");

    expect(result).toBe(`${encode(payload)}\n`);
  });

  it("converts each line of jsonl input independently", () => {
    const raw = `${JSON.stringify({ id: 1 })}\n${JSON.stringify({ id: 2 })}\n`;
    const result = convertToToon(raw, "jsonl");

    expect(result).toBe(`${encode({ id: 1 })}\n${encode({ id: 2 })}\n`);
  });

  it("skips blank lines in jsonl input", () => {
    const raw = `${JSON.stringify({ id: 1 })}\n\n${JSON.stringify({ id: 2 })}\n`;
    const result = convertToToon(raw, "jsonl");

    expect(result).toBe(`${encode({ id: 1 })}\n${encode({ id: 2 })}\n`);
  });

  it("returns empty input unchanged", () => {
    expect(convertToToon("", "json")).toBe("");
    expect(convertToToon("   \n", "json")).toBe("   \n");
  });

  it("falls back to the raw string when it isn't valid JSON", () => {
    expect(convertToToon("not json at all", "json")).toBe("not json at all");
  });

  it("falls back to the raw string when a jsonl line isn't valid JSON", () => {
    const raw = `${JSON.stringify({ id: 1 })}\nnot json\n`;
    expect(convertToToon(raw, "jsonl")).toBe(raw);
  });
});
