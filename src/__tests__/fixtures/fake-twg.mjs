#!/usr/bin/env node
// Stand-in for the real twg binary, used only by the test suite so it never
// depends on twg being installed or authenticated.
const argv = process.argv.slice(2);
process.stderr.write(`ARGV:${JSON.stringify(argv)}\n`);

function hasOutput(target) {
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if ((token === "--output" || token === "-o") && argv[i + 1] === target) return true;
    if (token === `--output=${target}`) return true;
  }
  return false;
}

if (argv.includes("--fail")) {
  process.stderr.write("boom: something went wrong\n");
  process.exit(3);
}

if (argv.includes("--emit-invalid-json")) {
  process.stdout.write("not actually json\n");
  process.exit(1);
}

if (argv.includes("--output-summary") || argv.some((a) => a.startsWith("--output-summary="))) {
  process.stdout.write("summary: /tmp/payload.json\nstats:\n  count: 2\n");
  process.exit(0);
}

if (hasOutput("json")) {
  process.stdout.write(
    JSON.stringify({
      ok: true,
      items: [
        { id: 1, name: "a" },
        { id: 2, name: "b" },
      ],
    }),
  );
  process.exit(0);
}

if (hasOutput("jsonl")) {
  process.stdout.write(`${JSON.stringify({ id: 1, name: "a" })}\n`);
  process.stdout.write(`${JSON.stringify({ id: 2, name: "b" })}\n`);
  process.exit(0);
}

process.stdout.write("plain text output\nline two\n");
process.exit(0);
