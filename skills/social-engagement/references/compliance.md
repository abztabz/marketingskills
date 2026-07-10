# Platform compliance reference

The rules that keep accounts alive. Read before going live.

## Reddit

- **Official API exists** (OAuth). Automated commenting is technically supported, but the content policy and individual subreddit rules treat self-promotion as spam.
- **The 90/10 (really 95/5) rule**: the vast majority of your activity should be genuine participation with no brand mention. A handful of relevant mentions among a lot of plain help is fine; the reverse gets you banned.
- **New/low-karma accounts** posting links or brand names are auto-filtered. Warm the account first (see below).
- **Per-subreddit rules vary** — many ban self-promotion outright. Read each subreddit's rules; if it bans promo, either answer with zero brand mention or skip it. Set those subreddits aside in `config.json`.
- **Rate limits**: keep posting slow and human. SocialScout spaces live posts 5 seconds apart and fetches 1.2 seconds apart; for real campaigns, spread posts across hours/days, not minutes.
- **Setup**: create a *script* app at reddit.com/prefs/apps → set `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USERNAME`, `REDDIT_PASSWORD`.

## Quora

- **No public posting API.** The only automation path is browser scripting, which violates Quora's ToS and risks account bans. SocialScout does **not** automate Quora.
- **Workflow**: use the finder/draft steps to prepare answers, then `publish` exports approved Quora drafts to `quora-drafts.md`. A human pastes them in.
- Quora rewards thorough, evergreen answers. Disclosure norms still apply — state your affiliation.

## Account warming (both platforms)

1. Use a real, established account where possible, not a brand-new throwaway.
2. Spend the first weeks genuinely participating: upvote, comment helpfully, build karma/credibility with zero promotion.
3. Complete the profile (bio, avatar). Empty profiles read as spam.
4. Only after the account has a real history should it ever mention a brand, and then sparingly.

## Disclosure

- Always disclose a material connection when you name the brand ("I work with X..."). This is both an FTC expectation for endorsements and a trust signal.
- Disclosure is cheap insurance: undisclosed promotion that gets discovered destroys far more trust than it ever built.

## Red lines (never do these)

- No fake personas pretending to be unaffiliated customers.
- No vote manipulation, no multiple accounts to upvote your own posts.
- No identical copy-pasted answers across threads (pattern-detected as spam).
- No links in subreddits that forbid them.
- No invented stats, prices, or guarantees.
