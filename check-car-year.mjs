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
const BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json';
const asArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);

async function get(path, params) {
  const qs = new URLSearchParams({ appId: APP_ID, lang: 'J', ...params });
  const res = await fetch(`${BASE}/${path}?${qs.toString()}`);
  return await res.json();
}

const TARGETS = [
  { label: '社会生活統計指標 #L03607（二人以上世帯・千世帯当たり）', statsId: '0000010212', code: '#L03607' },
  { label: '基礎データ L5108（耐久消費財所有数量・自動車）',         statsId: '0000010112', code: 'L5108'   },
];

for (const t of TARGETS) {
  console.log(`\n==== ${t.label} ====`);
  const meta = await get('getMetaInfo', { statsDataId: t.statsId });
  const root = meta.GET_META_INFO;
  if (!root || root.RESULT.STATUS !== 0) { console.log('  メタ取得失敗'); continue; }
  const timeObj = asArray(root.METADATA_INF.CLASS_INF.CLASS_OBJ).find((o) => o['@id'] === 'time');
  const times = asArray(timeObj.CLASS)
    .map((c) => ({ code: c['@code'], name: c['@name'] }))
    .sort((a, b) => b.code.localeCompare(a.code))
    .slice(0, 20);
  const data = await get('getStatsData', {
    statsDataId: t.statsId, cdCat01: t.code,
    cdTime: times.map((x) => x.code).join(','),
    cntGetFlg: 'N', annotationGetFlg: 'N', explanationGetFlg: 'N', replaceSpChars: '0',
  });
  const sroot = data.GET_STATS_DATA;
  if (!sroot || sroot.RESULT.STATUS !== 0) {
    console.log(`  データ取得失敗: ${sroot?.RESULT?.ERROR_MSG || '不明'}`);
    continue;
  }
  const values = asArray(sroot.STATISTICAL_DATA.DATA_INF.VALUE);
  const byTime = {};
  for (const v of values) {
    const bad = ['', '-', '***', 'X', null, undefined].includes(v['$']);
    const isPref = /^(0[1-9]|[1-4][0-9])000$/.test(v['@area']);
    if (!isPref || bad) continue;
    byTime[v['@time']] = (byTime[v['@time']] || 0) + 1;
  }
  const nameByCode = Object.fromEntries(times.map((x) => [x.code, x.name]));
  const years = Object.keys(byTime).sort().reverse();
  if (years.length === 0) { console.log('  値なし'); continue; }
  for (const y of years) {
    console.log(`  ${nameByCode[y] || y}  … 都道府県 ${byTime[y]}/47 件`);
  }
}
console.log('\n完了。いちばん上（最新）で47/47件そろっている年を教えてください。');
