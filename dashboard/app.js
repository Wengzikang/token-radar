// Token Radar dashboard: renders window.RADAR with no network.
//
// The board, the filters, the sort and the detail view all run off the
// dataset data.js carries. The farm plan in the detail view is generated
// here from the row's own fields, with the same rules as the board's
// farm_steps, so the page and board.json always agree.

(function () {
  var D = window.RADAR;
  if (!D) return;

  var rows = D.rows;
  var bySlug = {};
  rows.forEach(function (r) { bySlug[r.s] = r; });

  // ---------- formatting ----------

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function money(n) { return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function tvl(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    return '$' + Math.round(n / 1e3) + 'k';
  }
  function pct(g) {
    if (g === null || g === undefined) return '—';
    return (g >= 0 ? '+' : '') + g.toFixed(1) + '%';
  }
  function age(a) { return a === null || a === undefined ? '—' : a + 'd'; }

  // ---------- farm plan (same rules as the board's farm_steps) ----------

  function capitalFor(t) {
    if (t >= 1e9) return 250;
    if (t >= 250e6) return 150;
    if (t >= 100e6) return 100;
    return 50;
  }
  function holdDaysFor(a) {
    if (a === null || a === undefined) return 30;
    if (a < 180) return 60;
    if (a < 365) return 45;
    return 30;
  }
  function actionFor(row, capital, chain) {
    var c = (row.c || '').toLowerCase();
    var name = row.n;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Lend $' + capital + ' of USDC on ' + name + ' (' + chain + ') and leave the loan open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('amm') >= 0) return 'Add $' + capital + ' of liquidity to ' + name + '\u2019s busiest pool on ' + chain + ' and leave it in.';
    if (c.indexOf('yield') >= 0 || c.indexOf('farm') >= 0) return 'Put $' + capital + ' of USDC into a ' + name + ' yield vault on ' + chain + ' and leave it earning.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC into ' + chain + ' with ' + name + ', then use it inside the app.';
    if (c.indexOf('stak') >= 0 || c.indexOf('restak') >= 0) return 'Stake $' + capital + ' of the chain asset through ' + name + ' and hold the receipt token.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('deriv') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged trade.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' on ' + name + ' and take one small market position.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + ' of the yield-bearing asset ' + name + ' issues on ' + chain + ' and hold it.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('capital') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and hold the vault shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or hold $' + capital + ' of the stable asset ' + name + ' issues on ' + chain + '.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy live.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and leave the position open.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + ' Keep the position open and check the protocol\u2019s own page.';
    return s;
  }
  function farmSteps(row) {
    var chain = row.ch.length > 0 ? row.ch[0] : 'its main chain';
    var capital = capitalFor(row.t);
    var hold = holdDaysFor(row.a);
    var gas = capital >= 150 ? 8 : 4;
    return [
      { text: 'Open a fresh wallet that holds only the funds you plan to farm, and store its seed phrase offline on paper.', cost: 'no capital, under $3 of gas', time: '5 minutes' },
      { text: actionFor(row, capital, chain), cost: '$' + capital + ' of capital plus about $' + gas + ' of gas', time: '15 minutes to set up' },
      { text: 'Do one qualifying action each week: a deposit, a borrow, a swap, a vote, or a claim of points.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Keep the position open for at least ' + hold + ' days, so the activity shows up in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: 'Before you withdraw, open the protocol\u2019s own points or rewards page and claim only through the link it publishes.', cost: 'free to check; never pay anyone to claim', time: '10 minutes' },
      { text: 'Write the wallet address, the dates, and every transaction hash in a farm log, so you can repeat or unwind the position.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  // ---------- header ----------

  function moneyShort(n) { return money(n); }
  document.getElementById('stats').innerHTML =
    '<div><dt>Snapshot</dt><dd>' + esc(D.asOf) + '</dd></div>' +
    '<div><dt>Watchlist</dt><dd>' + D.watch + ' protocols</dd></div>' +
    '<div><dt>Board</dt><dd>' + D.size + ' rows</dd></div>' +
    '<div><dt>Early finds</dt><dd>' + D.early + ' below the floor</dd></div>' +
    '<div><dt>Model</dt><dd>' + esc(D.version) + '</dd></div>';
  document.getElementById('model').innerHTML =
    '<b>Model ' + esc(D.version) + ':</b> implied value = TVL &times; 0.20 &times; (1 + clamped 7-day change &times; 0.6) &times; maturity (0.70&ndash;1.20 by age listed) &times; breadth (1.00&ndash;1.20 by chain count). ' +
    'Growth is clamped to &minus;50&hellip;+150%. The watchlist floor is ' + moneyShort(D.floor) + ' of TVL. ' +
    'No protocol name is ever special-cased: the same formula scores every row.';

  // ---------- filters ----------

  var cats = [];
  var chains = [];
  rows.forEach(function (r) {
    if (r.c && cats.indexOf(r.c) < 0) cats.push(r.c);
    r.ch.forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
  });
  cats.sort();
  chains.sort();
  var catSel = document.getElementById('cat');
  var chainSel = document.getElementById('chain');
  cats.forEach(function (c) { var o = document.createElement('option'); o.value = c; o.textContent = c; catSel.appendChild(o); });
  chains.forEach(function (c) { var o = document.createElement('option'); o.value = c; o.textContent = c; chainSel.appendChild(o); });

  var state = { q: '', cat: '', chain: '', watch: false, sort: 'r', dir: 1, detail: null };
  try {
    var params = new URLSearchParams(window.location.search);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('cat')) state.cat = params.get('cat');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('watch') === '1') state.watch = true;
    if (params.get('detail')) state.detail = params.get('detail');
  } catch (e) { /* file URLs may not parse: ignore */ }
  document.getElementById('q').value = state.q;
  catSel.value = state.cat;
  chainSel.value = state.chain;
  document.getElementById('watch').checked = state.watch;

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return rows.filter(function (r) {
      if (state.watch && !r.w) return false;
      if (state.cat && r.c !== state.cat) return false;
      if (state.chain && r.ch.indexOf(state.chain) < 0) return false;
      if (q && (r.n.toLowerCase().indexOf(q) < 0 && r.s.toLowerCase().indexOf(q) < 0 && (r.c || '').toLowerCase().indexOf(q) < 0)) return false;
      return true;
    });
  }
  function numVal(r, k) {
    if (k === 'g') return r.g === null || r.g === undefined ? -1e9 : r.g;
    if (k === 'a') return r.a === null || r.a === undefined ? -1e9 : r.a;
    return r[k];
  }
  function sorted(list) {
    var k = state.sort;
    var dir = state.dir;
    return list.slice().sort(function (a, b) {
      var d;
      if (k === 'n' || k === 'c') d = (a[k] || '').localeCompare(b[k] || '');
      else if (k === 'ch') d = (a.ch[0] || '').localeCompare(b.ch[0] || '');
      else d = numVal(a, k) - numVal(b, k);
      if (d === 0) d = a.s < b.s ? -1 : 1;
      return d * dir;
    });
  }

  // ---------- board ----------

  var tbody = document.getElementById('rows');
  function render() {
    var list = sorted(filtered());
    document.getElementById('count').textContent = 'Showing ' + list.length + ' of ' + rows.length;
    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="empty">No protocols match these filters.</td></tr>';
      return;
    }
    tbody.innerHTML = list.map(function (r) {
      var gCls = r.g === null ? '' : (r.g >= 0 ? 'pos' : 'neg');
      return '<tr data-slug="' + esc(r.s) + '"' + (state.detail === r.s ? ' class="sel"' : '') + '>' +
        '<td class="num rank">#' + r.r + '</td>' +
        '<td><span class="name">' + esc(r.n) + '</span>' + (r.w ? '<span class="watch">WATCH</span>' : '') + '<br><span class="sub">' + esc(r.s) + '</span></td>' +
        '<td>' + esc(r.c || '—') + '</td>' +
        '<td>' + esc(r.ch.slice(0, 3).join(', ')) + (r.ch.length > 3 ? ' +' + (r.ch.length - 3) : '') + '</td>' +
        '<td class="num">' + tvl(r.t) + '</td>' +
        '<td class="num ' + gCls + '">' + pct(r.g) + '</td>' +
        '<td class="num">' + age(r.a) + '</td>' +
        '<td class="num"><b>' + money(r.v) + '</b></td></tr>';
    }).join('');
    document.querySelectorAll('#board th').forEach(function (th) {
      th.classList.toggle('sorted', th.getAttribute('data-sort') === state.sort);
    });
  }

  // ---------- detail ----------

  var detailEl = document.getElementById('detail');
  function showDetail(slug) {
    var r = bySlug[slug];
    if (!r) { detailEl.hidden = true; state.detail = null; render(); return; }
    state.detail = slug;
    var base = Math.round(r.t * 0.2);
    var steps = farmSteps(r);
    detailEl.innerHTML =
      '<button class="close" id="close-detail">Close</button>' +
      '<h2><span class="rank">#' + r.r + '</span>' + esc(r.n) + (r.w ? ' <span class="watch">WATCHLIST</span>' : '') + '</h2>' +
      '<p class="meta">' + esc(r.c || 'Uncategorised') + ' &middot; ' + esc(r.ch.join(', ') || '—') + ' &middot; TVL ' + tvl(r.t) + ' &middot; 7d ' + pct(r.g) + ' &middot; listed ' + age(r.a) + ' ago &middot; records no token</p>' +
      '<h3>Why this rank — model ' + esc(D.version) + '</h3>' +
      '<div class="math">Base ' + money(base) + ' (TVL &times; 0.20) &times; growth &times;' + r.gm.toFixed(2) + ' (7d ' + pct(r.g) + ') &times; maturity &times;' + r.mm.toFixed(2) + ' (' + age(r.a) + ' listed) &times; breadth &times;' + r.bm.toFixed(2) + ' (' + r.ch.length + ' chain' + (r.ch.length === 1 ? '' : 's') + ') = <b>' + money(r.v) + '</b></div>' +
      '<h3>Farm plan — six steps</h3>' +
      '<ol class="steps">' + steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>';
    detailEl.hidden = false;
    document.getElementById('close-detail').addEventListener('click', function () {
      state.detail = null;
      detailEl.hidden = true;
      render();
    });
    render();
  }
  tbody.addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (tr) showDetail(tr.getAttribute('data-slug'));
  });

  // ---------- live reference ----------

  document.getElementById('live-rows').innerHTML = D.liveRows.map(function (r) {
    return '<tr><td><span class="name">' + esc(r.n) + '</span><br><span class="sub">' + esc(r.s) + '</span></td>' +
      '<td>' + esc(r.c || '—') + '</td>' +
      '<td class="num">' + tvl(r.t) + '</td>' +
      '<td class="num"><b>' + money(r.m || 0) + '</b></td></tr>';
  }).join('');

  // ---------- events ----------

  document.getElementById('q').addEventListener('input', function (e) { state.q = e.target.value; render(); });
  catSel.addEventListener('change', function (e) { state.cat = e.target.value; render(); });
  chainSel.addEventListener('change', function (e) { state.chain = e.target.value; render(); });
  document.getElementById('watch').addEventListener('change', function (e) { state.watch = e.target.checked; render(); });
  document.querySelectorAll('#board th').forEach(function (th) {
    th.addEventListener('click', function () {
      var k = th.getAttribute('data-sort');
      if (state.sort === k) state.dir = -state.dir;
      else { state.sort = k; state.dir = k === 'n' || k === 'c' || k === 'ch' ? 1 : -1; }
      render();
    });
  });

  render();
  if (state.detail) showDetail(state.detail);
})();
