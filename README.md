# twg-axi

A drop-in wrapper for Atlassian's [`twg`](https://www.npmjs.com/package/twg) CLI that emits
[TOON](https://toonformat.dev) instead of JSON on stdout.

`twg-axi` mirrors `twg` exactly: every command, flag, and argument is forwarded to the real
`twg` binary unchanged. The only difference is output encoding. Any time `twg` would write raw
JSON to stdout (`--output json` or `--output jsonl`), `twg-axi` captures that JSON and re-emits
it as TOON, which is roughly 30-60% fewer tokens for an LLM to read than the equivalent JSON.
Everything else - plain text output, tables, `--output-summary`'s YAML envelope, errors, exit
codes, and stdin/stdout/stderr stream behavior - passes through from `twg` unaltered.

`twg-axi` does not implement any `twg` functionality itself. It is a thin subprocess wrapper
around the installed `twg` binary plus a JSON-to-TOON conversion step at the output boundary.

## Requirements

- Node.js >= 18
- The [`twg` CLI](https://www.npmjs.com/package/twg) installed and authenticated on your `PATH`

## Installation

```sh
npm install -g @andrew-codes/twg-axi
```

This installs a `twg-axi` executable alongside `twg`. It does not install or configure `twg`
itself - `twg-axi` requires `twg` to already be present and authenticated.

## Usage

Run `twg-axi` exactly as you would run `twg`, substituting the binary name:

```sh
twg-axi jira issue list --project ABC --output json
```

Any flag, subcommand, or argument accepted by `twg` is accepted identically by `twg-axi` and
forwarded through unchanged. See `twg --help` (or `twg-axi --help`, which is the same thing) for
the full command surface.

### JSON becomes TOON

```sh
$ twg jira issue list --project ABC --output json
{"items":[{"key":"ABC-1","summary":"Fix auth bug"},{"key":"ABC-2","summary":"Add pagination"}]}

$ twg-axi jira issue list --project ABC --output json
items[2]{key,summary}:
  ABC-1,Fix auth bug
  ABC-2,Add pagination
```

The same applies to `--output jsonl`, where each JSON record is converted to its own TOON block.

### Everything else passes through unchanged

Default text output, tables, `--output json --output-summary` (which emits a YAML envelope, not
raw JSON), error messages, and exit codes are all identical to running `twg` directly.

## How it works

`twg-axi` spawns `twg` as a subprocess with the exact argv it was given.

- When `--output`/`-o` is not `json` or `jsonl` (or `--output-summary` is set, which makes `twg`
  emit YAML instead of raw JSON), stdin/stdout/stderr are inherited directly from `twg` so
  behavior - including streaming and TTY detection - is identical to running `twg` on its own.
- When `--output json` or `--output jsonl` is requested without `--output-summary`, `twg-axi`
  captures `twg`'s stdout, parses it as JSON, and re-encodes it with
  [`@toon-format/toon`](https://www.npmjs.com/package/@toon-format/toon) before writing it to
  stdout. If the captured output isn't valid JSON (for example, `twg` exited before writing a
  payload), it is passed through unchanged rather than dropped.

Exit codes and signals (`SIGINT`, `SIGTERM`, `SIGHUP`) are forwarded to the underlying `twg`
process in both cases.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for local development setup (Yarn PnP /
zero-installs) and [`docs/release-process.md`](docs/release-process.md) for how releases are
cut and published.
