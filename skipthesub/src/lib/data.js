// Build-time data layer: merges src/data/sources.json over src/data/tools.json.
// Anything that has no sourced value stays exactly as-is (i.e. "TBD") and is
// never invented. Also provides the pricing/hardware cost helpers and the
// "runs on my machine" profile logic.

import tools from '../data/tools.json';
import sources from '../data/sources.json';

const TBD = 'TBD';

export { tools, sources };

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function isTbd(v) {
  return v === null || v === undefined || v === TBD || v === '';
}

/** Split a source string like "url ; url2" into an array of URL strings. */
export function sourceUrls(raw) {
  if (typeof raw !== 'string') return [];
  return raw
    .split(';')
    .map((part) => part.trim())
    .filter((part) => /^https?:\/\//i.test(part));
}

/** Recursively overlay `over` on top of `base` (arrays and scalars replace). */
function deepMerge(base, over) {
  if (over === undefined) return base;
  const overIsObj = over !== null && typeof over === 'object' && !Array.isArray(over);
  const baseIsObj = base !== null && typeof base === 'object' && !Array.isArray(base);
  if (!overIsObj || !baseIsObj) return over;
  const out = { ...base };
  for (const key of Object.keys(over)) {
    out[key] = deepMerge(base[key], over[key]);
  }
  return out;
}

/** Normalize a `{value, source}`-style field; null means "TBD". */
function fieldOf(v) {
  if (isTbd(v)) return null;
  if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
    if (isTbd(v.value)) return null;
    return {
      value: v.value,
      source: typeof v.source === 'string' && v.source ? v.source : null,
      note: typeof v.note === 'string' && v.note.trim() ? v.note.trim() : null,
    };
  }
  return { value: v, source: null, note: null };
}

export function minHardwareOf(mh) {
  const runsOn = Array.isArray(mh?.runsOn) ? mh.runsOn.filter((r) => typeof r === 'string') : [];
  const ramGB = isNum(mh?.ramGB) ? mh.ramGB : null;
  const vramGB = isNum(mh?.vramGB) ? mh.vramGB : null;
  return {
    ramGB,
    vramGB,
    runsOn,
    note: typeof mh?.note === 'string' && mh.note.trim() ? mh.note.trim() : null,
    source: typeof mh?.source === 'string' && mh.source ? mh.source : null,
    hasData: runsOn.length > 0 || ramGB !== null || vramGB !== null,
  };
}

export function hasHardwareData(minHardware) {
  return minHardwareOf(minHardware).hasData;
}

/** Paid tool price sourced from sources.json; null value means "TBD". */
export function priceFor(tool) {
  const entry = sources.prices?.[tool.slug];
  if (!entry || isTbd(entry.value)) return { value: null, urls: [] };
  return { value: entry.value, urls: sourceUrls(entry.source) };
}

function setupOf(v) {
  const field = fieldOf(v);
  if (!field) return null;
  const n = Number(field.value);
  if (!Number.isInteger(n) || n < 1 || n > 5) return null;
  return {
    value: n,
    source: field.source,
    rubric: sources.rubric?.[String(n)] ?? null,
  };
}

/** Merge sourced data over a tools.json entry into a render-ready view. */
export function toolView(tool) {
  const price = priceFor(tool);
  const alternatives = tool.alternatives.map((alt) => {
    const sourced = sources.alternatives?.[alt.repo] ?? {};
    const merged = deepMerge(alt, sourced);
    return {
      repo: merged.repo,
      githubUrl: merged.githubUrl,
      canDo: fieldOf(merged.canDo),
      cantDo: fieldOf(merged.cantDo),
      minHardware: minHardwareOf(merged.minHardware),
      setupDifficulty: setupOf(merged.setupDifficulty),
    };
  });
  return { slug: tool.slug, name: tool.name, price, alternatives };
}

export const PROFILES = [
  { id: 'cpu', label: 'CPU only', hint: 'no GPU' },
  { id: 'mac16', label: 'Mac 16GB', hint: 'Apple Mac with 16GB RAM or less' },
  { id: 'gpu8', label: 'GPU 8GB', hint: 'GPU with up to 8GB VRAM' },
  { id: 'gpu12', label: 'GPU 12GB', hint: 'GPU with up to 12GB VRAM' },
  { id: 'gpu24', label: 'GPU 24GB', hint: 'GPU with up to 24GB VRAM' },
];

/**
 * Whether an alternative's minimum hardware fits a profile:
 * - cpu:   runsOn includes "cpu" and (ramGB TBD or <= 16)
 * - mac16: runsOn includes "mac" or "cpu", and (ramGB TBD or <= 16)
 * - gpuN:  runsOn includes "cpu", or (runsOn includes "gpu" and vramGB is a number <= N)
 * Alternatives with no hardware data never fit.
 */
export function fitsProfile(profileId, minHardware) {
  const mh = minHardwareOf(minHardware);
  if (!mh.hasData) return false;
  const ramOk = mh.ramGB === null || mh.ramGB <= 16;
  if (profileId === 'cpu') return mh.runsOn.includes('cpu') && ramOk;
  if (profileId === 'mac16') {
    return (mh.runsOn.includes('mac') || mh.runsOn.includes('cpu')) && ramOk;
  }
  if (/^gpu\d+$/.test(profileId)) {
    const vramLimit = Number(profileId.slice(3));
    return (
      mh.runsOn.includes('cpu') ||
      (mh.runsOn.includes('gpu') && mh.vramGB !== null && mh.vramGB <= vramLimit)
    );
  }
  return false;
}

/**
 * Per-profile stats for one tool view (see toolView): how many alternatives
 * fit the profile, and how many have no verified hardware data (never
 * counted as fitting).
 */
export function toolProfiles(toolView) {
  return PROFILES.map((profile) => {
    let fitCount = 0;
    let unverifiedCount = 0;
    for (const alt of toolView.alternatives) {
      if (!alt.minHardware.hasData) {
        unverifiedCount += 1;
        continue;
      }
      if (fitsProfile(profile.id, alt.minHardware)) fitCount += 1;
    }
    return {
      id: profile.id,
      fits: fitCount > 0,
      fitCount,
      unverifiedCount,
    };
  });
}

export function electricityInfo() {
  const e = sources.costInputs?.electricityUsdPerKwh ?? {};
  return {
    rate: isNum(e.value) ? e.value : null,
    source: typeof e.source === 'string' ? e.source : null,
    note: typeof e.note === 'string' ? e.note : null,
    formula: sources.costInputs?.localFormula ?? null,
  };
}

export function vpsInfo() {
  const v = sources.costInputs?.vps ?? {};
  return {
    source: typeof v.source === 'string' ? v.source : null,
    plans: Array.isArray(v.plans) ? v.plans : [],
    formula: sources.costInputs?.vpsFormula ?? null,
  };
}

/**
 * Cheapest DigitalOcean plan whose RAM >= the alternative's minimum RAM.
 * Returns TBD when: minimum RAM is unknown, OR runsOn has "gpu" only, OR no
 * listed plan has enough RAM.
 */
export function vpsCost(minHardware) {
  const mh = minHardwareOf(minHardware);
  const gpuOnly = mh.runsOn.includes('gpu') && !mh.runsOn.includes('cpu');
  if (gpuOnly) return { value: null, ramGB: null, reason: 'gpu-only' };
  if (mh.ramGB === null) return { value: null, ramGB: null, reason: 'ram-unknown' };
  const candidates = vpsInfo().plans.filter(
    (plan) => isNum(plan.ramGB) && isNum(plan.usd) && plan.ramGB >= mh.ramGB,
  );
  if (candidates.length === 0) return { value: null, ramGB: null, reason: 'no-plan' };
  const cheapest = candidates.reduce((a, b) => (b.usd < a.usd ? b : a));
  return { value: cheapest.usd, ramGB: cheapest.ramGB, reason: null };
}
