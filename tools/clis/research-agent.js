#!/usr/bin/env node
//
// research-agent — Layer 1 Research orchestrator for the 108 Media Agency OS.
//
// Runs the full "Step 1: Research" pipeline for one target and writes a
// Research Store that Step 2 (Demand Generation) consumes:
//
//   collect (customer + competitor + market tracks)
//      -> filter (dedupe, drop errors/empties, stamp source+date)
//      -> distill (typed records)
//      -> analyze (frontier model -> Opportunity Brief, or emit a prompt pack)
//      -> emit  research-store/<slug>/{RESEARCH_STORE.json, brief.*, gap-matrix.md, ...}
//
// Zero dependencies (Node 18+). It ORCHESTRATES the single-vendor sibling CLIs
// in this folder (ahrefs, semrush, similarweb, dataforseo, exa) plus inline
// Firecrawl + Anthropic calls. Every collector degrades gracefully: a missing
// API key or failed probe is recorded and skipped, never fatal.
//
// See tools/integrations/research-agent.md for the full guide.

const fs = require('fs')
const path = require('path')
const { spawn } = require('child_process')

// ----------------------------------------------------------------------------
// arg parsing (matches the sibling CLIs' convention)
// ----------------------------------------------------------------------------
function parseArgs(argv) {
  const result = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg.startsWith('--')) {
      const key = arg.slice(2)
      const next = argv[i + 1]
      if (next && !next.startsWith('--')) { result[key] = next; i++ }
      else { result[key] = true }
    } else {
      result._.push(arg)
    }
  }
  return result
}

const args = parseArgs(process.argv.slice(2))
const [cmd, ...rest] = args._

function slugify(s) {
  return String(s).toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    .replace(/[^a-z0-9.-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}
function bareDomain(s) {
  return String(s).toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '')
}
function nowISO() { return new Date().toISOString() }

// ----------------------------------------------------------------------------
// collector plan — maps the three research tracks to concrete probes.
// Each probe: { track, label, kind, tool?, argv?, needs:[env], run? }
// kind 'cli'      -> spawn a sibling CLI (process.execPath sibling.js ...argv)
// kind 'firecrawl'-> inline Firecrawl map+scrape
// kind 'exa'      -> spawn exa.js (competitor discovery / market trends)
// ----------------------------------------------------------------------------
function buildPlan(cfg) {
  const D = cfg.domain
  const geo = cfg.geo
  const probes = []

  // --- Track A: Customer research (the target's own status) ---
  probes.push({ track: 'customer', label: 'website-scrape', kind: 'firecrawl', needs: ['FIRECRAWL_API_KEY'], target: D })
  probes.push({ track: 'customer', label: 'seo-domain-rating', kind: 'cli', tool: 'ahrefs', argv: ['domain-rating', 'get', '--target', D], needs: ['AHREFS_API_KEY'] })
  probes.push({ track: 'customer', label: 'seo-top-pages', kind: 'cli', tool: 'ahrefs', argv: ['top-pages', 'list', '--target', D], needs: ['AHREFS_API_KEY'] })
  probes.push({ track: 'customer', label: 'seo-overview', kind: 'cli', tool: 'semrush', argv: ['domain', 'overview', '--domain', D], needs: ['SEMRUSH_API_KEY'] })
  probes.push({ track: 'customer', label: 'seo-organic-keywords', kind: 'cli', tool: 'semrush', argv: ['domain', 'organic', '--domain', D], needs: ['SEMRUSH_API_KEY'] })
  probes.push({ track: 'customer', label: 'traffic-visits', kind: 'cli', tool: 'similarweb', argv: ['traffic', 'visits', '--domain', D], needs: ['SIMILARWEB_API_KEY'] })
  probes.push({ track: 'customer', label: 'traffic-sources', kind: 'cli', tool: 'similarweb', argv: ['sources', 'referrals', '--domain', D], needs: ['SIMILARWEB_API_KEY'] })

  // --- Track B: Competitor research ---
  // Discovery first (semrush competitors + exa lookalikes), then lite probes.
  probes.push({ track: 'competitor', label: 'competitors-semrush', kind: 'cli', tool: 'semrush', argv: ['domain', 'competitors', '--domain', D], needs: ['SEMRUSH_API_KEY'] })
  probes.push({ track: 'competitor', label: 'competitors-lookalike', kind: 'cli', tool: 'exa', argv: ['find-similar', '--url', 'https://' + D, '--num', String(cfg.numCompetitors)], needs: ['EXA_API_KEY'] })
  for (const c of cfg.competitors) {
    probes.push({ track: 'competitor', label: `rival-dr:${c}`, kind: 'cli', tool: 'ahrefs', argv: ['domain-rating', 'get', '--target', c], needs: ['AHREFS_API_KEY'], rival: c })
    if (cfg.depth === 'deepdive') {
      probes.push({ track: 'competitor', label: `rival-traffic:${c}`, kind: 'cli', tool: 'similarweb', argv: ['traffic', 'visits', '--domain', c], needs: ['SIMILARWEB_API_KEY'], rival: c })
    }
  }

  // --- Track C: Market research ---
  if (cfg.market) {
    probes.push({ track: 'market', label: 'demand-volume', kind: 'cli', tool: 'dataforseo', argv: ['keywords', 'volume', 'for-keywords', '--keywords', cfg.market, '--location', geo], needs: ['DATAFORSEO_LOGIN', 'DATAFORSEO_PASSWORD'] })
    probes.push({ track: 'market', label: 'trends-press', kind: 'cli', tool: 'exa', argv: ['search', '--query', `${cfg.market} marketing trends ${geo} ${new Date().getFullYear()}`, '--num', '6', '--summary'], needs: ['EXA_API_KEY'] })
  }

  return probes
}

// ----------------------------------------------------------------------------
// collectors
// ----------------------------------------------------------------------------
function envReady(needs) { return needs.every((k) => process.env[k]) }

function runCli(tool, argv) {
  return new Promise((resolve) => {
    const file = path.join(__dirname, `${tool}.js`)
    if (!fs.existsSync(file)) { resolve({ error: `sibling CLI not found: ${tool}.js` }); return }
    const child = spawn(process.execPath, [file, ...argv], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = '', err = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    child.on('close', () => {
      const text = out.trim() || err.trim()
      try { resolve(JSON.parse(text)) }
      catch { resolve({ error: 'non-json output', raw: text.slice(0, 2000) }) }
    })
    child.on('error', (e) => resolve({ error: e.message }))
  })
}

async function runFirecrawl(target) {
  const key = process.env.FIRECRAWL_API_KEY
  const base = 'https://api.firecrawl.dev'
  const scrape = async (url) => {
    const res = await fetch(`${base}/v1/scrape`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, formats: ['markdown'] }),
    })
    const j = await res.json().catch(() => ({}))
    return j?.data?.markdown || j?.markdown || null
  }
  // Map the site, then scrape a few high-signal pages.
  let urls = [`https://${target}`]
  try {
    const m = await fetch(`${base}/v1/map`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: `https://${target}`, limit: 60 }),
    })
    const mj = await m.json().catch(() => ({}))
    const found = mj?.links || mj?.urls || []
    const want = /(pricing|about|service|product|contact|team|home)/i
    const key_pages = found.filter((u) => want.test(u)).slice(0, 4)
    urls = [`https://${target}`, ...key_pages]
  } catch { /* map optional; fall back to homepage only */ }
  const pages = {}
  for (const u of urls.slice(0, 5)) {
    try { const md = await scrape(u); if (md) pages[u] = md.slice(0, 8000) } catch { /* skip page */ }
  }
  if (!Object.keys(pages).length) return { error: 'firecrawl returned no content' }
  return { pages }
}

async function collect(probes, opts) {
  const results = []
  const pool = Math.max(1, Number(opts.concurrency) || 4)
  let idx = 0
  async function worker() {
    while (idx < probes.length) {
      const p = probes[idx++]
      const rec = { track: p.track, label: p.label, tool: p.tool || p.kind, argv: p.argv, at: nowISO() }
      if (!envReady(p.needs)) { rec.status = 'skipped'; rec.reason = `missing ${p.needs.filter((k) => !process.env[k]).join(', ')}`; results.push(rec); continue }
      try {
        const data = p.kind === 'firecrawl' ? await runFirecrawl(p.target) : await runCli(p.tool, p.argv)
        rec.data = data
        rec.status = data && !data.error ? 'ok' : 'error'
        if (data && data.error) rec.reason = data.error
        if (p.rival) rec.rival = p.rival
      } catch (e) { rec.status = 'error'; rec.reason = e.message }
      results.push(rec)
    }
  }
  await Promise.all(Array.from({ length: pool }, worker))
  return results
}

// ----------------------------------------------------------------------------
// filter -> distill (deterministic)
// ----------------------------------------------------------------------------
function filterResults(raw) {
  const seen = new Set()
  const kept = []
  const dropped = []
  for (const r of raw) {
    const sig = `${r.tool}|${(r.argv || []).join(' ')}`
    if (r.status !== 'ok') { dropped.push({ label: r.label, status: r.status, reason: r.reason }); continue }
    if (seen.has(sig)) { dropped.push({ label: r.label, status: 'duplicate' }); continue }
    seen.add(sig)
    kept.push(r)
  }
  return { kept, dropped }
}

// Pull a number from a vendor payload by trying a list of likely key paths.
function firstNumber(obj, keys) {
  for (const k of keys) {
    const v = k.split('.').reduce((o, kk) => (o == null ? o : o[kk]), obj)
    const n = typeof v === 'string' ? Number(v.replace(/[,%]/g, '')) : v
    if (typeof n === 'number' && !Number.isNaN(n)) return n
  }
  return null
}

function distill(kept, cfg) {
  const d = {
    domain: cfg.domain,
    customer: { website: {}, seo: {}, traffic: {} },
    competitor: { discovered: [], rivals: {} },
    market: { demand: null, trends: [] },
    provenance: [],
  }
  for (const r of kept) {
    d.provenance.push({ label: r.label, tool: r.tool, at: r.at })
    const x = r.data || {}
    if (r.label === 'website-scrape') {
      d.customer.website.pages = Object.keys(x.pages || {})
      d.customer.website.sample = Object.values(x.pages || {})[0]?.slice(0, 1200) || null
    } else if (r.label === 'seo-domain-rating') {
      d.customer.seo.domainRating = firstNumber(x, ['domain_rating', 'domainRating', 'data.domain_rating', 'metrics.domain_rating'])
    } else if (r.label === 'seo-overview' || r.label === 'seo-organic-keywords') {
      d.customer.seo.organicKeywords = firstNumber(x, ['organic_keywords', 'organicKeywords', 'data.organic_keywords']) ?? d.customer.seo.organicKeywords
      d.customer.seo.organicTraffic = firstNumber(x, ['organic_traffic', 'organicTraffic', 'data.organic_traffic']) ?? d.customer.seo.organicTraffic
    } else if (r.label === 'seo-top-pages') {
      d.customer.seo.topPages = Array.isArray(x.pages || x.data) ? (x.pages || x.data).length : undefined
    } else if (r.label === 'traffic-visits') {
      d.customer.traffic.visits = firstNumber(x, ['visits', 'value', 'data.visits'])
    } else if (r.label === 'traffic-sources') {
      d.customer.traffic.sources = x
    } else if (r.label === 'competitors-semrush' || r.label === 'competitors-lookalike') {
      const list = x.results || x.data || x.competitors || []
      for (const it of Array.isArray(list) ? list : []) {
        const dom = bareDomain(it.url || it.domain || it.target || '')
        if (dom && !d.competitor.discovered.includes(dom) && dom !== cfg.domain) d.competitor.discovered.push(dom)
      }
    } else if (r.rival && r.label.startsWith('rival-dr')) {
      d.competitor.rivals[r.rival] = d.competitor.rivals[r.rival] || {}
      d.competitor.rivals[r.rival].domainRating = firstNumber(x, ['domain_rating', 'domainRating', 'data.domain_rating'])
    } else if (r.rival && r.label.startsWith('rival-traffic')) {
      d.competitor.rivals[r.rival] = d.competitor.rivals[r.rival] || {}
      d.competitor.rivals[r.rival].visits = firstNumber(x, ['visits', 'value', 'data.visits'])
    } else if (r.label === 'demand-volume') {
      d.market.demand = x
    } else if (r.label === 'trends-press') {
      const list = x.results || x.data || []
      d.market.trends = (Array.isArray(list) ? list : []).slice(0, 6).map((it) => ({ title: it.title, url: it.url, summary: it.summary || null }))
    }
  }
  return d
}

// ----------------------------------------------------------------------------
// analyze -> Opportunity Brief (frontier model, or emit a prompt pack)
// ----------------------------------------------------------------------------
function analysisPrompt(distilled, cfg) {
  return [
    `You are the Lead Research Analyst for 108 Media, an AI-native marketing agency in the UAE.`,
    `Analyze the structured research below for the prospect "${cfg.domain}" (market: ${cfg.market || 'unspecified'}, geo: ${cfg.geo}, languages: ${cfg.lang.join('+')}).`,
    ``,
    `Produce ONE JSON object, no prose, with this exact shape:`,
    `{`,
    `  "fit_score": <0-100 how good a fit for 108 Media>,`,
    `  "estimated_monthly_value_usd": <number>,`,
    `  "gaps": [ { "gap": "<verifiable, specific>", "evidence": "<cite a number/fact from the data>", "severity": 1-10, "opportunity": "<what 108 Media would do>" } ],  // 3-5 items, ranked`,
    `  "outreach_hook": "<one sentence a first-touch email opens with, citing a real finding>",`,
    `  "market_playbook": { "demand_note": "<AR vs EN demand insight>", "seasonal": "<relevant GCC moment>", "benchmark_note": "<realistic target>" },`,
    `  "confidence": "high|medium|low",`,
    `  "notes": "<flag any conflicting or thin evidence>"`,
    `}`,
    ``,
    `Rules: every gap must cite a real number or fact from the data. If evidence is thin or conflicting, say so in "notes" and lower "confidence" — do not invent figures.`,
    ``,
    `RESEARCH DATA:`,
    '```json',
    JSON.stringify(distilled, null, 2),
    '```',
  ].join('\n')
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fenced ? fenced[1] : text
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  try { return JSON.parse(body.slice(start, end + 1)) } catch { return null }
}

async function analyzeWithClaude(distilled, cfg) {
  const key = process.env.ANTHROPIC_API_KEY
  const model = cfg.model
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 2000, messages: [{ role: 'user', content: analysisPrompt(distilled, cfg) }] }),
  })
  const j = await res.json().catch(() => ({}))
  if (j.error) return { error: j.error.message || 'anthropic error' }
  const text = (j.content || []).map((b) => b.text || '').join('\n')
  const brief = extractJson(text)
  return brief ? { brief } : { error: 'could not parse brief from model output', raw: text.slice(0, 1500) }
}

// Deterministic signal summary — always available, even with no LLM key.
function signalSummary(distilled) {
  const dr = distilled.customer.seo.domainRating
  const rivals = Object.entries(distilled.competitor.rivals)
  const strongerRivals = rivals.filter(([, v]) => dr != null && v.domainRating != null && v.domainRating > dr).map(([k]) => k)
  return {
    domainRating: dr ?? 'unknown',
    organicKeywords: distilled.customer.seo.organicKeywords ?? 'unknown',
    monthlyVisits: distilled.customer.traffic.visits ?? 'unknown',
    competitorsFound: distilled.competitor.discovered.length,
    rivalsOutrankingByDR: strongerRivals,
    marketTrendsCaptured: distilled.market.trends.length,
    websitePagesScraped: (distilled.customer.website.pages || []).length,
  }
}

// ----------------------------------------------------------------------------
// emit Research Store
// ----------------------------------------------------------------------------
function renderBriefMd(brief, cfg, signal) {
  const lines = [`# Opportunity Brief — ${cfg.domain}`, ``, `_Generated ${nowISO()} · geo ${cfg.geo} · ${cfg.lang.join('+')}_`, ``]
  if (brief && brief.gaps) {
    lines.push(`**Fit score:** ${brief.fit_score}/100  ·  **Est. value:** $${brief.estimated_monthly_value_usd}/mo  ·  **Confidence:** ${brief.confidence}`, '')
    lines.push(`**Outreach hook:** ${brief.outreach_hook}`, '', `## Gaps`, '')
    for (const g of brief.gaps) lines.push(`- **${g.gap}** (severity ${g.severity}/10)`, `  - Evidence: ${g.evidence}`, `  - Opportunity: ${g.opportunity}`)
    if (brief.market_playbook) {
      lines.push('', `## Market playbook`, `- Demand: ${brief.market_playbook.demand_note}`, `- Seasonal: ${brief.market_playbook.seasonal}`, `- Benchmark: ${brief.market_playbook.benchmark_note}`)
    }
    if (brief.notes) lines.push('', `## Notes`, brief.notes)
  } else {
    lines.push(`> Analysis pending — no ANTHROPIC_API_KEY at run time. Run \`analysis-prompt.md\` through a frontier model to fill in the brief.`, '')
  }
  lines.push('', `## Deterministic signal summary`, '```json', JSON.stringify(signal, null, 2), '```')
  return lines.join('\n')
}

function renderGapMatrix(distilled) {
  const dr = distilled.customer.seo.domainRating
  const v = distilled.customer.traffic.visits
  const rows = [`| Domain | Domain Rating | Monthly Visits |`, `|---|---:|---:|`, `| **${distilled.domain}** (prospect) | ${dr ?? '?'} | ${v ?? '?'} |`]
  for (const [c, m] of Object.entries(distilled.competitor.rivals)) rows.push(`| ${c} | ${m.domainRating ?? '?'} | ${m.visits ?? '?'} |`)
  for (const c of distilled.competitor.discovered) if (!distilled.competitor.rivals[c]) rows.push(`| ${c} | — | — |`)
  return `# Gap Matrix — ${distilled.domain}\n\n${rows.join('\n')}\n`
}

function writeStore(outRoot, cfg, payload) {
  const slug = slugify(cfg.domain)
  const dir = path.join(outRoot, slug)
  fs.mkdirSync(dir, { recursive: true })
  const w = (f, c) => fs.writeFileSync(path.join(dir, f), typeof c === 'string' ? c : JSON.stringify(c, null, 2))
  w('raw.json', payload.raw)
  w('distilled.json', payload.distilled)
  w('brief.json', payload.brief || { status: 'pending_analysis' })
  w('brief.md', payload.briefMd)
  w('gap-matrix.md', payload.gapMatrix)
  if (payload.promptPack) w('analysis-prompt.md', payload.promptPack)
  const manifest = {
    schema: 'research-store/v1',
    domain: cfg.domain,
    slug,
    generatedAt: nowISO(),
    geo: cfg.geo,
    languages: cfg.lang,
    market: cfg.market || null,
    depth: cfg.depth,
    status: payload.brief ? 'analyzed' : 'collected_pending_analysis',
    fitScore: payload.brief?.fit_score ?? null,
    estimatedMonthlyValueUsd: payload.brief?.estimated_monthly_value_usd ?? null,
    outreachHook: payload.brief?.outreach_hook ?? null,
    topGaps: (payload.brief?.gaps || []).slice(0, 3).map((g) => g.gap),
    competitors: payload.distilled.competitor.discovered,
    signal: payload.signal,
    collection: payload.collectionSummary,
    files: {
      brief: 'brief.json', briefMd: 'brief.md', gapMatrix: 'gap-matrix.md',
      distilled: 'distilled.json', raw: 'raw.json',
      analysisPrompt: payload.promptPack ? 'analysis-prompt.md' : null,
    },
    // The contract for Step 2 (Demand Generation): read this file, rank by
    // fitScore, open outreach with outreachHook / topGaps.
    readyForStep2: !!payload.brief,
  }
  w('RESEARCH_STORE.json', manifest)
  return { dir, manifest }
}

// ----------------------------------------------------------------------------
// commands
// ----------------------------------------------------------------------------
function makeConfig() {
  const domain = bareDomain(args.domain || rest[0] || '')
  const competitors = args.competitors && args.competitors !== 'auto'
    ? String(args.competitors).split(',').map(bareDomain).filter(Boolean) : []
  return {
    domain,
    competitors,
    numCompetitors: Number(args['num-competitors']) || 5,
    market: args.market && args.market !== true ? String(args.market) : '',
    geo: (args.geo && args.geo !== true ? String(args.geo) : 'AE').toUpperCase(),
    lang: String(args.lang && args.lang !== true ? args.lang : 'en,ar').split(',').map((s) => s.trim()),
    depth: args.depth === 'deepdive' ? 'deepdive' : 'prospect',
    model: args.model && args.model !== true ? String(args.model) : 'claude-sonnet-5',
    out: args.out && args.out !== true ? String(args.out) : 'research-store',
    noLlm: !!args['no-llm'],
    concurrency: args.concurrency,
  }
}

async function cmdRun(dry) {
  const cfg = makeConfig()
  if (!cfg.domain) return { error: '--domain required (e.g. --domain acme.ae)' }
  const probes = buildPlan(cfg)

  if (dry || args['dry-run']) {
    return {
      command: 'run', mode: 'dry-run', target: cfg.domain, geo: cfg.geo, market: cfg.market || null,
      depth: cfg.depth, willAnalyzeWith: cfg.noLlm ? 'prompt-pack (no LLM)' : (process.env.ANTHROPIC_API_KEY ? cfg.model : 'prompt-pack (no ANTHROPIC_API_KEY)'),
      probes: probes.map((p) => ({ track: p.track, label: p.label, tool: p.tool || p.kind, needs: p.needs, ready: envReady(p.needs) })),
      output: path.join(cfg.out, slugify(cfg.domain)) + '/',
    }
  }

  const raw = await collect(probes, { concurrency: cfg.concurrency })
  const { kept, dropped } = filterResults(raw)
  const distilled = distill(kept, cfg)

  // If competitors were auto-discovered and none were passed in, do a second
  // lite pass on the top discovered rivals so the gap matrix isn't empty.
  if (!cfg.competitors.length && distilled.competitor.discovered.length) {
    const top = distilled.competitor.discovered.slice(0, Math.min(3, cfg.numCompetitors))
    const extra = []
    for (const c of top) extra.push({ track: 'competitor', label: `rival-dr:${c}`, kind: 'cli', tool: 'ahrefs', argv: ['domain-rating', 'get', '--target', c], needs: ['AHREFS_API_KEY'], rival: c })
    const more = await collect(extra, { concurrency: cfg.concurrency })
    raw.push(...more)
    const f2 = filterResults(raw)
    Object.assign(distilled, distill(f2.kept, cfg))
  }

  const signal = signalSummary(distilled)
  let brief = null, promptPack = null
  const canLlm = !cfg.noLlm && process.env.ANTHROPIC_API_KEY
  if (canLlm) {
    const a = await analyzeWithClaude(distilled, cfg)
    if (a.brief) brief = a.brief
    else promptPack = analysisPrompt(distilled, cfg) + `\n\n<!-- auto-analysis failed: ${a.error} -->`
  } else {
    promptPack = analysisPrompt(distilled, cfg)
  }

  const collectionSummary = {
    probes: probes.length, ok: kept.length, dropped: dropped.length,
    droppedDetail: dropped,
  }
  const payload = {
    raw, distilled, brief, signal, promptPack,
    briefMd: renderBriefMd(brief, cfg, signal),
    gapMatrix: renderGapMatrix(distilled),
    collectionSummary,
  }
  const { dir, manifest } = writeStore(cfg.out, cfg, payload)
  return {
    command: 'run', target: cfg.domain, store: dir + '/',
    status: manifest.status, readyForStep2: manifest.readyForStep2,
    fitScore: manifest.fitScore, topGaps: manifest.topGaps,
    collected: collectionSummary, signal,
    nextStep: manifest.readyForStep2
      ? `Step 2 can read ${path.join(dir, 'RESEARCH_STORE.json')}`
      : `Run ${path.join(dir, 'analysis-prompt.md')} through a frontier model, write brief.json, then flip readyForStep2.`,
  }
}

function cmdStatus() {
  const cfg = makeConfig()
  const root = cfg.out
  if (!fs.existsSync(root)) return { error: `no research store at ${root}/` }
  const entries = []
  for (const slug of fs.readdirSync(root)) {
    const mf = path.join(root, slug, 'RESEARCH_STORE.json')
    if (!fs.existsSync(mf)) continue
    try {
      const m = JSON.parse(fs.readFileSync(mf, 'utf-8'))
      if (cfg.domain && bareDomain(m.domain) !== cfg.domain) continue
      entries.push({ domain: m.domain, status: m.status, fitScore: m.fitScore, readyForStep2: m.readyForStep2, generatedAt: m.generatedAt })
    } catch { /* skip corrupt */ }
  }
  entries.sort((a, b) => (b.fitScore || 0) - (a.fitScore || 0))
  return { store: root + '/', count: entries.length, prospects: entries }
}

const USAGE = {
  tool: 'research-agent — Layer 1 Research orchestrator (Step 1 of the 108 Media Agency OS)',
  commands: {
    run: 'run --domain <d> [--market "<category>"] [--geo AE] [--lang en,ar] [--competitors auto|c1,c2] [--num-competitors 5] [--depth prospect|deepdive] [--model claude-sonnet-5] [--out research-store] [--no-llm] [--dry-run]',
    plan: 'plan --domain <d> ...   (alias for run --dry-run: shows probes + readiness without calling anything)',
    status: 'status [--domain <d>] [--out research-store]   (list Research Store prospects, ranked by fit — what Step 2 polls)',
  },
  pipeline: 'collect (customer+competitor+market via ahrefs/semrush/similarweb/dataforseo/exa/firecrawl) -> filter -> distill -> analyze (Claude or prompt pack) -> Research Store',
  output: 'research-store/<domain>/{RESEARCH_STORE.json, brief.json, brief.md, gap-matrix.md, distilled.json, raw.json}',
  envKeys: 'FIRECRAWL_API_KEY, AHREFS_API_KEY, SEMRUSH_API_KEY, SIMILARWEB_API_KEY, DATAFORSEO_LOGIN+DATAFORSEO_PASSWORD, EXA_API_KEY, ANTHROPIC_API_KEY. Missing keys skip that probe; the run still produces a store.',
  handoff: 'RESEARCH_STORE.json.readyForStep2 === true means Step 2 (Demand Generation) can rank the prospect and open outreach with outreachHook / topGaps.',
}

async function main() {
  let result
  switch (cmd) {
    case 'run': result = await cmdRun(false); break
    case 'plan': result = await cmdRun(true); break
    case 'status': result = cmdStatus(); break
    default: result = { error: cmd ? `unknown command: ${cmd}` : undefined, usage: USAGE }
  }
  console.log(JSON.stringify(result, null, 2))
  if (result && result.error) process.exit(1)
}

main().catch((err) => { console.error(JSON.stringify({ error: err.message })); process.exit(1) })
