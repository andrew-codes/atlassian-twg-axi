import { describe, expect, it } from "vitest";
// @ts-expect-error - plain .mjs release script without type declarations
import { isLive } from "../../scripts/release/npm-registry.mjs";
// @ts-expect-error - plain .mjs release script without type declarations
import { waitUntilLive } from "../../scripts/release/wait-until-live.mjs";

// A fake clock: sleeping just advances `now`, so a 15 minute window runs instantly.
function fakeClock() {
  let time = 0;
  const sleeps: number[] = [];
  return {
    sleeps,
    now: () => time,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      time += ms;
    },
  };
}

describe("waitUntilLive", () => {
  it("returns immediately when the version is already live", async () => {
    const clock = fakeClock();
    const result = await waitUntilLive(async () => true, clock);

    expect(result).toEqual({ live: true, attempts: 1, waitedMs: 0 });
    expect(clock.sleeps).toEqual([]);
  });

  it("backs off between polls and stops once the version appears", async () => {
    const clock = fakeClock();
    let polls = 0;
    const result = await waitUntilLive(async () => ++polls === 6, {
      ...clock,
      initialDelayMs: 5000,
      maxDelayMs: 60_000,
    });

    expect(result.live).toBe(true);
    expect(result.attempts).toBe(6);
    expect(clock.sleeps).toEqual([5000, 10_000, 20_000, 40_000, 60_000]);
  });

  it("gives up after the timeout, without sleeping past it", async () => {
    const clock = fakeClock();
    let polls = 0;
    const result = await waitUntilLive(async () => (polls++, false), {
      ...clock,
      timeoutMs: 15 * 60 * 1000,
    });

    expect(result.live).toBe(false);
    expect(result.waitedMs).toBe(15 * 60 * 1000);
    expect(clock.sleeps.reduce((a: number, b: number) => a + b, 0)).toBe(15 * 60 * 1000);
    expect(Math.max(...clock.sleeps)).toBeLessThanOrEqual(60_000);
    expect(polls).toBeGreaterThan(10);
  });

  it("reports each wait through onWait", async () => {
    const clock = fakeClock();
    const waits: unknown[] = [];
    let polls = 0;
    await waitUntilLive(async () => ++polls === 3, { ...clock, onWait: (w: unknown) => waits.push(w) });

    expect(waits).toEqual([
      { attempt: 1, waitMs: 5000, elapsedMs: 0 },
      { attempt: 2, waitMs: 10_000, elapsedMs: 5000 },
    ]);
  });
});

describe("isLive", () => {
  const respond = (status: number, body: unknown) => async () =>
    new Response(JSON.stringify(body), { status });

  it("is live only when the served document contains the exact version", async () => {
    const doc = { versions: { "1.2.3": { version: "1.2.3" } } };

    expect(await isLive("@scope/pkg", "1.2.3", { fetchImpl: respond(200, doc) })).toBe(true);
    expect(await isLive("@scope/pkg", "1.2.4", { fetchImpl: respond(200, doc) })).toBe(false);
  });

  it("is not live on a 404, a server error or a network failure", async () => {
    expect(await isLive("pkg", "1.0.0", { fetchImpl: respond(404, { error: "Not found" }) })).toBe(false);
    expect(await isLive("pkg", "1.0.0", { fetchImpl: respond(503, {}) })).toBe(false);
    const failing = async () => {
      throw new Error("ECONNRESET");
    };
    expect(await isLive("pkg", "1.0.0", { fetchImpl: failing })).toBe(false);
  });

  it("asks for a fresh, uniquely keyed copy of the scoped package document", async () => {
    const urls: string[] = [];
    const headers: unknown[] = [];
    const fetchImpl = async (url: string, init: { headers: unknown }) => {
      urls.push(url);
      headers.push(init.headers);
      return new Response("{}", { status: 200 });
    };
    await isLive("@scope/pkg", "1.0.0", { fetchImpl });
    await isLive("@scope/pkg", "1.0.0", { fetchImpl });

    expect(urls[0]).toMatch(/^https:\/\/registry\.npmjs\.org\/@scope%2Fpkg\?cachebust=/);
    expect(urls[0]).not.toEqual(urls[1]);
    expect(headers[0]).toMatchObject({ "cache-control": "no-cache" });
  });
});
