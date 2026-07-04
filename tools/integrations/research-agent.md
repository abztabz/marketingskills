# research-agent

Layer 1 **Research** orchestrator — the runnable Step 1 of the 108 Media
Autonomous Agency OS (see `docs/108media-omni-channel-architecture.md`). Given
one target domain it runs the full research pipeline and writes a **Research
Store** that Step 2 (Demand Generation) consumes.

Unlike the single-vendor CLIs in this folder, `research-agent` is an
**orchestrator**: it spawns the sibling CLIs (ahrefs, semrush, similarweb,
dataforseo, exa) plus inline Firecrawl + Anthropic calls, then does the
deterministic filter/distill and the LLM analyze on top.

## Pipeline

```
collect  ── Track A customer  (firecrawl · ahrefs · semrush · similarweb)
         ── Track B competitor (semrush competitors · exa find-similar · lite rival probes)
         ── Track C market      (dataforseo volume · exa trends)
   ↓ filter    dedupe, drop errors/empties, stamp source + date
   ↓ distill   typed records: seo, traffic, competitors, market
   ↓ analyze   frontier model → Opportunity Brief  (or emit analysis-prompt.md)
   ↓ emit      research-store/<domain>/…
```

Every collector degrades gracefully: a missing API key or a failed probe is
recorded in `collection.droppedDetail` and skipped. The run always produces a
Research Store, even with zero keys (status `collected_pending_analysis`).

## Commands

```bash
# Full run for one prospect
node tools/clis/research-agent.js run \
  --domain acme.ae --market "specialty coffee" --geo AE --lang en,ar

# Preview the probe plan + key readiness without calling anything
node tools/clis/research-agent.js plan --domain acme.ae --market "coffee"

# List Research Store prospects ranked by fit score (what Step 2 polls)
node tools/clis/research-agent.js status
```

### `run` flags

| Flag | Default | Meaning |
|------|---------|---------|
| `--domain <d>` | required | Target domain (prospect or client) |
| `--market "<category>"` | — | Enables Track C (market demand + trends) |
| `--geo <CC>` | `AE` | Geo for demand/benchmarks |
| `--lang <en,ar>` | `en,ar` | Languages the analysis reasons about |
| `--competitors auto\|c1,c2` | `auto` | Pass explicit rivals or auto-discover |
| `--num-competitors <n>` | `5` | How many lookalikes to discover |
| `--depth prospect\|deepdive` | `prospect` | `deepdive` adds per-rival traffic probes |
| `--model <id>` | `claude-sonnet-5` | Analyze model (use an Opus-class id for depth) |
| `--out <dir>` | `research-store` | Store root |
| `--no-llm` | off | Skip the LLM; emit `analysis-prompt.md` instead |
| `--dry-run` | off | Same as `plan` |

## Environment keys

All optional — a missing key skips only that probe.

`FIRECRAWL_API_KEY`, `AHREFS_API_KEY`, `SEMRUSH_API_KEY`,
`SIMILARWEB_API_KEY`, `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD`,
`EXA_API_KEY`, `ANTHROPIC_API_KEY`.

Scraping obeys the source's robots.txt and platform ToS — the orchestrator
only calls the sanctioned vendor APIs above.

## Output — the Research Store (the Step 2 contract)

```
research-store/<domain>/
├── RESEARCH_STORE.json   # manifest Step 2 reads (see below)
├── brief.json            # Opportunity Brief (structured)
├── brief.md              # human-readable brief
├── gap-matrix.md         # prospect vs competitors (DR, visits)
├── distilled.json        # typed records by track
├── raw.json              # every collected probe result
└── analysis-prompt.md    # only when no LLM key: the ready-to-run prompt pack
```

`RESEARCH_STORE.json` is the handoff contract. Key fields:

- `readyForStep2` — `true` once an Opportunity Brief exists
- `fitScore`, `estimatedMonthlyValueUsd` — pipeline ranking signals
- `outreachHook`, `topGaps` — what a first-touch email opens with
- `competitors` — discovered rival domains
- `signal` — deterministic summary (works even with no LLM key)

### Step 2 handoff

Demand Generation ranks prospects by `fitScore`, then opens outreach with
`outreachHook` / `topGaps` — evidence, not pitch. Poll readiness with:

```bash
node tools/clis/research-agent.js status --domain acme.ae
```

When `readyForStep2` is `false` (no LLM key at run time), run the emitted
`analysis-prompt.md` through a frontier model, write `brief.json`, and flip
`readyForStep2` to `true`.

## Related

- Skills: `seo-audit`, `cro`, `customer-research`, `competitor-profiling`,
  `competitors`, `prospecting`, `cold-email`
- CLIs: `ahrefs`, `semrush`, `dataforseo`, `similarweb`, `exa`,
  `keywords-everywhere`
- Scraping guides: `firecrawl.md`, `browserbase.md`, `exa.md`
