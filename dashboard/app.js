// Token Radar dashboard: sortable, filterable board with a detail view.
// Reads window.RADAR from data.js. No network, no fetch, no framework.

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
      return '<tr data-slug="' + esc(r.slug) + '"' + cls + '>' +
        '<td class="rank">' + r.rank + '</td>' +
        '<td><span class="name">' + esc(r.name) + '</span>' +
        (isWatchlist(r) ? '<span class="tag">Watchlist</span>' : '') +
        '<span class="slug">' + esc(r.slug) + '</span></td>' +
        '<td class="cat">' + esc(r.category || '—') + '</td>' +
        '<td class="chains">' + esc((r.chains || []).slice(0, 3).join(', ') || '—') + '</td>' +
        '<td class="num">' + fmtUSD(r.tvl_usd) + '</td>' +
        '<td class="num ' + pctClass(r.change_7d) + '">' + fmtPct(r.change_7d) + '</td>' +
        '<td class="num">' + fmtAge(r.age_days) + '</td>' +
        '<td class="num"><strong>' + fmtUSD(r.implied_value_usd) + '</strong></td>' +
        '</tr>';
    }).join('');
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
    var base = r.tvl_usd * R.model.base_multiple;
    var steps = (r.farm_steps || []).map(function (s) {
      var p = splitStep(s);
      var chips = '';
      if (p.cost) chips += '<span class="chip">Cost: ' + esc(p.cost) + '</span>';
      if (p.time) chips += '<span class="chip">Time: ' + esc(p.time) + '</span>';
      return '<li><p>' + esc(p.action) + '</p><div class="chips">' + chips + '</div></li>';
    }).join('');
    detailEl.innerHTML =
      '<div class="d-head"><span class="d-rank">#' + r.rank + '</span><h2>' + esc(r.name) + '</h2>' +
      '<span class="d-meta">' + esc(r.slug) + ' &middot; ' + esc(r.category || 'uncategorised') + ' &middot; ' + esc((r.chains || []).join(', ') || 'no chain listed') + '</span></div>' +
      '<div class="d-grid"><div class="d-col"><h3>Model breakdown</h3><table class="facts">' +
      '<tr><td>TVL</td><td>' + fmtUSD(r.tvl_usd) + '</td></tr>' +
      '<tr><td>Base: TVL &times; ' + R.model.base_multiple + '</td><td>' + fmtUSD(base) + '</td></tr>' +
      '<tr><td>7-day change</td><td>' + fmtPct(r.change_7d) + '</td></tr>' +
      '<tr><td>Growth multiplier</td><td>&times;' + r.growth_multiplier.toFixed(2) + '</td></tr>' +
      '<tr><td>Age</td><td>' + fmtAge(r.age_days) + (r.listed_at ? ' &middot; listed ' + esc(r.listed_at) : '') + '</td></tr>' +
      '<tr><td>Maturity multiplier</td><td>&times;' + r.maturity_multiplier.toFixed(2) + '</td></tr>' +
      '<tr><td>Chains (' + (r.chains || []).length + ')</td><td>&times;' + r.breadth_multiplier.toFixed(2) + '</td></tr>' +
      '<tr><td><strong>Implied value</strong></td><td><strong>' + fmtUSD(r.implied_value_usd) + '</strong></td></tr>' +
      '</table></div>' +
      '<div class="d-col"><h3>Farm plan</h3><ol class="steps">' + steps + '</ol></div></div>';
    detailEl.hidden = false;
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
    $('stats').innerHTML =
      '<div><dt>Watchlist</dt><dd>' + R.watchlist_size + '</dd></div>' +
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
      if (k === 'q') { state.q = v; $('q').value = v; }
      if (k === 'cat' && categories.indexOf(v) !== -1) { state.cat = v; $('cat').value = v; }
      if (k === 'scope' && (v === 'watchlist' || v === 'early')) { state.scope = v; $('scope').value = v; }
      if (k === 'chain' && chains.indexOf(v) !== -1) { state.chain = v; $('chain').value = v; }
      if (k === 'detail') selected = v;
    });
  }

  rowsEl.addEventListener('click', function (ev) {
    var tr = ev.target.closest('tr[data-slug]');
    if (!tr) return;
    var slug = tr.getAttribute('data-slug');
    if (slug === selected) { selected = null; detailEl.hidden = true; renderBoard(); setHash(); return; }
    renderDetail(slug);
    setHash();
    detailEl.scrollIntoView({ block: 'nearest' });
  });

  document.querySelectorAll('#board th[data-sort]').forEach(function (th) {
    th.addEventListener('click', function () {
      var key = th.getAttribute('data-sort');
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
    if (selected) renderDetail(selected);
  });

  readHash();
  renderStats();
  renderBoard();
  renderLive();
  if (selected) {
    renderDetail(selected);
    // A detail opened from a link lands in view, so a capture of the
    // page shows the detail panel instead of the board's top rows.
    detailEl.scrollIntoView();
  }
})();
