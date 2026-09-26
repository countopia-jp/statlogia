import { readFileSync } from 'node:fs';

function loadAppId() {
  if (process.env.ESTAT_APP_ID) return process.env.ESTAT_APP_ID;
  const env = readFileSync(new URL('./.env', import.meta.url), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^\s*ESTAT_APP_ID\s*=\s*(.+?)\s*$/);
    if (m) return m[1].replace(/^["']|["']$/g, '');
  }
  throw new Error('ESTAT_APP_ID が見つかりません');
}
const APP_ID = loadAppId();
const BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData';
const asArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);

const TARGETS = [
  { id: '0003456409', cat: '11', name: '柔道' },
  { id: '0003456409', cat: '12', name: '剣道' },
];

for (const t of TARGETS) {
  const url = `${BASE}?appId=${APP_ID}&lang=J&statsDataId=${t.id}`
    + `&cdTab=202110A09B08&cdCat01=0&cdCat02=99000&cdCat03=${t.cat}&metaGetFlg=N&cntGetFlg=N`;
  const res = await fetch(url);
  const json = await res.json();
  const root = json.GET_STATS_DATA;
  if (root.RESULT.STATUS !== 0) { console.log(`■ ${t.name} 失敗: ${root.RESULT.ERROR_MSG}\n`); continue; }
  const values = asArray(root.STATISTICAL_DATA?.DATA_INF?.VALUE);
  const rows = values.map(v => ({ area: v['@area'], val: parseFloat(v.$) }))
                     .filter(r => !Number.isNaN(r.val));
  const national = rows.find(r => r.area === '00000');
  const prefs = rows.filter(r => r.area !== '00000').sort((a, b) => b.val - a.val);
  console.log(`■ ${t.name}  (${values.length}件取得)  全国=${national?.val ?? '-'}%`);
  console.log('  上位7: ' + prefs.slice(0, 7).map(r => `${r.area}:${r.val}`).join('  '));
  console.log('  下位5: ' + prefs.slice(-5).map(r => `${r.area}:${r.val}`).join('  '));
  console.log('');
}
