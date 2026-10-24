// =====================================================
// Statlogia - e-Stat 応答のディスクキャッシュ（全 lib 共通）
// src/lib/estat-cache.js
//
// 各 lib の apiGet はここの cachedJsonFetch を通す。URL ごとに .cache/estat/ へ JSON を保存し、
// ESTAT_CACHE_DAYS（既定30）日以内ならネットに出ない。ESTAT_FRESH=1（npm run build:fresh）で無視。
// Cloudflare のビルドは毎回まっさらなので常に取り直し＝定期の再ビルド（月2回）で数字が新しくなる。
// 既定30日はあくまで手元のビルド用。月2回だと2回目が30日以内に入るが、手元で最新を取りたいときは
// npm run build:fresh（ESTAT_FRESH=1）を使う。
// appId はキャッシュの鍵から除く（鍵は表・コード・ページ位置だけ）。
// =====================================================
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DIR = path.join(process.cwd(), '.cache', 'estat');
const DAYS = Number(process.env.ESTAT_CACHE_DAYS || 30);
const FRESH = process.env.ESTAT_FRESH === '1';
let hits = 0, misses = 0;

function keyOf(url) {
  const u = new URL(url);
  u.searchParams.delete('appId');
  const s = u.pathname + '?' + [...u.searchParams.entries()].sort().map(([k, v]) => `${k}=${v}`).join('&');
  return crypto.createHash('sha1').update(s).digest('hex');
}

export async function cachedJsonFetch(url, init) {
  const f = path.join(DIR, keyOf(url) + '.json');
  if (!FRESH) {
    try {
      const st = fs.statSync(f);
      if ((Date.now() - st.mtimeMs) / 86400000 <= DAYS) { hits++; return JSON.parse(fs.readFileSync(f, 'utf8')); }
    } catch { /* miss */ }
  }
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  misses++;
  try { fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(f, JSON.stringify(json)); } catch { /* 書けなくても続ける */ }
  return json;
}

export const cacheStats = () => ({ hits, misses });
