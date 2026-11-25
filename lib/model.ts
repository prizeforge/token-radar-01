// Token radar, model radar-2.
//
// One sealed snapshot in, one ranked board out. The board ranks the
// protocols that record no token, watchlist first and then the early
// ones below the floor, by an implied value built only from the
// snapshot's own figures: TVL, seven-day growth, how long the protocol
// has run with no token, and how many chains it runs on. Protocols
// whose token already trades are kept apart in a live view and are
// never mixed into the ranked board.
//
//   base       = tvl_usd x BASE_MULTIPLE
//   growth     = clamp(change_7d, -50, 100) per cent
//   growthMult = 1 + (growth / 100) x GROWTH_WEIGHT
//   maturity   = 0.70 + min(age_days, 1460) / 1460 x 0.50   (unknown age: 365)
//   breadth    = 1 + 0.04 x min(chains - 1, 5)              (one chain: 1.00)
//   implied    = max(1, round(base x growthMult x maturity x breadth))
//
// No protocol name is ever special-cased: the same function scores
// every row, and the farm plan follows from the protocol's category,
// chains, TVL and age, never from a hand-written list of names.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
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

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  breadth_per_chain: number;
  breadth_max_extra: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.3,
  growth_weight: 0.6,
  growth_floor: -50,
  growth_cap: 100,
  maturity_floor: 0.7,
  maturity_range: 0.5,
  maturity_days: 1460,
  unknown_age_days: 365,
  breadth_per_chain: 0.04,
  breadth_max_extra: 5,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-2';

/** How many pre-token protocols below the watchlist floor the early radar carries. */
export const EARLY_MAX = 200;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 20;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
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
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    breadth_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's view of one row, farm plan included so the page shows exactly what board.json holds. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  symbol: string | null;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  watchlist_slugs: string[];
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
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

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The multipliers and the implied value one protocol gets under `model`. */
export function impliedValue(protocol: SnapshotProtocol, asOf: string, model: ModelConstants): { implied: number; growthPct: number; growthMult: number; maturityMult: number; breadthMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const extraChains = Math.min(Math.max(protocol.chains.length - 1, 0), model.breadth_max_extra);
  const breadthMult = 1 + model.breadth_per_chain * extraChains;
  const base = protocol.tvl_usd * model.base_multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * breadthMult));
  return { implied, growthPct, growthMult, maturityMult, breadthMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories that are a wrapped, staked or bridged product of a token that already trades. */
const WRAPPED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/**
 * Whether a protocol is one the board may rank: pre-token, not a
 * wrapped, staked or bridged product, and not a versioned pool. The
 * watchlist already meets this; the rule matters for the early rows
 * below the floor, where a liquid-staking receipt or a bridge is not
 * a token waiting to launch.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && WRAPPED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  const words = p.name.toLowerCase().split(/[^a-z0-9]+/);
  if (words.includes('wrapped') || words.includes('staked') || words.includes('staking')) return false;
  return true;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug on it, in full.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: rankable pre-token protocols below the watchlist
  // floor, by TVL, capped. A chosen protocol stays chosen.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_MAX);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, model);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
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
      base_multiple: model.base_multiple,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      breadth_multiplier: round4(s.breadthMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 250;
  if (p.tvl_usd >= 100_000_000) return 150;
  if (p.tvl_usd >= 50_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** Estimated setup/exit gas in USD from the primary chain and position size. */
function gasFor(chain: string, capital: number): number {
  if (chain.toLowerCase() === 'ethereum') return capital >= 150 ? 8 : 5;
  return capital >= 150 ? 2 : 1;
}

/** Estimated weekly gas in USD from the primary chain. */
function weeklyGasFor(chain: string): number {
  return chain.toLowerCase() === 'ethereum' ? 3 : 1;
}

/** The category's main action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string, hold: number): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC or core collateral on ${name} (${chain}), verify the receipt token, and keep any borrow LTV below 50%.`;
  if (c.includes('dex') || c.includes('leveraged farm')) return `Add $${capital} of liquidity to ${name}'s highest-TVL USDC pair on ${chain} with a 1% slippage cap and stake LP tokens if gauges exist.`;
  if (c.includes('yield aggregator') || c.includes('yield')) return `Deposit $${capital} of USDC into ${name}'s flagship audited vault on ${chain} and confirm the vault share balance in your wallet.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} via ${name}'s canonical route, then deploy it into a native lending or LP pool on ${chain}.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of ${chain}'s native staking asset via ${name} and hold the liquid receipt token unspent in the same wallet.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} (${chain}) and open one low-leverage (1x-2x) or delta-neutral hedged position.`;
  if (c.includes('prediction')) return `Fund $${capital} of USDC on ${name} (${chain}) and split it across 2 active, liquid markets with clear near-term resolution dates.`;
  if (c.includes('curator') || c.includes('allocator')) return `Allocate $${capital} of USDC into ${name}'s top curated vault on ${chain} and log your entry share price for tracking.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of ${name}'s stablecoin on ${chain} and stake it inside the protocol's savings or stability pool.`;
  if (c.includes('rwa')) return `Subscribe $${capital} of USDC into ${name}'s tokenized yield asset on ${chain} and hold the RWA token in self-custody.`;
  if (c.includes('insurance')) return `Buy $${capital} of protocol cover or fund an underwriting tranche on ${name} (${chain}) for at least a ${hold}-day coverage term.`;
  if (c.includes('basis')) return `Deposit $${capital} of USDC into ${name}'s basis-trade vault on ${chain} to earn funding-rate yield while staying delta-neutral.`;
  if (c.includes('chain')) return `Bridge $${capital} of USDC onto ${chain} through its official bridge and complete an initial swap plus LP deposit in a native app.`;
  if (c.includes('payment')) return `Load $${capital} of USDC into your ${name} account on ${chain} and execute one verified test transfer or merchant payment.`;
  if (c.includes('liquidity manager')) return `Deposit $${capital} of USDC into a ${name} automated concentrated-liquidity range on ${chain} with auto-rebalancing enabled.`;
  return `Deposit $${capital} of USDC into ${name}'s primary pool on ${chain} and confirm the active position appears on your portfolio dashboard.`;
}

/** The category's weekly qualifying action. */
function weeklyFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  const small = Math.max(10, Math.round(capital / 5));
  const micro = Math.max(5, Math.round(small / 2));
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Once a week, top up $${micro} of collateral on ${name} (${chain}) or borrow and same-day repay $10 to keep activity fresh.`;
  if (c.includes('dex') || c.includes('leveraged farm')) return `Once a week, route a $${small} swap through ${name} on ${chain} (0.5% max slippage) so the wallet builds both LP and volume history.`;
  if (c.includes('yield aggregator') || c.includes('yield')) return `Once a week, claim or compound accrued rewards on ${name} (${chain}) instead of leaving vault yield idle.`;
  if (c.includes('bridge')) return `Once a week, bridge a $${micro} transfer via ${name} or interact with a second app on ${chain} using the bridged funds.`;
  if (c.includes('staking') || c.includes('restak')) return `Once a week, verify accrued staking points or rewards on ${name} (${chain}) and restake into the same wallet.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Once a week, rebalance your hedge on ${name} (${chain}) with a $${small} notional trade to maintain active weekly volume.`;
  if (c.includes('prediction')) return `Once a week, settle resolved markets on ${name} and enter one new liquid market with $${micro}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Once a week, review ${name}'s vault allocation update on ${chain} and confirm your strategy APY and cap remain healthy.`;
  if (c.includes('stable')) return `Once a week, check the peg and savings rate on ${name}'s stablecoin (${chain}) and compound or top up by $${micro}.`;
  if (c.includes('rwa')) return `Once a week, confirm yield accrual on ${name}'s RWA balance (${chain}) and keep the position unbroken across distribution dates.`;
  if (c.includes('insurance')) return `Once a week, verify your ${name} policy or underwriting share on ${chain} remains active and properly collateralized.`;
  if (c.includes('basis')) return `Once a week, check the funding rate on ${name}'s basis vault (${chain}) and confirm the position stays within target spread.`;
  if (c.includes('chain')) return `Once a week, execute at least one on-chain transaction (swap, lend, or mint) in a native ${chain} app from the same wallet.`;
  if (c.includes('payment')) return `Once a week, settle a $${micro} transfer or card spend from your ${name} balance to build recurring usage.`;
  return `Once a week, execute one qualifying on-chain action on ${name} (${chain}): a $${micro} top-up, swap, vote, or reward claim.`;
}

/** The category's second leg: a different feature of the same protocol, so the farm is not one action repeated. */
function secondLegFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  const small = Math.max(10, Math.round(capital / 5));
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow $${small} against your ${name} supply on ${chain} (health factor > 2.0), hold for 7 days, then repay in full.`;
  if (c.includes('dex') || c.includes('leveraged farm')) return `Open a second $${small} LP position in a different ${name} fee tier or pool on ${chain} and keep both active.`;
  if (c.includes('yield aggregator') || c.includes('yield')) return `Deploy $${small} into a second ${name} vault strategy on ${chain} so the wallet records multi-vault usage.`;
  if (c.includes('bridge')) return `Use $${small} of bridged funds on ${chain} in a native swap or lending app, then bridge $${small} back via ${name}.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake an additional $${small} via ${name} (${chain}) and delegate it to a different validator or restaking operator.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Close the initial hedge on ${name} (${chain}) and open a fresh $${small} limit order so multiple trades settle.`;
  if (c.includes('prediction')) return `Allocate $${small} to a second ${name} market in an unrelated category to diversify resolution activity.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${small} into a second ${name} curated vault on ${chain} with a distinct collateral profile.`;
  if (c.includes('stable')) return `Pair $${small} of ${name}'s stablecoin with USDC in a ${chain} liquidity pool for secondary yield.`;
  if (c.includes('rwa')) return `Deploy $${small} of ${name}'s RWA token as collateral or LP on ${chain} through one full distribution cycle.`;
  if (c.includes('insurance')) return `Add $${small} of secondary cover or pool underwriting on ${name} (${chain}) so the wallet holds two active positions.`;
  if (c.includes('basis')) return `Allocate $${small} to a second maturity or pair on ${name} (${chain}) and hold through one full funding cycle.`;
  if (c.includes('chain')) return `Use $${small} in a second native ${chain} protocol (such as a money market or perpetual DEX) from the same wallet.`;
  if (c.includes('payment')) return `Route $${small} through a second ${name} payment rail on ${chain}, such as a virtual card top-up or payout link.`;
  return `Use $${small} in a second ${name} module on ${chain}, such as governance staking, a secondary pool, or points boost.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a
 * time. The plan is derived from the protocol's own record (category,
 * chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const small = Math.max(10, Math.round(capital / 5));
  const hold = holdDaysFor(age);
  const gas = gasFor(chain, capital);
  const wgas = weeklyGasFor(chain);
  const weeks = Math.ceil(hold / 7);
  return [
    {
      text: `Create a dedicated wallet on ${chain}, fund it with $${capital + small} USDC plus $${gas * 3 + wgas * weeks} in gas, and bookmark the official ${p.name} URL.`,
      cost: `$${capital + small} capital + $${gas} transfer gas`,
      time: '10 minutes',
    },
    {
      text: actionFor(p, capital, chain, hold),
      cost: `$${capital} principal + $${gas} setup gas`,
      time: '15 minutes',
    },
    {
      text: weeklyFor(p, capital, chain),
      cost: `$${wgas} gas/week ($${wgas * weeks} over ${hold}d)`,
      time: '10 minutes/week',
    },
    {
      text: secondLegFor(p, capital, chain),
      cost: `$${small} extra capital + $${gas} setup gas`,
      time: '20 minutes',
    },
    {
      text: `Keep both positions open untouched for at least ${hold} days (${weeks} weekly snapshots) without dropping below $${capital} deployed.`,
      cost: `$0 extra ($${capital + small} stays deployed)`,
      time: `${hold} days`,
    },
    {
      text: `Verify your points or rewards balance on ${p.name}'s official ${chain} dashboard, claim only via the verified UI, then unwind cleanly to USDC.`,
      cost: `$${gas} claim/withdraw gas ($0 claim fee)`,
      time: '15 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's view for data.js, farm plan included. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    symbol: row.symbol,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: row.model.breadth_multiplier,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    watchlist_slugs: [...snapshot.watchlist],
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
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

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
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
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
