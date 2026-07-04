# 108 Media — Autonomous AI Marketing Agency OS

A self-sustained, fully automated architecture for running 108media.ae as an
AI-native agency. Not a campaign pipeline with humans in the loop — an agency
where agents acquire clients, onboard them, plan, produce, deploy, optimize,
report, and bill, end to end. Humans sit on the **exception path only**: the
system never waits for approval; it runs under machine-enforced policy and
escalates when a policy trips.

Design principles applied:

- **Search Before Building** — every layer maps to existing assets in this
  repo (44 skills, 51 zero-dependency CLIs, Composio for OAuth platforms).
  The custom build surface is orchestration, policy, and memory. Nothing else.
- **Boil the Ocean** — the whole agency, not just content production. An
  automated content engine attached to manual sales, manual reporting, and
  manual billing is not self-sustained; it's a bottleneck with a fast middle.
- **Autonomy via policy, not via optimism** — full automation is safe only
  when every irreversible action (spend, publish, send) passes a deterministic
  policy engine with hard caps and auto-pause. The replacement for human
  judgment is not model confidence; it is enforceable rules plus statistical
  thresholds plus kill switches.

## System overview

```
                        ┌────────────────────────────────────────────┐
                        │  LAYER 0: ORCHESTRATION, MEMORY, POLICY    │
                        │  Agent scheduler (cron + event bus)        │
                        │  Per-client memory (git-versioned context) │
                        │  Policy Engine (caps, rules, kill switch)  │
                        │  Model router (frontier/mid/small tiers)   │
                        └────────────────────┬───────────────────────┘
      every layer below runs ON this substrate; every external action
      (spend, publish, send, charge) passes THROUGH the Policy Engine
                                             │
  ┌──────────────┬──────────────┬────────────┼────────────┬──────────────┐
  ▼              ▼              ▼            ▼            ▼              ▼
L1 DEMAND     L2 ONBOARD     L3 CAMPAIGN  L4 DEPLOY    L5 OPTIMIZE   L6 CLIENT
GENERATION    & INGESTION    ENGINE       & SCALE      (24/7 loop)   SUCCESS
(agency's                                                            + L7 BACK
own growth)                                                          OFFICE
```

## Layer 0 — Orchestration, Memory, Policy (the substrate)

**Scheduler + event bus.** A queue-based orchestrator (Temporal, Trigger.dev,
or plain cron + webhooks — search before building; don't write a custom
workflow engine) fires agents on schedules (hourly metric pulls, weekly
retros) and events (lead replied, canary breached, invoice paid).

**Per-client memory, git-versioned.** One repo per client:

```
clients/<client>/
├── brand-dna.md          # voice, positioning, visual identity
├── style-guide.md        # banned words, claims rules, AR/EN glossary
├── compliance.md         # UAE ad regs + category rules (finance, health...)
├── policy.yaml           # spend caps, channel allowlist, escalation contacts
├── learnings.jsonl       # append-only: what worked, what didn't, why
└── campaigns/<id>/       # briefs, assets, results per campaign
```

Loaded whole into context (200K–1M token windows make RAG-for-a-style-guide
obsolete). A vector index exists only for cross-client asset/archive search.

**Policy Engine — the autonomy license.** Deterministic code, not tokens.
Every outbound action is a typed request checked against `policy.yaml`:

- Spend: per-client daily/monthly caps, per-campaign caps, platform caps
- Publish: platform allowlist, content categories, blackout windows
- Outreach: send-volume caps, suppression lists, unsubscribe honor
- Billing: charge only against signed-contract line items
- Global and per-client **kill switches** flip everything to pause instantly

Breach → action blocked + auto-pause + one item on the **exception queue**
(a Slack/WhatsApp digest a human clears asynchronously). This is the only
place humans appear, and the system keeps running around them.

**Model router.** Frontier tier (Opus-class) for strategy, critique, and
anything judgment-heavy. Mid tier (Sonnet-class) for volume generation. Small
tier (Haiku-class) for classification, routing, sentiment. Model IDs pinned
in one config file — the architecture survives model churn without a rewrite.

## Layer 1 — Demand Generation (the agency sells itself)

A self-sustained agency acquires its own clients. Repo assets do the work:

- **Prospecting agent** (daily): builds UAE/GCC target lists via `apollo`,
  `clay`, `clearbit`, `hunter` CLIs + `prospecting` skill, then hands each
  prospect to the intelligence pipeline below before anyone drafts a word

- **Prospect Intelligence Pipeline** — no outreach is drafted until the
  prospect's current status is known across four lenses:

  1. **Website audit**: Firecrawl full-site scrape → messaging, offers,
     site structure, AR/EN coverage; `seo-audit` skill for on-page findings
     (titles, schema, speed, mobile); `cro` skill lens on key landing pages;
     `clearbit` for tech stack
  2. **SEO status**: `ahrefs` / `semrush` / `dataforseo` CLIs → domain
     rating, keyword rankings, estimated organic traffic, top pages,
     backlink profile; `keywords-everywhere` for local (UAE/GCC, AR + EN)
     search volumes they're missing
  3. **Social presence**: Browserbase sessions on their public profiles
     (Instagram, TikTok, LinkedIn, X) → posting cadence, engagement rate,
     content mix, Arabic/English split; Meta Ad Library + TikTok Creative
     Center → are they running paid, which creatives, and how long-running
     (long-running = working, stale = fatigued)
  4. **Competitor benchmark**: Exa + `similarweb` identify the top 3 local
     competitors → same audit run lite on each (`competitors` +
     `competitor-profiling` skills) → gap matrix: share of search, social
     engagement, ad activity, content velocity deltas

  Output: an **Opportunity Brief** per prospect — 3–5 scored, verifiable
  gaps ("competitor X outranks you on 40 keywords worth ~12K visits/mo",
  "no Arabic content while 60% of your market searches in Arabic", "your
  Meta creatives have run unchanged for 90 days") plus a fit score and
  estimated engagement value. Briefs are cached; a signed prospect's brief
  pre-seeds L2 ingestion so nothing is scraped twice.

- **Outbound agent**: sequences via `instantly`/`lemlist` CLIs +
  `cold-email` skill, where **every first touch leads with one specific
  finding from that prospect's Opportunity Brief** — evidence, not pitch.
  Replies classified by the small model; positive intent auto-books via
  `calendly`/`savvycal` CLIs
- **Inbound engine** (weekly): `ai-seo`, `programmatic-seo`, `content-strategy`,
  `social` skills publish for 108media.ae itself — the agency's own site is
  client zero and the standing proof-of-work demo
- **Proposal agent**: expands the Opportunity Brief into a scoped proposal —
  each proposed line item traces to a measured gap — with pricing from a
  rate card, sends for e-signature; signature event triggers Layer 2

Policy rails: outreach volume caps, suppression lists, no unapproved pricing
off the rate card, discovery calls stay human by default (relationship
capital — flip to AI-led when transcripts prove parity on close rate).

## Layer 2 — Autonomous Onboarding & Brand Ingestion

Signature event fires the ingestion agent, no kickoff meeting required:

1. **Scrape everything public** with a layered stack:
   - **Firecrawl** — client site + competitor sites → clean LLM-ready
     markdown (handles JS rendering and anti-bot; see
     `tools/integrations/firecrawl.md`)
   - **ScrapeGraphAI** — LLM-guided structured extraction on top of the raw
     scrape: turn pages into typed brand facts (offers, pricing, claims,
     tone samples, AR/EN copy pairs) instead of prose blobs
   - **Browserbase** — headless sessions for dynamic/login-walled surfaces:
     Meta Ad Library, TikTok Creative Center, social feeds
     (`tools/integrations/browserbase.md`)
   - **Exa** — semantic web search to discover competitors, press mentions,
     and review sites worth scraping (`tools/integrations/exa.md`)
   Analysis via `competitor-profiling`, `customer-research`,
   `product-marketing` skills. Scraping obeys robots.txt and platform ToS —
   the Policy Engine treats scrape targets like any other external action.
2. Draft `brand-dna.md`, `style-guide.md`, `compliance.md`, and a proposed
   `policy.yaml` (caps derived from contract value) — grounded in the
   structured scrape output, not model guesses about the client
3. Client confirms via a one-time portal review — a contractual boundary
   (spend authority, brand truth), not a workflow gate; it happens once per
   client, not per campaign
4. Composio + CLI connections established: ad accounts, GA4, CRM, socials
5. First campaign plan auto-generated within 24h of signature

## Layer 3 — Campaign Engine (strategy → generation → critique → production)

```
Strategist Agent (frontier)                        runs per campaign trigger:
  reads full client memory + learnings.jsonl       new client, new brief,
  → omni-channel plan, channel briefs,             calendar moment, or L5
    success metrics, budget split                  detecting a fatigued account
        │
        ▼
Generation swarm (mid tier) — existing skills, parallel per channel:
  Paid: /ads /ad-creative /copywriting /ab-testing (variants planned upfront)
  Organic: /social /video /content-strategy
  PR/Editorial: /public-relations /copywriting
  Lifecycle: /emails /sms /onboarding
  All assets native EN + AR from the shared glossary — never post-translated
        │
        ▼
Critique — deterministic first, LLM second, bounded:
  a. Code checks (free): banned words, claim substantiation flags, required
     disclaimers, platform char/dimension limits, link + UTM validation
  b. Critic agent (frontier, separate prompt lineage from generators):
     scored rubric — cohesion ≥8, brand voice ≥8, cultural fit ≥9
     lenses: /copy-editing /marketing-psychology
  c. Fail → regenerate with findings, MAX 2 iterations, then ship the best
     scoring variant BELOW threshold only if policy.yaml allows it for that
     channel; otherwise exception queue. Never loop silently.
        │
        ▼
Asset production: SDXL/Flux (brand LoRA), HeyGen avatars, Bannerbear
dynamic templates. Rendered assets re-enter check (a) for logo/dimension QA.
```

No approval step. The critic's rubric plus the policy engine ARE the gate.

## Layer 4 — Autonomous Deployment & Scaling

Fire-and-forget is not autonomy; it's negligence with extra steps. Autonomy
means the system supervises itself:

1. **Stage**: everything lands as drafts — paused ad sets, scheduled posts,
   staged emails, unpublished CMS entries (`meta-ads`, `google-ads`,
   `tiktok-ads`, `linkedin-ads`, `buffer`, HubSpot via Composio, `mailchimp`/
   `resend` CLIs)
2. **Canary**: auto-launch at 10–20% budget or one segment for 24–48h
3. **Guardrail watch** (small model + hard rules, checks hourly): CTR floor,
   CPA ceiling, spend-pacing anomaly, negative-sentiment spike, platform
   policy flags → breach = auto-pause + exception queue
4. **Auto-scale on statistics, not vibes**: scale to full budget only when
   the canary clears guardrails AND performance beats the client's
   `learnings.jsonl` baseline with adequate sample size. Not confident →
   extend the canary. Confidence thresholds live in `policy.yaml`.

The v1 human "confirm scale-up" is replaced by a statistical test plus a hard
spend cap. That pair is auditable, tireless, and enforceable at 3am.

## Layer 5 — Continuous Optimization (the 24/7 loop)

- **Budget reallocation** (daily): bandit-style shifting toward winning
  channels/ad sets within policy caps, via `ga4`, `meta-ads`, `google-ads`,
  `mixpanel` CLIs
- **Creative fatigue detection**: frequency up + CTR decaying → auto-trigger
  Layer 3 for refreshed variants; fatigued creative rotates out
- **A/B testing autonomy**: `ab-testing` skill plans variants at generation
  time; winners promote on significance, losers killed, result + rationale
  appended to `learnings.jsonl`
- **Weekly auto-retro per client**: which hooks/angles/formats won by
  channel → `learnings.jsonl` → next Strategist run starts smarter. This is
  the compounding loop; without it the agency starts cold every campaign.

## Layer 6 — Client Success (retention runs itself)

- **Reporting agent** (weekly + monthly): pulls performance, writes the
  client-facing narrative in the client's language (EN/AR), sends via
  `resend`/HubSpot; a live dashboard replaces "can you send me the numbers"
- **Anomaly comms**: guardrail auto-pause → client notified with cause and
  corrective action within the hour, automatically — bad news travels fast
  and from us first
- **Churn prevention** (`churn-prevention` skill): watch engagement with
  reports, sentiment in client emails, performance-vs-promise deltas; risk
  score crosses threshold → exception queue with a prepared save plan
- **Expansion agent**: performance patterns that justify upsell (e.g. paid
  search saturated, SEO opportunity large) → auto-drafted expansion proposal
  from the rate card

## Layer 7 — Back Office (the agency runs itself)

- **Billing**: `stripe`/`paddle` CLIs — invoices generated from contract line
  items, dunning sequences automated, revenue recognized per client
- **Unit economics ledger** (per client, updated daily): model spend + ad
  platform fees + tool costs vs retainer. Margin below floor → exception
  queue with a repricing recommendation. An agency that can't see per-client
  margin isn't self-sustained; it's self-deluding.
- **Capacity = compute**: onboarding client #30 means scaling queue workers
  and API budgets, not hiring. The marginal cost of a client is measurable
  in the ledger, and pricing updates flow from it.

## What "self-sustained" honestly requires

Full autonomy is a property you earn per action class, not declare globally:

| Action class | Autonomous from | Mechanism |
|---|---|---|
| Content generation + critique | Day 1 | Rubric + deterministic checks |
| Publish organic/social/email | Day 1 | Policy engine + staged drafts |
| Paid spend within caps | Day 1 | Caps + canary + guardrail auto-pause |
| Scale-up past canary | Day 1 | Statistical test + hard caps |
| Outbound sales sequences | Day 1 | Volume caps + suppression lists |
| Client onboarding | Day 1 | One-time portal confirm (contractual) |
| Billing + dunning | Day 1 | Contract-derived line items only |
| Raising a client's spend cap | Never automatic | Client's contractual call |
| Signing contracts / pricing off rate card | Never automatic | Legal identity acts |
| Platform account recovery (ad account bans) | Never automatic | Platforms require humans |

The last three rows are not philosophy — they're law, platform ToS, and
contract. Everything above them runs without asking anyone. Humans process
the exception queue asynchronously; the system never blocks on them.

**Failure containment**, because a fully automated agency fails at machine
speed: per-client blast-radius isolation (one client's breach never pauses
another), global kill switch, immutable action log (every publish/spend/send
recorded with the policy check that authorized it), and a weekly agent-run
audit of the audit log. Trust comes from the log, not the model.

## Build order (each stage is a working system)

1. **Layer 0 + one client end-to-end** — memory repo, policy engine, model
   router; run one real client through Layers 3–5 fully automated
2. **Layer 6** — reporting + anomaly comms (retention before acquisition)
3. **Layers 1–2** — demand gen + auto-onboarding (grow only after delivery
   is autonomous, or sales fills a leaky bucket)
4. **Layer 7** — billing + unit-economics ledger
5. **Scale loop** — client #N is a config file and a policy.yaml, not a hire
