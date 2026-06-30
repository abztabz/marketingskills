# Deploy SocialScout for live use on iOS (and any browser)

Goal: a hosted URL you open in Safari, with **real** Reddit threads, AI drafts, and
posting — protected by an access token so only you can drive it. ~5 minutes.

> Two ways to test on a phone:
> - **No deploy:** open `scripts/socialscout-mobile.html` (self-contained, demo data,
>   on-device only). Good for trying the UX.
> - **Live data (this guide):** host `scripts/server.mjs`. The dashboard is the same
>   responsive UI, now backed by real data.

## What you need
- A free host that runs Node (Render and Railway both work; Render shown here).
- A Reddit **script** app (reddit.com/prefs/apps) for posting: client id, secret, your username, password.
- Optional: `ANTHROPIC_API_KEY` for AI drafts (falls back to a safe template without it).

## Deploy on Render (free)
1. Push this repo to GitHub (it already includes `render.yaml`, `package.json`, `Procfile`).
2. Render → **New + → Blueprint** → select your repo. It reads `render.yaml` and creates the service from `skills/social-engagement/scripts`.
3. `SOCIALSCOUT_TOKEN` is generated automatically. Open the service → **Environment** and copy its value (you'll type it into the app once).
4. Add the secret env vars (Environment tab, never commit these):
   - `ANTHROPIC_API_KEY` (optional)
   - `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USERNAME`, `REDDIT_PASSWORD`
   - To customize brand/targets without committing, set `SOCIALSCOUT_CONFIG_JSON` to the full contents of your `config.json` as one line.
5. Deploy. You get a URL like `https://socialscout-xxxx.onrender.com`.

## Open on iPhone
1. Visit the URL in **Safari**. On first action it asks for the access token — paste `SOCIALSCOUT_TOKEN`. It's stored on the device (localStorage), so you enter it once.
2. **Share → Add to Home Screen** for a full-screen, app-like icon.
3. Use it: **Find live** → **Draft pending** → review/edit → **Approve** → **Publish approved**. Reddit posts go out via the API, 5s apart; Quora drafts export server-side.

## Security notes (read once)
- The server **refuses to start on a public host without `SOCIALSCOUT_TOKEN`** — it won't expose the publish endpoint unauthenticated.
- The token is a bearer secret. If it leaks, rotate it (change the env var, redeploy); the old one stops working.
- Free hosts have **ephemeral disk**: the review queue (`queue.json`) resets on redeploy/restart. For durable history, attach a persistent disk or point storage at a database (not needed for review/testing).
- Free hosts **sleep when idle**; the first request after idle takes a few seconds to wake.

## Railway / other hosts
Any Node host works: set the start command to `node server.mjs` with root dir
`skills/social-engagement/scripts`, set the same env vars, and ensure `PORT` is
provided by the platform (it is on Render/Railway/Heroku). The server binds
`0.0.0.0` automatically when `PORT` is set.
