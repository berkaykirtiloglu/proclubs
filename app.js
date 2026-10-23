(() => {
  // ================= Durum & yardımcılar =================
  const state = {
    club: 'all', type: 'all', minGames: 1, group: 'genel', res: 'all', q: '', pairMin: 2,
    sorts: { players: { key: 'goals', dir: -1 }, pairs: { key: 'games', dir: -1 }, lineups: { key: 'games', dir: -1 }, opps: { key: 'games', dir: -1 } },
  };
  let DATA = { clubs: [], matches: [], members: {}, meta: {} };

  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = (m, a) => (a > 0 ? (m / a) * 100 : null);
  const div = (a, b) => (b > 0 ? a / b : null);
  const fmtPct = (v) => (v == null || isNaN(v) ? '–' : `%${Math.round(v)}`);
  const fmt1 = (v) => (v == null || isNaN(v) ? '–' : v.toFixed(1).replace('.', ','));
  const fmt2 = (v) => (v == null || isNaN(v) ? '–' : v.toFixed(2).replace('.', ','));
  const fmtInt = (v) => (v == null || isNaN(v) ? '–' : Math.round(v).toLocaleString('tr-TR'));
  const TYPE = { leagueMatch: 'Lig', playoffMatch: 'Playoff', friendlyMatch: 'Hazırlık' };
  const POS = { goalkeeper: 'KL', defender: 'DEF', midfielder: 'OS', forward: 'FV' };
  const RES_TXT = { G: 'Galibiyet', B: 'Beraberlik', M: 'Mağlubiyet' };
  const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  const SAVE_TYPES = ['Dalış', 'Yan top', 'Doğru yön', 'Sektirme', 'Yumruk', 'Refleks'];
  const C_US = '#15a36b', C_THEM = '#d06a1f'; // dataviz doğrulayıcısından geçti (koyu yüzey)
  const clubName = (id) => DATA.clubs.find((c) => c.clubId === id)?.name ?? id;
  const sum = (arr, f) => arr.reduce((s, x) => s + (typeof f === 'function' ? f(x) : x[f] || 0), 0);
  const pLink = (name) => `<a href="#" class="plink" data-player="${esc(name)}">${esc(name)}</a>`;

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
    return DATA.matches.filter((m) =>
      (state.club === 'all' || m.clubId === state.club) && (state.type === 'all' || m.type === state.type));
  }

  const dateStr = (ts) => {
    const d = new Date(ts * 1000);
    return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' +
      d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  };
  const shortDate = (ts) => new Date(ts * 1000).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });
  const cardsHtml = (p) => '<span class="card-yellow"></span>'.repeat(p.yellow || 0) + '<span class="card-red"></span>'.repeat(p.red || 0);
  const badge = (r) => `<span class="badge ${r}" title="${RES_TXT[r]}">${r}</span>`;

  // ================= Toplamlar =================
  function aggregatePlayers(matches) {
    const map = new Map();
    const chron = [...matches].sort((a, b) => a.ts - b.ts);
    for (const m of chron) {
      for (const p of m.players) {
        const k = p.name.toLowerCase();
        let a = map.get(k);
        if (!a) {
          a = { name: p.name, clubs: new Set(), games: 0, w: 0, d: 0, l: 0, goals: 0, assists: 0, shots: 0, passAtt: 0, passMade: 0,
            tackleAtt: 0, tackleMade: 0, red: 0, yellow: 0, mom: 0, saves: 0, conceded: 0, cleanSheet: 0, ratingSum: 0, best: 0,
            secs: 0, idle: 0, dnf: 0, league: 0, playoff: 0, sv: [0, 0, 0, 0, 0, 0], pos: {}, ratings: [], hat: 0, gkGames: 0 };
          map.set(k, a);
        }
        a.clubs.add(m.clubId);
        a.games++;
        if (m.result === 'G') a.w++; else if (m.result === 'B') a.d++; else a.l++;
        for (const f of ['goals', 'assists', 'shots', 'passAtt', 'passMade', 'tackleAtt', 'tackleMade', 'red', 'yellow', 'mom', 'saves', 'cleanSheet', 'secs', 'idle']) a[f] += p[f] || 0;
        if (p.pos === 'goalkeeper') { a.gkGames++; a.conceded += p.conceded || 0; }
        a.ratingSum += p.rating || 0;
        a.best = Math.max(a.best, p.rating || 0);
        a.ratings.push(p.rating || 0);
        if (m.dnf) a.dnf++;
        if (m.type === 'leagueMatch') a.league++;
        if (m.type === 'playoffMatch') a.playoff++;
        if ((p.goals || 0) >= 3) a.hat++;
        (p.sv || []).forEach((v, i) => (a.sv[i] += v || 0));
        if (p.pos) a.pos[p.pos] = (a.pos[p.pos] || 0) + 1;
      }
    }
    return [...map.values()].map((a) => {
      const mins = a.secs / 60;
      const per90 = (v) => (mins >= 1 ? (v / mins) * 90 : null);
      return {
        ...a,
        mins,
        ga: a.goals + a.assists,
        gpg: a.goals / a.games,
        apg: a.assists / a.games,
        ga90: per90(a.goals + a.assists),
        g90: per90(a.goals),
        spg: a.shots / a.games,
        conv: pct(a.goals, a.shots),
        rating: a.ratingSum / a.games,
        passPct: pct(a.passMade, a.passAtt),
        ppg: a.passMade / a.games,
        tacklePct: pct(a.tackleMade, a.tackleAtt),
        tpg: a.tackleMade / a.games,
        winPct: pct(a.w, a.games),
        momPct: pct(a.mom, a.games),
        svpg: a.gkGames ? a.saves / a.gkGames : null,
        idleMin: a.idle / 60,
        form: a.ratings.slice(-5),
        mainPos: Object.entries(a.pos).sort((x, y) => y[1] - x[1])[0]?.[0] ?? '',
      };
    });
  }

  function streaks(matches) {
    const chron = [...matches].sort((a, b) => a.ts - b.ts);
    let w = 0, u = 0, l = 0, bw = 0, bu = 0, bl = 0, ns = 0, bns = 0;
    for (const m of chron) {
      w = m.result === 'G' ? w + 1 : 0;
      u = m.result !== 'M' ? u + 1 : 0;
      l = m.result === 'M' ? l + 1 : 0;
      ns = m.gf > 0 ? ns + 1 : 0;
      bw = Math.max(bw, w); bu = Math.max(bu, u); bl = Math.max(bl, l); bns = Math.max(bns, ns);
    }
    const last = chron[chron.length - 1];
    let cur = 0;
    for (let i = chron.length - 1; i >= 0 && chron[i].result === last?.result; i--) cur++;
    return { cur, curRes: last?.result, bw, bu, bl, bns };
  }

  // ================= Grafikler (saf SVG) =================
  function barChart(ms) {
    const data = [...ms].sort((a, b) => a.ts - b.ts).slice(-20);
    if (data.length < 2) return '';
    const W = 640, H = 200, pl = 28, pb = 22, pt = 10, pr = 6;
    const max = Math.max(1, ...data.map((m) => Math.max(m.gf, m.ga)));
    const iw = W - pl - pr, ih = H - pt - pb, band = iw / data.length, bw = Math.min(14, (band - 6) / 2);
    const y = (v) => pt + ih - (v / max) * ih;
    let g = '';
    for (let t = 0; t <= max; t += Math.max(1, Math.ceil(max / 4))) g += `<line x1="${pl}" x2="${W - pr}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${pl - 6}" y="${y(t) + 4}" class="ax" text-anchor="end">${t}</text>`;
    const bar = (x, v, c) => v > 0 ? `<path d="M${x},${y(0)} V${y(v) + 3} a3,3 0 0 1 3,-3 h${bw - 6} a3,3 0 0 1 3,3 V${y(0)} Z" fill="${c}"/>` : '';
    data.forEach((m, i) => {
      const cx = pl + band * i + band / 2;
      const tip = `${esc(shortDate(m.ts))} · ${esc(clubName(m.clubId))} ${m.gf}-${m.ga} ${esc(m.opponent.name)}`;
      g += `<g class="hit" data-tip="${tip}"><rect x="${pl + band * i}" y="${pt}" width="${band}" height="${ih}" fill="transparent"/>` +
        bar(cx - bw - 1, m.gf, C_US) + bar(cx + 1, m.ga, C_THEM) + '</g>';
      if (data.length <= 12 || i % 2 === 0) g += `<text x="${cx}" y="${H - 6}" class="ax" text-anchor="middle">${esc(shortDate(m.ts))}</text>`;
    });
    g += `<line x1="${pl}" x2="${W - pr}" y1="${y(0)}" y2="${y(0)}" class="base"/>`;
    return `<figure class="chart"><figcaption>Maç maç atılan ve yenilen goller (son ${data.length})
      <span class="legend"><i style="background:${C_US}"></i>Atılan <i style="background:${C_THEM}"></i>Yenilen</span></figcaption>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Atılan ve yenilen goller">${g}</svg></figure>`;
  }

  function lineChart(points, title, { min = 4, max = 10 } = {}) {
    if (points.length < 2) return '';
    const W = 640, H = 180, pl = 28, pb = 22, pt = 10, pr = 10;
    const lo = Math.min(min, ...points.map((p) => p.v)), hi = Math.max(max, ...points.map((p) => p.v));
    const iw = W - pl - pr, ih = H - pt - pb, step = iw / (points.length - 1);
    const x = (i) => pl + i * step, y = (v) => pt + ih - ((v - lo) / (hi - lo)) * ih;
    let g = '';
    for (let t = Math.ceil(lo); t <= hi; t += 1) if (t % 2 === 0) g += `<line x1="${pl}" x2="${W - pr}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${pl - 6}" y="${y(t) + 4}" class="ax" text-anchor="end">${t}</text>`;
    g += `<polyline fill="none" stroke="${C_US}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="${points.map((p, i) => `${x(i)},${y(p.v)}`).join(' ')}"/>`;
    points.forEach((p, i) => {
      g += `<g class="hit" data-tip="${esc(p.tip)}"><rect x="${x(i) - step / 2}" y="${pt}" width="${step}" height="${ih}" fill="transparent"/>` +
        `<circle cx="${x(i)}" cy="${y(p.v)}" r="4" fill="${C_US}" stroke="var(--panel)" stroke-width="2"/></g>`;
    });
    const lastI = points.length - 1;
    g += `<text x="${x(lastI) - 6}" y="${y(points[lastI].v) - 10}" class="lbl" text-anchor="end">${fmt1(points[lastI].v)}</text>`;
    return `<figure class="chart"><figcaption>${esc(title)}</figcaption><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}">${g}</svg></figure>`;
  }

  // ================= Genel sıralanabilir tablo =================
  function table(id, cols, rows, opts = {}) {
    const s = state.sorts[id];
    if (s) {
      const col = cols.find((c) => c.key === s.key) || cols[0];
      const val = col.sv || ((r) => r[col.key]);
      rows = [...rows].sort((a, b) => {
        const x = val(a), y = val(b);
        if (typeof x === 'string' || typeof y === 'string') return s.dir * String(x ?? '').localeCompare(String(y ?? ''), 'tr');
        return s.dir * ((x ?? -Infinity) - (y ?? -Infinity));
      });
    }
    const head = cols.map((c) => `<th ${s ? `data-t="${id}"` : ''} data-key="${c.key}" class="${s && c.key === s.key ? 'sorted' : ''}" ${c.title ? `title="${esc(c.title)}"` : ''}>${c.label}${s && c.key === s.key ? (s.dir < 0 ? ' ↓' : ' ↑') : ''}</th>`).join('');
    const body = rows.map((r) => `<tr>${cols.map((c) => `<td>${c.f ? c.f(r) : r[c.key] ?? '–'}</td>`).join('')}</tr>`).join('');
    return `<div class="tablewrap"><table class="${opts.cls || ''}"><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${cols.length}" class="muted">Veri yok</td></tr>`}</tbody></table></div>`;
  }
  document.addEventListener('click', (e) => {
    const th = e.target.closest('th[data-t]');
    if (th) {
      const id = th.dataset.t, k = th.dataset.key, s = state.sorts[id];
      state.sorts[id] = { key: k, dir: s.key === k ? -s.dir : (k === 'name' || k === 'mainPos' || k === 'opp' ? 1 : -1) };
      renderAll();
      return;
    }
    const pl = e.target.closest('[data-player]');
    if (pl) { e.preventDefault(); openPlayer(pl.dataset.player); }
  });

  // ================= Özet =================
  function clubCards() {
    const clubs = DATA.clubs.filter((c) => (state.club === 'all' || c.clubId === state.club) && c.info && Object.keys(c.info).length);
    if (!clubs.length) return '';
    return `<div class="clubcards">${clubs.map((c) => {
      const i = c.info, col = (i.colors || [])[0] || 'var(--accent)', col2 = (i.colors || [])[1] || col;
      const gp = i.gamesPlayed || 0;
      return `<div class="card club">
        <div class="kit" style="background:linear-gradient(90deg, ${esc(col)} 50%, ${esc(col2)} 50%)"></div>
        <div class="clubhead"><b>${esc(c.name)}</b>${i.stadium ? `<span class="muted small">${esc(i.stadium)}</span>` : ''}</div>
        <div class="kv">
          ${i.currentDivision != null ? `<div><span>Lig seviyesi</span><b>${i.currentDivision}. Lig</b></div>` : ''}
          ${i.skillRating != null ? `<div><span>Beceri puanı</span><b>${fmtInt(i.skillRating)}</b></div>` : ''}
          <div><span>Tüm zamanlar</span><b>${i.wins ?? 0}G ${i.ties ?? 0}B ${i.losses ?? 0}M</b></div>
          <div><span>Galibiyet oranı</span><b>${fmtPct(pct(i.wins, gp))}</b></div>
          <div><span>Gol (A/Y)</span><b>${i.goals ?? 0} / ${i.goalsAgainst ?? 0}</b></div>
          <div><span>Yükselme / Düşme</span><b>${i.promotions ?? 0} / ${i.relegations ?? 0}</b></div>
          ${i.bestDivision != null ? `<div><span>En iyi lig</span><b>${i.bestDivision}. Lig</b></div>` : ''}
          <div><span>Playoff maçı</span><b>${i.gamesPlayedPlayoff ?? 0}</b></div>
        </div></div>`;
    }).join('')}</div>`;
  }

  function renderOzet() {
    const ms = filtered();
    const el = $('#ozet');
    if (!ms.length) return (el.innerHTML = clubCards() + emptyHtml());
    const w = ms.filter((m) => m.result === 'G').length, d = ms.filter((m) => m.result === 'B').length, l = ms.length - w - d;
    const gf = sum(ms, 'gf'), ga = sum(ms, 'ga');
    const cs = ms.filter((m) => m.ga === 0).length, fts = ms.filter((m) => m.gf === 0).length;
    const us = (f) => sum(ms, (m) => m.us?.[f] || 0), them = (f) => sum(ms, (m) => m.them?.[f] || 0);
    const st = streaks(ms);
    const ps = aggregatePlayers(ms);
    const minG = Math.min(3, Math.max(1, Math.ceil(ms.length / 5)));
    const top = (key, f = (v) => v, filter = () => true) =>
      ps.filter(filter).filter((p) => p[key] != null && p[key] > 0).sort((a, b) => b[key] - a[key]).slice(0, 5)
        .map((p) => `<li>${pLink(p.name)} <span class="v">${f(p[key])}</span></li>`).join('') || '<li class="muted">–</li>';
    const scores = {};
    ms.forEach((m) => { const k = `${m.gf}-${m.ga}`; scores[k] = (scores[k] || 0) + 1; });
    const topScores = Object.entries(scores).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const days = DAYS.map((n, i) => {
      const dm = ms.filter((m) => new Date(m.ts * 1000).getDay() === i);
      return { n, g: dm.length, w: dm.filter((m) => m.result === 'G').length, gf: sum(dm, 'gf'), ga: sum(dm, 'ga') };
    }).filter((x) => x.g);
    const chron = [...ms].sort((a, b) => a.ts - b.ts);
    const ratingPts = chron.slice(-25).map((m) => ({ v: m.players.length ? sum(m.players, 'rating') / m.players.length : 0, tip: `${shortDate(m.ts)} · ${m.gf}-${m.ga} ${m.opponent.name} · ort. ${fmt1(sum(m.players, 'rating') / (m.players.length || 1))}` }));
    const card = (label, value, sub = '') => `<div class="card"><div class="label">${label}</div><div class="value">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;

    el.innerHTML = `
      ${clubCards()}
      <h2>Kayıtlı maçlar</h2>
      <div class="cards">
        ${card('Maç', ms.length, `${w}G ${d}B ${l}M`)}
        ${card('Galibiyet oranı', fmtPct(pct(w, ms.length)), `Puan ort. ${fmt2((w * 3 + d) / ms.length)}`)}
        ${card('Atılan / Yenilen', `${gf} / ${ga}`, `Averaj ${gf - ga >= 0 ? '+' : ''}${gf - ga}`)}
        ${card('Maç başı gol', fmt2(gf / ms.length), `Yenilen ${fmt2(ga / ms.length)}`)}
        ${card('Gol yememe', cs, `Gol atamama ${fts}`)}
        ${card('Şut / maç', fmt1(us('shots') / ms.length), `Rakip ${fmt1(them('shots') / ms.length)}`)}
        ${card('Gol dönüşümü', fmtPct(pct(gf, us('shots'))), `Rakip ${fmtPct(pct(ga, them('shots')))}`)}
        ${card('Pas isabeti', fmtPct(pct(us('passMade'), us('passAtt'))), `Rakip ${fmtPct(pct(them('passMade'), them('passAtt')))}`)}
        ${card('Pas / maç', fmt1(us('passMade') / ms.length), `Rakip ${fmt1(them('passMade') / ms.length)}`)}
        ${card('Tackle başarısı', fmtPct(pct(us('tackleMade'), us('tackleAtt'))), `Rakip ${fmtPct(pct(them('tackleMade'), them('tackleAtt')))}`)}
        ${card('Kırmızı kart', `${us('red')}<span class="card-red"></span>`, `Rakip ${them('red')}`)}
        ${card('Yarıda kalan', ms.filter((m) => m.dnf).length, 'Bağlantı kopması vb.')}
      </div>
      <h2>Seriler</h2>
      <div class="cards">
        ${card('Güncel seri', st.curRes ? `${st.cur} ${badge(st.curRes)}` : '–')}
        ${card('En uzun galibiyet serisi', st.bw)}
        ${card('En uzun yenilmezlik', st.bu)}
        ${card('En uzun mağlubiyet serisi', st.bl)}
        ${card('Üst üste gol atılan maç', st.bns)}
      </div>
      <h2>Son 10 maç</h2>
      <div class="form">${ms.slice(0, 10).map((m) => `<span class="badge ${m.result}" title="${esc(m.opponent.name)} ${m.gf}-${m.ga}">${m.result}</span>`).join('')}</div>
      <div class="charts">${barChart(ms)}${lineChart(ratingPts, 'Takımın maç başı ortalama ratingi')}</div>
      <h2>Liderler</h2>
      <div class="leaders">
        <div class="card"><div class="label">Gol</div><ol>${top('goals')}</ol></div>
        <div class="card"><div class="label">Asist</div><ol>${top('assists')}</ol></div>
        <div class="card"><div class="label">Gol + asist / 90 dk (en az ${minG} maç)</div><ol>${top('ga90', fmt2, (p) => p.games >= minG)}</ol></div>
        <div class="card"><div class="label">Ortalama rating (en az ${minG} maç)</div><ol>${top('rating', fmt1, (p) => p.games >= minG)}</ol></div>
        <div class="card"><div class="label">Maçın adamı</div><ol>${top('mom')}</ol></div>
        <div class="card"><div class="label">Şut</div><ol>${top('shots')}</ol></div>
        <div class="card"><div class="label">Pas isabeti (en az ${minG} maç)</div><ol>${top('passPct', fmtPct, (p) => p.games >= minG && p.passAtt >= 20)}</ol></div>
        <div class="card"><div class="label">Başarılı tackle</div><ol>${top('tackleMade')}</ol></div>
        <div class="card"><div class="label">Tackle başarısı (en az ${minG} maç)</div><ol>${top('tacklePct', fmtPct, (p) => p.games >= minG && p.tackleAtt >= 5)}</ol></div>
        <div class="card"><div class="label">Galibiyet oranı (en az ${minG} maç)</div><ol>${top('winPct', fmtPct, (p) => p.games >= minG)}</ol></div>
        ${ps.some((p) => p.saves) ? `<div class="card"><div class="label">Kurtarış</div><ol>${top('saves')}</ol></div>` : ''}
      </div>
      <div class="two">
        <div><h2>En sık skorlar</h2>${table('_scores', [{ key: 's', label: 'Skor' }, { key: 'n', label: 'Kez' }], topScores.map(([s, n]) => ({ s, n })))}</div>
        <div><h2>Günlere göre</h2>${table('_days', [{ key: 'n', label: 'Gün' }, { key: 'g', label: 'Maç' }, { key: 'w', label: 'Galibiyet', f: (r) => `${r.w} <span class="muted small">${fmtPct(pct(r.w, r.g))}</span>` }, { key: 'gf', label: 'Atılan' }, { key: 'ga', label: 'Yenilen' }], days)}</div>
      </div>`;
  }

  // ================= Maçlar =================
  function playerRows(players, opp = false) {
    return [...players].sort((a, b) => b.rating - a.rating).map((p) => `
      <tr>
        <td>${opp ? esc(p.name) : pLink(p.name)} ${p.mom ? '<span class="mom" title="Maçın adamı">★</span>' : ''} ${cardsHtml(p)}</td>
        <td>${POS[p.pos] ?? esc(p.pos)}</td>
        <td><b>${fmt1(p.rating)}</b></td>
        <td>${p.goals}</td><td>${p.assists}</td><td>${p.shots ?? '–'}</td>
        ${opp ? '' : `<td>${p.passMade}/${p.passAtt} <span class="muted">${fmtPct(pct(p.passMade, p.passAtt))}</span></td>
        <td>${p.tackleMade}/${p.tackleAtt} <span class="muted">${fmtPct(pct(p.tackleMade, p.tackleAtt))}</span></td>
        <td>${p.saves || (p.pos === 'goalkeeper' ? 0 : '–')}</td>
        <td>${p.secs ? Math.round(p.secs / 60) : '–'}</td>`}
      </tr>`).join('');
  }

  function renderMaclar() {
    let ms = filtered();
    const el = $('#maclar');
    if (!ms.length) return (el.innerHTML = emptyHtml());
    if (state.res !== 'all') ms = ms.filter((m) => m.result === state.res);
    if (state.q) ms = ms.filter((m) => m.opponent.name.toLowerCase().includes(state.q.toLowerCase()));
    const list = ms.map((m) => {
      const u = m.us || {}, t = m.them || {};
      const row = (label, a, b) => `<div>${a}</div><div>${label}</div><div>${b}</div>`;
      const gk = m.players.filter((p) => (p.sv || []).some(Boolean));
      return `<details class="match">
        <summary>
          ${badge(m.result)}
          <div class="teams"><b>${esc(clubName(m.clubId))} – ${esc(m.opponent.name)}</b>
            <span class="muted small">${TYPE[m.type] ?? m.type}${m.dnf ? ' · maç yarıda kaldı' : ''}</span></div>
          <span class="score">${m.gf} - ${m.ga}</span>
          <span class="when">${dateStr(m.ts)}</span>
        </summary>
        <div class="body">
          <div class="compare">
            <div class="h">${esc(clubName(m.clubId))}</div><div></div><div class="h">${esc(m.opponent.name)}</div>
            ${row('Gol', m.gf, m.ga)}
            ${row('Şut', u.shots ?? '–', t.shots ?? '–')}
            ${row('Gol dönüşümü', fmtPct(pct(m.gf, u.shots)), fmtPct(pct(m.ga, t.shots)))}
            ${row('Başarılı pas', u.passMade ?? '–', t.passMade ?? '–')}
            ${row('Pas isabeti', fmtPct(pct(u.passMade, u.passAtt)), fmtPct(pct(t.passMade, t.passAtt)))}
            ${row('Başarılı tackle', u.tackleMade ?? '–', t.tackleMade ?? '–')}
            ${row('Tackle başarısı', fmtPct(pct(u.tackleMade, u.tackleAtt)), fmtPct(pct(t.tackleMade, t.tackleAtt)))}
            ${row('Kırmızı kart', u.red ?? 0, t.red ?? 0)}
            ${row('Oyuncu sayısı', m.players.length, m.opp ? m.opp.length : '–')}
          </div>
          <h3>Bizim oyuncular</h3>
          <div class="tablewrap"><table>
            <thead><tr><th>Oyuncu</th><th>Mevki</th><th>Rating</th><th>Gol</th><th>Asist</th><th>Şut</th><th>Pas</th><th>Tackle</th><th>Kurtarış</th><th>Dk</th></tr></thead>
            <tbody>${playerRows(m.players)}</tbody></table></div>
          ${gk.length ? `<h3>Kurtarış türleri</h3><div class="tablewrap"><table><thead><tr><th>Kaleci</th>${SAVE_TYPES.map((s) => `<th>${s}</th>`).join('')}</tr></thead>
            <tbody>${gk.map((p) => `<tr><td>${esc(p.name)}</td>${p.sv.map((v) => `<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}
          ${m.opp?.length ? `<h3>Rakip oyuncular</h3><div class="tablewrap"><table>
            <thead><tr><th>Oyuncu</th><th>Mevki</th><th>Rating</th><th>Gol</th><th>Asist</th><th>Şut</th></tr></thead>
            <tbody>${playerRows(m.opp, true)}</tbody></table></div>` : ''}
        </div>
      </details>`;
    }).join('');
    el.innerHTML = `
      <div class="toolbar">
        <div class="seg small-seg">${['all', 'G', 'B', 'M'].map((r) => `<button data-res="${r}" class="${state.res === r ? 'active' : ''}">${r === 'all' ? 'Hepsi' : RES_TXT[r]}</button>`).join('')}</div>
        <input type="search" id="oppSearch" placeholder="Rakip ara…" value="${esc(state.q)}">
        <span class="muted small">${ms.length} maç</span>
      </div>${list || '<div class="empty">Eşleşen maç yok.</div>'}`;
    el.querySelectorAll('[data-res]').forEach((b) => b.addEventListener('click', () => { state.res = b.dataset.res; renderMaclar(); }));
    const inp = $('#oppSearch');
    inp.addEventListener('input', () => { state.q = inp.value; const pos = inp.selectionStart; renderMaclar(); const n = $('#oppSearch'); n.focus(); n.setSelectionRange(pos, pos); });
  }

  // ================= Oyuncular =================
  const name = { key: 'name', label: 'Oyuncu', f: (p) => pLink(p.name) };
  const GROUPS = {
    genel: { label: 'Genel', cols: [name,
      { key: 'mainPos', label: 'Mevki', f: (p) => POS[p.mainPos] ?? esc(p.mainPos) },
      { key: 'games', label: 'Maç' },
      { key: 'mins', label: 'Dakika', f: (p) => fmtInt(p.mins) },
      { key: 'w', label: 'G-B-M', f: (p) => `${p.w}-${p.d}-${p.l}` },
      { key: 'winPct', label: 'Galibiyet', f: (p) => fmtPct(p.winPct) },
      { key: 'rating', label: 'Ort. Rating', f: (p) => `<b>${fmt1(p.rating)}</b>` },
      { key: 'best', label: 'En iyi', f: (p) => fmt1(p.best) },
      { key: 'mom', label: 'MOM' },
      { key: 'momPct', label: 'MOM %', f: (p) => fmtPct(p.momPct) },
      { key: 'form', label: 'Son 5 rating', sv: (p) => p.form.reduce((s, v) => s + v, 0) / (p.form.length || 1), f: (p) => `<span class="formr">${p.form.map((v) => `<i class="${v >= 7.5 ? 'hi' : v < 6.5 ? 'lo' : ''}">${fmt1(v)}</i>`).join('')}</span>` },
    ] },
    hucum: { label: 'Hücum', cols: [name,
      { key: 'games', label: 'Maç' },
      { key: 'goals', label: 'Gol' }, { key: 'assists', label: 'Asist' }, { key: 'ga', label: 'G+A' },
      { key: 'gpg', label: 'Gol/Maç', f: (p) => fmt2(p.gpg) },
      { key: 'apg', label: 'Asist/Maç', f: (p) => fmt2(p.apg) },
      { key: 'g90', label: 'Gol/90', f: (p) => fmt2(p.g90), title: '90 dakika başına gol' },
      { key: 'ga90', label: 'G+A/90', f: (p) => fmt2(p.ga90), title: '90 dakika başına gol + asist' },
      { key: 'shots', label: 'Şut' },
      { key: 'spg', label: 'Şut/Maç', f: (p) => fmt1(p.spg) },
      { key: 'conv', label: 'Gol dönüşümü', f: (p) => fmtPct(p.conv), title: 'Gol / şut' },
      { key: 'hat', label: 'Hat-trick' },
    ] },
    pas: { label: 'Pas & Savunma', cols: [name,
      { key: 'games', label: 'Maç' },
      { key: 'passMade', label: 'Başarılı pas' }, { key: 'passAtt', label: 'Pas denemesi' },
      { key: 'passPct', label: 'Pas %', f: (p) => fmtPct(p.passPct) },
      { key: 'ppg', label: 'Pas/Maç', f: (p) => fmt1(p.ppg) },
      { key: 'tackleMade', label: 'Başarılı tackle' }, { key: 'tackleAtt', label: 'Tackle denemesi' },
      { key: 'tacklePct', label: 'Tackle %', f: (p) => fmtPct(p.tacklePct) },
      { key: 'tpg', label: 'Tackle/Maç', f: (p) => fmt1(p.tpg) },
    ] },
    kaleci: { label: 'Kaleci', cols: [name,
      { key: 'gkGames', label: 'KL maçı' },
      { key: 'saves', label: 'Kurtarış' },
      { key: 'svpg', label: 'Kurtarış/Maç', f: (p) => fmt1(p.svpg) },
      { key: 'conceded', label: 'Yenilen (KL iken)' },
      { key: 'cleanSheet', label: 'Gol yememe' },
      ...SAVE_TYPES.map((s, i) => ({ key: 'sv' + i, label: s, sv: (p) => p.sv[i], f: (p) => p.sv[i] })),
    ] },
    diger: { label: 'Disiplin & Diğer', cols: [name,
      { key: 'games', label: 'Maç' },
      { key: 'league', label: 'Lig maçı' }, { key: 'playoff', label: 'Playoff maçı' },
      { key: 'red', label: 'Kırmızı' }, { key: 'yellow', label: 'Sarı' },
      { key: 'dnf', label: 'Yarıda kalan' },
      { key: 'idleMin', label: 'AFK (dk)', f: (p) => fmt1(p.idleMin), title: 'EA’nın kaydettiği hareketsiz kalma süresi' },
      { key: 'clubs', label: 'Kulüp', sv: (p) => [...p.clubs].map(clubName).join(', '), f: (p) => esc([...p.clubs].map(clubName).join(', ')) },
    ] },
  };

  function renderOyuncular() {
    const ms = filtered();
    const el = $('#oyuncular');
    if (!ms.length) return (el.innerHTML = emptyHtml());
    let ps = aggregatePlayers(ms).filter((p) => p.games >= state.minGames);
    const g = GROUPS[state.group];
    let cols = g.cols;
    if (state.group === 'kaleci') ps = ps.filter((p) => p.gkGames || p.saves);
    if (state.group === 'diger' && !ms.some((m) => m.players.some((p) => p.yellow))) cols = cols.filter((c) => c.key !== 'yellow');
    if (!cols.some((c) => c.key === state.sorts.players.key)) state.sorts.players = { key: cols[2].key, dir: -1 };
    el.innerHTML = `
      <div class="toolbar">
        <div class="seg small-seg">${Object.entries(GROUPS).map(([k, v]) => `<button data-group="${k}" class="${state.group === k ? 'active' : ''}">${v.label}</button>`).join('')}</div>
        <label>En az <input type="number" id="minGames" min="1" value="${state.minGames}"> maç</label>
        <span class="muted small">Başlığa tıklayarak sıralayın, isme tıklayarak profili açın</span>
      </div>
      ${ps.length ? table('players', cols, ps) : `<div class="empty">${state.group === 'kaleci' ? 'Kaleci olarak oynayan kimse yok.' : 'Oyuncu yok.'}</div>`}`;
    el.querySelectorAll('[data-group]').forEach((b) => b.addEventListener('click', () => { state.group = b.dataset.group; renderOyuncular(); }));
    $('#minGames').addEventListener('change', (e) => { state.minGames = Math.max(1, +e.target.value || 1); renderOyuncular(); });
  }

  // ================= İkililer & kadrolar =================
  function renderIkililer() {
    const ms = filtered();
    const el = $('#ikililer');
    if (!ms.length) return (el.innerHTML = emptyHtml());
    const pairs = new Map(), lineups = new Map();
    for (const m of ms) {
      const names = [...new Set(m.players.map((p) => p.name))].sort((a, b) => a.localeCompare(b, 'tr'));
      const lk = names.join(' · ');
      const L = lineups.get(lk) || { names, games: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 };
      L.games++; L[m.result === 'G' ? 'w' : m.result === 'B' ? 'd' : 'l']++; L.gf += m.gf; L.ga += m.ga;
      lineups.set(lk, L);
      for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
        const k = names[i] + '|' + names[j];
        const P = pairs.get(k) || { a: names[i], b: names[j], games: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, ga2: 0, rs: 0 };
        const pa = m.players.find((p) => p.name === names[i]), pb = m.players.find((p) => p.name === names[j]);
        P.games++; P[m.result === 'G' ? 'w' : m.result === 'B' ? 'd' : 'l']++; P.gf += m.gf; P.ga += m.ga;
        P.ga2 += pa.goals + pa.assists + pb.goals + pb.assists; P.rs += (pa.rating + pb.rating) / 2;
        pairs.set(k, P);
      }
    }
    const pr = [...pairs.values()].filter((p) => p.games >= state.pairMin).map((p) => ({ ...p, winPct: pct(p.w, p.games), rating: p.rs / p.games, gpg: p.gf / p.games, gapg: p.ga / p.games }));
    const lr = [...lineups.values()].filter((l) => l.games >= state.pairMin).map((l) => ({ ...l, winPct: pct(l.w, l.games), n: l.names.length }));
    const res = (r) => `${r.w}-${r.d}-${r.l}`;
    el.innerHTML = `
      <div class="toolbar"><label>En az <input type="number" id="pairMin" min="1" value="${state.pairMin}"> ortak maç</label>
        <span class="muted small">Birlikte sahaya çıkan oyuncuların sonuçları</span></div>
      <h2>İkililer</h2>
      ${table('pairs', [
        { key: 'a', label: 'İkili', sv: (r) => r.a + r.b, f: (r) => `${pLink(r.a)} + ${pLink(r.b)}` },
        { key: 'games', label: 'Ortak maç' },
        { key: 'w', label: 'G-B-M', f: res },
        { key: 'winPct', label: 'Galibiyet', f: (r) => fmtPct(r.winPct) },
        { key: 'gpg', label: 'Takım gol/maç', f: (r) => fmt2(r.gpg) },
        { key: 'gapg', label: 'Yenilen/maç', f: (r) => fmt2(r.gapg) },
        { key: 'ga2', label: 'İkilinin G+A' },
        { key: 'rating', label: 'Ort. rating', f: (r) => fmt1(r.rating) },
      ], pr)}
      <h2>Kadro kombinasyonları</h2>
      ${table('lineups', [
        { key: 'names', label: 'Kadro', sv: (r) => r.names.join(), f: (r) => r.names.map(pLink).join(', ') },
        { key: 'n', label: 'Kişi' },
        { key: 'games', label: 'Maç' },
        { key: 'w', label: 'G-B-M', f: res },
        { key: 'winPct', label: 'Galibiyet', f: (r) => fmtPct(r.winPct) },
        { key: 'gf', label: 'Atılan' }, { key: 'ga', label: 'Yenilen' },
      ], lr)}`;
    $('#pairMin').addEventListener('change', (e) => { state.pairMin = Math.max(1, +e.target.value || 1); renderIkililer(); });
  }

  // ================= Rakipler =================
  function renderRakipler() {
    const ms = filtered();
    const el = $('#rakipler');
    if (!ms.length) return (el.innerHTML = emptyHtml());
    const map = new Map();
    for (const m of [...ms].sort((a, b) => b.ts - a.ts)) {
      const k = m.opponent.id || m.opponent.name;
      const o = map.get(k) || { opp: m.opponent.name, games: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, last: `${m.gf}-${m.ga}`, lastTs: m.ts, scorers: {} };
      o.games++; o[m.result === 'G' ? 'w' : m.result === 'B' ? 'd' : 'l']++; o.gf += m.gf; o.ga += m.ga;
      (m.opp || []).forEach((p) => { if (p.goals) o.scorers[p.name] = (o.scorers[p.name] || 0) + p.goals; });
      map.set(k, o);
    }
    const rows = [...map.values()].map((o) => {
      const t = Object.entries(o.scorers).sort((a, b) => b[1] - a[1])[0];
      return { ...o, diff: o.gf - o.ga, winPct: pct(o.w, o.games), top: t ? `${t[0]} (${t[1]})` : '' };
    });
    el.innerHTML = `<p class="muted">Karşılaşılan her rakibe karşı sonuçlar. "Bize en çok gol atan" rakip oyuncu verisinden hesaplanır.</p>
      ${table('opps', [
        { key: 'opp', label: 'Rakip', f: (r) => esc(r.opp) },
        { key: 'games', label: 'Maç' },
        { key: 'w', label: 'G-B-M', f: (r) => `${r.w}-${r.d}-${r.l}` },
        { key: 'winPct', label: 'Galibiyet', f: (r) => fmtPct(r.winPct) },
        { key: 'gf', label: 'Atılan' }, { key: 'ga', label: 'Yenilen' },
        { key: 'diff', label: 'Averaj', f: (r) => (r.diff > 0 ? '+' : '') + r.diff },
        { key: 'lastTs', label: 'Son maç', f: (r) => `${r.last} <span class="muted small">${shortDate(r.lastTs)}</span>` },
        { key: 'top', label: 'Bize en çok gol atan', f: (r) => esc(r.top || '–') },
      ], rows)}`;
  }

  // ================= Rekorlar =================
  function renderRekorlar() {
    const ms = filtered();
    const el = $('#rekorlar');
    if (!ms.length) return (el.innerHTML = emptyHtml());
    const mDesc = (m) => `${esc(clubName(m.clubId))} ${m.gf}-${m.ga} ${esc(m.opponent.name)} <span class="muted small">${shortDate(m.ts)}</span>`;
    const by = (f) => [...ms].sort((a, b) => f(b) - f(a))[0];
    const bigW = ms.filter((m) => m.result === 'G').sort((a, b) => (b.gf - b.ga) - (a.gf - a.ga))[0];
    const bigL = ms.filter((m) => m.result === 'M').sort((a, b) => (b.ga - b.gf) - (a.ga - a.gf))[0];
    const most = by((m) => m.gf + m.ga);
    const pm = ms.flatMap((m) => m.players.map((p) => ({ p, m })));
    const pBest = (f, fmt = (v) => v, min = 1) => {
      const x = pm.filter((r) => f(r.p) >= min).sort((a, b) => f(b.p) - f(a.p))[0];
      return x ? `<b>${fmt(f(x.p))}</b> · ${pLink(x.p.name)}<div class="small muted">${mDesc(x.m)}</div>` : '–';
    };
    const hats = pm.filter((r) => r.p.goals >= 3);
    const st = streaks(ms);
    const rec = (t, v) => `<div class="card rec"><div class="label">${t}</div><div>${v}</div></div>`;
    el.innerHTML = `
      <h2>Takım rekorları</h2>
      <div class="recs">
        ${rec('En farklı galibiyet', bigW ? mDesc(bigW) : '–')}
        ${rec('En farklı mağlubiyet', bigL ? mDesc(bigL) : '–')}
        ${rec('En gollü maç', most ? mDesc(most) : '–')}
        ${rec('Bir maçta en çok şut', (() => { const m = by((m) => m.us?.shots || 0); return m ? `<b>${m.us.shots}</b> · ${mDesc(m)}` : '–'; })())}
        ${rec('Bir maçta en çok başarılı pas', (() => { const m = by((m) => m.us?.passMade || 0); return m ? `<b>${m.us.passMade}</b> · ${mDesc(m)}` : '–'; })())}
        ${rec('En uzun galibiyet / yenilmezlik serisi', `<b>${st.bw}</b> / <b>${st.bu}</b> maç`)}
      </div>
      <h2>Bireysel rekorlar (tek maç)</h2>
      <div class="recs">
        ${rec('En çok gol', pBest((p) => p.goals))}
        ${rec('En çok asist', pBest((p) => p.assists))}
        ${rec('En çok gol + asist', pBest((p) => p.goals + p.assists))}
        ${rec('En yüksek rating', pBest((p) => p.rating, fmt1))}
        ${rec('En çok şut', pBest((p) => p.shots))}
        ${rec('En çok başarılı pas', pBest((p) => p.passMade))}
        ${rec('En çok başarılı tackle', pBest((p) => p.tackleMade))}
        ${rec('En çok kurtarış', pBest((p) => p.saves))}
      </div>
      <h2>Hat-trick'ler</h2>
      ${hats.length ? `<div class="tablewrap"><table><thead><tr><th>Oyuncu</th><th>Gol</th><th>Maç</th></tr></thead><tbody>${hats.map((r) => `<tr><td>${pLink(r.p.name)}</td><td>${r.p.goals}</td><td>${mDesc(r.m)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">Henüz hat-trick yok.</div>'}`;
  }

  // ================= EA sezon toplamları =================
  const MCOLS = [
    ['name', 'Oyuncu'], ['proName', 'Pro adı'], ['proOverall', 'Genel güç'], ['proHeight', 'Boy'], ['favoritePosition', 'Mevki'],
    ['gamesPlayed', 'Maç'], ['winRate', 'Galibiyet %'], ['goals', 'Gol'], ['assists', 'Asist'], ['ratingAve', 'Ort. Rating'],
    ['manOfTheMatch', 'MOM'], ['shotSuccessRate', 'Şut isabeti %'], ['passesMade', 'Başarılı pas'], ['passSuccessRate', 'Pas %'],
    ['tacklesMade', 'Tackle'], ['tackleSuccessRate', 'Tackle %'], ['redCards', 'Kırmızı'], ['cleanSheetsDef', 'Gol yememe (DEF)'],
    ['cleanSheetsGK', 'Gol yememe (KL)'], ['prev', 'Son 10 maç gol'],
  ];
  function renderSezon() {
    const el = $('#sezon');
    const clubs = DATA.clubs.filter((c) => state.club === 'all' || c.clubId === state.club);
    const parts = clubs.map((c) => {
      const mem = (DATA.members[c.clubId]?.members || []).filter((m) => +m.gamesPlayed > 0);
      if (!mem.length) return `<h2>${esc(c.name)}</h2><div class="empty">Henüz EA sezon verisi yok.</div>`;
      const cols = MCOLS.filter(([k]) => k === 'prev' ? mem.some((m) => m.prevGoals1 != null) : mem.some((m) => m[k] != null && m[k] !== ''));
      const sorted = [...mem].sort((a, b) => (+b.gamesPlayed || 0) - (+a.gamesPlayed || 0));
      return `<h2>${esc(c.name)}</h2><div class="tablewrap"><table>
        <thead><tr>${cols.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead>
        <tbody>${sorted.map((m) => `<tr>${cols.map(([k]) => {
          if (k === 'name') return `<td>${pLink(m.name)}</td>`;
          if (k === 'prev') return `<td><span class="prevg">${Array.from({ length: 10 }, (_, i) => m['prevGoals' + (i + 1)]).filter((v) => v != null).map((v) => `<i class="${+v ? 'on' : ''}">${v}</i>`).join('')}</span></td>`;
          let v = m[k];
          if (k === 'favoritePosition') v = POS[v] ?? v;
          if (k === 'ratingAve' && v !== '') v = fmt1(+v);
          if (k === 'proHeight' && v) v = `${v} cm`;
          return `<td>${esc(v ?? '–')}</td>`;
        }).join('')}</tr>`).join('')}</tbody></table></div>`;
    });
    el.innerHTML = `<p class="muted">EA'nın tuttuğu tüm zamanların kulüp içi toplamları (takipten önceki maçlar dahil). "Son 10 maç gol" EA'nın kaydettiği en son maçlardan başlar.</p>${parts.join('') || emptyHtml()}`;
  }

  // ================= Oyuncu profili =================
  function openPlayer(nm) {
    const key = nm.toLowerCase();
    const ms = filtered().filter((m) => m.players.some((p) => p.name.toLowerCase() === key)).sort((a, b) => b.ts - a.ts);
    const agg = aggregatePlayers(ms).find((p) => p.name.toLowerCase() === key);
    const memb = Object.entries(DATA.members).flatMap(([cid, v]) => (v.members || []).filter((m) => m.name.toLowerCase() === key).map((m) => ({ ...m, club: clubName(cid) })));
    const dlg = $('#playerDlg');
    let html = `<div class="dlghead"><h2>${esc(nm)}</h2><button class="x" aria-label="Kapat">✕</button></div>`;
    if (!agg) html += '<div class="empty">Bu filtrede kayıtlı maçı yok.</div>';
    else {
      const card = (l, v, s = '') => `<div class="card"><div class="label">${l}</div><div class="value">${v}</div>${s ? `<div class="sub">${s}</div>` : ''}</div>`;
      // en iyi partnerler
      const mates = {};
      ms.forEach((m) => m.players.forEach((p) => {
        if (p.name.toLowerCase() === key) return;
        const o = mates[p.name] || (mates[p.name] = { g: 0, w: 0 });
        o.g++; if (m.result === 'G') o.w++;
      }));
      const mateRows = Object.entries(mates).sort((a, b) => b[1].g - a[1].g || b[1].w - a[1].w);
      const posTxt = Object.entries(agg.pos).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${POS[k] ?? k} ${v}`).join(' · ');
      const pts = [...ms].reverse().map((m) => {
        const p = m.players.find((x) => x.name.toLowerCase() === key);
        return { v: p.rating, tip: `${shortDate(m.ts)} · ${m.gf}-${m.ga} ${m.opponent.name} · ${fmt1(p.rating)} (${p.goals}G ${p.assists}A)` };
      }).slice(-25);
      html += `
        <div class="cards">
          ${card('Maç', agg.games, `${agg.w}G ${agg.d}B ${agg.l}M`)}
          ${card('Gol / Asist', `${agg.goals} / ${agg.assists}`, `G+A/90: ${fmt2(agg.ga90)}`)}
          ${card('Ort. rating', fmt1(agg.rating), `En iyi ${fmt1(agg.best)}`)}
          ${card('Maçın adamı', agg.mom, fmtPct(agg.momPct))}
          ${card('Pas isabeti', fmtPct(agg.passPct), `${agg.passMade}/${agg.passAtt}`)}
          ${card('Tackle başarısı', fmtPct(agg.tacklePct), `${agg.tackleMade}/${agg.tackleAtt}`)}
          ${card('Şut', agg.shots, `Dönüşüm ${fmtPct(agg.conv)}`)}
          ${card('Dakika', fmtInt(agg.mins), posTxt)}
        </div>
        ${lineChart(pts, 'Maç maç rating')}
        ${memb.length ? `<h3>EA profili</h3><div class="kv wide">${memb.map((m) => `
          <div><span>${esc(m.club)}</span><b>${esc(m.proName || '')} ${m.proOverall ? `· ${esc(m.proOverall)} güç` : ''} ${m.proHeight ? `· ${esc(m.proHeight)} cm` : ''} · ${esc(m.gamesPlayed)} maç, ${esc(m.goals)} gol, ${esc(m.assists)} asist</b></div>`).join('')}</div>` : ''}
        ${mateRows.length ? `<h3>Birlikte oynadıkları</h3><div class="chips">${mateRows.map(([n, o]) => `<span class="chip">${pLink(n)} <span class="muted">${o.g} maç · ${fmtPct(pct(o.w, o.g))}</span></span>`).join('')}</div>` : ''}
        <h3>Maç geçmişi</h3>
        <div class="tablewrap"><table><thead><tr><th>Tarih</th><th>Maç</th><th>Sonuç</th><th>Mevki</th><th>Rating</th><th>Gol</th><th>Asist</th><th>Şut</th><th>Pas</th><th>Tackle</th></tr></thead><tbody>
        ${ms.map((m) => { const p = m.players.find((x) => x.name.toLowerCase() === key); return `<tr>
          <td>${shortDate(m.ts)}</td><td>${esc(clubName(m.clubId))} ${m.gf}-${m.ga} ${esc(m.opponent.name)}</td><td>${badge(m.result)}</td>
          <td>${POS[p.pos] ?? esc(p.pos)}</td><td><b>${fmt1(p.rating)}</b>${p.mom ? ' <span class="mom">★</span>' : ''}</td><td>${p.goals}</td><td>${p.assists}</td><td>${p.shots}</td>
          <td>${p.passMade}/${p.passAtt}</td><td>${p.tackleMade}/${p.tackleAtt}</td></tr>`; }).join('')}
        </tbody></table></div>`;
    }
    dlg.innerHTML = html;
    $('.x', dlg).addEventListener('click', () => dlg.close());
    if (!dlg.open) dlg.showModal();
    dlg.scrollTop = 0;
  }

  // ================= Tooltip =================
  const tip = document.createElement('div');
  tip.className = 'tip';
  document.body.appendChild(tip);
  document.addEventListener('pointermove', (e) => {
    const t = e.target.closest?.('[data-tip]');
    if (!t) { tip.style.display = 'none'; return; }
    tip.textContent = t.dataset.tip;
    tip.style.display = 'block';
    const r = tip.getBoundingClientRect();
    tip.style.left = Math.min(window.innerWidth - r.width - 8, Math.max(8, e.clientX - r.width / 2)) + 'px';
    tip.style.top = Math.max(8, e.clientY - r.height - 14) + 'px';
  });

  // ================= Genel =================
  function emptyHtml() {
    return `<div class="empty">Bu filtre için kayıtlı maç yok.<br><span class="small">Maç oynandıktan ve veriler güncellendikten sonra burada görünecek.</span></div>`;
  }

  function renderAll() { renderOzet(); renderMaclar(); renderOyuncular(); renderIkililer(); renderRakipler(); renderRekorlar(); renderSezon(); }

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
