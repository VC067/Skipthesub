#!/usr/bin/env node
// Fetches GitHub stars/push/archive/release data for every repo in src/data/tools.json
// and writes src/data/freshness.json. Keeps existing values on any fetch failure.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOLS_PATH = path.join(ROOT, 'src', 'data', 'tools.json');
const FRESHNESS_PATH = path.join(ROOT, 'src', 'data', 'freshness.json');

const GITHUB_API = 'https://api.github.com';
const TOKEN = process.env.GITHUB_TOKEN || '';

function loadJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function apiHeaders() {
  const headers = {
    'User-Agent': 'skipthesub-freshness',
    Accept: 'application/vnd.github+json',
  };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  return headers;
}

async function apiFetch(url) {
  const res = await fetch(url, { headers: apiHeaders() });
  const remaining = Number(res.headers.get('x-ratelimit-remaining') ?? NaN);
  if (Number.isFinite(remaining) && remaining <= 0) {
    const reset = res.headers.get('x-ratelimit-reset');
    const when = reset ? new Date(Number(reset) * 1000).toISOString() : 'later';
    throw Object.assign(new Error(`GitHub rate limit exhausted (resets ${when})`), { rateLimited: true });
  }
  if (res.status === 404) return null;
  if (res.status === 200) return res.json();
  throw new Error(`HTTP ${res.status} for ${url}`);
}

async function main() {
  const tools = loadJson(TOOLS_PATH, null);
  if (!tools) {
    console.error(`Could not read ${TOOLS_PATH}`);
    process.exit(1);
  }

  const repos = [...new Set(tools.flatMap((t) => t.alternatives.map((a) => a.repo)))].sort();
  const old = loadJson(FRESHNESS_PATH, {});
  const out = { ...old };
  const now = new Date().toISOString();
  let ok = 0, stale = 0, failed = 0;

  for (const repo of repos) {
    try {
      const meta = await apiFetch(`${GITHUB_API}/repos/${repo}`);
      if (!meta) {
        // Repo gone or never existed: drop stale data for it.
        delete out[repo];
        continue;
      }
      let latestRelease;
      try {
        const rel = await apiFetch(`${GITHUB_API}/repos/${repo}/releases/latest`);
        latestRelease = rel ? { tagName: rel.tag_name || null, name: rel.name || null, url: rel.html_url || null, publishedAt: rel.published_at || null } : null;
      } catch (err) {
        if (err.rateLimited) throw err;
        console.warn(`  warning: release lookup failed for ${repo} (${err.message}), keeping old value`);
        latestRelease = old[repo] && old[repo].latestRelease !== undefined ? old[repo].latestRelease : null;
      }
      out[repo] = {
        stars: typeof meta.stargazers_count === 'number' ? meta.stargazers_count : null,
        pushedAt: meta.pushed_at || null,
        archived: Boolean(meta.archived),
        latestRelease,
        fetchedAt: now,
      };
      ok++;
    } catch (err) {
      if (out[repo]) {
        stale++;
        console.warn(`Kept old data for ${repo}: ${err.message}`);
      } else {
        failed++;
        console.warn(`Skipping ${repo} (no data fetched): ${err.message}`);
      }
      if (err.rateLimited) {
        console.error('Rate limited by GitHub; stopping early. Previously fetched data is kept.');
        break;
      }
    }
  }

  fs.writeFileSync(FRESHNESS_PATH, JSON.stringify(out, null, 2) + '\n');
  console.log(`Freshness data written to src/data/freshness.json: ${ok} fetched, ${stale} kept from cache, ${failed} skipped.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
