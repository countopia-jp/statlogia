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
const BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json/getStatsList';
const asArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);

let pos = 1;
let total = 0;
for (let page = 0; page < 40; page++) {
  const url = `${BASE}?appId=${APP_ID}&lang=J&statsCode=00200533&surveyYears=2021&limit=500&startPosition=${pos}`;
  const res = await fetch(url);
  const json = await res.json();
  const root = json.GET_STATS_LIST;
  if (!root || root.RESULT.STATUS !== 0) break;
  const tables = asArray(root.DATALIST_INF?.TABLE_INF);
  if (tables.length === 0) break;
  for (const t of tables) {
    const title = t.TITLE?.$ ?? t.TITLE ?? '';
    console.log(`${t['@id']}  ${title}`);
  }
  total += tables.length;
  const next = root.DATALIST_INF?.RESULT_INF?.NEXT_KEY;
  if (!next) break;
  pos = next;
}
console.error(`取得 ${total} 件`);
