# Global Coffee Board

A global coffee knowledge encyclopedia **and** a daily live coffee-price dashboard, built for Indian farmers, enthusiasts, café owners and exporters.

Pure **HTML / CSS / JS** — no framework, no build step. Three.js (via CDN) powers the 3D floating-coffee-bean background. Deploy free on Netlify.

## Pages

| File | What it is |
|------|------------|
| `index.html` | Home + **live price dashboard** with 3D bean background, verdict, differential, Coffee Board table & chart, earnings calculator |
| `knowledge.html` | Coffee **encyclopedia** — varieties, processing, brewing, Indian coffee, markets, glossary |
| `admin.html` | **Admin panel** for daily manual price entry (localStorage, import/export JSON) |

```
src/                 page TEMPLATES (edit these) — reference external assets
  index.html  knowledge.html  admin.html
assets/
  css/style.css      design system (dark espresso theme)  ← source of truth
  js/config.js       data sources, conversions, formatting, storage
     scene.js        Three.js 3D coffee beans (classic script + CSS fallback)
     main.js         nav, scroll reveal, 3D tilt cards
     dashboard.js    price engine (live fetch → manual → seed), verdict, calculator
     admin.js        admin panel logic
build.py             inlines CSS+JS from src/ + assets/ into the root pages
index.html  knowledge.html  admin.html   ← GENERATED, self-contained, deployed
netlify.toml         static hosting config
```

### Build step (important)
The **root** `index.html` / `knowledge.html` / `admin.html` are **generated** — CSS and JS
are inlined into each page so they render correctly everywhere: opened directly from
disk (`file://`), inside sandboxed IDE preview panes that ignore external `<link>`
stylesheets, and on Netlify. **Edit `src/` and `assets/`, then run:**

```bash
python3 build.py
```

Only Google Fonts and the Three.js CDN stay external (with a CSS-bean fallback if the
CDN is blocked, so the hero is never blank).

## Data sources & how live prices work

- **USD/INR** — `open.er-api.com` (free, keyless, CORS-friendly). Works live in the browser.
- **London Robusta (RC=F)** & **NY Arabica (KC=F)** — Yahoo Finance chart API, fetched through a public CORS proxy. Browser CORS + proxy uptime make this **best-effort**; it falls back gracefully.
- **Coffee Board of India** — the gov.in report can't be scraped from a static browser page (no CORS). It's maintained **manually via the admin panel**, which is the intended daily workflow.

**Data priority:** `live feed → admin manual entry → sample seed`. The dashboard never shows an empty state, and each card is labelled with its source (● live / ✎ manual / ◦ sample).

### Recommended daily workflow
1. Open `admin.html`.
2. Copy today's grade prices from the [Coffee Board Daily Market Report](https://coffeeboard.gov.in/Market_Info.aspx) into the table.
3. (Optional) enter Robusta/Arabica/FX if you want fixed figures instead of the live feed.
4. **Save & publish** — the dashboard uses them immediately.

## Run locally

Because `scene.js` is an ES module, use a local server (not `file://`):

```bash
cd FunProject
python3 -m http.server 8080
# open http://localhost:8080
```

## Deploy to Netlify
- Drag-and-drop the folder at app.netlify.com, **or**
- Connect the GitHub repo — no build command, publish directory `.`.
- Point `GlobalCoffeeBoard.com` at the Netlify site in DNS.

## Making the admin panel multi-user (next step)
The admin panel currently stores data per-browser. To publish one shared price set to all visitors, either:
- Commit the exported JSON into the repo and `fetch()` it from the dashboard, or
- Add a small **Netlify Function** + a store (e.g. Netlify Blobs) that the admin writes to and the dashboard reads.

## Disclaimer
Prices are indicative, for information only, and not financial advice.
