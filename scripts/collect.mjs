// EA FC Pro Clubs veri toplayıcı (Node 18+, ek paket yok)
// Çalıştırma: node scripts/collect.mjs
// Not: EA bulut sunucularını (ör. GitHub Actions) engelleyebilir; ev/ofis bağlantısından çalıştırın.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { collect } from './core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'data');
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
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
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}

async function main() {
  const config = await readJson(path.join(ROOT, 'config.json'), null);
  if (!config) throw new Error('config.json okunamadı');
  await mkdir(DATA, { recursive: true });
  const existing = {
    clubs: await readJson(path.join(DATA, 'clubs.json'), []),
    matches: await readJson(path.join(DATA, 'matches.json'), []),
    members: await readJson(path.join(DATA, 'members.json'), {}),
    opponents: await readJson(path.join(DATA, 'opponents.json'), {}),
  };
  const r = await collect({ config, existing, get: getJson, sleep });
  for (const [name, content] of Object.entries(r.files)) await writeFile(path.join(DATA, name), content);
  console.log(`Bitti: ${r.added} yeni maç, toplam ${r.total}. Hata sayısı: ${r.errors}`);
  if (r.errors && r.added === 0 && r.errors >= r.expectedCalls) process.exitCode = 1;
}

main().catch((e) => { console.error(e.message); process.exit(1); });
