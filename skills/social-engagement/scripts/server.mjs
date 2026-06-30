#!/usr/bin/env node
/**
 * SocialScout review app — a tiny zero-dependency HTTP server that serves the
 * browser dashboard and drives the same pipeline as the CLI (in-process).
 * Bound to 127.0.0.1 only. Nothing posts without an explicit "Publish (live)".
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadQueue, findOpportunities, draftPending, setReview, publish, CONFIG } from './socialscout.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
};
const readBody = (req) => new Promise((resolve) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } }); });

export function startServer({ port = 7821 } = {}) {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://localhost:${port}`);
      const p = url.pathname;
      if (req.method === 'GET' && (p === '/' || p === '/dashboard.html')) {
        return send(res, 200, fs.readFileSync(path.join(DIR, 'dashboard.html'), 'utf8'), 'text/html');
      }
      if (req.method === 'GET' && p === '/api/queue') {
        return send(res, 200, { brand: CONFIG.brand.name, queue: loadQueue() });
      }
      if (req.method === 'POST' && p === '/api/find') {
        const b = await readBody(req);
        return send(res, 200, await findOpportunities({ mock: !!b.mock, platform: b.platform || 'reddit', urls: b.urls || [], log: () => {} }));
      }
      if (req.method === 'POST' && p === '/api/draft') {
        return send(res, 200, await draftPending({ log: () => {} }));
      }
      if (req.method === 'POST' && p === '/api/review') {
        const b = await readBody(req);
        return send(res, 200, setReview(b.id, b.status, b.edit));
      }
      if (req.method === 'POST' && p === '/api/publish') {
        const b = await readBody(req);
        return send(res, 200, await publish({ live: !!b.live, log: () => {} }));
      }
      send(res, 404, { error: 'not found' });
    } catch (e) { send(res, 500, { error: e.message }); }
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`\n  SocialScout review app → http://127.0.0.1:${port}\n  (127.0.0.1 only · nothing posts without an explicit Publish-live)\n`);
  });
  return server;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) startServer({ port: Number((process.argv.find((a) => a.startsWith('--port='))?.split('=')[1]) || 7821) });
