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

## Requirements intake — it asks you first

On a terminal, `run` **interviews the operator before any research** so the
pipeline matches what you actually want, then confirms before spending a single
API call. Questions: engagement (new prospect vs signed client), target domain,
**industry**, market, geo, languages, primary goal, budget, competitors, **what
NOT to waste time researching**, constraints. Answers flow into the config,
the Opportunity Brief analysis (so gaps and fit score are tailored to the
stated goal/budget), and the Research Store manifest.

- Prompts print to **stderr**; stdout stays pure JSON (safe to pipe).
- Flags **pre-fill** answers — you're only asked what's missing.
- Automation never hangs: with `--yes` / `--non-interactive`, or when stdin
  isn't a TTY, it skips the interview and uses flags.
- `--engagement onboard` (or answering "2") implies `--depth deepdive`.
- **Every confirmed answer set is logged** — see "Client Info Document" below.

### Industry vs Market

`--industry` is the broad classification (hospitality, real estate, F&B).
`--market` is a narrower category within it (boutique hotels in Dubai Marina).
Leave `--market` blank and Track C (market research) runs on `--industry`
instead — you don't have to fill in both.

### "Do not waste time researching"

`--exclude` (or the matching intake question) takes a comma-separated list of:

- **track names** — `competitor`, `market` (or any word matching a probe's
  track/label, e.g. `traffic`, `seo`) — cuts every matching probe from the
  plan **before a single API call is made**
- **specific competitor domains** — e.g. `rival.ae` — skips just that rival's
  probes, whether passed via `--competitors` or auto-discovered
- **free-text topics** — anything else is passed to the analysis model as an
  explicit "don't spend brief slots on this"

Run `plan` to see exactly what got cut, with reasons, in `excludedByOperator`
— before any research spends a cent.

```bash
# Interview only, save reusable requirements.json
node tools/clis/research-agent.js intake --save reqs.json

# Run from a saved intake (no questions asked)
node tools/clis/research-agent.js run --from-requirements reqs.json
```

## Commands

```bash
# Interactive on a terminal: asks requirements first, then runs
node tools/clis/research-agent.js run

# Unattended: pass everything as flags, skip the interview
node tools/clis/research-agent.js run --yes \
  --domain acme.ae --market "specialty coffee" --geo AE --lang en,ar \
  --goal "lead gen" --budget "5k-15k"

# Preview the probe plan + key readiness without calling anything
node tools/clis/research-agent.js plan --domain acme.ae --market "coffee"

# List Research Store prospects ranked by fit score (what Step 2 polls)
node tools/clis/research-agent.js status
```

### `run` flags

| Flag | Default | Meaning |
|------|---------|---------|
| `--domain <d>` | required | Target domain (prospect or client) |
| `--industry "<industry>"` | — | Broad category; used for Track C if `--market` is blank |
| `--market "<category>"` | — | Narrower category; enables Track C (market demand + trends) |
| `--geo <CC>` | `AE` | Geo for demand/benchmarks |
| `--lang <en,ar>` | `en,ar` | Languages the analysis reasons about |
| `--goal <g>` | — | Primary objective; tailors the Opportunity Brief |
| `--budget <b>` | — | Monthly budget range; tailors the Opportunity Brief |
| `--competitors auto\|c1,c2` | `auto` | Pass explicit rivals or auto-discover |
| `--exclude "<...>"` | — | "Do not waste time researching" — see above |
| `--num-competitors <n>` | `5` | How many lookalikes to discover |
| `--depth prospect\|deepdive` | `prospect` | `deepdive` adds per-rival traffic probes |
| `--model <id>` | `claude-sonnet-5` | Analyze model (use an Opus-class id for depth) |
| `--out <dir>` | `research-store` | Research Store root (this run's output) |
| `--clients-dir <dir>` | `clients` | Client Info Document root (durable client memory) |
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

## Client Info Document — durable memory, separate from the Research Store

Every confirmed intake (interactive, `--from-requirements`, or the `intake`
command) is logged to the client's own memory folder — this is durable, cross-run
memory, distinct from `research-store/` which is this run's research output:

```
clients/<domain>/
├── client-info.md      # human-readable latest snapshot
├── client-info.json    # machine-readable latest snapshot
└── intake-log.jsonl    # append-only: every confirmed intake, timestamped
```

This mirrors the Layer 0 per-client memory convention in
`docs/108media-omni-channel-architecture.md` (`brand-dna.md`,
`learnings.jsonl`, ...) — `intake-log.jsonl` never overwrites, only appends,
so nothing an operator has ever said about a client is lost, even across
scheduled/unattended runs. `RESEARCH_STORE.json.clientInfo` points back to
the `client-info.md` for that domain.

## Related

- Skills: `seo-audit`, `cro`, `customer-research`, `competitor-profiling`,
  `competitors`, `prospecting`, `cold-email`
- CLIs: `ahrefs`, `semrush`, `dataforseo`, `similarweb`, `exa`,
  `keywords-everywhere`
- Scraping guides: `firecrawl.md`, `browserbase.md`, `exa.md`
