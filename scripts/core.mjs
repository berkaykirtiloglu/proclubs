// Ortak çekirdek: Node (scripts/collect.mjs) ve tarayıcı güncelleyici aynı kodu kullanır.
export const API = 'https://proclubs.ea.com/api/fc';

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// ---------- Kulüp ID bulma ----------
function listFromSearch(res) {
  if (!res) return [];
  const arr = Array.isArray(res) ? res : Object.values(res);
  return arr
    .map((c) => ({
      clubId: String(c.clubId ?? c.clubInfo?.clubId ?? ''),
      name: c.clubName ?? c.name ?? c.clubInfo?.name ?? '',
    }))
    .filter((c) => c.clubId);
}

export async function resolveClubId(name, platform, get) {
  const q = encodeURIComponent(name);
  const urls = [
    `${API}/allTimeLeaderboard/search?platform=${platform}&clubName=${q}`,
    `${API}/clubs/search?platform=${platform}&clubName=${q}`,
  ];
  for (const url of urls) {
    try {
      const list = listFromSearch(await get(url));
      const exact = list.find((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase());
      if (exact) return exact.clubId;
      if (list.length === 1) return list[0].clubId;
      if (list.length) console.warn(`"${name}" için birden fazla sonuç:`, list.slice(0, 5));
    } catch (e) {
      console.warn('Arama hatası:', e.message);
    }
  }
  return null;
}

// ---------- Maç normalize ----------
const pct = (made, att) => (att > 0 ? Math.round((made / att) * 1000) / 10 : null);

export function normalizePlayer(id, p) {
  return {
    id: String(id),
    name: p.playername ?? p.name ?? String(id),
    pos: p.pos ?? '',
    rating: num(p.rating),
    goals: num(p.goals),
    assists: num(p.assists),
    shots: num(p.shots),
    passAtt: num(p.passattempts),
    passMade: num(p.passesmade),
    tackleAtt: num(p.tackleattempts),
    tackleMade: num(p.tacklesmade),
    red: num(p.redcards),
    yellow: num(p.yellowcards ?? p.yellowCards ?? 0),
    mom: num(p.mom) > 0 ? 1 : 0,
    saves: num(p.saves),
    conceded: num(p.goalsconceded),
    cleanSheet: num(p.cleansheetsany) > 0 ? 1 : 0,
    secs: num(p.secondsPlayed ?? p.realtimegame),
    real: num(p.realtimegame),
    idle: num(p.realtimeidle),
    arch: num(p.archetypeid),
    sv: [p.ballDiveSaves, p.crossSaves, p.goodDirectionSaves, p.parrySaves, p.punchSaves, p.reflexSaves].map(num),
  };
}

const SCHEMA = 2;

export function normalizeMatch(raw, ourId, matchType) {
  ourId = String(ourId);
  const clubs = raw.clubs || {};
  const ours = clubs[ourId];
  if (!ours) return null;
  const oppId = Object.keys(clubs).find((k) => k !== ourId);
  const opp = oppId ? clubs[oppId] : {};
  const gf = num(ours.goals ?? ours.score);
  const ga = num(ours.goalsAgainst ?? opp.goals ?? opp.score);
  const dnf = num(ours.winnerByDnf) > 0 || num(opp.winnerByDnf) > 0;
  const result = gf > ga ? 'G' : gf < ga ? 'M' : 'B';
  const players = Object.entries(raw.players?.[ourId] || {}).map(([id, p]) => normalizePlayer(id, p));
  const oppPlayers = Object.entries((oppId && raw.players?.[oppId]) || {}).map(([id, p]) => normalizePlayer(id, p));
  const agg = (list) => ({
    shots: list.reduce((s, p) => s + p.shots, 0),
    passAtt: list.reduce((s, p) => s + p.passAtt, 0),
    passMade: list.reduce((s, p) => s + p.passMade, 0),
    tackleAtt: list.reduce((s, p) => s + p.tackleAtt, 0),
    tackleMade: list.reduce((s, p) => s + p.tackleMade, 0),
    red: list.reduce((s, p) => s + p.red, 0),
    yellow: list.reduce((s, p) => s + p.yellow, 0),
  });
  return {
    v: SCHEMA,
    key: `${raw.matchId}_${ourId}`,
    matchId: String(raw.matchId),
    ts: num(raw.timestamp),
    type: matchType,
    clubId: ourId,
    opponent: {
      id: oppId ? String(oppId) : '',
      name: opp?.details?.name ?? 'Bilinmeyen rakip',
    },
    gf,
    ga,
    result,
    dnf,
    us: agg(players),
    them: agg(oppPlayers),
    players,
    opp: oppPlayers.map((p) => ({ name: p.name, pos: p.pos, rating: p.rating, goals: p.goals, assists: p.assists, shots: p.shots, red: p.red, mom: p.mom })),
  };
}

// ---------- Kulüp bilgileri (lig, seriler, stadyum, renkler) ----------
export async function fetchClubInfo(club, platform, get) {
  const info = {};
  try {
    const o = (await get(`${API}/clubs/overallStats?platform=${platform}&clubIds=${club.clubId}`))?.[0];
    if (o) {
      for (const k of ['gamesPlayed', 'gamesPlayedPlayoff', 'wins', 'ties', 'losses', 'goals', 'goalsAgainst', 'promotions',
        'relegations', 'wstreak', 'unbeatenstreak', 'skillRating', 'leagueAppearances', 'bestDivision', 'bestFinishGroup'])
        info[k] = o[k] == null ? null : num(o[k]);
    }
  } catch { /* isteğe bağlı */ }
  try {
    const l = listFromSearchRaw(await get(`${API}/allTimeLeaderboard/search?platform=${platform}&clubName=${encodeURIComponent(club.name)}`));
    const me = l.find((c) => String(c.clubId) === String(club.clubId));
    if (me) {
      info.currentDivision = me.currentDivision == null ? null : num(me.currentDivision);
      info.points = num(me.points);
      const k = me.clubInfo?.customKit || {};
      info.stadium = k.stadName || null;
      info.colors = [k.kitColor1, k.kitColor2].filter(Boolean).map((c) => '#' + Number(c).toString(16).padStart(6, '0'));
      info.crestAssetId = k.crestAssetId || null;
    }
  } catch { /* isteğe bağlı */ }
  return info;
}
const listFromSearchRaw = (res) => (!res ? [] : Array.isArray(res) ? res : Object.values(res));

// ---------- Toplama + birleştirme ----------
// existing: { clubs, matches, members }  get: url -> JSON
export async function collect({ config, existing, get, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = console.log }) {
  const knownClubs = existing.clubs || [];
  const members = { ...(existing.members || {}) };
  const byKey = new Map((existing.matches || []).map((m) => [m.key, m]));
  const platform = config.platform || 'common-gen5';

  const clubs = [];
  for (const c of config.clubs) {
    let id = c.clubId || knownClubs.find((k) => k.name === c.name)?.clubId;
    if (!id) {
      id = await resolveClubId(c.name, platform, get);
      log(`${c.name} -> clubId ${id ?? 'BULUNAMADI'}`);
    }
    if (id) clubs.push({ name: c.name, clubId: String(id), platform });
  }
  if (!clubs.length) throw new Error('Hiçbir kulüp ID’si bulunamadı. config.json içine clubId yazın.');

  let added = 0;
  let errors = 0;
  for (const club of clubs) {
    for (const type of config.matchTypes) {
      const url = `${API}/clubs/matches?matchType=${type}&platform=${platform}&clubIds=${club.clubId}&maxResultCount=10`;
      try {
        const list = (await get(url)) || [];
        for (const raw of list) {
          const m = normalizeMatch(raw, club.clubId, type);
          if (!m) continue;
          const old = byKey.get(m.key);
          if (!old) added++;
          if (!old || (old.v || 1) < SCHEMA) byKey.set(m.key, m);
        }
      } catch (e) {
        errors++;
        log(`${club.name} / ${type}: ${e.message}`);
      }
      await sleep(500);
    }
    try {
      const res = await get(`${API}/members/stats?platform=${platform}&clubId=${club.clubId}`);
      if (res?.members) members[club.clubId] = { updated: Date.now(), members: res.members, positionCount: res.positionCount || null };
    } catch (e) {
      log(`${club.name} üye istatistikleri: ${e.message}`);
    }
    club.info = await fetchClubInfo(club, platform, get);
    const old = knownClubs.find((k) => k.clubId === club.clubId);
    if (!Object.keys(club.info).length && old?.info) club.info = old.info;
  }

  const all = [...byKey.values()].sort((a, b) => b.ts - a.ts);
  const files = {
    'matches.json': JSON.stringify(all),
    'members.json': JSON.stringify(members),
    'clubs.json': JSON.stringify(clubs, null, 2),
    'meta.json': JSON.stringify({ updated: Date.now(), total: all.length }),
  };
  return { files, added, errors, total: all.length, expectedCalls: clubs.length * config.matchTypes.length };
}
