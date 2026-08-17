// =====================================================
// Countopia Stats - 展示13〜16 の下ごしらえ
// scripts/find-codes-13-16.mjs
//
//   1) 社会生活基本調査 2021 の cat03 全コードを表示
//        スポーツ24種    : 0003456409
//        趣味・娯楽36種  : 0003456573
//   2) 消費者物価地域差指数 C5705(光熱・水道) / C5710(教育) の
//      最新年47都道府県を降順で表示（statsDataId: 0000010103）
//
//   実行: node scripts/find-codes-13-16.mjs
// =====================================================

import fs from 'node:fs';

// .env の簡易パース（dotenv 未導入のため）
for (const line of fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g, '');
}
const appId = process.env.ESTAT_APP_ID;
if (!appId) throw new Error('ESTAT_APP_ID が読めていません（.env の場所とキー名を確認）');

const BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json';
const asArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);

async function get(path, params) {
  const qs = new URLSearchParams({ appId, lang: 'J', ...params });
  const res = await fetch(`${BASE}/${path}?${qs.toString()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${path}`);
  return await res.json();
}

// ── 1) 行動者率の cat03 一覧 ───────────────────────
const TABLES = [
  ['スポーツ24種', '0003456409'],
  ['趣味・娯楽36種', '0003456573'],
];

for (const [label, id] of TABLES) {
  const json = await get('getMetaInfo', { statsDataId: id });
  const root = json.GET_META_INFO;
  if (!root || root.RESULT.STATUS !== 0) {
    throw new Error(`getMetaInfo失敗(${id}): ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  const obj = asArray(root.METADATA_INF.CLASS_INF.CLASS_OBJ).find((o) => o['@id'] === 'cat03');
  console.log(`\n===== ${label}（${id}） cat03 =====`);
  for (const c of asArray(obj?.CLASS)) {
    console.log(`${c['@code']}\t${c['@name']}`);
  }
}

// ── 2) 物価 C5705 / C5710 の実データ ────────────────
const CODES = [
  ['C5705', '光熱・水道'],
  ['C5710', '教育'],
];

const json = await get('getStatsData', {
  statsDataId: '0000010103',
  cdCat01: CODES.map(([c]) => c).join(','),
  metaGetFlg: 'Y',
  cntGetFlg: 'N',
  annotationGetFlg: 'N',
  explanationGetFlg: 'N',
  replaceSpChars: '0',
});
const root = json.GET_STATS_DATA;
if (!root || root.RESULT.STATUS !== 0) {
  throw new Error(`getStatsData失敗: ${root?.RESULT?.ERROR_MSG || '不明'}`);
}
const sd = root.STATISTICAL_DATA;
const classObjs = asArray(sd.CLASS_INF.CLASS_OBJ);

const areaNames = {};
for (const c of asArray(classObjs.find((o) => o['@id'] === 'area')?.CLASS)) {
  areaNames[c['@code']] = (c['@name'] || '').trim();
}
const timeNames = {};
for (const c of asArray(classObjs.find((o) => o['@id'] === 'time')?.CLASS)) {
  timeNames[c['@code']] = (c['@name'] || '').trim();
}

const NG = ['', '-', '***', 'X', undefined, null];

for (const [code, label] of CODES) {
  const vals = asArray(sd.DATA_INF.VALUE).filter(
    (v) => v['@cat01'] === code && !NG.includes(v['$'])
  );
  if (vals.length === 0) {
    console.log(`\n===== ${code} ${label} → データなし =====`);
    continue;
  }
  const latest = vals.map((v) => v['@time']).sort().pop();
  const rows = vals
    .filter((v) => v['@time'] === latest)
    .map((v) => ({ n: areaNames[v['@area']] || '', v: Number(v['$']) }))
    .filter((r) => r.n && r.n !== '全国' && Number.isFinite(r.v))
    .sort((a, b) => b.v - a.v);

  console.log(`\n===== ${code} ${label} ${timeNames[latest] || latest}（${rows.length}件） =====`);
  rows.forEach((r, i) => console.log(`${String(i + 1).padStart(2)}\t${r.n}\t${r.v}`));
}