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

const url = `${BASE}?appId=${APP_ID}&lang=J&statsCode=00200533&searchWord=行動者率&limit=200`;

console.log('社会生活基本調査から「行動者率」の表を探索中…\n');
const res = await fetch(url);
const json = await res.json();
const root = json.GET_STATS_LIST;
if (!root || root.RESULT.STATUS !== 0) {
  console.log('取得失敗:', root?.RESULT?.ERROR_MSG);
  process.exit(1);
}

const tables = asArray(root.DATALIST_INF?.TABLE_INF);
console.log(`ヒット ${tables.length} 件\n`);

for (const t of tables) {
  const title = t.TITLE?.$ ?? t.TITLE ?? '';
  console.log(`statsDataId=${t['@id']}`);
  console.log(`  表番号: ${t.STAT_NAME?.$ ?? ''} / ${t.TITLE_SPEC?.TABLE_NAME ?? ''}`);
  console.log(`  タイトル: ${title}`);
  console.log(`  分類: ${t.TITLE_SPEC?.TABLE_CATEGORY ?? ''} ${t.TITLE_SPEC?.TABLE_SUB_CATEGORY1 ?? ''}`);
  console.log(`  調査年: ${t.SURVEY_DATE ?? ''}  件数: ${t.OVERALL_TOTAL_NUMBER ?? ''}`);
  console.log('');
}
console.log('完了。都道府県別で行動者率が取れそうな表IDを教えてください。');
