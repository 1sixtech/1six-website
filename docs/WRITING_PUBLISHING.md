# Private writing and publication

The article source is `1sixtech/1six-researchs`. Its published articles and figures remain public on
1six.tech. Repository privacy protects access to the source, history, drafts and internal review;
it does not make the website private or retract copies that were already public.

The owner approved private operation without branch protection and with Preview access to the whole
article repository on 2026-11-16. The PR validation workflow is advisory, not a required merge gate.

## Authentication

The organization owns the `1six-writing-reader` GitHub App. Install it only on `1six-researchs`, with
**Contents: read** and no webhook. Vercel Production and Preview have these settings:

| Setting | Type | Purpose |
| --- | --- | --- |
| `WRITING_GITHUB_APP_ID` | Config | App ID |
| `WRITING_GITHUB_INSTALLATION_ID` | Config | Installation in 1sixtech |
| `WRITING_GITHUB_PRIVATE_KEY` | Secret | Signing key, never committed or printed |

`writingAuth.mjs` uses Octokit to mint an installation token for each build. The request restricts
the token again to the article repository ID and Contents: read, even if the app later gains access
elsewhere. The token lasts one hour; the sync has a ten-minute deadline. Authentication failures
omit the underlying SDK error because it can contain a signed JWT or key. Build logs must never
print environment values or entire authenticated request objects.

Authentication retries transient failures at most three times, with a fresh 30-second request timeout
and no individual retry wait longer than one minute. This bounded authentication stage precedes the
ten-minute content-sync deadline. Invalid credentials and permanent permission refusals fail promptly.

GitHub Actions in the article repository supplies its own `github.token` as `WRITING_GITHUB_TOKEN`,
with `contents: read`. Local developers can supply a fine-grained token for this repository with the
same permission. A supplied token takes precedence over App settings; there is no anonymous path.

For local work, put the token in `.env.local` following `.env.example`, then run:

```sh
pnpm install
node --env-file-if-exists=.env.local scripts/sync-writing.mjs
pnpm dev
```

`pnpm build` loads `.env.local` for the sync automatically. Vercel supplies build variables directly.
Production and Preview Secrets are not a source of local development credentials; use a developer's
own read-only token. Never use a `NEXT_PUBLIC_` name for any of these credentials.

To rotate the App key, generate a new key in the organization's GitHub App settings, replace the
Vercel Secret in both Production and Preview, verify new builds, then revoke the old key. Existing
deployments do not acquire changed environment settings: a new deployment is required. An App
uninstallation, lost repository access or invalid key stops new builds; removing credentials does
not restore anonymous access to a private repository.

## What publishes

`main` changes under a numbered article folder trigger `.github/workflows/publish.yml`. The
workflow calls the existing Vercel Deploy Hook, which rebuilds the website's `main`. A website-code
deployment also syncs articles. The sync resolves article `main` once, then reads every file at that
SHA. Concurrent article merges can therefore be included together in a later build.

The date line in each article's README controls its draft status. `Date: 2026-11-08 (draft)` excludes
the article and all its figures. The repository's top-level listing is not a publishing switch.
Every allowed image under a published article folder is copied to a public URL, including images
the article does not reference. Keep internal figures elsewhere. Non-image files such as CSV data
or Python scripts in a published article folder fail the build. Public reproducibility material
needs a separately reviewed public destination; Releases in the private repository remain private.

The sync writes `/writing-revision.json` only after all content and assets are saved. It contains the
full article commit SHA, has `Cache-Control: no-store`, and is excluded from search indexing. No
credential, draft text or private filename is included.

## Validation and result checking

The article repository's `Validate articles` workflow runs on pull requests without a path filter.
It checks out the public website's `main`, supplies the proposed article merge SHA, and runs the
actual production build. It also runs the publication monitor's tests. It uses `pull_request`,
read-only repository permissions and no stored App key. It is deliberately not required on `main`.

After the Deploy Hook, the publish job polls the revision on **https://1six.tech**, at most once every
30 seconds for 20 minutes. It succeeds only when that domain serves the requested SHA or a descendant
confirmed through GitHub. Immutable comparisons are cached. A queued build, build failure, old
deployment, active rollback, or older `WRITING_GIT_REF` pin cannot alone turn the job green.

On failure the workflow opens an issue in the article repository, assigned to the publisher where
possible, with a link to the Actions run. The full job has 25 minutes, including checkout, the hook
request and observation. Private Actions consumes the organization's included compute usage; check
its budget if jobs stop starting.

If an article breaks the build while a website fix must ship, set `WRITING_GIT_REF` in Vercel to a
known good article SHA and deploy. Newer article publishing jobs will correctly fail to confirm
their revision while the pin is in place. Remove the pin and deploy again after the article is fixed.

## Deployment verification

When changing authentication or repository visibility, verify all of these before declaring success:

1. The App installation can read only the intended repository; no write permission is granted.
2. Production and Preview builds authenticate after the repository is private.
3. The live revision matches the new article SHA (or its verified descendant).
4. Published articles and full-size figures load; drafts and their assets remain absent.
5. A real article-repository workflow run validates and confirms a deployment.
6. Invalid credentials fail without publishing a new revision or printing secrets. A stale live
   revision, a transient request failure, and an exhausted observation window are covered by tests.

Sources: [GitHub App tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app),
[Actions token scope](https://docs.github.com/en/actions/concepts/security/github_token),
[Vercel environment variables](https://vercel.com/docs/environment-variables),
[Deploy Hooks](https://vercel.com/docs/deploy-hooks).
