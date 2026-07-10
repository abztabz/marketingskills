#!/usr/bin/env node
/**
 * SocialScout — a compliant, human-in-the-loop content-assist pipeline for
 * Reddit + Quora. It NEVER auto-publishes: drafts land in a review queue and a
 * human must approve before anything is posted.
 *
 * CLI commands:
 *   find [--mock] [--platform reddit|quora] [--urls "u1,u2"]
 *   draft
 *   review [--list] | review --approve <id> [--edit "text"] | review --reject <id>
 *   publish [--dry-run | --live]
 *   serve [--port 7821]      # browser review app
 *
 * Core functions are exported so the web server (server.mjs) can drive the same
 * pipeline in-process. Zero dependencies. Node 18+.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
// Config precedence: SOCIALSCOUT_CONFIG_JSON env (for hosted deploys, no commit) >
// the user's config.json > the working demo config > the blank template.
const pick = (...names) => names.map((n) => path.join(DIR, n)).find((p) => fs.existsSync(p));
const CONFIG_PATH = pick('config.json', 'config.demo.json', 'config.example.json');
export const CONFIG = process.env.SOCIALSCOUT_CONFIG_JSON
  ? JSON.parse(process.env.SOCIALSCOUT_CONFIG_JSON)
  : JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const QUEUE_PATH = path.join(DIR, 'queue.json');
const POLICY_CACHE = path.join(DIR, '.subreddit-policy.json');
const UA = 'web:socialscout:0.2 (compliant content-assist; human-reviewed)';

export const loadQueue = () => (fs.existsSync(QUEUE_PATH) ? JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8')) : []);
const saveQueue = (q) => fs.writeFileSync(QUEUE_PATH, JSON.stringify(q, null, 2));

// ---------- opportunity scoring ----------
export function scoreOpportunity(post) {
  const text = `${post.title} ${post.selftext || ''}`.toLowerCase();
  let score = 0; const matched = [];
  for (const kw of CONFIG.targets.keywords) if (text.includes(kw.toLowerCase())) { score += 2; matched.push(kw); }
  if (/\?|how|what|need|help|recommend|anyone/.test(text)) score += 1;
  if ((post.num_comments ?? 0) < 8) score += 1;
  const ageDays = (Date.now() / 1000 - (post.created_utc || 0)) / 86400;
  if (ageDays < 3) score += 1;
  return { score, matched };
}

// ---------- subreddit self-promo guard ----------
const NO_PROMO_RX = /(no|zero|not?)\s*(self[-\s]?)?(promo|promotion|advertis|soliciting|marketing|spam)/i;
function policyCache() { try { return JSON.parse(fs.readFileSync(POLICY_CACHE, 'utf8')); } catch { return {}; } }
function savePolicy(c) { try { fs.writeFileSync(POLICY_CACHE, JSON.stringify(c, null, 2)); } catch {} }

/** Returns true if the subreddit bans self-promotion. Config list wins; otherwise
 *  fetches /r/<sub>/about/rules.json when online. Cached. Fails open (false). */
export async function subredditBansPromo(sub, { online = true } = {}) {
  const listed = (CONFIG.rules.noPromoSubreddits || []).map((s) => s.toLowerCase());
  if (listed.includes(sub.toLowerCase())) return true;
  const cache = policyCache();
  if (sub in cache) return cache[sub];
  if (!online) return false;
  try {
    const res = await fetch(`https://www.reddit.com/r/${sub}/about/rules.json`, { headers: { 'User-Agent': UA } });
    if (!res.ok) return false;
    const json = await res.json();
    const blob = JSON.stringify(json?.rules || json || '');
    const bans = NO_PROMO_RX.test(blob);
    cache[sub] = bans; savePolicy(cache);
    return bans;
  } catch { return false; }
}

// ---------- Reddit fetch ----------
// Optional discovery path: when FIRECRAWL_API_KEY is set, Reddit's public
// search.json is fetched through Firecrawl's scrape API instead of directly.
// Firecrawl renders with a real browser, which gets past Reddit's anonymous-
// request blocking (HTTP 403) without needing Reddit OAuth credentials.
// Read-only discovery only — SocialScout never posts through Firecrawl.
async function firecrawlJson(url, log) {
  const key = process.env.FIRECRAWL_API_KEY;
  const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, formats: ['rawHtml'] }),
  });
  if (!res.ok) throw new Error(`Firecrawl HTTP ${res.status}`);
  const json = await res.json();
  const raw = json?.data?.rawHtml ?? json?.rawHtml ?? '';
  const start = raw.indexOf('{'); const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Firecrawl: no JSON in response');
  return JSON.parse(raw.slice(start, end + 1));
}

async function redditToken() {
  const { REDDIT_CLIENT_ID: id, REDDIT_CLIENT_SECRET: secret, REDDIT_USERNAME: user, REDDIT_PASSWORD: pass } = process.env;
  if (!id || !secret || !user || !pass) return null;
  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'), 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', username: user, password: pass }),
  });
  if (!res.ok) throw new Error(`Reddit auth failed: ${res.status}`);
  return (await res.json()).access_token;
}

async function fetchReddit(log = console.error) {
  const useFirecrawl = !!process.env.FIRECRAWL_API_KEY;
  const token = useFirecrawl ? null : await redditToken().catch(() => null);
  const base = token ? 'https://oauth.reddit.com' : 'https://www.reddit.com';
  const headers = { 'User-Agent': UA, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const out = [];
  for (const sub of CONFIG.targets.subreddits) {
    const q = encodeURIComponent(CONFIG.targets.keywords.join(' OR '));
    const url = `${base}/r/${sub}/search.json?q=${q}&restrict_sr=1&sort=new&limit=15`;
    try {
      const json = useFirecrawl ? await firecrawlJson(url, log) : await (async () => {
        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })();
      for (const ch of json?.data?.children ?? []) {
        const d = ch.data;
        out.push({ id: d.name, platform: 'reddit', subreddit: d.subreddit, title: d.title, selftext: d.selftext, url: `https://www.reddit.com${d.permalink}`, num_comments: d.num_comments, ups: d.ups, created_utc: d.created_utc });
      }
      await new Promise((r) => setTimeout(r, 1200));
    } catch (e) { log(`  ! r/${sub}: ${e.message}`); }
  }
  return out;
}

// ---------- Quora discovery (read-only; no posting API) ----------
/** Quora has no API. We support two honest paths:
 *  - --mock: bundled fixtures.
 *  - --urls: you paste Quora question URLs you found; we fetch each public page
 *    and read its og:title for drafting. Posting is always manual. */
async function fetchQuoraUrls(urls, log = console.error) {
  const out = [];
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!res.ok) { log(`  ! ${url}: HTTP ${res.status}`); continue; }
      const html = await res.text();
      const m = html.match(/<meta property="og:title" content="([^"]+)"/i) || html.match(/<title>([^<]+)<\/title>/i);
      out.push({ id: 'q_' + Buffer.from(url).toString('base64').slice(0, 12), platform: 'quora', subreddit: 'quora', title: (m ? m[1] : url).replace(/\s*-\s*Quora\s*$/, ''), selftext: '', url, num_comments: 0, created_utc: Date.now() / 1000 });
      await new Promise((r) => setTimeout(r, 1500));
    } catch (e) { log(`  ! ${url}: ${e.message}`); }
  }
  return out;
}

// ---------- draft generation ----------
function systemPrompt(noBrand) {
  const B = CONFIG.brand;
  if (noBrand) return `You write a helpful public Q&A reply. This community bans self-promotion, so do NOT mention any company, brand, product, or link. Just answer the question well and plainly, like a knowledgeable peer. Under ${CONFIG.rules.maxDraftWords} words. Return ONLY the reply text.`;
  return `You write replies on behalf of someone who works with ${B.name} (${B.oneLiner}).
Hard rules — breaking them gets the account banned:
1. ANSWER THE ACTUAL QUESTION first and completely; be useful even if they never become a customer.
2. Voice: ${B.voice}. Plain language, no marketing speak, no hype.
3. Disclose the affiliation naturally only if you reference ${B.name}: e.g. "${B.disclosure}"
4. No link unless the thread explicitly asks for resources.
5. Mention ${B.name} only if truly relevant; otherwise don't.
6. Under ${CONFIG.rules.maxDraftWords} words. No headers/bullet-spam; write like a human.
7. Never invent specifics, prices, or guarantees.
Return ONLY the reply text.`;
}
function templateDraft(item) {
  const topic = (item.matched && item.matched[0]) || 'this';
  const close = item.noPromo ? '' : `\n\nHappy to share a simple checklist if that'd help. (${CONFIG.brand.disclosure})`;
  return `Been through this side of things, so a few practical pointers on ${topic}:\n\nStart by writing down exactly what's being asked of you and work backward from the requirement — most of the stress here comes from not having one clear checklist. Keep records dated and in one place, and don't rely on memory for anything renewal-based.${close}`;
}
async function aiDraft(item, log = console.error) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { text: templateDraft(item), engine: 'template' };
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-opus-4-8', max_tokens: 600, system: systemPrompt(item.noPromo), messages: [{ role: 'user', content: `Platform: ${item.platform}\nForum: ${item.subreddit}\nTitle: ${item.title}\nBody: ${item.body || item.selftext || '(none)'}\n\nWrite the reply.` }] }),
    });
    if (!res.ok) { log(`  ! Claude HTTP ${res.status}; using template`); return { text: templateDraft(item), engine: 'template-fallback' }; }
    const json = await res.json();
    return { text: json.content?.[0]?.text?.trim() || templateDraft(item), engine: 'claude' };
  } catch (e) { log(`  ! Claude: ${e.message}; using template`); return { text: templateDraft(item), engine: 'template-fallback' }; }
}

// ---------- exported core (used by CLI and server) ----------
export async function findOpportunities({ mock = false, platform = 'reddit', urls = [], log = console.error } = {}) {
  let posts = [];
  if (mock) {
    const file = platform === 'quora' ? 'quora-sample.json' : 'reddit-sample.json';
    posts = JSON.parse(fs.readFileSync(path.join(DIR, 'fixtures', file), 'utf8'));
  } else if (platform === 'quora') {
    posts = await fetchQuoraUrls(urls, log);
  } else {
    posts = await fetchReddit(log);
  }
  posts = posts.map((p) => ({ ...p, platform: p.platform || platform })); // stamp platform on fixtures
  const min = CONFIG.rules.minOpportunityScore;
  const mode = CONFIG.rules.noPromoMode || 'no-brand'; // 'no-brand' | 'skip'
  const scored = [];
  for (const p of posts) {
    const s = scoreOpportunity(p);
    if (s.score < min) continue;
    let noPromo = false;
    if (p.platform === 'reddit') noPromo = await subredditBansPromo(p.subreddit, { online: !mock });
    if (noPromo && mode === 'skip') continue;
    scored.push({ ...p, ...s, noPromo });
  }
  scored.sort((a, b) => b.score - a.score);
  const queue = loadQueue(); let added = 0;
  for (const p of scored) {
    if (queue.find((q) => q.postId === p.id)) continue;
    queue.push({ id: `op_${p.id}`, postId: p.id, platform: p.platform, subreddit: p.subreddit, title: p.title, body: p.selftext, url: p.url, score: p.score, matched: p.matched, noPromo: p.noPromo, status: 'new', draft: null, foundAt: new Date().toISOString() });
    added++;
  }
  saveQueue(queue);
  return { scanned: posts.length, relevant: scored.length, added, opportunities: scored };
}

export async function draftPending({ log = console.error } = {}) {
  const queue = loadQueue(); const todo = queue.filter((q) => q.status === 'new'); const done = [];
  for (const item of todo) {
    const { text, engine } = await aiDraft(item, log);
    item.draft = text; item.draftEngine = engine; item.status = 'pending';
    done.push({ id: item.id, engine });
  }
  saveQueue(queue);
  return { drafted: done.length, engine: process.env.ANTHROPIC_API_KEY ? 'claude' : 'template', items: done };
}

export function setReview(id, status, edit) {
  const queue = loadQueue(); const item = queue.find((q) => q.id === id);
  if (!item) return { ok: false, error: `no item ${id}` };
  item.status = status; if (typeof edit === 'string' && edit.trim()) item.draft = edit;
  saveQueue(queue); return { ok: true, item };
}

export async function publish({ live = false, log = console.error } = {}) {
  const queue = loadQueue(); const approved = queue.filter((q) => q.status === 'approved');
  const results = [];
  const token = live ? await redditToken().catch(() => null) : null;
  if (live && approved.some((a) => a.platform === 'reddit') && !token) return { ok: false, error: 'live Reddit requires REDDIT_* env vars' };
  for (const item of approved.filter((a) => a.platform === 'reddit')) {
    if (!live) { results.push({ id: item.id, action: 'would-post', url: item.url }); continue; }
    const res = await fetch('https://oauth.reddit.com/api/comment', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ api_type: 'json', thing_id: item.postId, text: item.draft }) });
    if (res.ok) { item.status = 'posted'; item.postedAt = new Date().toISOString(); results.push({ id: item.id, action: 'posted', url: item.url }); }
    else results.push({ id: item.id, action: 'failed', status: res.status, url: item.url });
    await new Promise((r) => setTimeout(r, 5000));
  }
  saveQueue(queue);
  const quora = approved.filter((q) => q.platform === 'quora');
  let quoraFile = null;
  if (quora.length) {
    quoraFile = path.join(DIR, 'quora-drafts.md');
    fs.writeFileSync(quoraFile, quora.map((q) => `## ${q.title}\n${q.url}\n\n${q.draft}\n`).join('\n---\n'));
  }
  return { ok: true, dry: !live, results, quoraExported: quora.length, quoraFile };
}

// ---------- CLI ----------
const c = { dim: (s) => `\x1b[2m${s}\x1b[0m`, b: (s) => `\x1b[1m${s}\x1b[0m`, g: (s) => `\x1b[32m${s}\x1b[0m`, y: (s) => `\x1b[33m${s}\x1b[0m`, r: (s) => `\x1b[31m${s}\x1b[0m`, c: (s) => `\x1b[36m${s}\x1b[0m` };
const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); if (i === -1) return def; const v = process.argv[i + 1]; return v && !v.startsWith('--') ? v : true; };
const has = (name) => process.argv.includes(`--${name}`);

async function cliFind() {
  const platform = arg('platform', 'reddit');
  const urls = typeof arg('urls') === 'string' ? arg('urls').split(',').map((s) => s.trim()).filter(Boolean) : [];
  const r = await findOpportunities({ mock: has('mock'), platform, urls, log: (m) => console.error(c.y(m)) });
  console.log(`\n${c.b('SocialScout · find')} ${has('mock') ? c.dim('(mock)') : ''} ${c.dim('platform=' + platform)}`);
  console.log(c.dim(`Scanned ${r.scanned} · ${r.relevant} relevant · ${r.added} new\n`));
  for (const p of r.opportunities) console.log(`  ${c.g('●')} [${c.c('score ' + p.score)}] r/${p.subreddit} — ${c.b(p.title)}${p.noPromo ? c.y('  [no-promo sub → brand-free draft]') : ''}\n     ${c.dim('matched: ' + (p.matched.join(', ') || '—'))}`);
  console.log(`\nNext: ${c.b('node socialscout.mjs draft')}\n`);
}
async function cliDraft() {
  const r = await draftPending({ log: (m) => console.error(c.y(m)) });
  if (!r.drafted) return console.log(c.y('\nNo new opportunities to draft. Run `find` first.\n'));
  console.log(`\n${c.b('SocialScout · draft')} ${process.env.ANTHROPIC_API_KEY ? c.dim('(Claude)') : c.y('(template fallback — set ANTHROPIC_API_KEY)')}`);
  for (const item of loadQueue().filter((q) => q.status === 'pending')) {
    console.log(`\n  ${c.c('✎')} r/${item.subreddit} — ${c.b(item.title)} ${c.dim('[' + item.id + ']')}`);
    console.log(item.draft.split('\n').map((l) => '     ' + c.dim(l)).join('\n'));
  }
  console.log(`\nReview: ${c.b('node socialscout.mjs review --list')}\n`);
}
function cliReview() {
  if (has('approve') || has('reject')) {
    const id = arg('approve') || arg('reject');
    const r = setReview(id, has('approve') ? 'approved' : 'rejected', arg('edit'));
    return console.log(r.ok ? (has('approve') ? c.g('✓ approved ') : c.r('✗ rejected ')) + id : c.r(r.error));
  }
  const pending = loadQueue().filter((q) => q.status === 'pending');
  console.log(`\n${c.b('SocialScout · review queue')}\n`);
  if (!pending.length) console.log(c.dim('  Nothing pending.\n'));
  for (const item of pending) {
    console.log(`  ${c.y('⧗ pending')} ${c.dim(item.id)} · ${item.platform}/${item.subreddit} · ${c.c('score ' + item.score)}${item.noPromo ? c.y(' · no-promo') : ''}`);
    console.log(`     ${c.b(item.title)}\n     ${c.dim(item.url)}`);
    console.log(item.draft.split('\n').map((l) => '     │ ' + l).join('\n'));
    console.log(c.dim(`     node socialscout.mjs review --approve ${item.id}   |   --reject ${item.id}\n`));
  }
}
async function cliPublish() {
  const r = await publish({ live: has('live'), log: (m) => console.error(c.y(m)) });
  console.log(`\n${c.b('SocialScout · publish')} ${r.dry ? c.y('(DRY RUN — add --live to post)') : c.r('(LIVE)')}\n`);
  if (!r.ok) return console.log(c.r('  ' + r.error + '\n'));
  for (const x of r.results) console.log(`  ${x.action === 'posted' ? c.g('✓ posted') : x.action === 'failed' ? c.r('✗ failed') : c.c('→ would post')} ${x.url}`);
  if (r.quoraExported) console.log(c.c(`  ↪ ${r.quoraExported} Quora draft(s) → quora-drafts.md (paste manually)`));
  console.log();
}
async function cliServe() {
  const { startServer } = await import('./server.mjs');
  startServer({ port: Number(arg('port', 7821)) });
}

const HELP = `${c.b('SocialScout')} — compliant, human-reviewed content assist for Reddit + Quora

  node socialscout.mjs find [--mock] [--platform reddit|quora] [--urls "u1,u2"]
  node socialscout.mjs draft
  node socialscout.mjs review [--list] | --approve <id> [--edit "text"] | --reject <id>
  node socialscout.mjs publish [--dry-run|--live]
  node socialscout.mjs serve [--port 7821]      browser review app

Nothing posts without an explicit approval and --live.
Env (Reddit posting): REDDIT_CLIENT_ID/SECRET/USERNAME/PASSWORD   Env (AI drafts): ANTHROPIC_API_KEY`;

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const cmd = process.argv[2];
  ({ find: cliFind, draft: cliDraft, review: cliReview, publish: cliPublish, serve: cliServe }[cmd] || (() => console.log(HELP)))();
}
