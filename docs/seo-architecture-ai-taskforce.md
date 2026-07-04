# SEO Architecture for Organic Search — AI-Run Taskforce

A viable, defensible architecture for winning organic search in the current
(2025–2026) Google environment using a taskforce of AI agents with humans on
the review path. Grounded in three sources of truth:

1. **Google's current algorithm behavior** — continuous core + spam updates
   (December 2025, March 2026, May 2026), "information gain" scoring that
   demotes content merely summarizing what already ranks, indexing itself
   acting as the quality filter, and holistic Core Web Vitals scoring.
2. **Google's official guidance** — the May 2026 guide on succeeding in AI
   Overviews / AI Mode, and Danny Sullivan's Search Central Live 2026
   keynote: *"Good SEO is largely having great content for people"*; AEO/GEO
   are still SEO; no special formats (llms.txt, artificial chunking) needed;
   the bar is **non-commodity content** — unique, specific, authentic.
3. **Practitioner consensus (Neil Patel et al., 2026)** — authority now
   equals citations, not just backlinks; entity-focused topical depth;
   freshness; quotable structure AI systems can lift; and "search everywhere"
   (Google + AI assistants + social/vertical search).

The strategic premise that follows from all three: **Google's algorithm is
now explicitly tuned to punish exactly what a naive AI content operation
produces** (synthetic summaries of the existing top 10 — 24.1% of such pages
dropped from top-10 positions in the March 2026 core update). Therefore the
taskforce is architected so AI does the *leverage work* (research, drafts,
technical execution, monitoring at scale) while unique data, first-hand
experience, and expert accountability — the things Google now filters for —
are injected deliberately at defined points.

---

## Taskforce architecture

```
                    ┌──────────────────────────────────────────┐
                    │ ORCHESTRATOR AGENT                       │
                    │ backlog, priorities, cadences, routing   │
                    │ every publish passes the Quality Gate    │
                    └───────────────────┬──────────────────────┘
        ┌───────────┬───────────┬───────┴────┬────────────┬────────────┐
        ▼           ▼           ▼            ▼            ▼            ▼
   R1 RESEARCH  R2 CONTENT  R3 EDITORIAL  R4 TECHNICAL  R5 AUTHORITY  R6 MEASURE
   intent maps  strategist  QA + E-E-A-T  SEO agent     digital PR /  rankings,
   entity gaps  briefs +    fact-check    crawl, CWV,   entity &      AI citations,
   SERP/AI-     drafts      (human        schema,       citation      revenue,
   answer scan              sign-off)     internal      building      core-update
                                          links                       impact
        └───────────┴───────────┴────────────┴────────────┴────────────┘
                     shared memory: keyword/entity graph, content
                     inventory, quality scorecards, learnings log
```

**Agent roles**

| Agent | Mandate | Repo skills it runs on |
|---|---|---|
| Orchestrator | Owns the backlog, enforces the Quality Gate, schedules cadences | `marketing-plan` |
| R1 Research | Query/intent mapping, entity gap analysis, SERP + AI Overview monitoring, competitor deltas | `competitors`, `competitor-profiling`, `customer-research` |
| R2 Content | Topic clusters, briefs with an explicit **information-gain requirement**, drafts | `content-strategy`, `copywriting`, `programmatic-seo` |
| R3 Editorial QA | Commodity-content detection, fact-checking, E-E-A-T injection, routing to human expert reviewer | `copy-editing` |
| R4 Technical | Crawl health, indexation, Core Web Vitals, schema, internal linking, site structure | `seo-audit`, `site-architecture`, `schema` |
| R5 Authority | Digital PR, original-data assets, brand mention / citation building, directory + profile hygiene | `public-relations`, `co-marketing`, `directory-submissions`, `free-tools`, `ai-seo` |
| R6 Measurement | GSC/GA4 pulls, rank + AI-visibility tracking, scorecards, core-update impact analysis | `analytics`, `ai-seo` |

**Humans on the loop (non-negotiable, and why):** Google's 2026 updates
demote content that lacks first-hand experience and original insight. AI
agents cannot manufacture experience; they can only package it. Humans
appear at exactly three points:

1. **Expert input harvest** — a named subject-matter expert supplies the
   opinions, data, war stories, and screenshots the brief demands (async, ~30
   min per piece; the R3 agent interviews them and transcribes).
2. **Pre-publish sign-off** — the named author approves and stands behind
   the piece (byline + author schema + credentials page).
3. **Exception queue** — quality-gate failures, core-update anomalies, and
   penalty signals escalate to a human; everything else runs on schedule.

**The Quality Gate (deterministic, runs on every piece before publish):**

- Information-gain check: does the piece contain ≥1 element absent from the
  current top 10 (original data, proprietary example, expert quote, tool)?
- Commodity check: R3 agent summarizes the current top 5 results; if the
  draft is substitutable for that summary, it is rejected, not published.
- E-E-A-T check: named author, credentials, first-hand evidence present.
- Extractability check: direct answer in the first ~50 words of each H2
  section, clean heading hierarchy, quotable standalone passages.
- Technical check: valid schema, internal links in/out, CWV budget respected.

---

## A. Actionable tasks

### Phase 0 — Foundation (weeks 1–4)

| # | Task | Owner |
|---|---|---|
| 1 | Full technical audit: crawl, indexation coverage, CWV (all three of LCP/INP/CLS — 2026 scoring is composite, one failing metric compounds), duplicate/thin pages | R4 |
| 2 | Content inventory + quality triage: keep / improve / consolidate / prune. Flag every page that would fail the commodity check | R2 + R3 |
| 3 | Entity foundation: Organization + Person schema, consistent NAP, author pages with credentials, Knowledge Panel claim/cleanup, Google Business Profile if applicable | R4 + R5 |
| 4 | Keyword → **intent → entity** map: cluster queries by topic entity, tag each cluster with AI Overview presence rate and click expectation (AIOs now trigger on ~48% of queries and cut top-position CTR ~34.5%) | R1 |
| 5 | Stand up measurement stack (Section B) and baseline everything: rankings, indexed pages, AI citation share, organic conversions | R6 |
| 6 | Define the Quality Gate rubric and wire it into the publish workflow | Orchestrator |

### Phase 1 — Build the moat (months 2–3)

| # | Task | Owner |
|---|---|---|
| 7 | Fix all Phase-0 technical findings; consolidate/redirect pruned pages | R4 |
| 8 | Upgrade the 20 highest-potential existing pages to non-commodity standard (add original data, expert input, direct-answer structure) before writing anything new | R2 + R3 + human expert |
| 9 | Launch 1–2 **original data assets** per quarter (proprietary survey, benchmark report, teardown, free tool) — these are the citation magnets both Google and AI answers reward | R2 + R5 |
| 10 | Publish new cluster content on a sustainable cadence (quality-gated; volume is whatever passes the gate, not a quota) | R2 + R3 |
| 11 | Digital PR sprint: pitch the data assets; target brand mentions and citations on authoritative domains — entity signals now beat equivalent content without them | R5 |
| 12 | Internal linking pass: hub-and-spoke per cluster, descriptive anchors | R4 |

### Phase 2 — Compounding loop (month 4 onward, continuous)

| # | Task | Owner |
|---|---|---|
| 13 | Weekly SERP + AI Overview monitoring per money cluster; log which sources get cited and why (structure? data? recency?) | R1 |
| 14 | Freshness program: every page in the money clusters reviewed/updated on a defined cycle (quarterly for volatile topics, semi-annual otherwise) — freshness is a 2026 citation factor | R2 |
| 15 | Quarterly content pruning: anything that failed to index or earn impressions in 2 quarters gets improved, consolidated, or removed — indexing is now the filter, and dead weight drags site-level quality | R2 + R4 |
| 16 | Expand "search everywhere": repurpose winning pieces to YouTube, LinkedIn, and vertical platforms where the audience actually queries | R5 |
| 17 | Core-update response protocol: on every confirmed update, R6 produces a winners/losers delta within 7 days; changes ship only after the rollout completes | R6 → exception queue |

## B. Quality measurement tools

| Layer | Tool | What it measures | Notes |
|---|---|---|---|
| Ground truth | **Google Search Console** | Impressions, clicks, position, indexation coverage, manual actions | The only first-party source; API-pull daily via R6 |
| Behavior + revenue | **GA4** (MCP-enabled in this repo — `tools/integrations/ga4.md`) | Organic sessions, engagement, conversions, assisted revenue | Tie every cluster to a conversion event |
| Technical health | **Screaming Frog / Sitebulb** + **PageSpeed Insights / CrUX API** | Crawl errors, orphan pages, schema validity, LCP/INP/CLS field data | Weekly automated crawl diff |
| Rank + share of voice | **Semrush or Ahrefs** | Cluster-level rank tracking, visibility index, backlink/citation growth | Track clusters, not vanity keywords |
| AI visibility | **AI citation tracker** (Semrush AI toolkit, Profound, Peec, or scripted prompt-sampling across AI Overviews/ChatGPT/Perplexity) | Citation share: how often the brand is cited for the target query set vs competitors | The 2026 replacement for "rank #1" as the headline metric |
| Internal quality | **Quality Gate scorecard** (rubric above, scored per piece, logged) | Information gain, E-E-A-T evidence, extractability, technical pass | Leading indicator — this predicts the lagging metrics |

**One headline KPI per horizon:** short-term = % of published pieces passing
the Quality Gate first try; mid-term = indexed-and-earning-impressions rate;
long-term = AI citation share + organic-assisted revenue. Do **not** use raw
organic traffic as the north star — AI Overviews structurally depress clicks
even when visibility and revenue grow.

## C. Quality measurement timeline

| Cadence | Review | Metrics | Decision made |
|---|---|---|---|
| **Daily** (automated) | R6 anomaly scan | GSC clicks/impressions deltas, indexation drops, CWV field alerts | Escalate anomalies > 20% to exception queue |
| **Weekly** | Taskforce standup (agent-generated digest) | Publish velocity vs gate pass-rate, new citations, SERP feature changes on money clusters | Reprioritize next week's briefs |
| **Monthly** | Performance review | Cluster rank movement, AI citation share, indexed-page yield, conversion by landing page | Kill/double-down calls per cluster |
| **Quarterly** | Strategy review + pruning pass | Revenue attribution, content ROI per cluster, competitor delta, freshness backlog | Roadmap, data-asset topics, resourcing |
| **Per core update** (~2–4×/year) | Impact analysis within 7 days of rollout completion | Winner/loser pages, pattern diagnosis against update focus | Remediation plan; never mid-rollout |

**Expectation-setting (what "working" looks like, honestly):**

- Weeks 1–6: technical fixes reflected in crawl stats; new content indexed
  (or not — a non-indexation rate above ~20% means quality, not patience, is
  the problem).
- Months 2–4: impressions and long-tail movement on upgraded pages; first
  AI citations on low-competition queries.
- Months 4–8: cluster-level rankings and citation share compound; first
  core update verdict on the program.
- Month 12: the program should defend itself in revenue terms, not traffic
  terms.

## D. Content do's and don'ts — top 5 each

**Do:**

1. **Lead every piece with information gain.** Ship at least one thing the
   current top 10 doesn't have: original data, a real example with numbers,
   an expert's contrarian take, a free tool. This is now the literal
   ranking mechanism, not a nice-to-have.
2. **Demonstrate first-hand experience, by a named human.** Real
   screenshots, real results, real bylines with credentials and author
   schema. "Authentic — not rewritten Google results" is Google's own
   definition of the bar.
3. **Structure for extraction.** Direct answer in the first 1–2 sentences
   under each heading, clean H2/H3 hierarchy, tables and steps, quotable
   standalone passages — this is what both AI Overviews and featured
   snippets lift, per Google's May 2026 guidance.
4. **Build topical depth around entities, not keywords.** Complete clusters
   that cover a topic's real sub-questions, interlinked hub-and-spoke, with
   consistent entity signals (schema, brand mentions) around them.
5. **Keep money pages demonstrably fresh.** Scheduled substantive updates —
   new data, new examples, updated recommendations — with honest
   dateModified. Freshness is a measured citation factor in 2026.

**Don't:**

1. **Don't publish AI summaries of what already ranks.** The March 2026
   core update was aimed at exactly this ("AI slop"); pages that only
   restate the top 10 are being dropped at indexing — they never even get
   to lose rankings.
2. **Don't chase volume quotas.** 100 mediocre programmatic pages now
   damage site-wide quality signals and indexation rates. Publish only what
   passes the Quality Gate; prune what fails to earn indexation.
3. **Don't fake E-E-A-T.** Invented authors, purchased bylines, fabricated
   review claims, or AI-generated "expert" personas are spam-update fodder
   and, once caught, poison the whole domain's trust.
4. **Don't build for the machine with gimmicks.** No llms.txt worship,
   artificial text chunking, keyword stuffing, or separate "AI versions" of
   pages — Google's explicit 2026 position is that no special format is
   needed and AEO/GEO are still just SEO.
5. **Don't optimize for raw traffic in a zero-click world.** Ranking #1 on
   a query whose AI Overview answers everything is worth less than being
   the *cited source* inside that answer. Pick targets by click-and-citation
   opportunity, and measure revenue, not sessions.

## E. Skills required

**Human roles (small, senior, on the exception path):**

| Role | Why AI can't replace it | Time load |
|---|---|---|
| SEO lead / orchestrator owner | Strategy calls, core-update judgment, gate rubric ownership | ~0.25–0.5 FTE |
| Subject-matter expert(s) | The source of experience and opinion — the actual moat | ~30 min per piece |
| Editor with E-E-A-T accountability | Final sign-off; legally/reputationally stands behind bylines | ~0.25 FTE |
| Digital PR / relationships | Journalists and partners respond to humans, not agents | fractional |

**Agent capabilities (mapped to this repo):**

- Search intent + entity analysis, competitor monitoring — `competitors`,
  `competitor-profiling`, `customer-research`
- Content strategy, briefs, drafting, editing — `content-strategy`,
  `copywriting`, `copy-editing`, `programmatic-seo`
- Technical SEO, structured data, architecture — `seo-audit`, `schema`,
  `site-architecture`
- AI-search optimization and citation tracking — `ai-seo`
- Authority building — `public-relations`, `co-marketing`,
  `directory-submissions`, `free-tools`, `lead-magnets`
- Analytics and reporting — `analytics` + GA4 MCP integration
  (`tools/integrations/ga4.md`), GSC via API

**Technical skills to operate the system:** prompt/agent orchestration,
API integration (GSC, GA4, crawler, rank tracker), basic data analysis for
scorecards and update-impact diffs, schema/JSON-LD literacy.

## F. Other important considerations

1. **Indexing is the new front line.** Google now filters at indexation:
   content too similar to what exists often never enters the index. Track
   indexed-page yield as a first-class KPI — it is the earliest and
   cheapest quality signal you have.
2. **Site-level quality is shared fate.** Weak sections drag strong ones
   under 2026's holistic scoring. The pruning cadence (task 15) is not
   hygiene, it's ranking strategy.
3. **Never react mid-rollout.** Core updates take 2+ weeks to roll out and
   often overlap spam updates. The protocol is: annotate dates, wait for
   completion, diff winners/losers, diagnose against the update's stated
   focus, then remediate. Panic edits during rollout destroy the diagnosis.
4. **The economics have shifted from clicks to presence.** Budget and
   report accordingly: citation share, branded search growth, and
   organic-assisted revenue are the board-level metrics. A program judged
   on 2019 traffic curves will be cancelled right before it compounds.
5. **Diversify beyond Google.** Practitioner consensus and Gartner's ~25%
   search-volume erosion forecast both point the same way: the same
   non-commodity assets should be syndicated to where the audience searches
   (YouTube, LinkedIn, vertical communities, AI assistants). One production
   pipeline, many distribution surfaces.
6. **Log everything the taskforce learns.** Every gate rejection, update
   diff, and citation win goes to a shared learnings log the agents load as
   context. The compounding advantage of an AI taskforce is not speed — it
   is that it never forgets what worked.

---

## Sources

- Google Search Central Live 2026 (Danny Sullivan keynote): commodity vs
  non-commodity content, "good SEO is largely having great content for
  people" — [Search Engine Journal recap](https://www.searchenginejournal.com/google-search-central-live-nyc-insights-on-seo-for-ai-overviews/542684/),
  [JC Chouinard slides](https://www.jcchouinard.com/google-search-central-live-toronto-slides-april-2026/),
  [Schema App recap](https://www.schemaapp.com/schema-markup/google-search-central-live-toronto-what-actually-matters-in-ai-search/)
- Google: "SEO for AI is still SEO" —
  [Search Engine Land](https://searchengineland.com/google-danny-sullivan-seo-for-ai-is-still-seo-466368)
- 2025–2026 algorithm update timeline, March 2026 information-gain update,
  May 2026 core update —
  [Outline Technologies](https://outline.ad/blog/google-algorithm-updates-2026/),
  [Digital Applied timeline](https://www.digitalapplied.com/blog/google-algorithm-update-history-2026-complete-timeline),
  [Search Engine Journal history](https://www.searchenginejournal.com/google-algorithm-history/)
- Neil Patel, 2026 AI SEO strategy (authority = citations, search everywhere,
  freshness, quotable structure) —
  [Search engine trends](https://neilpatel.com/blog/search-engine-trends/),
  [AI visibility tools](https://neilpatel.com/blog/ai-visibility-tools/),
  [Progress interview on findability](https://www.progress.com/blogs/search-everywhere-optimization-neil-patel-brand-ai-future-findability)
- 2026 SEO leader predictions —
  [Search Engine Land](https://searchengineland.com/ai-search-visibility-seo-predictions-2026-468042)
