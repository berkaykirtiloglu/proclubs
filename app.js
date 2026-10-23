(() => {
  const state = { club: 'all', type: 'all', minGames: 1, sort: { key: 'goals', dir: -1 } };
  let DATA = { clubs: [], matches: [], members: {}, meta: {} };

  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = (m, a) => (a > 0 ? (m / a) * 100 : null);
  const fmtPct = (v) => (v == null ? '–' : `%${v.toFixed(0)}`);
  const fmt1 = (v) => (v == null || isNaN(v) ? '–' : v.toFixed(1).replace('.', ','));
  const fmt2 = (v) => (v == null || isNaN(v) ? '–' : v.toFixed(2).replace('.', ','));
  const TYPE = { leagueMatch: 'Lig', playoffMatch: 'Playoff', friendlyMatch: 'Hazırlık' };
  const POS = { goalkeeper: 'KL', defender: 'DEF', midfielder: 'OS', forward: 'FV' };
  const RES = { G: 'G', B: 'B', M: 'M' };
  const clubName = (id) => DATA.clubs.find((c) => c.clubId === id)?.name ?? id;

  async function load(file, fallback) {
    try {
      const r = await fetch(`data/${file}?v=${Date.now()}`);
      if (!r.ok) throw 0;
      return await r.json();
    } catch {
      return fallback;
    }
  }

  function filtered() {
    return DATA.matches.filter(
      (m) => (state.club === 'all' || m.clubId === state.club) && (state.type === 'all' || m.type === state.type)
    );
  }

  function dateStr(ts) {
    const d = new Date(ts * 1000);
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  }

  function cardsHtml(p) {
    return '<span class="card-yellow"></span>'.repeat(p.yellow || 0) + '<span class="card-red"></span>'.repeat(p.red || 0);
  }

  // ---------- Oyuncu toplamları ----------
  function aggregatePlayers(matches) {
    const map = new Map();
    for (const m of matches) {
      for (const p of m.players) {
        const k = p.name.toLowerCase();
        let a = map.get(k);
        if (!a) {
          a = { name: p.name, clubs: new Set(), games: 0, wins: 0, goals: 0, assists: 0, shots: 0, passAtt: 0, passMade: 0,
            tackleAtt: 0, tackleMade: 0, red: 0, yellow: 0, mom: 0, saves: 0, cleanSheet: 0, ratingSum: 0, pos: {} };
          map.set(k, a);
        }
        a.clubs.add(m.clubId);
        a.games++;
        if (m.result === 'G') a.wins++;
        for (const f of ['goals', 'assists', 'shots', 'passAtt', 'passMade', 'tackleAtt', 'tackleMade', 'red', 'yellow', 'mom', 'saves', 'cleanSheet']) a[f] += p[f] || 0;
        a.ratingSum += p.rating || 0;
        if (p.pos) a.pos[p.pos] = (a.pos[p.pos] || 0) + 1;
      }
    }
    return [...map.values()].map((a) => ({
      ...a,
      ga: a.goals + a.assists,
      gpg: a.goals / a.games,
      rating: a.ratingSum / a.games,
      passPct: pct(a.passMade, a.passAtt),
      tacklePct: pct(a.tackleMade, a.tackleAtt),
      winPct: pct(a.wins, a.games),
      mainPos: Object.entries(a.pos).sort((x, y) => y[1] - x[1])[0]?.[0] ?? '',
    }));
  }

  // ---------- Özet ----------
  function renderOzet() {
    const ms = filtered();
    const el = $('#ozet');
    if (!ms.length) return (el.innerHTML = emptyHtml());
    const w = ms.filter((m) => m.result === 'G').length;
    const d = ms.filter((m) => m.result === 'B').length;
    const l = ms.filter((m) => m.result === 'M').length;
    const gf = ms.reduce((s, m) => s + m.gf, 0);
    const ga = ms.reduce((s, m) => s + m.ga, 0);
    const cs = ms.filter((m) => m.ga === 0).length;
    const sum = (f) => ms.reduce((s, m) => s + (m.us?.[f] || 0), 0);
    const form = ms.slice(0, 10).map((m) => `<span class="badge ${m.result}" title="${esc(m.opponent.name)} ${m.gf}-${m.ga}">${RES[m.result]}</span>`).join('');
    const ps = aggregatePlayers(ms);
    const minG = Math.min(3, Math.max(1, Math.ceil(ms.length / 5)));
    const top = (key, n = 5, filter = () => true, f = (v) => v) =>
      ps.filter(filter).sort((a, b) => (b[key] ?? -1) - (a[key] ?? -1)).slice(0, n)
        .map((p) => `<li>${esc(p.name)} <span class="v">${f(p[key])}</span></li>`).join('') || '<li class="muted">–</li>';

    el.innerHTML = `
      <div class="cards">
        <div class="card"><div class="label">Maç</div><div class="value">${ms.length}</div><div class="sub">${w}G ${d}B ${l}M</div></div>
        <div class="card"><div class="label">Galibiyet oranı</div><div class="value">${fmtPct(pct(w, ms.length))}</div></div>
        <div class="card"><div class="label">Atılan / Yenilen</div><div class="value">${gf} / ${ga}</div><div class="sub">Averaj ${gf - ga >= 0 ? '+' : ''}${gf - ga}</div></div>
        <div class="card"><div class="label">Maç başı gol</div><div class="value">${fmt2(gf / ms.length)}</div><div class="sub">Yenilen ${fmt2(ga / ms.length)}</div></div>
        <div class="card"><div class="label">Gol yememe</div><div class="value">${cs}</div></div>
        <div class="card"><div class="label">Pas isabeti</div><div class="value">${fmtPct(pct(sum('passMade'), sum('passAtt')))}</div></div>
        <div class="card"><div class="label">Tackle başarısı</div><div class="value">${fmtPct(pct(sum('tackleMade'), sum('tackleAtt')))}</div></div>
        <div class="card"><div class="label">Kartlar</div><div class="value">${sum('red')}<span class="card-red"></span> ${sum('yellow') ? `${sum('yellow')}<span class="card-yellow"></span>` : ''}</div></div>
      </div>
      <h2>Son 10 maç</h2>
      <div class="form">${form}</div>
      <h2>Liderler</h2>
      <div class="leaders">
        <div class="card"><div class="label">Gol</div><ol>${top('goals')}</ol></div>
        <div class="card"><div class="label">Asist</div><ol>${top('assists')}</ol></div>
        <div class="card"><div class="label">Ortalama rating (en az ${minG} maç)</div><ol>${top('rating', 5, (p) => p.games >= minG, fmt1)}</ol></div>
        <div class="card"><div class="label">Maçın adamı</div><ol>${top('mom', 5, (p) => p.mom > 0)}</ol></div>
        <div class="card"><div class="label">Pas isabeti (en az ${minG} maç)</div><ol>${top('passPct', 5, (p) => p.games >= minG && p.passAtt >= 20, fmtPct)}</ol></div>
        <div class="card"><div class="label">Tackle başarısı (en az ${minG} maç)</div><ol>${top('tacklePct', 5, (p) => p.games >= minG && p.tackleAtt >= 5, fmtPct)}</ol></div>
      </div>`;
  }

  // ---------- Maçlar ----------
  function playerTable(players) {
    const rows = [...players].sort((a, b) => b.rating - a.rating).map((p) => `
      <tr>
        <td>${esc(p.name)} ${p.mom ? '<span class="mom" title="Maçın adamı">★</span>' : ''} ${cardsHtml(p)}</td>
        <td>${POS[p.pos] ?? esc(p.pos)}</td>
        <td><b>${fmt1(p.rating)}</b></td>
        <td>${p.goals}</td><td>${p.assists}</td><td>${p.shots}</td>
        <td>${p.passMade}/${p.passAtt} <span class="muted">${fmtPct(pct(p.passMade, p.passAtt))}</span></td>
        <td>${p.tackleMade}/${p.tackleAtt} <span class="muted">${fmtPct(pct(p.tackleMade, p.tackleAtt))}</span></td>
        <td>${p.pos === 'goalkeeper' ? p.saves : '–'}</td>
      </tr>`).join('');
    return `<div class="tablewrap"><table>
      <thead><tr><th>Oyuncu</th><th>Mevki</th><th>Rating</th><th>Gol</th><th>Asist</th><th>Şut</th><th>Pas</th><th>Tackle</th><th>Kurtarış</th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  }

  function renderMaclar() {
    const ms = filtered();
    const el = $('#maclar');
    if (!ms.length) return (el.innerHTML = emptyHtml());
    el.innerHTML = ms.map((m) => {
      const u = m.us || {}, t = m.them || {};
      const row = (label, a, b) => `<div>${a}</div><div>${label}</div><div>${b}</div>`;
      return `<details class="match">
        <summary>
          <span class="badge ${m.result}">${RES[m.result]}</span>
          <div class="teams"><b>${esc(clubName(m.clubId))} – ${esc(m.opponent.name)}</b>
            <span class="muted small">${TYPE[m.type] ?? m.type}${m.dnf ? ' · maç yarıda kaldı' : ''}</span></div>
          <span class="score">${m.gf} - ${m.ga}</span>
          <span class="when">${dateStr(m.ts)}</span>
        </summary>
        <div class="body">
          <div class="compare">
            ${row('Şut', u.shots ?? '–', t.shots ?? '–')}
            ${row('Pas isabeti', fmtPct(pct(u.passMade, u.passAtt)), fmtPct(pct(t.passMade, t.passAtt)))}
            ${row('Tackle başarısı', fmtPct(pct(u.tackleMade, u.tackleAtt)), fmtPct(pct(t.tackleMade, t.tackleAtt)))}
            ${row('Kırmızı kart', u.red ?? 0, t.red ?? 0)}
          </div>
          ${playerTable(m.players)}
        </div>
      </details>`;
    }).join('');
  }

  // ---------- Oyuncular ----------
  const COLS = [
    { key: 'name', label: 'Oyuncu', f: (p) => esc(p.name) },
    { key: 'mainPos', label: 'Mevki', f: (p) => POS[p.mainPos] ?? esc(p.mainPos) },
    { key: 'games', label: 'Maç' },
    { key: 'winPct', label: 'Galibiyet', f: (p) => fmtPct(p.winPct) },
    { key: 'goals', label: 'Gol' },
    { key: 'assists', label: 'Asist' },
    { key: 'ga', label: 'G+A' },
    { key: 'gpg', label: 'Gol/Maç', f: (p) => fmt2(p.gpg) },
    { key: 'rating', label: 'Ort. Rating', f: (p) => `<b>${fmt1(p.rating)}</b>` },
    { key: 'mom', label: 'MOM' },
    { key: 'shots', label: 'Şut' },
    { key: 'passPct', label: 'Pas %', f: (p) => `${fmtPct(p.passPct)} <span class="muted small">${p.passMade}/${p.passAtt}</span>` },
    { key: 'tacklePct', label: 'Tackle %', f: (p) => `${fmtPct(p.tacklePct)} <span class="muted small">${p.tackleMade}/${p.tackleAtt}</span>` },
    { key: 'red', label: 'Kırmızı' },
    { key: 'yellow', label: 'Sarı' },
    { key: 'saves', label: 'Kurtarış' },
    { key: 'cleanSheet', label: 'Gol yememe' },
  ];

  function renderOyuncular() {
    const ms = filtered();
    const el = $('#oyuncular');
    if (!ms.length) return (el.innerHTML = emptyHtml());
    const { key, dir } = state.sort;
    const ps = aggregatePlayers(ms).filter((p) => p.games >= state.minGames).sort((a, b) => {
      const x = a[key], y = b[key];
      if (typeof x === 'string') return dir * String(x).localeCompare(String(y), 'tr');
      return dir * ((x ?? -1) - (y ?? -1));
    });
    const hasYellow = ms.some((m) => m.players.some((p) => p.yellow));
    const cols = COLS.filter((c) => c.key !== 'yellow' || hasYellow);
    el.innerHTML = `
      <div class="toolbar"><label>En az <input type="number" id="minGames" min="1" value="${state.minGames}"> maç oynayanlar</label>
        <span class="muted small">Sütun başlığına tıklayarak sıralayın</span></div>
      <div class="tablewrap"><table>
        <thead><tr>${cols.map((c) => `<th data-key="${c.key}" class="${c.key === key ? 'sorted' : ''}">${c.label}${c.key === key ? (dir < 0 ? ' ↓' : ' ↑') : ''}</th>`).join('')}</tr></thead>
        <tbody>${ps.map((p) => `<tr>${cols.map((c) => `<td>${c.f ? c.f(p) : p[c.key]}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>`;
    el.querySelectorAll('th').forEach((th) => th.addEventListener('click', () => {
      const k = th.dataset.key;
      state.sort = { key: k, dir: state.sort.key === k ? -state.sort.dir : k === 'name' || k === 'mainPos' ? 1 : -1 };
      renderOyuncular();
    }));
    $('#minGames').addEventListener('change', (e) => { state.minGames = Math.max(1, +e.target.value || 1); renderOyuncular(); });
  }

  // ---------- EA sezon toplamları ----------
  const MCOLS = [
    ['name', 'Oyuncu'], ['favoritePosition', 'Mevki'], ['gamesPlayed', 'Maç'], ['winRate', 'Galibiyet %'],
    ['goals', 'Gol'], ['assists', 'Asist'], ['ratingAve', 'Ort. Rating'], ['manOfTheMatch', 'MOM'],
    ['shotSuccessRate', 'Şut %'], ['passesMade', 'Başarılı pas'], ['passSuccessRate', 'Pas %'],
    ['tacklesMade', 'Tackle'], ['tackleSuccessRate', 'Tackle %'], ['redCards', 'Kırmızı'],
    ['cleanSheetsDef', 'Gol yememe (DEF)'], ['cleanSheetsGK', 'Gol yememe (KL)'],
  ];
  function renderSezon() {
    const el = $('#sezon');
    const clubs = DATA.clubs.filter((c) => state.club === 'all' || c.clubId === state.club);
    const parts = clubs.map((c) => {
      const mem = DATA.members[c.clubId]?.members || [];
      if (!mem.length) return `<h2>${esc(c.name)}</h2><div class="empty">Henüz EA sezon verisi yok.</div>`;
      const cols = MCOLS.filter(([k]) => mem.some((m) => m[k] != null && m[k] !== ''));
      const sorted = [...mem].sort((a, b) => (+b.gamesPlayed || 0) - (+a.gamesPlayed || 0));
      return `<h2>${esc(c.name)}</h2><div class="tablewrap"><table>
        <thead><tr>${cols.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead>
        <tbody>${sorted.map((m) => `<tr>${cols.map(([k]) => {
          let v = m[k];
          if (k === 'favoritePosition') v = POS[v] ?? v;
          if (k === 'ratingAve' && v !== '') v = fmt1(+v);
          return `<td>${esc(v ?? '–')}</td>`;
        }).join('')}</tr>`).join('')}</tbody></table></div>`;
    });
    el.innerHTML = `<p class="muted">Bu tablo EA'nın tuttuğu tüm zamanların kulüp içi toplamlarıdır (takipten önceki maçlar dahil). Diğer sekmeler sadece kaydedilen maçlardan hesaplanır.</p>${parts.join('') || emptyHtml()}`;
  }

  function emptyHtml() {
    return `<div class="empty">Bu filtre için kayıtlı maç yok.<br><span class="small">Veri toplayıcı ilk kez çalıştıktan ve maç oynandıktan sonra burada görünecek.</span></div>`;
  }

  function renderAll() { renderOzet(); renderMaclar(); renderOyuncular(); renderSezon(); }

  function setupUi() {
    const seg = $('#clubFilter');
    const opts = [{ id: 'all', name: 'Tümü' }, ...DATA.clubs.map((c) => ({ id: c.clubId, name: c.name }))];
    seg.innerHTML = opts.map((o) => `<button data-id="${esc(o.id)}" class="${o.id === state.club ? 'active' : ''}">${esc(o.name)}</button>`).join('');
    seg.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      state.club = b.dataset.id;
      seg.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
      renderAll();
    }));
    $('#typeFilter').addEventListener('change', (e) => { state.type = e.target.value; renderAll(); });
    $('#tabs').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('active', x === b));
      document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === b.dataset.tab));
      history.replaceState(null, '', `#${b.dataset.tab}`);
    }));
    const h = location.hash.slice(1);
    if (h) document.querySelector(`#tabs button[data-tab="${h}"]`)?.click();
    if (DATA.meta.updated) $('#updated').textContent = 'Son güncelleme: ' + new Date(DATA.meta.updated).toLocaleString('tr-TR');
  }

  (async () => {
    const [clubs, matches, members, meta] = await Promise.all([
      load('clubs.json', []), load('matches.json', []), load('members.json', {}), load('meta.json', {}),
    ]);
    DATA = { clubs, matches, members, meta };
    setupUi();
    renderAll();
  })();
})();
