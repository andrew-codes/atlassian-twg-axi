# Release process

`@andrew-codes/twg-axi` publishes to npm automatically. There is no manual version bump
and no manual `npm publish`.

## How a release happens

Every push to `main` (i.e. every merged PR) runs `.github/workflows/release.yml`:

1. Check out the repo with full history and tags.
2. Install with Yarn PnP (`yarn install --immutable`) and run the full verification suite
   (typecheck, tests, lint if present). If any step fails, the workflow stops here - nothing
   is published, versioned, or tagged.
3. Walk the commits since the last version tag and compute the next semantic version from
   their messages (see below).
4. Bump `package.json` to that version, build, and publish the package to npm under the
   `@andrew-codes` scope.
5. Only if publishing succeeds: commit the version bump back to `main` (with a `[skip ci]`
   marker so it doesn't retrigger the workflow) and create + push a git tag for the new
   version, then create a GitHub release for that tag.

## How the version is computed

The workflow uses [Conventional Commits](https://www.conventionalcommits.org/) prefixes on
commit messages to decide the bump type:

| Commit message pattern                                  | Bump  |
| --------------------------------------------------------- | ----- |
| `fix: ...`                                                 | patch |
| `feat: ...`                                                | minor |
| Any commit with a `BREAKING CHANGE:` footer, or `!` after the type/scope (e.g. `feat!:`) | major |
| No commits since the last tag match a recognized prefix   | patch |

Only commits since the most recent version tag are considered. If several commits qualify
for different bump levels, the highest one wins (major > minor > patch).

To land a release at the bump level you want, write your commit messages accordingly:

```
fix: correct exit code passthrough on SIGTERM
feat: support --output jsonl passthrough
feat!: drop Node 16 support

BREAKING CHANGE: minimum supported Node.js version is now 18
```

Commits that don't follow this convention (e.g. `chore:`, `docs:`, or unprefixed messages)
don't influence the bump; if a release contains only such commits, it still ships as a patch.

## Local development under Yarn PnP / zero-installs

This project uses Yarn Plug'n'Play with zero-installs: `.pnp.cjs`, `.yarn/cache`, and
`.yarn/releases` are committed to the repo, so `yarn install` after a fresh clone does not
hit the network for anything already in the cache and does not create a `node_modules`
directory.

Practical implications:

- Don't `rm -rf node_modules` to "reset" things - there isn't one. If something seems stale,
  `yarn install` again.
- Adding or upgrading a dependency (`yarn add`, `yarn up`) updates `.pnp.cjs`,
  `yarn.lock`, and `.yarn/cache` together; commit all three.
- Editors need the Yarn PnP SDK/IDE integration to resolve TypeScript correctly (see
  [`CONTRIBUTING.md`](../CONTRIBUTING.md) for setup).
- Tools that read `node_modules` directly instead of through Node's module resolution (some
  native binaries, some editor plugins) may need a package marked
  `dependenciesMeta.<name>.unplugged: true` in `package.json` to force it to be extracted to
  a real folder under `.yarn/unplugged` instead of read from the zip cache.
