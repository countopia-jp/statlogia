// scripts/check-rate-data.mjs
import fs from 'node:fs';

for (const line of fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g, '');
}
const appId = process.env.ESTAT_APP_ID;
if (!appId) throw new Error('ESTAT_APP_ID が読めていません');

const BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json';
const asArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);

// [表ID, cat03, ラベル]
const TARGETS = [
  ['0003456409', '17', '登山・ハイキング'],
  ['0003456573', '27', '趣味としての読書'],
  ['0003456573', '28', 'マンガを読む'],
];

for (const [id, cat03, label] of TARGETS) {
  const qs = new URLSearchParams({
    appId, lang: 'J',
    statsDataId: id,
    cdTab: '202110A09B08',
    cdCat01: '0',
    cdCat02: '99000',
    cdCat03: cat03,
    metaGetFlg: 'Y', cntGetFlg: 'N',
    annotationGetFlg: 'N', explanationGetFlg: 'N', replaceSpChars: '0',
  });
  const res = await fetch(`${BASE}/getStatsData?${qs.toString()}`);
  const root = (await res.json()).GET_STATS_DATA;
  if (!root || root.RESULT.STATUS !== 0) {
    throw new Error(`${label} 失敗: ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  const sd = root.STATISTICAL_DATA;
  const names = {};
  for (const c of asArray(asArray(sd.CLASS_INF.CLASS_OBJ).find((o) => o['@id'] === 'area')?.CLASS)) {
    names[c['@code']] = (c['@name'] || '').trim();
  }
  const NG = ['', '-', '***', 'X', undefined, null];
  let national = null;
  const rows = [];
  for (const v of asArray(sd.DATA_INF.VALUE)) {
    if (NG.includes(v['$'])) continue;
    const n = names[v['@area']] || '';
    const num = Number(String(v['$']).replace(/,/g, ''));
    if (!Number.isFinite(num)) continue;
    if (n === '全国') { national = num; continue; }
    if (n) rows.push({ n, v: num });
  }
  rows.sort((a, b) => b.v - a.v);
  console.log(`\n===== ${label}（cat03=${cat03}） 全国 ${national} =====`);
  rows.forEach((r, i) => console.log(`${String(i + 1).padStart(2)}\t${r.n}\t${r.v}`));
}