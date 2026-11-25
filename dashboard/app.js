// Token Radar v8 dashboard: sortable, filterable, keyboard-navigable board with detail view.
// Reads window.RADAR from data.js. No network, no fetch, no framework.
//
// Recomputes every row's implied value from the row's own TVL, 7-day
// change, age and chains using radar-2, and regenerates every row's
// 6-step farm plan from category, chains, TVL and age. window.__radarCheck()
// verifies the whole board matches board.json step for step.

(function () {
  'use strict';

  var R = window.RADAR;
  if (!R || !Array.isArray(R.rows)) {
    document.body.innerHTML = '<p style="padding:40px;font-family:sans-serif">Token Radar: no data loaded.</p>';
    return;
  }

  var wl = {};
  (R.watchlist_slugs || []).forEach(function (s) { wl[s] = true; });

  var state = { q: '', cat: 'all', scope: 'all', chain: 'all', sort: 'rank', dir: 1 };
  var selected = null;
  var focusedSlug = null;

  var $ = function (id) { return document.getElementById(id); };
  var rowsEl = $('rows');
  var detailEl = $('detail');
  var qEl = $('q');
  var clearQEl = $('clear-q');
  var resetBtn = $('reset-filters');

  function fmtUSD(n) {
    if (n === null || n === undefined) return '\u2014';
    var neg = n < 0;
    var a = Math.abs(n);
    var out;
    if (a >= 1e9) out = '$' + (a / 1e9).toFixed(2) + 'B';
    else if (a >= 1e6) out = '$' + (a / 1e6).toFixed(1) + 'M';
    else if (a >= 1e3) out = '$' + (a / 1e3).toFixed(1) + 'K';
    else out = '$' + Math.round(a);
    return neg ? '-' + out : out;
  }

  function fmtSignedUSD(n) {
    if (n === null || n === undefined) return '\u2014';
    return (n > 0 ? '+' : n < 0 ? '-' : '') + fmtUSD(Math.abs(n));
  }

  function fmtPct(n) {
    if (n === null || n === undefined) return '\u2014';
    if (n > 0) return '\u25b2 +' + n.toFixed(1) + '%';
    if (n < 0) return '\u25bc ' + n.toFixed(1) + '%';
    return '0.0%';
  }

  function pctClass(n) {
    if (n === null || n === undefined) return 'flat';
    if (n > 0.5) return 'pos';
    if (n < -0.5) return 'neg';
    return 'flat';
  }

  function fmtAge(n) {
    if (n === null || n === undefined) return '\u2014';
    if (n >= 365) return (n / 365).toFixed(1) + 'y';
    return n + 'd';
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ---- The value model, run here, in the page -------------------------

  function impliedOf(r) {
    var m = R.model;
    var rawGrowth = (typeof r.change_7d === 'number' && isFinite(r.change_7d)) ? r.change_7d : 0;
    var growthPct = Math.min(m.growth_cap, Math.max(m.growth_floor, rawGrowth));
    var growthMult = 1 + (growthPct / 100) * m.growth_weight;
    var age = (r.age_days === null || r.age_days === undefined) ? m.unknown_age_days : r.age_days;
    var maturityMult = m.maturity_floor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
    var extraChains = Math.min(Math.max((r.chains || []).length - 1, 0), m.breadth_max_extra);
    var breadthMult = 1 + m.breadth_per_chain * extraChains;
    var base = r.tvl_usd * m.base_multiple;
    var implied = Math.max(1, Math.round(base * growthMult * maturityMult * breadthMult));
    var neutralImplied = Math.max(1, Math.round(base * maturityMult * breadthMult));
    return {
      implied: implied,
      neutralImplied: neutralImplied,
      growthDelta: implied - neutralImplied,
      growthPct: growthPct,
      growthMult: growthMult,
      maturityMult: maturityMult,
      breadthMult: breadthMult,
      base: base
    };
  }

  // ---- The farm plan, generated here, in the page (15 categories) -----

  function chainOf(r) {
    return (r.chains && r.chains.length > 0) ? r.chains[0] : 'its main chain';
  }

  function capitalFor(r) {
    if (r.tvl_usd >= 1e9) return 250;
    if (r.tvl_usd >= 1e8) return 150;
    if (r.tvl_usd >= 5e7) return 100;
    return 50;
  }

  function holdDaysFor(age) {
    if (age === null || age === undefined) return 45;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }

  function gasFor(chain, capital) {
    if (chain.toLowerCase() === 'ethereum') return capital >= 150 ? 8 : 5;
    return capital >= 150 ? 2 : 1;
  }

  function weeklyGasFor(chain) {
    return chain.toLowerCase() === 'ethereum' ? 3 : 1;
  }

  function actionFor(r, capital, chain, hold) {
    var c = (r.category || '').toLowerCase();
    var name = r.name;
    if (c.indexOf('lend') !== -1 || c.indexOf('cdp') !== -1 || c.indexOf('collateral') !== -1) return 'Supply $' + capital + ' of USDC or core collateral on ' + name + ' (' + chain + '), verify the receipt token, and keep any borrow LTV below 50%.';
    if (c.indexOf('dex') !== -1 || c.indexOf('leveraged farm') !== -1) return 'Add $' + capital + ' of liquidity to ' + name + '\'s highest-TVL USDC pair on ' + chain + ' with a 1% slippage cap and stake LP tokens if gauges exist.';
    if (c.indexOf('yield aggregator') !== -1 || c.indexOf('yield') !== -1) return 'Deposit $' + capital + ' of USDC into ' + name + '\'s flagship audited vault on ' + chain + ' and confirm the vault share balance in your wallet.';
    if (c.indexOf('bridge') !== -1) return 'Bridge $' + capital + ' of USDC to ' + chain + ' via ' + name + '\'s canonical route, then deploy it into a native lending or LP pool on ' + chain + '.';
    if (c.indexOf('staking') !== -1 || c.indexOf('restak') !== -1) return 'Stake $' + capital + ' of ' + chain + '\'s native staking asset via ' + name + ' and hold the liquid receipt token unspent in the same wallet.';
    if (c.indexOf('perpetual') !== -1 || c.indexOf('derivative') !== -1) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' (' + chain + ') and open one low-leverage (1x-2x) or delta-neutral hedged position.';
    if (c.indexOf('prediction') !== -1) return 'Fund $' + capital + ' of USDC on ' + name + ' (' + chain + ') and split it across 2 active, liquid markets with clear near-term resolution dates.';
    if (c.indexOf('curator') !== -1 || c.indexOf('allocator') !== -1) return 'Allocate $' + capital + ' of USDC into ' + name + '\'s top curated vault on ' + chain + ' and log your entry share price for tracking.';
    if (c.indexOf('stable') !== -1) return 'Mint or deposit $' + capital + ' of ' + name + '\'s stablecoin on ' + chain + ' and stake it inside the protocol\'s savings or stability pool.';
    if (c.indexOf('rwa') !== -1) return 'Subscribe $' + capital + ' of USDC into ' + name + '\'s tokenized yield asset on ' + chain + ' and hold the RWA token in self-custody.';
    if (c.indexOf('insurance') !== -1) return 'Buy $' + capital + ' of protocol cover or fund an underwriting tranche on ' + name + ' (' + chain + ') for at least a ' + hold + '-day coverage term.';
    if (c.indexOf('basis') !== -1) return 'Deposit $' + capital + ' of USDC into ' + name + '\'s basis-trade vault on ' + chain + ' to earn funding-rate yield while staying delta-neutral.';
    if (c.indexOf('chain') !== -1) return 'Bridge $' + capital + ' of USDC onto ' + chain + ' through its official bridge and complete an initial swap plus LP deposit in a native app.';
    if (c.indexOf('payment') !== -1) return 'Load $' + capital + ' of USDC into your ' + name + ' account on ' + chain + ' and execute one verified test transfer or merchant payment.';
    if (c.indexOf('liquidity manager') !== -1) return 'Deposit $' + capital + ' of USDC into a ' + name + ' automated concentrated-liquidity range on ' + chain + ' with auto-rebalancing enabled.';
    return 'Deposit $' + capital + ' of USDC into ' + name + '\'s primary pool on ' + chain + ' and confirm the active position appears on your portfolio dashboard.';
  }

  function weeklyFor(r, capital, chain) {
    var c = (r.category || '').toLowerCase();
    var name = r.name;
    var small = Math.max(10, Math.round(capital / 5));
    var micro = Math.max(5, Math.round(small / 2));
    if (c.indexOf('lend') !== -1 || c.indexOf('cdp') !== -1 || c.indexOf('collateral') !== -1) return 'Once a week, top up $' + micro + ' of collateral on ' + name + ' (' + chain + ') or borrow and same-day repay $10 to keep activity fresh.';
    if (c.indexOf('dex') !== -1 || c.indexOf('leveraged farm') !== -1) return 'Once a week, route a $' + small + ' swap through ' + name + ' on ' + chain + ' (0.5% max slippage) so the wallet builds both LP and volume history.';
    if (c.indexOf('yield aggregator') !== -1 || c.indexOf('yield') !== -1) return 'Once a week, claim or compound accrued rewards on ' + name + ' (' + chain + ') instead of leaving vault yield idle.';
    if (c.indexOf('bridge') !== -1) return 'Once a week, bridge a $' + micro + ' transfer via ' + name + ' or interact with a second app on ' + chain + ' using the bridged funds.';
    if (c.indexOf('staking') !== -1 || c.indexOf('restak') !== -1) return 'Once a week, verify accrued staking points or rewards on ' + name + ' (' + chain + ') and restake into the same wallet.';
    if (c.indexOf('perpetual') !== -1 || c.indexOf('derivative') !== -1) return 'Once a week, rebalance your hedge on ' + name + ' (' + chain + ') with a $' + small + ' notional trade to maintain active weekly volume.';
    if (c.indexOf('prediction') !== -1) return 'Once a week, settle resolved markets on ' + name + ' and enter one new liquid market with $' + micro + '.';
    if (c.indexOf('curator') !== -1 || c.indexOf('allocator') !== -1) return 'Once a week, review ' + name + '\'s vault allocation update on ' + chain + ' and confirm your strategy APY and cap remain healthy.';
    if (c.indexOf('stable') !== -1) return 'Once a week, check the peg and savings rate on ' + name + '\'s stablecoin (' + chain + ') and compound or top up by $' + micro + '.';
    if (c.indexOf('rwa') !== -1) return 'Once a week, confirm yield accrual on ' + name + '\'s RWA balance (' + chain + ') and keep the position unbroken across distribution dates.';
    if (c.indexOf('insurance') !== -1) return 'Once a week, verify your ' + name + ' policy or underwriting share on ' + chain + ' remains active and properly collateralized.';
    if (c.indexOf('basis') !== -1) return 'Once a week, check the funding rate on ' + name + '\'s basis vault (' + chain + ') and confirm the position stays within target spread.';
    if (c.indexOf('chain') !== -1) return 'Once a week, execute at least one on-chain transaction (swap, lend, or mint) in a native ' + chain + ' app from the same wallet.';
    if (c.indexOf('payment') !== -1) return 'Once a week, settle a $' + micro + ' transfer or card spend from your ' + name + ' balance to build recurring usage.';
    return 'Once a week, execute one qualifying on-chain action on ' + name + ' (' + chain + '): a $' + micro + ' top-up, swap, vote, or reward claim.';
  }

  function secondLegFor(r, capital, chain) {
    var c = (r.category || '').toLowerCase();
    var name = r.name;
    var small = Math.max(10, Math.round(capital / 5));
    if (c.indexOf('lend') !== -1 || c.indexOf('cdp') !== -1 || c.indexOf('collateral') !== -1) return 'Borrow $' + small + ' against your ' + name + ' supply on ' + chain + ' (health factor > 2.0), hold for 7 days, then repay in full.';
    if (c.indexOf('dex') !== -1 || c.indexOf('leveraged farm') !== -1) return 'Open a second $' + small + ' LP position in a different ' + name + ' fee tier or pool on ' + chain + ' and keep both active.';
    if (c.indexOf('yield aggregator') !== -1 || c.indexOf('yield') !== -1) return 'Deploy $' + small + ' into a second ' + name + ' vault strategy on ' + chain + ' so the wallet records multi-vault usage.';
    if (c.indexOf('bridge') !== -1) return 'Use $' + small + ' of bridged funds on ' + chain + ' in a native swap or lending app, then bridge $' + small + ' back via ' + name + '.';
    if (c.indexOf('staking') !== -1 || c.indexOf('restak') !== -1) return 'Stake an additional $' + small + ' via ' + name + ' (' + chain + ') and delegate it to a different validator or restaking operator.';
    if (c.indexOf('perpetual') !== -1 || c.indexOf('derivative') !== -1) return 'Close the initial hedge on ' + name + ' (' + chain + ') and open a fresh $' + small + ' limit order so multiple trades settle.';
    if (c.indexOf('prediction') !== -1) return 'Allocate $' + small + ' to a second ' + name + ' market in an unrelated category to diversify resolution activity.';
    if (c.indexOf('curator') !== -1 || c.indexOf('allocator') !== -1) return 'Deposit $' + small + ' into a second ' + name + ' curated vault on ' + chain + ' with a distinct collateral profile.';
    if (c.indexOf('stable') !== -1) return 'Pair $' + small + ' of ' + name + '\'s stablecoin with USDC in a ' + chain + ' liquidity pool for secondary yield.';
    if (c.indexOf('rwa') !== -1) return 'Deploy $' + small + ' of ' + name + '\'s RWA token as collateral or LP on ' + chain + ' through one full distribution cycle.';
    if (c.indexOf('insurance') !== -1) return 'Add $' + small + ' of secondary cover or pool underwriting on ' + name + ' (' + chain + ') so the wallet holds two active positions.';
    if (c.indexOf('basis') !== -1) return 'Allocate $' + small + ' to a second maturity or pair on ' + name + ' (' + chain + ') and hold through one full funding cycle.';
    if (c.indexOf('chain') !== -1) return 'Use $' + small + ' in a second native ' + chain + ' protocol (such as a money market or perpetual DEX) from the same wallet.';
    if (c.indexOf('payment') !== -1) return 'Route $' + small + ' through a second ' + name + ' payment rail on ' + chain + ', such as a virtual card top-up or payout link.';
    return 'Use $' + small + ' in a second ' + name + ' module on ' + chain + ', such as governance staking, a secondary pool, or points boost.';
  }

  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + ' Hold the position and check the protocol\'s own page.';
    return s;
  }

  function farmMetaFor(r) {
    var chain = chainOf(r);
    var capital = capitalFor(r);
    var small = Math.max(10, Math.round(capital / 5));
    var hold = holdDaysFor(r.age_days);
    var gas = gasFor(chain, capital);
    var wgas = weeklyGasFor(chain);
    var weeks = Math.ceil(hold / 7);
    return {
      chain: chain,
      capital: capital,
      small: small,
      hold: hold,
      gas: gas,
      wgas: wgas,
      weeks: weeks,
      totalCapital: capital + small,
      totalGas: gas * 4 + wgas * weeks
    };
  }

  function farmStepsFor(r) {
    var m = farmMetaFor(r);
    return [
      stepText({ text: 'Create a dedicated wallet on ' + m.chain + ', fund it with $' + m.totalCapital + ' USDC plus $' + (m.gas * 3 + m.wgas * m.weeks) + ' in gas, and bookmark the official ' + r.name + ' URL.', cost: '$' + m.totalCapital + ' capital + $' + m.gas + ' transfer gas', time: '10 minutes' }),
      stepText({ text: actionFor(r, m.capital, m.chain, m.hold), cost: '$' + m.capital + ' principal + $' + m.gas + ' setup gas', time: '15 minutes' }),
      stepText({ text: weeklyFor(r, m.capital, m.chain), cost: '$' + m.wgas + ' gas/week ($' + (m.wgas * m.weeks) + ' over ' + m.hold + 'd)', time: '10 minutes/week' }),
      stepText({ text: secondLegFor(r, m.capital, m.chain), cost: '$' + m.small + ' extra capital + $' + m.gas + ' setup gas', time: '20 minutes' }),
      stepText({ text: 'Keep both positions open untouched for at least ' + m.hold + ' days (' + m.weeks + ' weekly snapshots) without dropping below $' + m.capital + ' deployed.', cost: '$0 extra ($' + m.totalCapital + ' stays deployed)', time: m.hold + ' days' }),
      stepText({ text: 'Verify your points or rewards balance on ' + r.name + '\'s official ' + m.chain + ' dashboard, claim only via the verified UI, then unwind cleanly to USDC.', cost: '$' + m.gas + ' claim/withdraw gas ($0 claim fee)', time: '15 minutes' })
    ];
  }

  window.__radarCheck = function () {
    var bad = [];
    R.rows.forEach(function (r) {
      var v = impliedOf(r);
      if (v.implied !== r.implied_value_usd) bad.push({ slug: r.slug, field: 'implied', page: v.implied, board: r.implied_value_usd });
      var gen = farmStepsFor(r);
      var stored = r.farm_steps || [];
      if (gen.length !== stored.length) {
        bad.push({ slug: r.slug, field: 'farm_steps.length', page: gen.length, board: stored.length });
      } else {
        for (var i = 0; i < gen.length; i++) {
          if (gen[i] !== stored[i]) { bad.push({ slug: r.slug, field: 'farm_steps[' + i + ']', page: gen[i], board: stored[i] }); break; }
        }
      }
    });
    return { rows: R.rows.length, mismatches: bad.length, bad: bad };
  };

  function renderSelfCheck() {
    var el = $('selfcheck');
    if (!el) return;
    var c = window.__radarCheck();
    if (c.mismatches === 0) {
      el.textContent = 'Page self-check: all ' + c.rows + ' rows recompute to the board\u2019s implied values, and all ' + c.rows + ' farm plans regenerate step for step.';
    } else {
      el.textContent = 'Page self-check: ' + c.mismatches + ' mismatch' + (c.mismatches === 1 ? '' : 'es') + ' in ' + c.rows + ' rows; first is ' + c.bad[0].slug + ' (' + c.bad[0].field + ').';
    }
  }

  function splitStep(step) {
    var m = step.match(/^(.*?) Cost: (.*?)\. Time: (.*?)\.?\s*$/);
    if (!m) return { action: step, cost: null, time: null };
    return { action: m[1], cost: m[2], time: m[3] };
  }

  function fillSelect(el, values, allLabel) {
    el.innerHTML = '<option value="all">' + esc(allLabel) + '</option>' +
      values.map(function (v) { return '<option value="' + esc(v) + '">' + esc(v) + '</option>'; }).join('');
  }

  var categories = [];
  var chains = [];
  R.rows.forEach(function (r) {
    if (r.category && categories.indexOf(r.category) === -1) categories.push(r.category);
    (r.chains || []).forEach(function (c) { if (chains.indexOf(c) === -1) chains.push(c); });
  });
  categories.sort();
  chains.sort();
  fillSelect($('cat'), categories, 'All categories');
  fillSelect($('chain'), chains, 'All chains');

  function isWatchlist(r) { return !!wl[r.slug]; }

  var maxImplied = R.rows.length ? R.rows[0].implied_value_usd : 1;

  function renderMovers() {
    var withChange = R.rows.filter(function (r) { return typeof r.change_7d === 'number' && isFinite(r.change_7d); });
    var gainers = withChange.filter(function (r) { return r.change_7d > 0; }).slice().sort(function (a, b) { return b.change_7d - a.change_7d; }).slice(0, 3);
    var losers = withChange.filter(function (r) { return r.change_7d < 0; }).slice().sort(function (a, b) { return a.change_7d - b.change_7d; }).slice(0, 3);

    function moverHtml(r) {
      var v = impliedOf(r);
      var deltaStr = fmtSignedUSD(v.growthDelta) + ' growth';
      return '<button type="button" class="mover-row" data-mover="' + esc(r.slug) + '">' +
        '<span class="m-rank">#' + r.rank + '</span>' +
        '<span class="m-name">' + esc(r.name) + (isWatchlist(r) ? '<span class="m-wl">WL</span>' : '') + '</span>' +
        '<span class="m-pct ' + pctClass(r.change_7d) + '">' + fmtPct(r.change_7d) + '</span>' +
        '<span class="m-imp">' + fmtUSD(r.implied_value_usd) + '</span>' +
        '<span class="m-delta">' + deltaStr + '</span>' +
        '</button>';
    }

    $('movers-up').innerHTML = gainers.map(moverHtml).join('');
    $('movers-down').innerHTML = losers.map(moverHtml).join('');
  }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    var out = R.rows.filter(function (r) {
      if (state.scope === 'watchlist' && !isWatchlist(r)) return false;
      if (state.scope === 'early' && isWatchlist(r)) return false;
      if (state.cat !== 'all' && r.category !== state.cat) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) === -1) return false;
      if (q) {
        var sym = (r.symbol || '').toLowerCase();
        if (r.name.toLowerCase().indexOf(q) === -1 && r.slug.toLowerCase().indexOf(q) === -1 && sym.indexOf(q) === -1) return false;
      }
      return true;
    });
    var key = state.sort;
    var dir = state.dir;
    out.sort(function (a, b) {
      var va = key === 'chains_count' ? (a.chains || []).length : a[key];
      var vb = key === 'chains_count' ? (b.chains || []).length : b[key];
      if (va === null || va === undefined) va = key === 'name' || key === 'category' ? '' : -Infinity;
      if (vb === null || vb === undefined) vb = key === 'name' || key === 'category' ? '' : -Infinity;
      if (typeof va === 'string') return va.localeCompare(vb) * dir;
      return (va - vb) * dir;
    });
    return out;
  }

  function syncFilterUI() {
    clearQEl.hidden = !state.q;
    var dirty = state.q !== '' || state.cat !== 'all' || state.scope !== 'all' || state.chain !== 'all';
    resetBtn.hidden = !dirty;
    document.querySelectorAll('.scope-pills .pill[data-scope]').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-scope') === state.scope);
    });
  }

  function renderBoard() {
    syncFilterUI();
    var list = filtered();
    $('count').textContent = list.length + ' of ' + R.rows.length + ' rows';
    if (!list.length) {
      rowsEl.innerHTML = '<tr><td colspan="9" class="empty-row">No protocols match the current filters.</td></tr>';
    } else {
      if (focusedSlug && !list.some(function (r) { return r.slug === focusedSlug; })) focusedSlug = list[0].slug;
      var activeTarget = focusedSlug || list[0].slug;
      rowsEl.innerHTML = list.map(function (r) {
        var wlRow = isWatchlist(r);
        var cls = [];
        if (wlRow) cls.push('wl');
        if (r.slug === selected) cls.push('selected');
        if (r.slug === focusedSlug) cls.push('kb-focus');
        var share = Math.max(1, Math.round((r.implied_value_usd / maxImplied) * 100));
        var tab = r.slug === activeTarget ? '0' : '-1';
        var sym = r.symbol ? ' \u00b7 ' + esc(r.symbol) : '';
        return '<tr data-slug="' + esc(r.slug) + '" tabindex="' + tab + '"' + (cls.length ? ' class="' + cls.join(' ') + '"' : '') + '>' +
          '<td class="rank">' + r.rank + '</td>' +
          '<td><span class="notoken" title="No token recorded"></span><span class="name">' + esc(r.name) + '</span>' +
          (wlRow ? '<span class="tag">Watchlist</span>' : '') +
          '<span class="slug">' + esc(r.slug) + sym + '</span></td>' +
          '<td class="cat">' + esc(r.category || '\u2014') + '</td>' +
          '<td class="chains">' + esc((r.chains || []).slice(0, 2).join(', ') || '\u2014') + ((r.chains || []).length > 2 ? ' +' + ((r.chains || []).length - 2) : '') + '</td>' +
          '<td class="num">' + fmtUSD(r.tvl_usd) + '</td>' +
          '<td class="num ' + pctClass(r.change_7d) + '">' + fmtPct(r.change_7d) + '</td>' +
          '<td class="num">' + fmtAge(r.age_days) + '</td>' +
          '<td class="barcell"><span class="bar"><i style="width:' + share + '%"></i></span></td>' +
          '<td class="num implied">' + fmtUSD(r.implied_value_usd) + '</td>' +
          '</tr>';
      }).join('');
    }
    document.querySelectorAll('#board th[data-sort]').forEach(function (th) {
      th.classList.remove('asc', 'desc');
      th.removeAttribute('aria-sort');
      if (th.getAttribute('data-sort') === state.sort) {
        th.classList.add(state.dir === 1 ? 'asc' : 'desc');
        th.setAttribute('aria-sort', state.dir === 1 ? 'ascending' : 'descending');
      }
    });
  }

  function renderDetail(slug) {
    var r = null;
    for (var i = 0; i < R.rows.length; i++) if (R.rows[i].slug === slug) { r = R.rows[i]; break; }
    if (!r) { detailEl.hidden = true; selected = null; renderBoard(); return; }
    selected = slug;
    focusedSlug = slug;
    var list = filtered();
    var idx = -1;
    for (var j = 0; j < list.length; j++) if (list[j].slug === slug) { idx = j; break; }
    var prevSlug = idx > 0 ? list[idx - 1].slug : '';
    var nextSlug = (idx !== -1 && idx + 1 < list.length) ? list[idx + 1].slug : '';

    var v = impliedOf(r);
    var fm = farmMetaFor(r);
    var generated = farmStepsFor(r);
    var stored = r.farm_steps || [];
    var planMatches = generated.length === stored.length;
    if (planMatches) {
      for (var k = 0; k < generated.length; k++) if (generated[k] !== stored[k]) { planMatches = false; break; }
    }
    var valueProof = v.implied === r.implied_value_usd
      ? 'Recomputed here from TVL, growth, age and chains: ' + fmtUSD(v.implied) + ', matching board.json.'
      : 'Recomputed here: ' + fmtUSD(v.implied) + ', mismatch with board.json ' + fmtUSD(r.implied_value_usd) + '.';
    var rankWhy = '';
    if (r.rank === 1) {
      var second = R.rows[1];
      rankWhy = 'Rank 1 of ' + R.rows.length + ': the highest implied value on the board' + (second ? '; next is ' + second.name + ' at ' + fmtUSD(second.implied_value_usd) + '.' : '.');
    } else {
      var above = R.rows[r.rank - 2];
      var below = R.rows[r.rank];
      rankWhy = 'Rank ' + r.rank + ' of ' + R.rows.length + ': ' + fmtUSD(v.implied) + ' sits between ' +
        (above ? above.name + ' (' + fmtUSD(above.implied_value_usd) + ')' : 'the top') + ' above and ' +
        (below ? below.name + ' (' + fmtUSD(below.implied_value_usd) + ')' : 'the bottom of the board') + ' below.';
    }    var planProof = planMatches
      ? 'Generated here from category, chains, TVL and age, matching board.json step for step.'
      : 'Generated here, mismatch with board.json farm_steps.';
    var steps = generated.map(function (s) {
      var p = splitStep(s);
      var chips = '';
      if (p.cost) chips += '<span class="chip">Cost: ' + esc(p.cost) + '</span>';
      if (p.time) chips += '<span class="chip">Time: ' + esc(p.time) + '</span>';
      return '<li><p>' + esc(p.action) + '</p><div class="chips">' + chips + '</div></li>';
    }).join('');
    detailEl.innerHTML =
      '<div class="d-head"><span class="d-rank">#' + r.rank + '</span><h2>' + esc(r.name) + '</h2>' +
      (isWatchlist(r) ? '<span class="tag">Watchlist</span>' : '') +
      '<span class="d-meta">' + esc(r.slug) + ' &middot; ' + esc(r.category || 'uncategorised') + ' &middot; ' + esc((r.chains || []).join(', ') || 'no chain listed') + '</span>' +
      '<div class="d-actions">' +
      '<button type="button" class="d-btn" id="d-prev"' + (prevSlug ? '' : ' disabled') + ' data-go="' + esc(prevSlug) + '">&larr; Prev</button>' +
      '<button type="button" class="d-btn" id="d-next"' + (nextSlug ? '' : ' disabled') + ' data-go="' + esc(nextSlug) + '">Next &rarr;</button>' +
      '<button type="button" class="d-btn d-close" id="d-close" aria-label="Close detail">&times; Close</button>' +
      '</div></div>' +
      '<div class="d-grid"><div class="d-col"><h3>Model breakdown</h3><table class="facts">' +
      '<tr><td>TVL</td><td>' + fmtUSD(r.tvl_usd) + '</td></tr>' +
      '<tr><td>Base (TVL &times; ' + R.model.base_multiple + ')</td><td>' + fmtUSD(v.base) + '</td></tr>' +
      '<tr><td>7-day change</td><td class="' + pctClass(r.change_7d) + '">' + fmtPct(r.change_7d) + '</td></tr>' +
      '<tr><td>Growth, clamped ' + fmtPct(v.growthPct) + '</td><td>&times;' + v.growthMult.toFixed(2) + '</td></tr>' +
      '<tr><td>Age</td><td>' + fmtAge(r.age_days) + (r.listed_at ? ' &middot; listed ' + esc(r.listed_at) : '') + '</td></tr>' +
      '<tr><td>Maturity multiplier</td><td>&times;' + v.maturityMult.toFixed(2) + '</td></tr>' +
      '<tr><td>Chains (' + (r.chains || []).length + ')</td><td>&times;' + v.breadthMult.toFixed(2) + '</td></tr>' +
      '<tr class="total"><td>Implied value</td><td>' + fmtUSD(v.implied) + '</td></tr>' +
      '</table><p class="proof">' + esc(rankWhy) + '</p><p class="proof">' + esc(valueProof) + '</p></div>' +
      '<div class="d-col"><h3>Farm plan</h3>' +
      '<div class="plan-summary">' +
      '<div><span class="ps-lbl">Total capital</span><span class="ps-val">$' + fm.totalCapital + ' ($' + fm.capital + '+$' + fm.small + ')</span></div>' +
      '<div><span class="ps-lbl">Est. gas budget</span><span class="ps-val">~$' + fm.totalGas + ' (' + esc(fm.chain) + ')</span></div>' +
      '<div><span class="ps-lbl">Hold window</span><span class="ps-val">' + fm.hold + 'd (' + fm.weeks + ' snapshots)</span></div>' +
      '</div>' +
      '<ol class="steps">' + steps + '</ol><p class="proof">' + esc(planProof) + '</p></div></div>';
    detailEl.hidden = false;
    renderBoard();
  }

  function closeDetail(restoreFocus) {
    var prev = selected;
    selected = null;
    detailEl.hidden = true;
    renderBoard();
    setHash();
    if (restoreFocus && prev) {
      var tr = rowsEl.querySelector('tr[data-slug="' + CSS.escape(prev) + '"]');
      if (tr) tr.focus();
    }
  }

  function renderLive() {
    $('liverows').innerHTML = R.live.map(function (p) {
      var ratio = (p.mcap_usd && p.tvl_usd) ? (p.mcap_usd / p.tvl_usd).toFixed(2) + 'x' : '\u2014';
      return '<tr><td><span class="name">' + esc(p.name) + '</span><span class="slug">' + esc(p.slug) + '</span></td>' +
        '<td class="cat">' + esc(p.category || '\u2014') + '</td>' +
        '<td class="chains">' + esc((p.chains || []).slice(0, 3).join(', ') || '\u2014') + '</td>' +
        '<td class="num">' + fmtUSD(p.tvl_usd) + '</td>' +
        '<td class="num">' + fmtUSD(p.mcap_usd) + '</td>' +
        '<td class="num">' + ratio + '</td>' +
        '<td class="num ' + pctClass(p.change_7d) + '">' + fmtPct(p.change_7d) + '</td></tr>';
    }).join('');
  }

  function renderStats() {
    $('asof').textContent = R.as_of;
    var covered = 0;
    var totalImplied = 0;
    R.rows.forEach(function (r) { if (isWatchlist(r)) covered++; totalImplied += r.implied_value_usd; });
    $('boardcount').textContent = R.board_size;
    $('stats').innerHTML =
      '<div class="hero"><dt>Total implied value</dt><dd>' + fmtUSD(totalImplied) + '</dd></div>' +
      '<div><dt>Watchlist covered</dt><dd>' + covered + ' / ' + R.watchlist_size + '</dd></div>' +
      '<div><dt>Board rows</dt><dd>' + R.board_size + '</dd></div>' +
      '<div><dt>Early rows</dt><dd>' + R.early_size + '</dd></div>' +
      '<div><dt>Floor</dt><dd>' + fmtUSD(R.floor_usd) + '</dd></div>' +
      '<div><dt>Already trading</dt><dd>' + R.live_size + '</dd></div>';
    $('src').textContent = R.source;
    $('footrows').textContent = R.board_size + ' ranked rows, ' + R.watchlist_size + ' on the watchlist and ' + R.early_size + ' early ones below the floor';
  }

  function setHash() {
    var parts = [];
    if (selected) parts.push('detail=' + encodeURIComponent(selected));
    if (state.q) parts.push('q=' + encodeURIComponent(state.q));
    if (state.cat !== 'all') parts.push('cat=' + encodeURIComponent(state.cat));
    if (state.scope !== 'all') parts.push('scope=' + state.scope);
    if (state.chain !== 'all') parts.push('chain=' + encodeURIComponent(state.chain));
    history.replaceState(null, '', parts.length ? '#' + parts.join('&') : '#');
  }

  function readHash() {
    var h = location.hash.replace(/^#/, '');
    if (!h) return;
    h.split('&').forEach(function (pair) {
      var kv = pair.split('=');
      var k = decodeURIComponent(kv[0] || '');
      var v = decodeURIComponent(kv[1] || '');
      if (k === 'q') { state.q = v; qEl.value = v; }
      if (k === 'cat' && categories.indexOf(v) !== -1) { state.cat = v; $('cat').value = v; }
      if (k === 'scope' && (v === 'watchlist' || v === 'early')) { state.scope = v; $('scope').value = v; }
      if (k === 'chain' && chains.indexOf(v) !== -1) { state.chain = v; $('chain').value = v; }
      if (k === 'detail') selected = v;
    });
  }

  function toggleRow(slug) {
    if (slug === selected) { closeDetail(true); return; }
    renderDetail(slug);
    setHash();
    detailEl.scrollIntoView({ block: 'nearest' });
  }

  rowsEl.addEventListener('click', function (ev) {
    var tr = ev.target.closest('tr[data-slug]');
    if (!tr) return;
    toggleRow(tr.getAttribute('data-slug'));
  });

  rowsEl.addEventListener('focusin', function (ev) {
    var tr = ev.target.closest('tr[data-slug]');
    if (tr) focusedSlug = tr.getAttribute('data-slug');
  });

  detailEl.addEventListener('click', function (ev) {
    var closeBtn = ev.target.closest('#d-close');
    if (closeBtn) { closeDetail(true); return; }
    var goBtn = ev.target.closest('[data-go]');
    if (goBtn && !goBtn.disabled) {
      var goSlug = goBtn.getAttribute('data-go');
      var wasPrev = !!ev.target.closest('#d-prev');
      if (goSlug) {
        renderDetail(goSlug);
        setHash();
        // renderDetail rebuilds the detail buttons, so the focused button is
        // destroyed: move focus to its replacement (or Close if disabled).
        var nb = $(wasPrev ? 'd-prev' : 'd-next');
        if (nb && !nb.disabled) nb.focus();
        else { var cb = $('d-close'); if (cb) cb.focus(); }
      }
    }
  });

  document.querySelector('.movers').addEventListener('click', function (ev) {
    var btn = ev.target.closest('button[data-mover]');
    if (!btn) return;
    var slug = btn.getAttribute('data-mover');
    renderDetail(slug);
    setHash();
    detailEl.scrollIntoView({ block: 'nearest' });
    // Keyboard-activated (Enter/Space fires click with detail === 0): the
    // detail sits above the board in DOM order, so move focus into it;
    // otherwise forward Tab from the mover row would skip the detail buttons.
    if (ev.detail === 0) { var cb = $('d-close'); if (cb) cb.focus(); }
  });

  function toggleSort(th) {
    var key = th.getAttribute('data-sort');
    if (state.sort === key) { state.dir = -state.dir; }
    else { state.sort = key; state.dir = key === 'name' || key === 'category' || key === 'rank' ? 1 : -1; }
    renderBoard();
  }

  document.querySelectorAll('#board th[data-sort]').forEach(function (th) {
    th.addEventListener('click', function () { toggleSort(th); });
    th.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggleSort(th); }
    });
  });

  qEl.addEventListener('input', function (ev) { state.q = ev.target.value; renderBoard(); setHash(); });
  clearQEl.addEventListener('click', function () { state.q = ''; qEl.value = ''; renderBoard(); setHash(); qEl.focus(); });
  $('cat').addEventListener('change', function (ev) { state.cat = ev.target.value; renderBoard(); setHash(); });
  $('scope').addEventListener('change', function (ev) { state.scope = ev.target.value; renderBoard(); setHash(); });
  $('chain').addEventListener('change', function (ev) { state.chain = ev.target.value; renderBoard(); setHash(); });

  document.querySelector('.scope-pills').addEventListener('click', function (ev) {
    var btn = ev.target.closest('button');
    if (!btn) return;
    if (btn.id === 'reset-filters') {
      state.q = ''; state.cat = 'all'; state.scope = 'all'; state.chain = 'all';
      qEl.value = ''; $('cat').value = 'all'; $('scope').value = 'all'; $('chain').value = 'all';
      renderBoard();
      setHash();
      return;
    }
    var sc = btn.getAttribute('data-scope');
    if (sc) {
      state.scope = sc;
      $('scope').value = sc;
      renderBoard();
      setHash();
    }
  });

  // Keyboard navigation: ArrowUp/ArrowDown move between rows, Enter opens detail, Esc closes, / focuses search.
  document.addEventListener('keydown', function (ev) {
    var tag = ev.target && ev.target.tagName;
    var inInput = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';

    if (ev.key === '/' && !inInput) {
      ev.preventDefault();
      qEl.focus();
      qEl.select();
      return;
    }
    if (ev.key === 'Escape') {
      if (inInput && ev.target === qEl && state.q) {
        state.q = ''; qEl.value = ''; renderBoard(); setHash();
        return;
      }
      if (!detailEl.hidden) {
        closeDetail(true);
        return;
      }
    }
    if (inInput) return;

    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      var rows = rowsEl.querySelectorAll('tr[data-slug]');
      if (!rows.length) return;
      ev.preventDefault();
      var idx = -1;
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].getAttribute('data-slug') === focusedSlug) { idx = i; break; }
      }
      if (idx === -1) idx = ev.key === 'ArrowDown' ? 0 : rows.length - 1;
      else idx = ev.key === 'ArrowDown' ? Math.min(rows.length - 1, idx + 1) : Math.max(0, idx - 1);
      var target = rows[idx];
      var nextSlug = target.getAttribute('data-slug');
      if (focusedSlug) {
        var prevEl = rowsEl.querySelector('tr.kb-focus');
        if (prevEl) { prevEl.classList.remove('kb-focus'); prevEl.setAttribute('tabindex', '-1'); }
      }
      focusedSlug = nextSlug;
      target.classList.add('kb-focus');
      target.setAttribute('tabindex', '0');
      target.focus({ preventScroll: false });
      return;
    }

    if (ev.key === 'Enter' || ev.key === ' ') {
      var tr = ev.target && ev.target.closest ? ev.target.closest('tr[data-slug]') : null;
      if (tr) {
        ev.preventDefault();
        toggleRow(tr.getAttribute('data-slug'));
        // Detail sits above the board in DOM order: when it opens from the
        // keyboard, move focus into it (Close), so forward Tab reaches the
        // detail buttons instead of skipping them.
        if (!detailEl.hidden) { var cb = $('d-close'); if (cb) cb.focus(); }
      }
    }
  });

  window.addEventListener('hashchange', function () {
    state.q = ''; state.cat = 'all'; state.scope = 'all'; state.chain = 'all'; selected = null;
    qEl.value = ''; $('cat').value = 'all'; $('scope').value = 'all'; $('chain').value = 'all';
    detailEl.hidden = true;
    readHash();
    renderBoard();
    if (selected) {
      renderDetail(selected);
      detailEl.scrollIntoView();
    }
  });

  readHash();
  renderStats();
  renderMovers();
  renderBoard();
  renderLive();
  renderSelfCheck();
  if (selected) {
    renderDetail(selected);
    detailEl.scrollIntoView();
  }
})();
