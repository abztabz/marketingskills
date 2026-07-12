# Master SEO tool — verification

The repository has no automated test framework, so this tool ships with a
self-contained browser verification script instead: [`verify.mjs`](verify.mjs).

## Continuous integration

The suite is enforced by GitHub Actions:
[`.github/workflows/master-seo-verify.yml`](../../.github/workflows/master-seo-verify.yml)
("Master SEO Verification").

**When it runs:** on pull requests targeting `main` and pushes to `main` that
touch `tools/master-seo/**` or the workflow file itself, plus manual runs via
*workflow_dispatch* from the Actions tab.

**What it does:** on `ubuntu-latest` with Node 20, it installs a pinned
Playwright (`npm install --no-save playwright@1.56.1` — workflow-scoped; the
repository deliberately has no package.json and this doesn't add one), installs
Chromium with system dependencies (`npx playwright install --with-deps
chromium`), then runs exactly the same command you run locally:

```bash
node tools/master-seo/verify.mjs
```

**Interpreting failures:** the job fails (non-zero exit) if any check fails.
The log lists every check as `ok` / `FAIL` with a detail snippet, ends with the
`N passed, M failed` summary, and repeats the failed check names at the bottom
— read those lines first; a Playwright/browser launch error instead means the
environment step broke, not the tool. The job also has a 15-minute timeout so
a hung browser cannot run forever.

**Script vs. enforcement:** `verify.mjs` is the verification (runnable anywhere,
committed with the tool); the workflow is only the enforcement wrapper that runs
it automatically. Keep new checks in the script, not the workflow. Note this is
CI feedback only — merging is not blocked unless branch protection is configured
for the repository, which this file does not assume.

## How to run

```bash
node tools/master-seo/verify.mjs
```

Requires Node 18+ and Playwright with a Chromium build. If Playwright is not
installed locally, point the script at an existing install:

```bash
PLAYWRIGHT_MODULE=/path/to/node_modules/playwright \
CHROMIUM_PATH=/path/to/chromium \
node tools/master-seo/verify.mjs
```

The script opens `index.html` from disk (no server needed), clears
`localStorage`, and exercises the tool end-to-end. It exits non-zero on any
failure.

## What it covers

| # | Check |
|---|---|
| 1 | Documented finding carries real source metadata (badge links to the Google doc; report prints the URL) |
| 2 | Heuristic finding labelled Heuristic (title-length rule) |
| 3 | Page-observed finding from pasted page HTML |
| 4 | User-provided-content finding (text analysis on typed body) |
| 5 | Self-reported finding (unchecked box, no page) |
| 6 | Not-verified finding (Core Web Vitals — tool cannot measure) |
| 7 | Static fetch vs rendered distinction (`page-observed (static)` label; static-only caps confidence at Medium) |
| 8 | Overall confidence with mixed evidence shows level **and** the "Why:" explanation |
| 9 | False-positive YMYL keyword (benign "credit" trips the heuristic; gate admits fallibility) |
| 10 | Manual override both directions (mark not-high-stakes on a match → gate hides, dissent preserved; mark high-stakes on a benign page → gate + advisory) |
| 11 | All five review decisions occur: retain, soften, escalate (noindex), reject (near-boundary title), needs-verification (CWV) |
| 12 | Learning notebook add |
| 13 | Persistence across reload |
| 14 | Export → clear → import round-trip (schema-versioned JSON) |
| 15 | Clear-all (with confirm dialog) |
| 16 | Markdown report contains provenance (tier, source type, verification, observed value, review decision, evidence URL), high-stakes status/override, disclaimers |
| 17/18 | Light and dark themes render differently |
| 19 | Zero console/page errors across the whole run |
| 20 | Write flow regression (full draft still generates) |

## Recorded run

2026-07-12, Linux, Chromium via Playwright 1.56:

```
==== 38 passed, 0 failed ====
```

## Known limitations (by design, stated in the UI)

- The tool never observes a **rendered** page; static fetch/paste findings are
  labelled `page-observed (static)` and capped at Medium confidence.
- Core Web Vitals, site-wide duplication, and first-hand experience are never
  verifiable here — they surface as `not-verified` → needs-verification.
- YMYL detection is a keyword heuristic with documented false positives/negatives;
  the manual override exists for exactly that reason.
- The learning notebook is browser-local only — it is not durable organizational
  memory, and says so.
