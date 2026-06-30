---
name: social-engagement
description: "Find relevant questions on Reddit and Quora and draft genuinely helpful, brand-voice answers for human review before posting — a compliant, human-in-the-loop outreach pipeline, NOT an auto-poster. Use when the user wants to do Reddit marketing, answer Quora questions, run organic social outreach, find threads to reply to, generate on-brand replies for review, or build inbound leads from communities without getting flagged as spam. Trigger phrases: \"post on Reddit,\" \"Reddit marketing,\" \"answer Quora questions,\" \"reply to threads,\" \"social outreach agent,\" \"find threads to comment on,\" \"organic engagement,\" \"draft Reddit answers.\" For building and owning your own community (Discord/Slack/subreddit), use community-marketing instead."
license: MIT
metadata:
  author: Corey Haines
  version: 1.1.0
---

# Social Engagement

You help the user show up as a genuinely helpful expert in public Q&A spaces (Reddit, Quora) to earn trust and inbound interest — **without spamming**. The deliverable is a stream of high-quality, human-reviewed answers, not volume.

This skill ships a working CLI, **SocialScout**, in `scripts/socialscout.mjs`. It runs the pipeline: `find → draft → review → publish`. **It never auto-posts** — a human must approve each draft and pass `--live` before anything is sent.

## The one rule that matters

Automated self-promotion is how accounts get banned. Reddit's content policy and most subreddit rules treat it as spam; Quora forbids automation in its ToS and has **no posting API**. So the winning strategy is the opposite of a spam bot:

> **Answer the question better than anyone else would, and mention the brand only when it's truly relevant.** Value first. The lead is a side effect of being helpful.

A health, finance, legal, or any trust-sensitive brand getting flagged as a spammer is worse than not posting at all. Optimize for reputation, not reach.

## Before you start

Read product context if present (`.agents/product-marketing.md` or `.claude/product-marketing.md`). Then confirm:

1. **Brand & expertise** — what the brand genuinely knows enough about to be useful.
2. **Voice** — how replies should sound (default: plain, warm, no marketing speak).
3. **Targets** — relevant subreddits and keywords. Be honest about which subreddits ban self-promotion (skip them).
4. **Automation level** — default and recommended: drafts + human approval. Full auto-posting (Reddit API only) is higher risk; Quora is always manual.

Persist these into `scripts/config.json` (copy `scripts/config.example.json`). The CLI reads `config.json` if present, otherwise `config.example.json`.

## How the pipeline works

```bash
cd scripts
node socialscout.mjs find --mock                      # demo with bundled fixtures (no credentials)
node socialscout.mjs find                             # live Reddit (public JSON; no creds needed)
node socialscout.mjs find --platform quora --urls "https://www.quora.com/<question>"
node socialscout.mjs draft                            # AI drafts (ANTHROPIC_API_KEY) or template fallback
node socialscout.mjs review --list
node socialscout.mjs review --approve <id> [--edit "your edited text"]
node socialscout.mjs review --reject  <id>
node socialscout.mjs publish --dry-run                # shows exactly what WOULD post
node socialscout.mjs publish --live                   # posts approved Reddit replies, 5s apart
node socialscout.mjs serve                            # browser review app at http://127.0.0.1:7821
```

Queue states: `new → pending → approved | rejected → posted`. State lives in `scripts/queue.json`.

### Web review app (`serve`)
`node socialscout.mjs serve` starts a tiny local server (127.0.0.1 only, zero dependencies) at `http://127.0.0.1:7821`. The dashboard runs the whole loop in the browser: **Find / Find Quora / Draft pending** buttons, per-card **Approve / Reject** with inline draft editing, and a **Publish** bar (dry-run or live). It drives the same queue as the CLI. The UI is mobile-first, so it works on a phone too. Nothing posts without clicking **Publish approved** and confirming. Best surface for a non-technical reviewer.

### Use it on iOS / host it
Two options:
- **No deploy:** open `scripts/socialscout-mobile.html` in Safari — self-contained demo (inline data, on-device storage), good for trying the UX.
- **Live data:** host `scripts/server.mjs` (Render/Railway; `render.yaml`, `package.json`, `Procfile` included). When `PORT` is set the server binds `0.0.0.0` and **requires `SOCIALSCOUT_TOKEN`** (it refuses to expose the publish endpoint unauthenticated). The dashboard prompts for the token once and stores it on-device. Set brand/targets without committing via the `SOCIALSCOUT_CONFIG_JSON` env var. Full walkthrough in `references/deploy.md`.

### Scoring (opportunity quality)
The finder scores each thread on keyword match (×2 each), question signals, low existing-answer count, and freshness. Threads below `rules.minOpportunityScore` are dropped, so off-topic noise never reaches the draft step.

### Subreddit self-promo guard
Before drafting, each Reddit opportunity is checked against subreddits that ban self-promotion: first your `rules.noPromoSubreddits` list, then (when online) the subreddit's own `about/rules.json`, scanned for no-promo language and cached in `.subreddit-policy.json`. Behavior is set by `rules.noPromoMode`:
- `"no-brand"` (default) — still draft a genuinely helpful answer, but with **zero brand mention or link**.
- `"skip"` — drop the opportunity entirely.

This keeps you from ever pitching in a subreddit that forbids it.

### Quora (discovery only)
Quora has no posting API, so SocialScout never posts there. `find --platform quora --mock` uses fixtures; `find --platform quora --urls "u1,u2"` fetches public Quora question pages you paste and reads their titles for drafting. Approved Quora drafts export to `quora-drafts.md` for manual pasting.

### Drafting (the system prompt does the compliance work)
With `ANTHROPIC_API_KEY` set, drafts come from Claude with hard rules baked in: answer the question first, disclose affiliation when the brand is named, no link unless the thread asks, brand mention only when relevant, word cap. Without a key, a safe template is used so the pipeline still runs.

### Publishing
- **Reddit** — `publish --live` uses the official API (OAuth) with 5-second spacing. Requires `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USERNAME`, `REDDIT_PASSWORD` (create a "script" app at reddit.com/prefs/apps).
- **Quora** — exported to `quora-drafts.md` for manual pasting. Never automated.

## Writing answers that don't read as spam

- Lead with the most useful, specific thing you know. Assume the reader will never click anything.
- One human voice. No headers, no bullet dumps, no "Great question!"
- Disclose: "I work with <brand>, sharing because it's relevant, not to pitch."
- Link only when asked for resources, and only where the subreddit allows it.
- Never invent prices, stats, or guarantees.
- Match each subreddit's rules; if a sub bans self-promotion, answer with zero brand mention or skip it.

See `references/compliance.md` for the full platform-by-platform rules, account-warming guidance, and rate limits.

## Related skills
- **community-marketing** — building and owning your own community (the inverse of this skill).
- **cold-email**, **content-strategy** — other top-of-funnel channels.
