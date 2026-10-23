(async () => {
  /* Pro Clubs güncelleyici: proclubs.ea.com sekmesinde çalışır, veriyi siteye taşır. */
  const SITE = '__SITE__';
  const CLUBS = __CLUBS__;
  const P = 'common-gen5';
  const API = 'https://proclubs.ea.com/api/fc';
  if (location.hostname !== 'proclubs.ea.com') {
    location.href = API + '/clubs/info?platform=' + P + '&clubIds=' + CLUBS[0].clubId;
    return;
  }
  const msg = (t) => { document.body.innerHTML = '<div style="font:18px system-ui,sans-serif;padding:24px;color:#111;background:#fff">' + t + '</div>'; };
  msg('Pro Clubs verileri çekiliyor…');
  try {
    const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    const get = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error('HTTP ' + r.status); const x = await r.text(); return x ? JSON.parse(x) : null; };
    const np = (id, p) => ({
      id: String(id), name: p.playername ?? p.name ?? String(id), pos: p.pos ?? '', rating: num(p.rating), goals: num(p.goals),
      assists: num(p.assists), shots: num(p.shots), passAtt: num(p.passattempts), passMade: num(p.passesmade),
      tackleAtt: num(p.tackleattempts), tackleMade: num(p.tacklesmade), red: num(p.redcards), yellow: num(p.yellowcards ?? p.yellowCards ?? 0),
      mom: num(p.mom) > 0 ? 1 : 0, saves: num(p.saves), conceded: num(p.goalsconceded), cleanSheet: num(p.cleansheetsany) > 0 ? 1 : 0,
      secs: num(p.secondsPlayed ?? p.realtimegame), real: num(p.realtimegame), idle: num(p.realtimeidle), arch: num(p.archetypeid),
      sv: [p.ballDiveSaves, p.crossSaves, p.goodDirectionSaves, p.parrySaves, p.punchSaves, p.reflexSaves].map(num),
    });
    const sumf = (l, f) => l.reduce((s, p) => s + p[f], 0);
    const agg = (l) => ({ shots: sumf(l, 'shots'), passAtt: sumf(l, 'passAtt'), passMade: sumf(l, 'passMade'), tackleAtt: sumf(l, 'tackleAtt'), tackleMade: sumf(l, 'tackleMade'), red: sumf(l, 'red'), yellow: sumf(l, 'yellow') });
    const nm = (raw, ourId, type) => {
      const clubs = raw.clubs || {}; const ours = clubs[ourId]; if (!ours) return null;
      const oppId = Object.keys(clubs).find((k) => k !== ourId); const opp = oppId ? clubs[oppId] : {};
      const gf = num(ours.goals ?? ours.score), ga = num(ours.goalsAgainst ?? opp.goals ?? opp.score);
      const players = Object.entries(raw.players?.[ourId] || {}).map(([i, p]) => np(i, p));
      const op = Object.entries((oppId && raw.players?.[oppId]) || {}).map(([i, p]) => np(i, p));
      return {
        v: 2, key: raw.matchId + '_' + ourId, matchId: String(raw.matchId), ts: num(raw.timestamp), type, clubId: ourId,
        opponent: { id: oppId ? String(oppId) : '', name: opp?.details?.name ?? 'Bilinmeyen rakip' },
        gf, ga, result: gf > ga ? 'G' : gf < ga ? 'M' : 'B', dnf: num(ours.winnerByDnf) > 0 || num(opp.winnerByDnf) > 0,
        us: agg(players), them: agg(op), players,
        opp: op.map((p) => ({ name: p.name, pos: p.pos, rating: p.rating, goals: p.goals, assists: p.assists, shots: p.shots, red: p.red, mom: p.mom })),
      };
    };
    const matches = [], members = {}, clubs = [];
    for (const c of CLUBS) {
      const club = { name: c.name, clubId: String(c.clubId), platform: P, info: {} };
      for (const t of ['leagueMatch', 'playoffMatch', 'friendlyMatch']) {
        try { for (const raw of (await get(`${API}/clubs/matches?matchType=${t}&platform=${P}&clubIds=${club.clubId}&maxResultCount=10`)) || []) { const m = nm(raw, club.clubId, t); if (m) matches.push(m); } } catch (e) { /* devam */ }
      }
      try { const r = await get(`${API}/members/stats?platform=${P}&clubId=${club.clubId}`); if (r?.members) members[club.clubId] = { updated: Date.now(), members: r.members, positionCount: r.positionCount || null }; } catch (e) { /* devam */ }
      try {
        const o = (await get(`${API}/clubs/overallStats?platform=${P}&clubIds=${club.clubId}`))?.[0];
        if (o) for (const k of ['gamesPlayed', 'gamesPlayedPlayoff', 'wins', 'ties', 'losses', 'goals', 'goalsAgainst', 'promotions', 'relegations', 'wstreak', 'unbeatenstreak', 'skillRating', 'leagueAppearances', 'bestDivision', 'bestFinishGroup']) club.info[k] = o[k] == null ? null : num(o[k]);
      } catch (e) { /* devam */ }
      try {
        const l = await get(`${API}/allTimeLeaderboard/search?platform=${P}&clubName=${encodeURIComponent(club.name)}`);
        const me = (Array.isArray(l) ? l : Object.values(l || {})).find((x) => String(x.clubId) === club.clubId);
        if (me) {
          const k = me.clubInfo?.customKit || {};
          Object.assign(club.info, { currentDivision: me.currentDivision == null ? null : num(me.currentDivision), points: num(me.points), stadium: k.stadName || null,
            colors: [k.kitColor1, k.kitColor2].filter(Boolean).map((x) => '#' + Number(x).toString(16).padStart(6, '0')), crestAssetId: k.crestAssetId || null });
        }
      } catch (e) { /* devam */ }
      clubs.push(club);
    }
    if (!matches.length && !Object.keys(members).length) throw new Error('EA hiç veri döndürmedi.');
    const s = new Blob([JSON.stringify({ t: Date.now(), matches, members, clubs })]).stream().pipeThrough(new CompressionStream('gzip'));
    const buf = new Uint8Array(await new Response(s).arrayBuffer());
    let bin = ''; for (const b of buf) bin += String.fromCharCode(b);
    msg('Veriler alındı (' + matches.length + ' maç). Siteye dönülüyor…');
    location.href = SITE + '#ea=' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch (e) {
    msg('Güncelleme başarısız: ' + e.message);
  }
})();
