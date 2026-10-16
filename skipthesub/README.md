# SkipTheSub

Open-source alternatives to paid AI and SaaS tools. A static [Astro](https://astro.build) site — no UI framework, plain CSS. Each listed tool gets a page mapping every known open-source alternative with GitHub freshness data (stars, last push, latest release, archived status).

Facts that have not been verified are shown as **TBD** and are never invented.

## Run locally

```bash
npm install
npm run dev        # dev server at http://localhost:4321
```

## Build

```bash
npm run build      # outputs to dist/
npm run preview    # preview the production build locally
```

## Refresh GitHub freshness data

`scripts/refresh-freshness.mjs` calls the GitHub API for every unique repo in `src/data/tools.json` and writes `src/data/freshness.json` (stars, last push, archived, latest release, fetched time). Failed fetches keep the previous value, and nothing is ever guessed.

```bash
export GITHUB_TOKEN=ghp_your_token_here   # optional, avoids the 60 req/hour anonymous limit
npm run refresh
```

A GitHub Actions workflow (`.github/workflows/refresh.yml`) runs this daily via cron and on manual dispatch, committing `src/data/freshness.json` when it changes.

## Deploy to Cloudflare Pages

1. Push this repository to GitHub.
2. In the Cloudflare dashboard create a Pages project, connect the repo, and use:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
3. (Optional) Add a Node.js version environment variable if Cloudflare picks an old default — `NODE_VERSION` = `20`.
4. Deploy. The site will be served as static HTML from `dist/`.

Cloudflare Pages also supports `wrangler` deployment:

```bash
npx wrangler pages deploy dist --project-name=skipthesub
```

## Updating the data

- **`SEED.md`** maps paid tools to GitHub `owner/repo` alternatives.
- **`src/data/tools.json`** is the site's source of truth (one entry per paid tool). Capabilities and hardware fields are `TBD` until verified.
- **`src/data/freshness.json`** is generated — do not edit by hand.

## Site structure

- `/` — all tools, with a search box and a "Runs on my machine" filter (Mac 16GB, GPU 8GB / 12GB / 24GB, CPU only). Items with unverified hardware are surfaced under an **Unverified** note.
- `/alternatives/{slug}` — per-tool page with each alternative's GitHub link, can/can't do (TBD), minimum hardware (TBD), setup difficulty (TBD), and GitHub freshness data, plus a copyable "Listed on SkipTheSub" badge snippet.
