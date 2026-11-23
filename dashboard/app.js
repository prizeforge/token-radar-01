// Token Radar dashboard: sortable, filterable board with a detail view.
// Reads window.RADAR from data.js. No network, no fetch, no framework.
//
// The page does not trust the numbers it is handed: it recomputes every
// row's implied value from the row's own TVL, seven-day change, age and
// chains, using the same radar-2 rule the entry's model runs, and it
// regenerates every row's farm plan from the row's own category, chains,
// TVL and age. The detail view says so, row by row, and
// window.__radarCheck() checks the whole board at once.

(function () {
  'use strict';

  var R = window.RADAR;
  if (!R || !Array.isArray(R.rows)) {
    document.body.innerHTML = '<p style="padding:40px;font-family:sans-serif">Token Radar: no data loaded.</p>';
    return;
  }

  // Watchlist membership comes from the snapshot's own list, carried
  // in the data so the page never has to guess it from row order.
  var wl = {};
  (R.watchlist_slugs || []).forEach(function (s) { wl[s] = true; });

  var state = { q: '', cat: 'all', scope: 'all', chain: 'all', sort: 'rank', dir: 1 };
  var selected = null;

  var $ = function (id) { return document.getElementById(id); };
  var rowsEl = $('rows');
  var detailEl = $('detail');
  var boardWrap = document.querySelector('.boardwrap');

  /** $2,754,000,000 -> $2.75B, $154,313,682 -> $154.3M, $48,967,055 -> $49.0M. */
  function fmtUSD(n) {
    if (n === null || n === undefined) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }

  function fmtPct(n) {
    if (n === null || n === undefined) return '—';
    var s = (n > 0 ? '+' : '') + n.toFixed(1) + '%';
    return s;
  }

  function pctClass(n) {
    if (n === null || n === undefined) return 'flat';
    if (n > 0.5) return 'pos';
    if (n < -0.5) return 'neg';
    return 'flat';
  }

  function fmtAge(n) {
    if (n === null || n === undefined) return '—';
    if (n >= 365) return (n / 365).toFixed(1) + 'y';
    return n + 'd';
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ---- The value model, run here, in the page -------------------------
  //
  // radar-2, the same rule lib/model.ts scores the board with:
  //   base       = tvl_usd x 0.30
  //   growth     = clamp(change_7d, -50, 100) per cent
  //   growthMult = 1 + (growth / 100) x 0.60
  //   maturity   = 0.70 + min(age_days, 1460) / 1460 x 0.50 (unknown age: 365)
  //   breadth    = 1 + 0.04 x min(chains - 1, 5)
  //   implied    = max(1, round(base x growthMult x maturity x breadth))
  // The constants come from R.model, which data.js carries from the model
  // itself, so the page and the board can never drift apart silently.

  /** A row's implied value, recomputed here from its own figures. */
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
    return { implied: implied, growthPct: growthPct, growthMult: growthMult, maturityMult: maturityMult, breadthMult: breadthMult, base: base };
  }

  // ---- The farm plan, generated here, in the page ---------------------
  //
  // The same derivation lib/model.ts uses: the plan follows from the
  // row's category, chains, TVL and age, never from a hand-written list
  // of names. Fifteen category branches, one main action, one weekly
  // qualifying action and one second leg each.

  /** The first chain a row names, or a neutral phrase. */
  function chainOf(r) {
    return (r.chains && r.chains.length > 0) ? r.chains[0] : 'its main chain';
  }

  /** How much capital one farm position needs, from the row's own TVL. */
  function capitalFor(r) {
    if (r.tvl_usd >= 1e9) return 250;
    if (r.tvl_usd >= 1e8) return 150;
    if (r.tvl_usd >= 5e7) return 100;
    return 50;
  }

  /** How long to hold, from the row's age: younger rows get a longer qualifying window. */
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 45;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }

  /** The category's main action, in the words a farmer can follow. */
  function actionFor(r, capital, chain) {
    var c = (r.category || '').toLowerCase();
    var name = r.name;
    if (c.indexOf('lend') !== -1 || c.indexOf('cdp') !== -1 || c.indexOf('collateral') !== -1) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and leave the supply open.';
    if (c.indexOf('dex') !== -1 || c.indexOf('leveraged farm') !== -1) return 'Provide $' + capital + ' of liquidity to ' + name + '\'s main pool on ' + chain + ' and leave the position open.';
    if (c.indexOf('yield aggregator') !== -1 || c.indexOf('yield') !== -1) return 'Deposit $' + capital + ' of USDC into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('bridge') !== -1) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and put the bridged funds to work in its app.';
    if (c.indexOf('staking') !== -1 || c.indexOf('restak') !== -1) return 'Stake $' + capital + ' of the chain\'s staking asset through ' + name + ' and keep the receipt token.';
    if (c.indexOf('perpetual') !== -1 || c.indexOf('derivative') !== -1) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged position.';
    if (c.indexOf('prediction') !== -1) return 'Fund $' + capital + ' on ' + name + ' and take one position in an active market.';
    if (c.indexOf('curator') !== -1 || c.indexOf('allocator') !== -1) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') !== -1) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') !== -1) return 'Mint $' + capital + ' of the yield-bearing asset ' + name + ' issues on ' + chain + ' and hold it.';
    if (c.indexOf('insurance') !== -1) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    if (c.indexOf('basis') !== -1) return 'Deposit $' + capital + ' into a ' + name + ' basis vault on ' + chain + ' and keep the position open.';
    if (c.indexOf('chain') !== -1) return 'Bridge $' + capital + ' of USDC onto ' + chain + ' and use it in one of the chain\'s own apps.';
    if (c.indexOf('payment') !== -1) return 'Fund $' + capital + ' into your ' + name + ' balance on ' + chain + ' and keep it ready to spend.';
    if (c.indexOf('liquidity manager') !== -1) return 'Deposit $' + capital + ' into a ' + name + ' managed position on ' + chain + ' and leave it running.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }

  /** The category's weekly qualifying action. */
  function weeklyFor(r, chain) {
    var c = (r.category || '').toLowerCase();
    var name = r.name;
    if (c.indexOf('lend') !== -1 || c.indexOf('cdp') !== -1 || c.indexOf('collateral') !== -1) return 'Once a week, adjust the position on ' + name + ': add a little supply, or borrow a small amount and repay it the same day.';
    if (c.indexOf('dex') !== -1 || c.indexOf('leveraged farm') !== -1) return 'Once a week, route one swap through ' + name + ' on ' + chain + ' so the wallet shows trading activity as well as liquidity.';
    if (c.indexOf('yield aggregator') !== -1 || c.indexOf('yield') !== -1) return 'Once a week, harvest or compound the vault rewards on ' + name + ' instead of letting them sit unclaimed.';
    if (c.indexOf('bridge') !== -1) return 'Once a week, move a small amount through ' + name + ' again, or use the bridged funds in a second app on ' + chain + '.';
    if (c.indexOf('staking') !== -1 || c.indexOf('restak') !== -1) return 'Once a week, check the staking rewards on ' + name + ' and restake what has accrued.';
    if (c.indexOf('perpetual') !== -1 || c.indexOf('derivative') !== -1) return 'Once a week, rebalance the hedge on ' + name + ' so the margin account stays active.';
    if (c.indexOf('prediction') !== -1) return 'Once a week, settle one market on ' + name + ' and take a position in a new one.';
    if (c.indexOf('curator') !== -1 || c.indexOf('allocator') !== -1) return 'Once a week, read ' + name + '\'s allocation report and note which vaults it moved funds into.';
    if (c.indexOf('stable') !== -1) return 'Once a week, check the peg and the yield on ' + name + '\'s stable asset and top the balance up if it fell.';
    if (c.indexOf('rwa') !== -1) return 'Once a week, check the yield that has accrued on ' + name + '\'s asset and keep the holding through the next distribution.';
    if (c.indexOf('insurance') !== -1) return 'Once a week, check that the ' + name + ' policy is still active and that its cover amount matches the position.';
    if (c.indexOf('basis') !== -1) return 'Once a week, check the funding rate ' + name + ' is earning and keep the vault position open through it.';
    if (c.indexOf('chain') !== -1) return 'Once a week, make one transaction in an app on ' + chain + ' from the same wallet.';
    if (c.indexOf('payment') !== -1) return 'Once a week, pay for something small with the ' + name + ' balance so the account shows real use.';
    return 'Once a week, do one qualifying action on ' + name + ': a deposit, a swap, a vote or a claim.';
  }

  /** The category's second leg: a different feature of the same protocol, so the farm is not one action repeated. */
  function secondLegFor(r, capital, chain) {
    var c = (r.category || '').toLowerCase();
    var name = r.name;
    var small = Math.max(10, Math.round(capital / 5));
    if (c.indexOf('lend') !== -1 || c.indexOf('cdp') !== -1 || c.indexOf('collateral') !== -1) return 'Borrow $' + small + ' against the supply on ' + name + ', hold the loan for a week, then repay it in full.';
    if (c.indexOf('dex') !== -1 || c.indexOf('leveraged farm') !== -1) return 'Open a second, smaller position in another ' + name + ' pool on ' + chain + ', about $' + small + ', and keep both open.';
    if (c.indexOf('yield aggregator') !== -1 || c.indexOf('yield') !== -1) return 'Try a second ' + name + ' vault strategy with about $' + small + ' so the wallet touches more than one product.';
    if (c.indexOf('bridge') !== -1) return 'Use the bridged funds on ' + chain + ' in a lending or swap app, then bridge a small amount back through ' + name + '.';
    if (c.indexOf('staking') !== -1 || c.indexOf('restak') !== -1) return 'Stake a second, smaller amount through ' + name + ' and delegate it to a different validator or pool.';
    if (c.indexOf('perpetual') !== -1 || c.indexOf('derivative') !== -1) return 'Close the first hedge on ' + name + ' and open a fresh one, so the account shows more than one completed trade.';
    if (c.indexOf('prediction') !== -1) return 'Take a position in a second ' + name + ' market in a different category from the first.';
    if (c.indexOf('curator') !== -1 || c.indexOf('allocator') !== -1) return 'Deposit about $' + small + ' into a second ' + name + ' vault with a different risk profile.';
    if (c.indexOf('stable') !== -1) return 'Provide $' + small + ' of ' + name + '\'s stable asset as liquidity in a pool on ' + chain + '.';
    if (c.indexOf('rwa') !== -1) return 'Hold the ' + name + ' asset through one full distribution cycle before deciding whether to add more.';
    if (c.indexOf('insurance') !== -1) return 'Add cover for a second position through ' + name + ' so the wallet holds more than one policy.';
    if (c.indexOf('basis') !== -1) return 'Keep the ' + name + ' vault position open through one full funding cycle and note the rate it paid.';
    if (c.indexOf('chain') !== -1) return 'Try a second app on ' + chain + ' from the same wallet, such as a swap or a lending market.';
    if (c.indexOf('payment') !== -1) return 'Use the ' + name + ' balance on a second payment rail, such as a card top-up or a merchant payment.';
    return 'Use a second feature of ' + name + ' once, such as its vote, its rewards page or a different pool.';
  }

  /** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + ' Hold the position and check the protocol\'s own page.';
    return s;
  }

  /** A row's farm plan: six steps, generated here from its own record. */
  function farmStepsFor(r) {
    var chain = chainOf(r);
    var capital = capitalFor(r);
    var hold = holdDaysFor(r.age_days);
    var gas = capital >= 150 ? 8 : 4;
    var small = Math.max(10, Math.round(capital / 5));
    return [
      stepText({ text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' }),
      stepText({ text: actionFor(r, capital, chain), cost: '$' + capital + ' of capital and about $' + gas + ' of gas', time: '15 minutes to set up' }),
      stepText({ text: weeklyFor(r, chain), cost: 'about $2 of gas a week', time: '10 minutes a week' }),
      stepText({ text: secondLegFor(r, capital, chain), cost: 'about $' + small + ' of extra capital and about $' + gas + ' of gas', time: '20 minutes' }),
      stepText({ text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' }),
      stepText({ text: 'Before you withdraw, open the protocol\'s own points or rewards page and claim only from the link it publishes.', cost: 'no fee to check, and never pay to claim', time: '10 minutes' })
    ];
  }

  /** The plan's size in one line, from the same numbers the steps use:
      capital across both positions, gas for the first transaction, the
      set-up and the second leg plus $2 a week over the hold, and the hold
      itself. A view summary only; it is not part of farm_steps. */
  function planTotals(r) {
    var capital = capitalFor(r);
    var hold = holdDaysFor(r.age_days);
    var gas = capital >= 150 ? 8 : 4;
    var small = Math.max(10, Math.round(capital / 5));
    var weeks = Math.ceil(hold / 7);
    var gasTotal = 3 + gas + 2 * weeks + gas;
    return 'Plan total: $' + (capital + small) + ' of capital, about $' + gasTotal + ' of gas, over at least ' + hold + ' days.';
  }

  // ---- The whole-board check, for the page and for tests ---------------
  //
  // Recomputes every row's implied value and regenerates every row's
  // farm plan, then compares both against what the board carries.
  // The footer shows the result on every load; a headless check can
  // read window.__radarCheck() directly.

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

  /** "Do X. Cost: $50. Time: 15 minutes." -> { action, cost, time }. */
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

  function filtered() {
    var q = state.q.trim().toLowerCase();
    var out = R.rows.filter(function (r) {
      if (state.scope === 'watchlist' && !isWatchlist(r)) return false;
      if (state.scope === 'early' && isWatchlist(r)) return false;
      if (state.cat !== 'all' && r.category !== state.cat) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) === -1) return false;
      if (q && r.name.toLowerCase().indexOf(q) === -1 && r.slug.toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    var key = state.sort;
    var dir = state.dir;
    out.sort(function (a, b) {
      var va = a[key];
      var vb = b[key];
      if (va === null || va === undefined) va = key === 'name' || key === 'category' ? '' : -Infinity;
      if (vb === null || vb === undefined) vb = key === 'name' || key === 'category' ? '' : -Infinity;
      if (typeof va === 'string') return va.localeCompare(vb) * dir;
      return (va - vb) * dir;
    });
    return out;
  }

  function renderBoard() {
    var list = filtered();
    $('count').textContent = list.length + ' of ' + R.rows.length + ' rows';
    rowsEl.innerHTML = list.map(function (r) {
      var cls = r.slug === selected ? ' class="selected"' : '';
      // Value bar: linear against the top row's implied value, so the
      // eye can rank the board without reading a single number.
      var share = Math.max(1, Math.round((r.implied_value_usd / maxImplied) * 100));
      return '<tr data-slug="' + esc(r.slug) + '"' + cls + '>' +
        '<td class="rank">' + r.rank + '</td>' +
        '<td><span class="notoken" title="No token recorded"></span><a class="name namelink" href="#' + hashParts(r.slug) + '">' + esc(r.name) + '</a>' +
        '<span class="slug">' + esc(r.slug) + '</span>' +
        (isWatchlist(r) ? '<span class="tag">Watchlist</span>' : '') + '</td>' +
        '<td class="cat">' + esc(r.category || '—') + '</td>' +
        '<td class="chains">' + esc((r.chains || []).slice(0, 3).join(', ') || '—') + '</td>' +
        '<td class="num">' + fmtUSD(r.tvl_usd) + '</td>' +
        '<td class="num ' + pctClass(r.change_7d) + '">' + fmtPct(r.change_7d) + '</td>' +
        '<td class="num">' + fmtAge(r.age_days) + '</td>' +
        '<td class="barcell"><span class="bar"><i style="width:' + share + '%"></i></span></td>' +
        '<td class="num"><strong>' + fmtUSD(r.implied_value_usd) + '</strong></td>' +
        '</tr>';
    }).join('');
    // The CSS reserve held the live section in place before the rows
    // existed. The rows are in now, in the same task, so drop the
    // reserve before anything paints: from here the wrap's height is
    // the table's own, and filtering to fewer rows shrinks it instead
    // of leaving a gap.
    if (boardWrap) boardWrap.style.minHeight = '0';
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
    var v = impliedOf(r);
    var generated = farmStepsFor(r);
    var stored = r.farm_steps || [];
    var planMatches = generated.length === stored.length;
    if (planMatches) {
      for (var i = 0; i < generated.length; i++) if (generated[i] !== stored[i]) { planMatches = false; break; }
    }
    var valueProof = v.implied === r.implied_value_usd
      ? 'Recomputed here from TVL, growth, age and chains: ' + fmtUSD(v.implied) + ', which matches the board.json value for this row.'
      : 'Recomputed here from TVL, growth, age and chains: ' + fmtUSD(v.implied) + ', which does NOT match the board.json value ' + fmtUSD(r.implied_value_usd) + ' for this row.';
    var planProof = planMatches
      ? 'Generated here from the row\u2019s own category, chains, TVL and age, and identical, step for step, to the plan board.json carries.'
      : 'Generated here from the row\u2019s own category, chains, TVL and age, but it does NOT match the plan board.json carries.';
    var steps = generated.map(function (s) {
      var p = splitStep(s);
      var chips = '';
      if (p.cost) chips += '<span class="chip">Cost: ' + esc(p.cost) + '</span>';
      if (p.time) chips += '<span class="chip">Time: ' + esc(p.time) + '</span>';
      return '<li><p>' + esc(p.action) + '</p><div class="chips">' + chips + '</div></li>';
    }).join('');
    detailEl.innerHTML =
      '<div class="d-head"><span class="d-rank">#' + r.rank + '</span><h2>' + esc(r.name) + '</h2>' +
      '<span class="d-meta">' + esc(r.slug) + ', ' + esc(r.category || 'uncategorised') + ', ' + esc((r.chains || []).join(', ') || 'no chain listed') + '</span>' +
      '<button type="button" class="d-close">Close</button></div>' +
      '<div class="d-grid"><div class="d-col"><h3>Model breakdown</h3><table class="facts">' +
      '<tr><td>TVL</td><td>' + fmtUSD(r.tvl_usd) + '</td></tr>' +
      '<tr><td>Base: TVL &times; ' + R.model.base_multiple + '</td><td>' + fmtUSD(v.base) + '</td></tr>' +
      '<tr><td>7-day change</td><td>' + fmtPct(r.change_7d) + '</td></tr>' +
      '<tr><td>Growth, clamped ' + fmtPct(v.growthPct) + '</td><td>&times;' + v.growthMult.toFixed(2) + '</td></tr>' +
      '<tr><td>Age</td><td>' + fmtAge(r.age_days) + (r.listed_at ? ' &middot; listed ' + esc(r.listed_at) : '') + '</td></tr>' +
      '<tr><td>Maturity multiplier</td><td>&times;' + v.maturityMult.toFixed(2) + '</td></tr>' +
      '<tr><td>Chains (' + (r.chains || []).length + ')</td><td>&times;' + v.breadthMult.toFixed(2) + '</td></tr>' +
      '<tr><td><strong>Implied value</strong></td><td><strong>' + fmtUSD(v.implied) + '</strong></td></tr>' +
      '</table><p class="proof">' + esc(valueProof) + '</p></div>' +
      '<div class="d-col"><h3>Farm plan</h3><ol class="steps">' + steps + '</ol><p class="totals">' + esc(planTotals(r)) + '</p><p class="proof">' + esc(planProof) + '</p></div></div>';
    detailEl.hidden = false;
    detailEl.querySelector('.d-close').addEventListener('click', function () {
      selected = null;
      detailEl.hidden = true;
      renderBoard();
      setHash();
      var link = document.querySelector('tr[data-slug="' + slug + '"] .namelink');
      if (link) link.focus();
    });
    renderBoard();
  }

  function renderLive() {
    $('liverows').innerHTML = R.live.map(function (p) {
      var ratio = (p.mcap_usd && p.tvl_usd) ? (p.mcap_usd / p.tvl_usd).toFixed(2) + 'x' : '—';
      return '<tr><td><span class="name">' + esc(p.name) + '</span><span class="slug">' + esc(p.slug) + '</span></td>' +
        '<td class="cat">' + esc(p.category || '—') + '</td>' +
        '<td class="chains">' + esc((p.chains || []).slice(0, 3).join(', ') || '—') + '</td>' +
        '<td class="num">' + fmtUSD(p.tvl_usd) + '</td>' +
        '<td class="num">' + fmtUSD(p.mcap_usd) + '</td>' +
        '<td class="num">' + ratio + '</td>' +
        '<td class="num ' + pctClass(p.change_7d) + '">' + fmtPct(p.change_7d) + '</td></tr>';
    }).join('');
  }

  function renderStats() {
    $('asof').textContent = R.as_of;
    var covered = 0;
    R.rows.forEach(function (r) { if (isWatchlist(r)) covered++; });
    $('boardcount').textContent = R.board_size;
    $('stats').innerHTML =
      '<div><dt>Watchlist covered</dt><dd>' + covered + ' / ' + R.watchlist_size + '</dd></div>' +
      '<div><dt>Board rows</dt><dd>' + R.board_size + '</dd></div>' +
      '<div><dt>Early rows</dt><dd>' + R.early_size + '</dd></div>' +
      '<div><dt>Floor</dt><dd>' + fmtUSD(R.floor_usd) + '</dd></div>' +
      '<div><dt>Already trading</dt><dd>' + R.live_size + '</dd></div>';
    $('src').textContent = R.source;
    $('footrows').textContent = R.board_size + ' ranked rows, ' + R.watchlist_size + ' on the watchlist and ' + R.early_size + ' early ones below the floor';
  }

  /** The hash for a view: the detail slug first, then the filters in
      force, so a link to a row never wipes the filters. */
  function hashParts(slug) {
    var parts = [];
    if (slug) parts.push('detail=' + encodeURIComponent(slug));
    if (state.q) parts.push('q=' + encodeURIComponent(state.q));
    if (state.cat !== 'all') parts.push('cat=' + encodeURIComponent(state.cat));
    if (state.scope !== 'all') parts.push('scope=' + state.scope);
    if (state.chain !== 'all') parts.push('chain=' + encodeURIComponent(state.chain));
    return parts.join('&');
  }

  function setHash() {
    var h = hashParts(selected);
    history.replaceState(null, '', h ? '#' + h : '#');
  }

  function readHash() {
    var h = location.hash.replace(/^#/, '');
    if (!h) return;
    h.split('&').forEach(function (pair) {
      var kv = pair.split('=');
      var k = decodeURIComponent(kv[0] || '');
      var v = decodeURIComponent(kv[1] || '');
      if (k === 'q') { state.q = v; $('q').value = v; }
      if (k === 'cat' && categories.indexOf(v) !== -1) { state.cat = v; $('cat').value = v; }
      if (k === 'scope' && (v === 'watchlist' || v === 'early')) { state.scope = v; $('scope').value = v; }
      if (k === 'chain' && chains.indexOf(v) !== -1) { state.chain = v; $('chain').value = v; }
      if (k === 'detail') selected = v;
    });
  }

  rowsEl.addEventListener('click', function (ev) {
    // A click on the name link lets the hash navigation open the detail;
    // the row handler must not also toggle it shut.
    if (ev.target.closest('a')) return;
    var tr = ev.target.closest('tr[data-slug]');
    if (!tr) return;
    var slug = tr.getAttribute('data-slug');
    if (slug === selected) { selected = null; detailEl.hidden = true; renderBoard(); setHash(); return; }
    renderDetail(slug);
    setHash();
    detailEl.scrollIntoView({ block: 'nearest' });
  });

  document.querySelectorAll('#board th[data-sort] button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var key = btn.parentElement.getAttribute('data-sort');
      if (state.sort === key) { state.dir = -state.dir; } else { state.sort = key; state.dir = key === 'name' || key === 'category' ? 1 : -1; }
      renderBoard();
    });
  });

  $('q').addEventListener('input', function (ev) { state.q = ev.target.value; renderBoard(); });
  $('cat').addEventListener('change', function (ev) { state.cat = ev.target.value; renderBoard(); });
  $('scope').addEventListener('change', function (ev) { state.scope = ev.target.value; renderBoard(); });
  $('chain').addEventListener('change', function (ev) { state.chain = ev.target.value; renderBoard(); });

  // A hash pasted in or edited by hand re-applies, so a shared link
  // always shows the view it names.
  window.addEventListener('hashchange', function () {
    state.q = ''; state.cat = 'all'; state.scope = 'all'; state.chain = 'all'; selected = null;
    $('q').value = ''; $('cat').value = 'all'; $('scope').value = 'all'; $('chain').value = 'all';
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
  renderBoard();
  renderLive();
  renderSelfCheck();
  if (selected) {
    renderDetail(selected);
    // A detail opened from a link lands in view, so a capture of the
    // page shows the detail panel instead of the board's top rows.
    detailEl.scrollIntoView();
  }
})();
