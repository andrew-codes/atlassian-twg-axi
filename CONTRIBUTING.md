# Contributing

## Setup

This project uses [Yarn](https://yarnpkg.com/) with Plug'n'Play and zero-installs.
`.pnp.cjs`, `.yarn/cache`, and `.yarn/releases` are committed, so a fresh clone doesn't need
`node_modules` or a network fetch for anything already cached:

```sh
git clone git@github.com:andrew-codes/atlassian-twg-axi.git
cd atlassian-twg-axi
yarn install
```

If your editor needs TypeScript IDE support to resolve PnP-managed packages, generate the
editor SDKs with:

```sh
yarn dlx @yarnpkg/sdks vscode   # or: base, vim, ...
```

## Development

```sh
yarn build       # compile TypeScript to dist/
yarn test        # build, then run the test suite
yarn typecheck
```

Tests spawn the compiled CLI against a fixture binary (`src/__tests__/fixtures/fake-twg.mjs`)
so the suite doesn't depend on `twg` being installed or authenticated. It covers
command/flag pass-through, JSON-to-TOON conversion correctness (json and jsonl), and
non-JSON passthrough.

## Commit messages

Releases are cut automatically from commits on `main` using
[Conventional Commits](https://www.conventionalcommits.org/) prefixes (`fix:`, `feat:`,
`feat!:`/`BREAKING CHANGE:`, etc.) to determine the version bump. See
[`docs/release-process.md`](docs/release-process.md) for the full mapping and how to write
commits that land the release you intend.

## Pull requests

Every pull request against `main` runs `.github/workflows/pr-verify.yml`, which installs
with Yarn PnP and runs typecheck, tests, and lint (if a `lint` script exists). All checks
must pass before merging.
