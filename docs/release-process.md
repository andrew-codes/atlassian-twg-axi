# Release process

`@andrew-codes/twg-axi` publishes to npm automatically. There is no manual version bump
and no manual `npm publish`.

## How a release happens

Every push to `main` (i.e. every merged PR) runs `.github/workflows/release.yml`:

1. Check out the repo with full history and tags.
2. Install with Yarn PnP (`yarn install --immutable`) and run the full verification suite
   (typecheck, tests, lint if present). If any step fails, the workflow stops here - nothing
   is published, versioned, or tagged.
3. Compute the next semantic version (`scripts/release/compute-release.mjs`). The base is the
   highest version that npm serves or a `v*` git tag records; the bump comes from the commit
   messages since the last tag (see below).
4. Set that version on `package.json` inside the job only, build, and publish to npm under the
   `@andrew-codes` scope (`scripts/release/publish.mjs`).
5. Once the version is confirmed live on npm: create and push the `v<version>` git tag and
   create the GitHub release for it.

The release never commits to `main`. `package.json` in the repo holds a placeholder version
(`0.0.0-development`); the version that ships exists only in the job's working copy and in the
published package. The source of truth for "what is the current version" is npm plus the tags.

## Idempotence and recovery

The publish step is the only one that cannot be undone, so the rest of the job is written
to be safely re-runnable after it:

- `publish.mjs` skips `yarn npm publish` when the version is already live, and only exits 0
  once npm serves the version, so the tag and release steps never run for an unpublished one.
- A rerun of a run that published but did not finish would normally compute the *next*
  version. It doesn't: yarn records the commit a version was published from as `gitHead`, and
  `compute-release.mjs` reuses the highest npm version when its `gitHead` is the commit being
  released. The publish is then skipped and only the tag and release are finished.
- The tag and release steps each check whether their target already exists and skip if so.
- Re-run the failed job for the *latest* failed run (or push to `main`). Re-running an older
  run after a newer release has shipped would compute a version from the old commit.
- The zero-installs cache must not change during `yarn install`. `.yarnrc.yml` sets
  `supportedArchitectures` (macOS and Linux, arm64 and x64) so the native `rolldown` and
  `lightningcss` bindings for CI are committed alongside the local ones. After a dependency
  change, run `yarn install` and commit everything under `.yarn/cache`.

### A leftover staged version

npm's [staged publishing](https://docs.npmjs.com/staged-publishing/) holds an upload hidden
until a maintainer approves it with 2FA. Staging is off for this package's trusted publisher,
so publishes go live in the same run. A version staged while it was on (0.2.0 at the time of
writing) is not visible to `npm view`, but it still blocks that version: publishing it again
fails with `409 Cannot publish over previously staged version`, which yarn reports as
`YN0035`. The publish step turns that into an error that says so. To clear it, either:

- **Approve it**: on npmjs.com open the package -> **Staged Packages** -> **Approve**, or run
  `npm stage list @andrew-codes/twg-axi` and `npm stage approve <stage-id>` (npm >= 11.15,
  2FA). The next run (or a re-run of the failed job) then sees the version live and finishes
  the tag and release. The tag lands on the commit that run started from, which can be newer
  than the one the staged tarball was built from.
- **Reject it**: `npm stage reject <stage-id>` (2FA). The next run publishes that version
  fresh.

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
