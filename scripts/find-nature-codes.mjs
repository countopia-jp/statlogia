import fs from 'node:fs';

for (const line of fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g, '');
}
const appId = process.env.ESTAT_APP_ID;
if (!appId) throw new Error('ESTAT_APP_ID が読めていません');

const BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json';
const asArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);

const TABLES = [
  ['市区町村・自然環境', '0000020102'],
  ['都道府県・自然環境', '0000010102'],
];

const seen = {};

for (const [label, id] of TABLES) {
  const qs = new URLSearchParams({ appId, lang: 'J', statsDataId: id });
  const res = await fetch(`${BASE}/getMetaInfo?${qs.toString()}`);
  const root = (await res.json()).GET_META_INFO;
  if (!root || root.RESULT.STATUS !== 0) {
    throw new Error(`${label} 失敗: ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  const obj = asArray(root.METADATA_INF.CLASS_INF.CLASS_OBJ).find((o) => o['@id'] === 'cat01');
  const list = asArray(obj?.CLASS);
  seen[id] = new Map(list.map((c) => [c['@code'], c['@name']]));
  console.log(`\n===== ${label}（${id}） cat01：${list.length}件 =====`);
  for (const c of list) console.log(`${c['@code']}\t${c['@name']}`);
}

const both = [...seen['0000020102'].keys()].filter((c) => seen['0000010102'].has(c));
console.log(`\n===== 市区町村・都道府県の両方にあるコード：${both.length}件 =====`);
for (const c of both) console.log(`${c}\t${seen['0000020102'].get(c)}`);
