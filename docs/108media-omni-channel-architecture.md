# 108 Media — Omni-Channel Content Engine v2

An improved architecture for the 108media.ae AI campaign pipeline, redesigned
against three principles: **Search Before Building** (don't build what already
exists in this repo), **Boil the Ocean** (close the loop — deploy without
measurement is half a system), and **User Sovereignty** (AI generates, humans
approve; nothing client-facing publishes itself).

## What was wrong with v1

| # | v1 flaw | Why it fails | v2 fix |
|---|---------|--------------|--------|
| 1 | Fully automated deploy (Step 5) with no human gate | Publishing is irreversible and client-facing. An agent confident enough to pass its own critic is exactly the agent you want a human to check. | Human approval gate between production and deployment; staged rollout after it |
| 2 | Pipeline ends at "goes live" | No performance data ever flows back. The system can't learn which hooks, angles, or formats work. | Step 6: measurement loop feeding a campaign learnings log |
| 3 | Three bespoke "engines" | Reinvents what already exists: this repo ships 44 marketing skills and 51 zero-dependency CLIs. Custom engines = custom maintenance. | One agent runtime invoking existing skills (`ads`, `social`, `public-relations`, `copywriting`, ...) |
| 4 | Vector DB as the primary brand store | A brand guide is 5–20 pages. Modern models hold 200K–1M tokens of context. RAG for a style guide adds retrieval failure modes to solve a problem that no longer exists. | Versioned per-client context file loaded whole; vector DB demoted to asset/archive search only |
| 5 | Critic checks for "100% Cohesive" | 100% is not a metric, it's a vibe. And an unbounded regen loop can ping-pong forever. | Scored rubric with explicit thresholds, deterministic pre-checks, max 2 regen iterations then human escalation |
| 6 | Hardcoded to Claude 3.5 Sonnet | Outdated model, and one model for every job overpays on volume work and underpowers judgment work. | Model tiering: frontier model for strategy/critique, mid-tier for volume generation, small model for classification |
| 7 | No localization or compliance stage | UAE market means Arabic/English parity and UAE advertising content rules. A "cultural norms" checkbox inside the critic is not a stage. | Explicit localization + compliance pass with deterministic checks before human review |

## v2 Architecture

```
[ STEP 1: INTAKE & CLIENT MEMORY ]
  Client Brief ──► Per-client context repo (versioned markdown, git)
                   ├── brand-dna.md          (voice, positioning, visual identity)
                   ├── style-guide.md        (banned words, claims rules, AR/EN glossary)
                   ├── compliance.md         (UAE ad regulations, category-specific rules)
                   └── learnings.jsonl       (append-only: what worked, what didn't, why)
                   Vector DB retained ONLY for: past asset library, campaign archive search
                                    │
                                    ▼
[ STEP 2: STRATEGY — AI DRAFTS, STRATEGIST DECIDES ]
  Lead Strategist Agent (frontier model, e.g. Claude Opus tier)
  • Loads the WHOLE client context file (no retrieval lottery)
  • Reads learnings.jsonl — never re-litigates a settled brand decision
  • Deconstructs brief → omni-channel plan + channel briefs + success metrics
                                    │
                        ┌── HUMAN GATE #1 ──┐
                        │ Strategist reviews │   AI recommends. The human has
                        │ & approves plan    │   context the model lacks: client
                        └─────────┬─────────┘   relationships, timing, taste.
                                  ▼
[ STEP 3: GENERATION — SKILLS, NOT BESPOKE ENGINES ]
  One agent runtime (mid-tier model for volume, e.g. Sonnet tier)
  invoking existing marketingskills:
  ┌────────────────────┬──────────────────────┬───────────────────────┐
  │ Paid Media         │ Organic Social       │ PR & Editorial        │
  │ /ads /ad-creative  │ /social /video       │ /public-relations     │
  │ /copywriting       │ /content-strategy    │ /content-strategy     │
  │ /ab-testing (plan  │ /copywriting         │ /copywriting          │
  │  variants upfront) │                      │                       │
  └────────────────────┴──────────────────────┴───────────────────────┘
  Every asset generated in EN + AR from the shared glossary, not translated after
                                  │
                                  ▼
[ STEP 4: REVIEW — DETERMINISTIC FIRST, LLM SECOND, BOUNDED ]
  4a. Deterministic checks (code, not tokens — free and non-negotiable):
      banned-word scan, claim-substantiation flags, required disclaimers,
      char/dimension limits per platform, link + UTM validation
  4b. Critic Agent (frontier model): scored rubric, not "100% cohesive"
      • Narrative cohesion across paid/organic/PR   (1–10, threshold 8)
      • Brand voice match vs brand-dna.md           (1–10, threshold 8)
      • Cultural fit: UAE norms, AR copy quality    (1–10, threshold 9)
      Uses /copy-editing + /marketing-psychology as review lenses
  4c. Regen loop: findings → back to Step 3 with specific feedback
      MAX 2 ITERATIONS. Still failing → escalate to human with the
      critic's findings attached. Never loop silently.
                                  │
                                  ▼
[ STEP 5: ASSET PRODUCTION ]
  Image: SDXL / Flux API (brand LoRA or reference-image conditioning)
  Video: HeyGen avatars    Dynamic: Bannerbear templates
  Every rendered asset re-enters 4a (deterministic) for logo/dimension/text QA
                                  │
                        ┌── HUMAN GATE #2 ──┐
                        │ Account lead +     │   One dashboard: all assets,
                        │ client approval    │   critic scores, side-by-side
                        └─────────┬─────────┘   EN/AR. Approve / edit / reject.
                                  ▼
[ STEP 6: STAGED DEPLOYMENT — CANARY, NOT FIRE-AND-FORGET ]
  6a. Everything lands as DRAFTS first: Meta/Google ads paused, posts
      scheduled, HubSpot emails staged, CMS entries unpublished
  6b. Canary launch: 10–20% budget / one market segment for 24–48h
  6c. Auto-watch guardrail metrics (CTR floor, CPA ceiling, negative-
      sentiment spike) → alert + auto-pause on breach, never auto-scale
  6d. Human confirms scale-up to full budget
  APIs via existing CLIs + Composio: meta-ads, google-ads, tiktok-ads,
  linkedin-ads, buffer, HubSpot (Composio), mailchimp/resend, CMS webhook
                                  │
                                  ▼
[ STEP 6+: MEASUREMENT & LEARNING — THE LOOP THAT MAKES IT COMPOUND ]
  ga4 / meta-ads / google-ads / mixpanel CLIs pull performance on a schedule
  • Weekly auto-retro per campaign: which hooks/angles/formats won, by channel
  • Wins and losses appended to learnings.jsonl WITH rationale
  • Next campaign's Strategist Agent reads it at Step 2 — the system gets
    smarter per campaign instead of starting cold every time
```

## Design rationale, mapped to the philosophy

**Search Before Building.** v1 proposed three custom engines and a bespoke
critic. This repo already contains the generation layer (44 skills including
`ads`, `ad-creative`, `social`, `public-relations`, `copywriting`,
`copy-editing`, `ab-testing`, `marketing-psychology`, `analytics`), the
integration layer (51 zero-dep CLIs: `meta-ads.js`, `google-ads.js`, `ga4.js`,
`buffer.js`, `mailchimp.js`, ...), and Composio for OAuth-heavy platforms
(HubSpot, LinkedIn Ads). The build surface shrinks to: per-client context
files, the deterministic check scripts, the critic rubric, the approval
dashboard, and the canary watcher. That's weeks of work, not quarters.

**Boil the Ocean.** v1 stopped at "goes live" — a 90% system. The missing 10%
(measurement loop, localization stage, compliance checks, bounded regen,
render QA) is exactly the part that compounds: a pipeline that learns per
campaign versus one that starts cold forever. Completeness is cheap now; the
learning loop costs one scheduled job and an append-only file.

**User Sovereignty.** The generation-verification loop is the architecture's
spine, not an afterthought. Two human gates (plan approval, asset approval)
plus a human-confirmed scale-up. The AI never skips verification because it's
confident — a critic passing its own team's work is agreement between models,
which is signal, not proof. Auto-PAUSE is allowed (protective, reversible);
auto-SCALE and auto-PUBLISH are not (spending and reputation are the client's
call).

## Model tiering

| Role | Tier | Why |
|------|------|-----|
| Lead Strategist (Step 2) | Frontier (Opus-class) | Judgment-heavy, low volume, sets everything downstream |
| Generation (Step 3) | Mid (Sonnet-class) | High volume, well-briefed, cost matters at scale |
| Critic (Step 4b) | Frontier, different prompt lineage than generators | Self-grading same-model output inflates scores |
| Classification / routing / sentiment (6c) | Small (Haiku-class) | Cheap, fast, deterministic-ish tasks |

Pin model IDs in one config file per environment. v1's hardcoded "Claude 3.5
Sonnet" is already two generations stale — the architecture should survive
model churn without a diagram rewrite.

## Build order (each stage ships value alone)

1. **Client context repo + strategist flow** — immediately useful even with
   manual everything downstream
2. **Generation via skills + deterministic checks** — assets in hours not days
3. **Critic + bounded regen + approval dashboard** — quality floor
4. **Asset production APIs + staged deployment** — drafts-first publishing
5. **Canary watcher + measurement loop** — the compounding part
