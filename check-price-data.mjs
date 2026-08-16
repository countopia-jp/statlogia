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

const CODES = ['C5201', 'C5301', 'C5601', 'C5701', 'C5703'];

for (const code of CODES) {
  const url = `${BASE}?appId=${APP_ID}&lang=J&statsDataId=0000010103`
    + `&cdCat01=${code}&metaGetFlg=Y&cntGetFlg=N`;
  const res = await fetch(url);
  const json = await res.json();
  const root = json.GET_STATS_DATA;
  if (!root || root.RESULT.STATUS !== 0) { console.log(`■ ${code} 失敗: ${root?.RESULT?.ERROR_MSG}\n`); continue; }
  const sd = root.STATISTICAL_DATA;

  const areaObj = asArray(sd.CLASS_INF.CLASS_OBJ).find(o => o['@id'] === 'area');
  const names = {};
  for (const c of asArray(areaObj?.CLASS)) names[c['@code']] = (c['@name']||'').trim();
  const timeObj = asArray(sd.CLASS_INF.CLASS_OBJ).find(o => o['@id'] === 'time');
  const timeNames = {};
  for (const c of asArray(timeObj?.CLASS)) timeNames[c['@code']] = (c['@name']||'').trim();

  const vals = asArray(sd.DATA_INF.VALUE)
    .filter(v => v.$ !== undefined && v.$ !== '-' && v.$ !== '***');
  if (vals.length === 0) { console.log(`■ ${code} データなし\n`); continue; }

  const latest = vals.map(v => v['@time']).sort().pop();
  const rows = vals.filter(v => v['@time'] === latest)
    .map(v => ({ n: names[v['@area']] || v['@area'], val: Number(v.$) }))
    .filter(r => r.n && r.n !== '全国' && Number.isFinite(r.val))
    .sort((a,b) => b.val - a.val);

  console.log(`■ ${code}  最新=${timeNames[latest] || latest}  件数=${rows.length}`);
  console.log('  高い順: ' + rows.slice(0,3).map(r=>`${r.n} ${r.val}`).join(' / '));
  console.log('  低い順: ' + rows.slice(-3).reverse().map(r=>`${r.n} ${r.val}`).join(' / '));
  console.log('');
}
console.log('完了。');
