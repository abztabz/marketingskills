# 108media.ae — redesign mockups (first look)

Three reimagined homepage directions for 108media.ae, delivered as static PNGs
(no code deliverable — the `.html` files here are only the render sources used
to produce the screenshots).

| Direction | File | Idea |
|---|---|---|
| A — Signal Press | `direction-a-full.png` | Poster-style editorial: oversized 108 numeral, ink-on-paper, numbered services index, process ticker |
| B — Agency OS | `direction-b-full.png` | Dark, systems-forward: live "108 OS" dashboard hero (canary status, budget reallocation, EN/AR creative pair), policy rails |
| C — Bilingual Bento | `direction-c-full.png` | Light Gulf-modern bento grid: EN + AR headline pairing, Opportunity Brief tile, stat tiles, service chips |

`*-hero.png` files are above-the-fold (1440×900) crops of the same pages.

## Constraints honoured (and one caveat)

The brief was: change anything **except** logo elements, brand colour, and
content. The live site could not be reached from this build environment
(network policy denies the domain, archives and screenshot services), so:

- **Logo** — a plain "108 MEDIA" wordmark placeholder is used; no logo marks
  were invented. Drop the real logo into the nav/footer slots.
- **Brand colour** — every mockup uses a single placeholder accent
  (`--accent: #FF3D2E`, defined once at the top of each HTML file). The rest
  of each palette is deliberately neutral so the real brand colour can be
  swapped in without redesigning.
- **Content** — copy is reconstructed from
  `docs/108media-omni-channel-architecture.md` (the 108 Media agency-OS
  positioning: AI-native, EN+AR native, canary launches, hourly guardrails,
  Opportunity Brief), not scraped from the live site. Replace with the live
  site's actual copy where they differ.

## Regenerating

```bash
npm install playwright-core @fontsource/bricolage-grotesque @fontsource/archivo \
  @fontsource/archivo-black @fontsource/unbounded @fontsource/jetbrains-mono \
  @fontsource/tajawal @fontsource/sora
node shot.mjs direction-a.html direction-b.html direction-c.html
```

(`shot.mjs` lives in the session scratchpad; any Playwright full-page
screenshot at 1440px / deviceScaleFactor 2 reproduces these.)
