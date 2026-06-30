---
name: social-engagement
description: "Find relevant questions on Reddit and Quora and draft genuinely helpful, brand-voice answers for human review before posting — a compliant, human-in-the-loop outreach pipeline, NOT an auto-poster. Use when the user wants to do Reddit marketing, answer Quora questions, run organic social outreach, find threads to reply to, generate on-brand replies for review, or build inbound leads from communities without getting flagged as spam. Trigger phrases: \"post on Reddit,\" \"Reddit marketing,\" \"answer Quora questions,\" \"reply to threads,\" \"social outreach agent,\" \"find threads to comment on,\" \"organic engagement,\" \"draft Reddit answers.\" For building and owning your own community (Discord/Slack/subreddit), use community-marketing instead."
license: MIT
metadata:
  author: Corey Haines
  version: 1.0.0
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
node socialscout.mjs find --mock     # demo with bundled fixtures (no credentials)
node socialscout.mjs find            # live Reddit (public JSON; no creds needed)
node socialscout.mjs draft           # AI drafts (ANTHROPIC_API_KEY) or template fallback
node socialscout.mjs review --list
node socialscout.mjs review --approve <id> [--edit "your edited text"]
node socialscout.mjs review --reject  <id>
node socialscout.mjs publish --dry-run   # shows exactly what WOULD post
node socialscout.mjs publish --live      # posts approved Reddit replies, 5s apart
```

Queue states: `new → pending → approved | rejected → posted`. State lives in `scripts/queue.json`.

### Scoring (opportunity quality)
The finder scores each thread on keyword match (×2 each), question signals, low existing-answer count, and freshness. Threads below `rules.minOpportunityScore` are dropped, so off-topic noise never reaches the draft step.

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
