# Article repository: proposed changes

**Status:** proposed, waiting for the owner's approval. Nothing here has been applied to
`1sixtech/1six-researchs` or to Vercel.

The sync now refuses bad folders, unknown file types, oversized assets, and partial listings. It
still runs only during the production build, so a mistake is found after it merges and the author
hears nothing. Three changes close that gap:

| # | Change | Where | What it fixes |
|---|--------|-------|---------------|
| 1 | Required pull-request check | Article repository | A malformed article is stopped before merge |
| 2 | Publish job waits for the build | Article repository | A failed build no longer looks like a success |
| 3 | Read-only GitHub token | Vercel environment | Production builds stop sharing the anonymous 60-an-hour limit |

Apply them in this order:

1. Merge the website pull request that adds the sync checks.
2. Open a pull request in the article repository adding `validate.yml` and `.gitignore`, and replacing
   `publish.yml`.
3. After `Validate articles` passes once on that pull request, make it required on `main`.
4. Set the token in Vercel. This can happen at any point.

Do steps 1 and 2 together. Until step 2 lands, a stray file in a published folder fails the website
build and only the Vercel dashboard shows it.

## 1. Required check: `Validate articles`

The check builds the website's `main` with the pull request's articles. It is the production build
itself, so the rules cannot drift apart: folder names, allowed files, size limits, dates, categories,
figure paths, and the HTML safety check are all the ones the site enforces.

Add `.github/workflows/validate.yml`:

```yaml
name: Validate articles

# Builds the website against this pull request, so an article the site would
# refuse fails here instead of in the production build.
#
# No "paths:" filter: GitHub leaves a required check Pending when its workflow
# is skipped, and that blocks the merge.
on:
  pull_request:

permissions:
  contents: read

jobs:
  validate:
    name: Validate articles
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          repository: 1sixtech/1six-website
          ref: main
          persist-credentials: false
      - uses: pnpm/action-setup@73e46992e05b19abd31f2f3c20e0e7370d762115 # v6.1.1
        with:
          version: 10.12.3
      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Build the website from this pull request's articles
        env:
          # The merge of this pull request into main, which is what production will build.
          WRITING_GIT_REF: ${{ github.sha }}
          WRITING_GITHUB_TOKEN: ${{ github.token }}
        run: pnpm build
```

To make it required: **Settings > Branches > `main` > Require status checks to pass before merging**,
then add `Validate articles`. GitHub offers a check here only after it has passed in the repository
within the past seven days, so it needs one passing run first.

What to expect:

- **Failures say what to fix.** For example: `002-arbitrage-in-reality-cross-venue needs a date like
  2026-11-08, found "2026-11-8 (draft)"`.
- **It must stay on `pull_request`, with no secrets and no write permission.** A pull request can
  change what this workflow runs, even from a fork. It is safe because `pull_request` gives forks no
  secrets and a read-only token. Never move it to `pull_request_target`.
- **It catches mistakes; it is not access control.** That same edit can make the check pass, and
  `main` still requires no approval, with admin bypass. The owner accepted that on 2026-11-09.
- **A broken website `main` turns article pull requests red.** The production deploy would fail the
  same way, so this is an accurate signal.
- **It checks the merge as of the last push.** A re-run uses the same merge commit, so to include
  later article merges, update the pull request's branch. If article pull requests start to overlap,
  also turn on **Require branches to be up to date before merging**.
- **It catches a figure path with a typo.** An image that is not a file in the article's folder, or under
  the website's `public/`, fails the check, and so does an `http(s)` image, even one on 1six.tech: an article
  image must be a file the site holds. Names must match exactly, including case. Only a difference in how
  Unicode composes a name, which cannot be seen (as when a Korean name is copied from Finder), is accepted.

Add `.gitignore` too, because one stray file in a published folder stops every website build:

```gitignore
.DS_Store
Thumbs.db
```

If a bad article is already on `main` and a website fix cannot wait, set `WRITING_GIT_REF` in Vercel to
the last good article commit and deploy. Once the article is fixed, remove the variable and redeploy,
because removing it does not start a build. While it is set, new articles do not publish, yet the
publish job still reports a finished build.

## 2. Publish job waits for the build

Vercel records each deployment's result on the public website repository's GitHub deployments. The
job can read that without a new secret. Replace `.github/workflows/publish.yml`:

```yaml
name: Publish articles

# The 1six.tech build downloads its articles from this repository, so a change
# to an article folder needs a new build. A Vercel Deploy Hook starts one, and
# this job then waits for the result, because the hook only answers "queued".
on:
  push:
    branches: [main]
    paths:
      - '[0-9][0-9][0-9]-*/**'
  workflow_dispatch:

permissions: {}

# One run at a time, so each run reads the build its own hook started.
concurrency:
  group: publish-articles

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 16
    permissions:
      issues: write
    steps:
      - name: Trigger the website deployment
        env:
          DEPLOY_HOOK_URL: ${{ secrets.VERCEL_DEPLOY_HOOK_URL }}
        run: |
          echo "HOOK_STARTED=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$GITHUB_ENV"
          curl --fail-with-body --silent --show-error --max-time 30 --retry 3 --retry-max-time 120 --retry-all-errors --request POST "$DEPLOY_HOOK_URL"

      - name: Wait for the website build
        timeout-minutes: 13
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          site=repos/1sixtech/1six-website
          # The hook has just fired and builds website main as of now, so hold that commit for the whole wait.
          for attempt in 1 2 3; do
            sha=$(gh api "$site/commits/main" --jq .sha) && break
            sleep 5
          done
          [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo "::error::Could not read the website commit."; exit 1; }
          deadline=$((SECONDS + 720))
          while [ "$SECONDS" -lt "$deadline" ]; do
            sleep 20
            deployment=$(gh api "$site/deployments?sha=$sha&environment=Production&per_page=1" --jq '.[0].id // empty') || continue
            [ -n "$deployment" ] || continue
            result=$(gh api "$site/deployments/$deployment/statuses?per_page=1" \
              --jq ".[0] | select(.created_at >= \"$HOOK_STARTED\") | \"\(.state) \(.description)\"") || continue
            case "$result" in
              success*) echo "The website build finished."; exit 0 ;;
              failure*|error*) echo "::error::The website build failed: ${result#* }"; exit 1 ;;
            esac
          done
          echo "::error::No website build result after 12 minutes. Check the Vercel dashboard."
          exit 1

      - name: Tell whoever published this
        if: failure()
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          title="Articles at ${GITHUB_SHA::7} may not have reached 1six.tech"
          body="The publish job could not confirm a successful website build, so the site may still show the last good build. Details: $GITHUB_SERVER_URL/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID"
          gh issue create --repo "$GITHUB_REPOSITORY" --title "$title" --body "$body" --assignee "$GITHUB_ACTOR" \
            || gh issue create --repo "$GITHUB_REPOSITORY" --title "$title" --body "$body"
```

The issue is there because a red job alone is not a reliable alert: GitHub tells someone about a
failed run only if they have turned on Actions notifications and watch the repository. The issue is
assigned to whoever merged, reaches them without that setting, and leaves a record. If that account
cannot be assigned, the issue is opened unassigned.

## 3. Read-only GitHub token

Without a token, a build makes two API calls from an address it shares with other Vercel builds, and
downloads files from `raw.githubusercontent.com`. Retries now cover short limits, but an hourly limit
that is already spent still fails the build.

1. Create a fine-grained personal access token with **Public repositories** read-only access and no
   other permissions.
2. Add it in Vercel as `WRITING_GITHUB_TOKEN` for **Production only**. Preview builds run branch code,
   which could read the token and use up its quota, so they stay anonymous.

**An expired token fails every production build** with a 401 that names the variable, so set a renewal reminder
at the token's expiry. Removing the variable returns the build to anonymous access.

## What was verified

| Claim | Evidence |
|-------|----------|
| The check goes red on the original bad article | A real `next build` with `Date: 2026-11-8 (draft)` exited 1 and named the article |
| The check goes red on a figure path with a typo | A real `next build` with `assets/Fig3-who-first.svg` for `fig3-who-first.svg` exited 1 on macOS and named the article; 1six.tech answers 404 for that name |
| The check's commands work from nothing | `pnpm install --frozen-lockfile` and `pnpm build` at the head of article PR 2, from a clean copy on Node 22, took 10 seconds on a laptop with a warm pnpm store |
| The check can read a merge commit | Commit lookup, listing, contents API, and raw host all answered for a fork pull request's merge commit on `actions/checkout` |
| A token works for every request | A real authenticated sync used 14 API calls and matched the anonymous sync byte for byte |
| Hook-triggered builds are reported to GitHub | The 2026-11-09 09:20 UTC hook run added a `success` status at 09:21:13 |
| Failed builds are reported to GitHub | Two failed preview builds on 2026-11-08 show `failure` with a `vercel inspect` command |
| The wait logic takes the right branch | Ran against a stubbed `gh` for success, failure, error, stale status, no record yet, timeout, API failures, and website main moving during the wait, and its three API reads against real data |

Not verified, because it needs a run in the article repository:

- Neither workflow has run in GitHub Actions.
- A failed **production** build from a hook has not been seen. If Vercel wrote no status for one, the
  job would still go red when its 12 minutes ran out.
- The job's token reading the website repository's deployments. GitHub documents these reads as open
  for public resources, and `actions/setup-node` reads another organization's public repository with
  the same token. If that were wrong, the job would go red and open an issue on its first run.
- A cancelled build has never occurred on this project. If Vercel writes no status for one, the job
  goes red at 12 minutes.
- The wait cannot tell which article commit a build read. A website deploy of the same commit that
  finishes just after the hook fires could be reported in place of the hook's own build, as could a
  website merge landing in the instant between the hook and the job reading website `main`.
- Vercel's rollback documentation says new production builds do not go live until a rollback is
  undone. The job could then go green while the site serves the older deployment.

## Alternatives considered

- **Vercel `repository_dispatch` (`vercel.deployment.error`):** sent only to the website repository,
  so it would not reach article authors, and would add that repository's first workflow.
- **Polling the Vercel API from Actions:** needs a Vercel access token stored in a public
  repository's secrets. The GitHub record gives the same answer with no new secret.
- **Vercel webhook (`deployment.error`):** needs an endpoint to receive it.
- **A commit stamp the site publishes:** after a success status, the job would fetch the stamp once
  from the deployment and require this commit or a later one. That closes the two gaps above about
  which build was read. It needs a site change, and must stay at one request a run: about 100
  requests to `1six.tech` tripped Vercel's bot protection on 2026-11-09. It is the next step if those
  gaps turn out to matter.

Sources: [GitHub: secondary rate limits](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api),
[GitHub: required status checks](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks),
[GitHub: Actions notifications](https://docs.github.com/en/subscriptions-and-notifications/how-tos/managing-github-actions-notifications),
[GitHub: deployments API](https://docs.github.com/en/rest/deployments/deployments),
[Vercel: Deploy Hooks](https://vercel.com/docs/deploy-hooks),
[Vercel for GitHub](https://vercel.com/docs/git/vercel-for-github).
