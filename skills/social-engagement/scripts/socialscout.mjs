#!/usr/bin/env node
/**
 * SocialScout — a compliant, human-in-the-loop content-assist pipeline for
 * Reddit (and Quora drafts). It NEVER auto-publishes: drafts land in a review
 * queue and a human must approve before anything is posted.
 *
 * Commands:
 *   find     Find relevant questions/threads to answer (Reddit).
 *   draft    Generate value-first answer drafts for found opportunities.
 *   review   List / approve / reject drafts in the queue.
 *   publish  Post APPROVED Reddit drafts (dry-run by default) + export Quora drafts.
 *
 * Zero dependencies. Node 18+. See README.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
// Prefer the user's config.json; fall back to the demo config when running --mock;
// otherwise the blank template (so `node socialscout.mjs` still loads).
const pick = (...names) => names.map((n) => path.join(DIR, n)).find((p) => fs.existsSync(p));
const CONFIG_PATH = process.argv.includes('--mock')
  ? pick('config.json', 'config.demo.json', 'config.example.json')
  : pick('config.json', 'config.example.json');
const CONFIG = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const QUEUE_PATH = path.join(DIR, 'queue.json');
const UA = 'web:socialscout:0.1 (compliant content-assist; human-reviewed)';

// ---------- tiny helpers ----------
const arg = (name, def = undefined) => {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
};
const has = (name) => process.argv.includes(`--${name}`);
const loadQueue = () => (fs.existsSync(QUEUE_PATH) ? JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8')) : []);
const saveQueue = (q) => fs.writeFileSync(QUEUE_PATH, JSON.stringify(q, null, 2));
const c = { dim: (s) => `\x1b[2m${s}\x1b[0m`, b: (s) => `\x1b[1m${s}\x1b[0m`, g: (s) => `\x1b[32m${s}\x1b[0m`, y: (s) => `\x1b[33m${s}\x1b[0m`, r: (s) => `\x1b[31m${s}\x1b[0m`, c: (s) => `\x1b[36m${s}\x1b[0m` };

// ---------- scoring: how good is this opportunity? ----------
function scoreOpportunity(post) {
  const text = `${post.title} ${post.selftext || ''}`.toLowerCase();
  let score = 0;
  const matched = [];
  for (const kw of CONFIG.targets.keywords) {
    if (text.includes(kw.toLowerCase())) { score += 2; matched.push(kw); }
  }
  // questions are better than statements
  if (/\?|how|what|need|help|recommend|anyone/.test(text)) score += 1;
  // fresh + low-answer threads are higher leverage
  if ((post.num_comments ?? 0) < 8) score += 1;
  const ageDays = (Date.now() / 1000 - (post.created_utc || 0)) / 86400;
  if (ageDays < 3) score += 1;
  return { score, matched };
}

// ---------- reddit fetch (public JSON; OAuth optional for higher limits) ----------
async function redditToken() {
  const id = process.env.REDDIT_CLIENT_ID, secret = process.env.REDDIT_CLIENT_SECRET;
  const user = process.env.REDDIT_USERNAME, pass = process.env.REDDIT_PASSWORD;
  if (!id || !secret || !user || !pass) return null;
  const body = new URLSearchParams({ grant_type: 'password', username: user, password: pass });
  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'), 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error(`Reddit auth failed: ${res.status}`);
  return (await res.json()).access_token;
}

async function fetchReddit() {
  const token = await redditToken().catch(() => null);
  const base = token ? 'https://oauth.reddit.com' : 'https://www.reddit.com';
  const headers = { 'User-Agent': UA, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const out = [];
  for (const sub of CONFIG.targets.subreddits) {
    const q = encodeURIComponent(CONFIG.targets.keywords.join(' OR '));
    const url = `${base}/r/${sub}/search.json?q=${q}&restrict_sr=1&sort=new&limit=15`;
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) { console.error(c.y(`  ! r/${sub}: HTTP ${res.status} (skipping)`)); continue; }
      const json = await res.json();
      for (const ch of json?.data?.children ?? []) {
        const d = ch.data;
        out.push({ id: d.name, subreddit: d.subreddit, title: d.title, selftext: d.selftext, url: `https://www.reddit.com${d.permalink}`, num_comments: d.num_comments, ups: d.ups, created_utc: d.created_utc });
      }
      await new Promise((r) => setTimeout(r, 1200)); // be polite
    } catch (e) { console.error(c.y(`  ! r/${sub}: ${e.message}`)); }
  }
  return out;
}

// ---------- draft generation (Claude if key present; template fallback) ----------
function systemPrompt() {
  const B = CONFIG.brand;
  return `You write Reddit replies on behalf of someone who works with ${B.name} (${B.oneLiner}).
Hard rules — these are non-negotiable, breaking them gets the account banned:
1. ANSWER THE ACTUAL QUESTION first and completely. Be genuinely useful even if the person never becomes a customer.
2. Voice: ${B.voice}. Plain language. No marketing speak. No exclamation-point hype.
3. Disclose the affiliation naturally and only if you reference ${B.name}: e.g. "${B.disclosure}"
4. Do NOT drop a link unless the thread explicitly asks for resources/recommendations.
5. Only mention ${B.name} if it is truly relevant to the question; otherwise don't mention it at all.
6. Keep under ${CONFIG.rules.maxDraftWords} words. No headers, no bullet-spam — write like a knowledgeable human.
7. Never invent specifics, prices, or guarantees. If unsure, say what generally applies.
Return ONLY the reply text.`;
}

function templateDraft(post) {
  const B = CONFIG.brand;
  const topic = scoreOpportunity(post).matched[0] || 'this';
  return `Been through this side of things, so a few practical pointers on ${topic}:\n\n` +
    `Start by writing down exactly what's being asked of you and work backward from the requirement — most of the stress here comes from not having one clear checklist. Keep records dated and in one place, and don't rely on memory for anything renewal-based.\n\n` +
    `Happy to share a simple checklist if that'd help. (${B.disclosure})`;
}

async function claudeDraft(post) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { text: templateDraft(post), engine: 'template' };
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-opus-4-8',
      max_tokens: 600,
      system: systemPrompt(),
      messages: [{ role: 'user', content: `Subreddit: r/${post.subreddit}\nTitle: ${post.title}\nBody: ${post.selftext || '(none)'}\n\nWrite the reply.` }],
    }),
  });
  if (!res.ok) { console.error(c.y(`  ! Claude HTTP ${res.status}; using template`)); return { text: templateDraft(post), engine: 'template-fallback' }; }
  const json = await res.json();
  return { text: json.content?.[0]?.text?.trim() || templateDraft(post), engine: 'claude' };
}

// ---------- commands ----------
async function cmdFind() {
  const mock = has('mock');
  const posts = mock
    ? JSON.parse(fs.readFileSync(path.join(DIR, 'fixtures', 'reddit-sample.json'), 'utf8'))
    : await fetchReddit();
  const min = CONFIG.rules.minOpportunityScore;
  const scored = posts.map((p) => ({ ...p, ...scoreOpportunity(p) }))
    .filter((p) => p.score >= min)
    .sort((a, b) => b.score - a.score);

  const queue = loadQueue();
  let added = 0;
  for (const p of scored) {
    if (queue.find((q) => q.postId === p.id)) continue;
    queue.push({ id: `op_${p.id}`, postId: p.id, platform: 'reddit', subreddit: p.subreddit, title: p.title, body: p.selftext, url: p.url, score: p.score, matched: p.matched, status: 'new', draft: null, foundAt: new Date().toISOString() });
    added++;
  }
  saveQueue(queue);
  console.log(`\n${c.b('SocialScout · find')} ${mock ? c.dim('(mock data)') : ''}`);
  console.log(c.dim(`Scanned ${posts.length} posts · ${scored.length} relevant · ${added} new added to queue\n`));
  for (const p of scored) console.log(`  ${c.g('●')} [${c.c('score ' + p.score)}] r/${p.subreddit} — ${c.b(p.title)}\n     ${c.dim('matched: ' + (p.matched.join(', ') || '—'))}`);
  console.log(`\nNext: ${c.b('node socialscout.mjs draft')}\n`);
}

async function cmdDraft() {
  const queue = loadQueue();
  const todo = queue.filter((q) => q.status === 'new');
  if (!todo.length) return console.log(c.y('\nNo new opportunities to draft. Run `find` first.\n'));
  console.log(`\n${c.b('SocialScout · draft')} ${process.env.ANTHROPIC_API_KEY ? c.dim('(Claude)') : c.y('(template fallback — set ANTHROPIC_API_KEY for AI drafts)')}\n`);
  for (const item of todo) {
    const { text, engine } = await claudeDraft({ subreddit: item.subreddit, title: item.title, selftext: item.body });
    item.draft = text; item.draftEngine = engine; item.status = 'pending';
    console.log(`  ${c.c('✎')} r/${item.subreddit} — ${c.b(item.title)}  ${c.dim('[' + item.id + ']')}`);
    console.log(text.split('\n').map((l) => '     ' + c.dim(l)).join('\n'), '\n');
  }
  saveQueue(queue);
  console.log(`Review: ${c.b('node socialscout.mjs review --list')}\n`);
}

async function cmdReview() {
  const queue = loadQueue();
  if (has('approve') || has('reject')) {
    const id = arg('approve') || arg('reject');
    const item = queue.find((q) => q.id === id);
    if (!item) return console.log(c.r(`No item ${id}`));
    item.status = has('approve') ? 'approved' : 'rejected';
    if (arg('edit') && typeof arg('edit') === 'string') item.draft = arg('edit');
    saveQueue(queue);
    return console.log(`${item.status === 'approved' ? c.g('✓ approved') : c.r('✗ rejected')} ${id}`);
  }
  const pending = queue.filter((q) => q.status === 'pending');
  console.log(`\n${c.b('SocialScout · review queue')}\n`);
  if (!pending.length) console.log(c.dim('  Nothing pending.\n'));
  for (const item of pending) {
    console.log(`  ${c.y('⧗ pending')} ${c.dim(item.id)} · r/${item.subreddit} · ${c.c('score ' + item.score)}`);
    console.log(`     ${c.b(item.title)}\n     ${c.dim(item.url)}`);
    console.log(item.draft.split('\n').map((l) => '     │ ' + l).join('\n'));
    console.log(c.dim(`     approve: node socialscout.mjs review --approve ${item.id}`));
    console.log(c.dim(`     reject:  node socialscout.mjs review --reject ${item.id}\n`));
  }
  const approved = queue.filter((q) => q.status === 'approved').length;
  if (approved) console.log(c.g(`  ${approved} approved · ready to publish (node socialscout.mjs publish --dry-run)\n`));
}

async function cmdPublish() {
  const dry = !has('live'); // dry-run unless --live
  const queue = loadQueue();
  const approved = queue.filter((q) => q.status === 'approved');
  console.log(`\n${c.b('SocialScout · publish')} ${dry ? c.y('(DRY RUN — no posts sent; add --live to actually post)') : c.r('(LIVE)')}\n`);
  if (!approved.length) return console.log(c.dim('  Nothing approved yet.\n'));

  const token = dry ? null : await redditToken().catch(() => null);
  if (!dry && !token) return console.log(c.r('  --live requires REDDIT_CLIENT_ID/SECRET/USERNAME/PASSWORD env vars.\n'));

  for (const item of approved) {
    if (dry) { console.log(`  ${c.c('→ would reply')} on ${item.url}\n${item.draft.split('\n').map((l) => '     ' + c.dim(l)).join('\n')}\n`); continue; }
    const body = new URLSearchParams({ api_type: 'json', thing_id: item.postId, text: item.draft });
    const res = await fetch('https://oauth.reddit.com/api/comment', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    if (res.ok) { item.status = 'posted'; item.postedAt = new Date().toISOString(); console.log(c.g(`  ✓ posted reply on ${item.url}`)); }
    else console.log(c.r(`  ✗ failed (${res.status}) on ${item.url}`));
    await new Promise((r) => setTimeout(r, 5000)); // rate-limit safety
  }
  saveQueue(queue);

  // Quora has no posting API — export approved-for-Quora drafts to paste manually.
  const quora = queue.filter((q) => q.platform === 'quora' && q.status === 'approved');
  if (quora.length) {
    const md = quora.map((q) => `## ${q.title}\n${q.url}\n\n${q.draft}\n`).join('\n---\n');
    fs.writeFileSync(path.join(DIR, 'quora-drafts.md'), md);
    console.log(c.c(`  ↪ ${quora.length} Quora draft(s) exported to quora-drafts.md (paste manually — Quora has no posting API).`));
  }
  console.log();
}

const HELP = `${c.b('SocialScout')} — compliant, human-reviewed content assist for Reddit + Quora

  node socialscout.mjs find [--mock]      find relevant threads, add to queue
  node socialscout.mjs draft               generate answer drafts (needs review)
  node socialscout.mjs review [--list]     show pending drafts
  node socialscout.mjs review --approve <id> [--edit "text"]
  node socialscout.mjs review --reject <id>
  node socialscout.mjs publish [--dry-run|--live]

Nothing is ever posted without an explicit --approve and --live.
Env (real Reddit): REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD
Env (AI drafts):  ANTHROPIC_API_KEY`;

const cmd = process.argv[2];
({ find: cmdFind, draft: cmdDraft, review: cmdReview, publish: cmdPublish }[cmd] || (() => console.log(HELP)))();
