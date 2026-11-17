// Token radar model (radar-2): the snapshot in, a ranked board out.
//
// The board ranks protocols that record no token yet, by the implied value a
// token would carry if the protocol's record stayed as it is. Every figure
// comes from the snapshot alone: TVL, seven-day TVL change, days listed, and
// how many chains the protocol runs on. No protocol name is special-cased.
//
//   base      = tvl_usd x TVL_MULTIPLE
//   growth    = clamp(change_7d, -50, 150) per cent
//   growthMul = 1 + (growth / 100) x GROWTH_WEIGHT
//   maturity  = 0.70 + min(age_days, 1460) / 1460 x 0.50   (age unknown: 180)
//   breadth   = 1 + min(chains - 1, 4) x 0.05
//   implied   = max(1, round(base x growthMul x maturity x breadth))
//
// A token usually trades below the value locked in its protocol, so the TVL
// multiple is 0.20. Growth is clamped hard because one week of +4000% is a
// data spike, not a trend. Age matters because a protocol that ran for years
// with no token has a longer record to price; breadth matters because a
// protocol on more chains reaches more wallets that could hold its token.

/** One protocol as the sealed snapshot carries it. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, stated in the dashboard so a reader can check them. */
export interface ModelConstants {
  tvl_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  breadth_step: number;
  breadth_max_chains: number;
}

export const MODEL: ModelConstants = {
  tvl_multiple: 0.2,
  growth_weight: 0.6,
  growth_floor: -50,
  growth_cap: 150,
  maturity_floor: 0.7,
  maturity_range: 0.5,
  maturity_days: 1460,
  unknown_age_days: 180,
  breadth_step: 0.05,
  breadth_max_chains: 4,
};

/** The model's version label, shown in the dashboard. */
export const MODEL_VERSION = 'radar-2';

/** Early rows added below the watchlist floor, picked by implied value. */
export const EARLY_ROWS = 80;

/** Live-token protocols shown for reference, by market cap. */
export const LIVE_ROWS = 12;

/** One row of board.json. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    tvl_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** A board row squeezed for data.js (short keys keep the dashboard small). */
export interface RadarRow {
  r: number;
  s: string;
  n: string;
  c: string | null;
  ch: string[];
  t: number;
  g: number | null;
  a: number | null;
  v: number;
  gm: number;
  mm: number;
  bm: number;
  w: number;
}

/** A protocol whose token already trades, shown for reference only. */
export interface LiveRow {
  s: string;
  n: string;
  c: string | null;
  t: number;
  m: number | null;
}

/** Everything the dashboard renders. */
export interface RadarData {
  asOf: string;
  source: string;
  floor: number;
  model: ModelConstants;
  version: string;
  watch: number;
  size: number;
  early: number;
  live: number;
  rows: RadarRow[];
  liveRows: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Whole days from `listedAt` to `asOf`, clamped at zero; null when either is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The four multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
): { implied: number; growthPct: number; growthMult: number; maturityMult: number; breadthMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const extraChains = Math.min(Math.max(protocol.chains.length - 1, 0), model.breadth_max_chains);
  const breadthMult = 1 + extraChains * model.breadth_step;
  const base = protocol.tvl_usd * model.tvl_multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * breadthMult));
  return { implied, growthPct, growthMult, maturityMult, breadthMult, age };
}

/** A name ending in a release marker is a versioned pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** A whole word that marks a wrapped or staked product of a token that trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/** Exchange names a protocol name must not start with. */
const EXCHANGES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Categories that are not a token launch: exchanges and wrapped/staked/bridged products. */
const NOT_A_LAUNCH = new Set(['CEX', 'Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC']);

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is one the radar may rank as a launch candidate: it
 * records no token, is not an exchange or a wrapped/staked/bridged product,
 * and is not a versioned pool. The watchlist's own rule, applied from the
 * snapshot's fields alone; the watchlist itself is always taken whole.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && NOT_A_LAUNCH.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  const lower = p.name.toLowerCase();
  for (const ex of EXCHANGES) if (lower.startsWith(ex.toLowerCase())) return false;
  return true;
}

/** The snapshot's protocols by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** Compare two protocols for a deterministic order: value first, slug second. */
function byValueThenSlug(a: { implied: number; slug: string }, b: { implied: number; slug: string }): number {
  return b.implied - a.implied || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
}

/** The board: every watchlist slug, plus the best early rows below the floor. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // Early radar: rankable protocols below the floor, picked by implied value.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .map((p) => ({ p, score: impliedValue(p, snapshot.as_of, model) }))
    .sort((a, b) => byValueThenSlug({ implied: a.score.implied, slug: a.p.slug }, { implied: b.score.implied, slug: b.p.slug }))
    .slice(0, EARLY_ROWS);
  for (const e of early) chosen.set(e.p.slug, e.p);

  const scored = [...chosen.values()].map((p) => {
    const s = impliedValue(p, snapshot.as_of, model);
    return { p, ...s };
  });
  scored.sort((a, b) => byValueThenSlug({ implied: a.implied, slug: a.p.slug }, { implied: b.implied, slug: b.p.slug }));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      tvl_multiple: model.tvl_multiple,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      breadth_multiplier: round4(s.breadthMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
export function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 250_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer window. */
export function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Lend $${capital} of USDC on ${name} (${chain}) and leave the loan open.`;
  if (c.includes('dex') || c.includes('amm')) return `Add $${capital} of liquidity to ${name}’s busiest pool on ${chain} and leave it in.`;
  if (c.includes('yield') || c.includes('farm')) return `Put $${capital} of USDC into a ${name} yield vault on ${chain} and leave it earning.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC into ${chain} with ${name}, then use it inside the app.`;
  if (c.includes('stak') || c.includes('restak')) return `Stake $${capital} of the chain asset through ${name} and hold the receipt token.`;
  if (c.includes('perpetual') || c.includes('deriv')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged trade.`;
  if (c.includes('prediction')) return `Fund $${capital} on ${name} and take one small market position.`;
  if (c.includes('rwa')) return `Mint $${capital} of the yield-bearing asset ${name} issues on ${chain} and hold it.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('capital')) return `Deposit $${capital} into a ${name} vault on ${chain} and hold the vault shares.`;
  if (c.includes('stable')) return `Mint or hold $${capital} of the stable asset ${name} issues on ${chain}.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy live.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and leave the position open.`;
}

/**
 * A protocol's farm plan: six steps, each an action with its cost and time.
 * Every word comes from the protocol's own record (category, chains, TVL,
 * age); no name is ever special-cased.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): { text: string; cost: string; time: string }[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const gas = capital >= 150 ? 8 : 4;
  return [
    {
      text: 'Open a fresh wallet that holds only the funds you plan to farm, and store its seed phrase offline on paper.',
      cost: 'no capital, under $3 of gas',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital plus about $${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: 'Do one qualifying action each week: a deposit, a borrow, a swap, a vote, or a claim of points.',
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Keep the position open for at least ${hold} days, so the activity shows up in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: 'Before you withdraw, open the protocol’s own points or rewards page and claim only through the link it publishes.',
      cost: 'free to check; never pay anyone to claim',
      time: '10 minutes',
    },
    {
      text: 'Write the wallet address, the dates, and every transaction hash in a farm log, so you can repeat or unwind the position.',
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** One farm step as a single string: action, cost, time. Kept inside 20..600 characters. */
export function stepText(step: { text: string; cost: string; time: string }): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Keep the position open and check the protocol’s own page.`;
  return s;
}

/** The live-token protocols, by market cap, for the dashboard's reference list. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1))
    .slice(0, LIVE_ROWS)
    .map((p) => ({ s: p.slug, n: p.name, c: p.category, t: p.tvl_usd, m: p.mcap_usd }));
}

/** A board row squeezed for data.js. `w` is 1 when the row is on the watchlist. */
export function radarRow(row: BoardRow, onWatch: boolean): RadarRow {
  return {
    r: row.rank,
    s: row.slug,
    n: row.name,
    c: row.category,
    ch: row.chains,
    t: row.tvl_usd,
    g: row.change_7d,
    a: row.age_days,
    v: row.implied_value_usd,
    gm: row.model.growth_multiplier,
    mm: row.model.maturity_multiplier,
    bm: row.model.breadth_multiplier,
    w: onWatch ? 1 : 0,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    asOf: snapshot.as_of,
    source: snapshot.source,
    floor: snapshot.floor_usd,
    model,
    version: MODEL_VERSION,
    watch: snapshot.watchlist.length,
    size: board.length,
    early,
    live: live.length,
    rows: board.map((r) => radarRow(r, snapshot.watchlist.includes(r.slug))),
    liveRows: live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch, no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
