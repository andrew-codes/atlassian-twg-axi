// Polls `check` until it returns true, backing off between polls, for at most `timeoutMs`.
// `sleep` and `now` are injectable so tests can run a 15 minute window on a fake clock.
export async function waitUntilLive(
  check,
  {
    timeoutMs = 15 * 60 * 1000,
    initialDelayMs = 5000,
    maxDelayMs = 60_000,
    factor = 2,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now = Date.now,
    onWait = () => {},
  } = {},
) {
  const start = now();
  let delayMs = initialDelayMs;
  for (let attempt = 1; ; attempt++) {
    if (await check()) return { live: true, attempts: attempt, waitedMs: now() - start };
    const remaining = timeoutMs - (now() - start);
    if (remaining <= 0) return { live: false, attempts: attempt, waitedMs: now() - start };
    const wait = Math.min(delayMs, remaining);
    onWait({ attempt, waitMs: wait, elapsedMs: now() - start });
    await sleep(wait);
    delayMs = Math.min(delayMs * factor, maxDelayMs);
  }
}
