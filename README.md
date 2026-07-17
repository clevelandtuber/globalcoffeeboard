# Global Coffee Board

A global coffee knowledge encyclopedia **and** a daily live coffee-price dashboard, built for Indian farmers, enthusiasts, café owners and exporters.

Built with **[Astro](https://astro.build)**. The dashboard's live data and 3D coffee-bean background run as vanilla client-side JavaScript (Three.js via CDN, with a CSS fallback).

## Pages

| Route | What it is |
|-------|------------|
| `/` (`src/pages/index.astro`) | Home + **live price dashboard** with 3D bean background, verdict, differential, Coffee Board table & chart, earnings calculator |
| `/knowledge` (`src/pages/knowledge.astro`) | Coffee **encyclopedia** — varieties, processing, brewing, Indian coffee, markets, glossary |
| `/admin` (`src/pages/admin.astro`) | **Admin panel** for daily manual price entry (localStorage, import/export JSON) |

## Project structure

```
src/
  layouts/Layout.astro   shared shell: <head>, fonts, nav, footer, 3D canvas
  pages/                 one .astro file per route
  styles/global.css      design system (dark espresso theme)
public/
  assets/js/             client-side JS, served as-is and loaded in order
    config.js            data sources, conversions, formatting, storage
    dashboard.js         price engine (live → manual → seed), verdict, calculator
    scene.js             Three.js 3D coffee beans (+ CSS fallback)
    main.js              nav, scroll reveal, 3D tilt cards
    admin.js             admin panel logic
  favicon.svg
astro.config.mjs         Astro config (set `site`, and `base` for GH project pages)
netlify.toml             Netlify build config
```

> **Note:** the client JS lives in `public/` on purpose — it's plain browser script
> (assigns to `window.GCB`, runs on `DOMContentLoaded`) and is loaded with
> `<script is:inline src="…">` in the layout/pages, preserving load order. No bundling
> needed. Edit these files directly.

## Develop

```bash
npm install       # first time only
npm run dev       # http://localhost:4321 — live reload
```

## Build & preview production

```bash
npm run build     # outputs static site to dist/
npm run preview   # serve the built dist/ locally
```

## Deploy

The build is a plain static site in `dist/`. Two easy options:

- **Netlify** (recommended, serves at the domain root): connect the GitHub repo;
  `netlify.toml` already sets build command `npm run build` and publish dir `dist`.
- **GitHub Pages**: use a GitHub Actions workflow (`withastro/action`). If you deploy to
  the project URL `username.github.io/globalcoffeeboard/`, also set
  `base: '/globalcoffeeboard'` in `astro.config.mjs`. A **custom domain** serves at root,
  so no `base` is needed.

## Data sources & how live prices work

- **USD/INR** — `open.er-api.com` (free, keyless, CORS-friendly). Works live in the browser.
- **London Robusta (RC=F)** & **NY Arabica (KC=F)** — Yahoo Finance via a public CORS
  proxy; best-effort, falls back gracefully.
- **Coffee Board of India** — maintained manually via `/admin` (localStorage). The gov.in
  report can't be scraped client-side (no CORS).

**Data priority:** `live feed → admin manual entry → sample seed`. Each card shows its
source (● live / ✎ manual / ◦ sample).

## Disclaimer
Prices are indicative, for information only, and not financial advice.
