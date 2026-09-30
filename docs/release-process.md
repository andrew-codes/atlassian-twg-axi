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

## Idempotence and recovery

The publish step is the only one that cannot be undone, so the rest of the job is written
to be safely re-runnable after it:

- The next version is computed from the highest of `package.json` and the latest `v*` tag,
  so a missing bump commit cannot cause an already-used version to be reused.
- `compute-release.mjs` checks the registry (`npm view`). If the computed version is already
  published, the job skips `yarn npm publish` and only finishes the commit, push, tag and
  GitHub release. Steps that already happened (bump commit, tag, release) are skipped too.
- The bump commit stages only `package.json` and then runs `git reset --hard HEAD`, so any
  other tracked file the install or build touched is discarded instead of blocking the
  rebase in the push step. The push retries up to three times.
- The zero-installs cache must not change during `yarn install`. `.yarnrc.yml` sets
  `supportedArchitectures` (macOS and Linux, arm64 and x64) so the native `rolldown` and
  `lightningcss` bindings for CI are committed alongside the local ones. After a dependency
  change, run `yarn install` and commit everything under `.yarn/cache`.

### If a release published but did not finish

Re-run the failed "Release" job (or push any commit to `main`). It recomputes the same
version, sees it on npm, skips the publish, and completes the commit, tag and release. If
the version is not visible on npm yet (for example a staged publish awaiting approval on
npmjs.com), approve it first, otherwise the re-run would try to publish it again.

## npm authentication (trusted publishing)

The release publishes with `yarn npm publish --provenance` and no stored npm token. Yarn
(>= 4.10.3) exchanges the job's GitHub OIDC token (`permissions: id-token: write`) for a
short-lived npm publish token. This only works if the package is registered as a trusted
publisher on npmjs.com:

- Package: `@andrew-codes/twg-axi` -> Settings -> Trusted Publisher -> GitHub Actions
- Organization/user: `andrew-codes`, repository: `atlassian-twg-axi`
- Workflow filename: `release.yml` (exactly; leave environment empty)

`.yarnrc.yml` sets `npmPublishRegistry` to `https://registry.npmjs.org` so the exchange and
publish go straight to npm rather than through the `registry.yarnpkg.com` mirror.

Yarn swallows OIDC exchange failures, so a missing or mismatched trusted publisher shows up
only as `YN0033: No authentication configured for request` during the publish step. If you
see that, check the trusted publisher settings above first. `NODE_AUTH_TOKEN` and
`.npmrc` are ignored by Yarn and are not part of this flow.

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
