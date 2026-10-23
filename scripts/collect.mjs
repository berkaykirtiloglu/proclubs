// EA FC Pro Clubs veri toplayıcı
// Çalıştırma: node scripts/collect.mjs   (Node 18+ gerekir, ek paket yok)
// EA'nın resmi olmayan proclubs.ea.com API'sinden maçları çeker ve data/ klasöründe biriktirir.
// EA her maç türü için sadece son ~10 maçı verdiği için bu script düzenli çalıştırılmalıdır.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const API = 'https://proclubs.ea.com/api/fc';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://www.ea.com/',
  Origin: 'https://www.ea.com',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      return text ? JSON.parse(text) : null;
    } catch (e) {
      lastErr = e;
      await sleep(1500 * (i + 1));
    }
  }
  throw new Error(`${url} -> ${lastErr?.message}`);
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

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

async function resolveClubId(name, platform) {
  const q = encodeURIComponent(name);
  const urls = [
    `${API}/allTimeLeaderboard/search?platform=${platform}&clubName=${q}`,
    `${API}/clubs/search?platform=${platform}&clubName=${q}`,
  ];
  for (const url of urls) {
    try {
      const list = listFromSearch(await getJson(url));
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
  };
}

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
  };
}

// ---------- Ana akış ----------
async function main() {
  const config = await readJson(path.join(ROOT, 'config.json'), null);
  if (!config) throw new Error('config.json okunamadı');
  await mkdir(DATA, { recursive: true });

  const clubsFile = path.join(DATA, 'clubs.json');
  const matchesFile = path.join(DATA, 'matches.json');
  const membersFile = path.join(DATA, 'members.json');

  const knownClubs = await readJson(clubsFile, []);
  const matches = await readJson(matchesFile, []);
  const members = await readJson(membersFile, {});
  const byKey = new Map(matches.map((m) => [m.key, m]));
  const platform = config.platform || 'common-gen5';

  const clubs = [];
  for (const c of config.clubs) {
    let id = c.clubId || knownClubs.find((k) => k.name === c.name)?.clubId;
    if (!id) {
      id = await resolveClubId(c.name, platform);
      console.log(`${c.name} -> clubId ${id ?? 'BULUNAMADI'}`);
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
        const list = (await getJson(url)) || [];
        for (const raw of list) {
          const m = normalizeMatch(raw, club.clubId, type);
          if (m && !byKey.has(m.key)) {
            byKey.set(m.key, m);
            added++;
          }
        }
      } catch (e) {
        errors++;
        console.warn(`${club.name} / ${type}:`, e.message);
      }
      await sleep(800);
    }
    try {
      const res = await getJson(`${API}/members/stats?platform=${platform}&clubId=${club.clubId}`);
      if (res?.members) members[club.clubId] = { updated: Date.now(), members: res.members };
    } catch (e) {
      console.warn(`${club.name} üye istatistikleri:`, e.message);
    }
    try {
      const info = await getJson(`${API}/clubs/info?platform=${platform}&clubIds=${club.clubId}`);
      const d = info?.[club.clubId];
      if (d?.customKit?.crestAssetId) club.crestAssetId = d.customKit.crestAssetId;
    } catch {
      /* isteğe bağlı */
    }
  }

  const all = [...byKey.values()].sort((a, b) => b.ts - a.ts);
  await writeFile(matchesFile, JSON.stringify(all));
  await writeFile(membersFile, JSON.stringify(members));
  await writeFile(clubsFile, JSON.stringify(clubs, null, 2));
  await writeFile(path.join(DATA, 'meta.json'), JSON.stringify({ updated: Date.now(), total: all.length }));
  console.log(`Bitti: ${added} yeni maç, toplam ${all.length}. Hata sayısı: ${errors}`);
  if (errors && added === 0 && errors >= clubs.length * config.matchTypes.length) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
