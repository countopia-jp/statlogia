// =====================================================
// Statlogia - たずね窓口の索引づくり（ビルド時に1回だけ動く）
// src/lib/search-index.js
//
// 公開中の指標（catalog.js の usedIn）から、ページごとに
//   名前・説明・載っている指標・引ける単位（都道府県／市区町村）
// をまとめる。窓口や展示を足すと、ここは触らなくても索引に入る。
// 説明文は、共通エンジンの窓口＝設定の description、手書きのページ＝ページの BaseLayout に書いた description から取る。
// 展示は Countopia に残したので、/exhibits/ の指標は索引に入れない。
// =====================================================
import fs from 'node:fs';
import path from 'node:path';
import { catalog } from '../data/catalog.js';
import { ROOM_NAMES } from '../data/page-names.js';
import { ROOMS } from '../data/rooms/index.js';

const SCOPE_WORD = { pref: '都道府県', muni: '市区町村', city: '県庁所在市など' };

function descFromPage(href) {
  const file = path.join(process.cwd(), 'src/pages', href, 'index.astro');
  if (!fs.existsSync(file)) return '';
  const m = fs.readFileSync(file, 'utf8').match(/description="([^"]+)"/);
  return m ? m[1] : '';
}

export function buildSearchIndex() {
  const byPage = new Map();
  for (const c of catalog) {
    if (c.status !== 'published') continue;
    for (const href of c.usedIn || []) {
      if (href.startsWith('/exhibits/')) continue;
      if (!byPage.has(href)) byPage.set(href, { labels: [], scopes: new Set() });
      const p = byPage.get(href);
      if (!p.labels.includes(c.label)) p.labels.push(c.label);
      if (SCOPE_WORD[c.scope]) p.scopes.add(SCOPE_WORD[c.scope]);
    }
  }
  const roomByPath = new Map(Object.values(ROOMS).map((r) => [r.path, r]));

  const entries = [];
  for (const [href, p] of byPage) {
    const roomName = ROOM_NAMES[href];
    if (!roomName) continue; // 名前の無いページ（下書きなど）は出さない
    const kind = '閲覧室';
    const name = roomName.replace(/^閲覧室\s+/, '');
    const desc = roomByPath.get(href)?.description || descFromPage(href);
    // 計算にだけ使う人口などは、名前に「の計算に使用」が付いているので外す
    // 人口あたりに直すために読んでいる「総人口」も、人口の窓口以外では出さない
    const labels = p.labels.filter((l) => !/計算に使用/.test(l) && !(l === '総人口' && !/人口|国勢/.test(name)));
    entries.push({ href, kind, no: null, name, desc, labels, scopes: [...p.scopes] });
  }
  entries.sort((a, b) => (a.no ?? 0) - (b.no ?? 0));
  return entries;
}
