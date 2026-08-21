import fs from 'node:fs';

for (const line of fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g, '');
}
const appId = process.env.ESTAT_APP_ID;
if (!appId) throw new Error('ESTAT_APP_ID が読めていません');

const BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json';
const asArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);

// 社会・人口統計体系（statsCode=00200502）の表を全部出す
let start = 1;
const rows = [];
while (true) {
  const qs = new URLSearchParams({
    appId, lang: 'J', statsCode: '00200502', limit: '500', startPosition: String(start),
  });
  const res = await fetch(`${BASE}/getStatsList?${qs.toString()}`);
  const root = (await res.json()).GET_STATS_LIST;
  if (root.RESULT.STATUS !== 0) throw new Error(root.RESULT.ERROR_MSG);
  const list = asArray(root.DATALIST_INF.TABLE_INF);
  for (const t of list) {
    const title = typeof t.TITLE === 'object' ? t.TITLE.$ : t.TITLE;
    rows.push({
      id: t['@id'],
      title: (title || '').trim(),
      stat: t.STAT_NAME?.$ || '',
      updated: t.UPDATED_DATE || '',
    });
  }
  const next = root.DATALIST_INF.RESULT_INF?.NEXT_KEY;
  if (!next) break;
  start = Number(next);
}

console.log(`===== 社会・人口統計体系の表：${rows.length}件 =====\n`);
for (const r of rows.sort((a, b) => a.id.localeCompare(b.id))) {
  console.log(`${r.id}\t${r.title}`);
}
