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
const BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json/getMetaInfo';
const asArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);

const IDS = ['0003456408', '0003456409', '0003456572', '0003456573'];

for (const id of IDS) {
  const url = `${BASE}?appId=${APP_ID}&lang=J&statsDataId=${id}`;
  const res = await fetch(url);
  const json = await res.json();
  const root = json.GET_META_INFO;
  if (!root || root.RESULT.STATUS !== 0) { console.log(`■ ${id} 取得失敗\n`); continue; }
  console.log(`■ statsDataId=${id}`);
  console.log(`  ${root.METADATA_INF?.TABLE_INF?.TITLE?.$ ?? ''}`);
  for (const obj of asArray(root.METADATA_INF?.CLASS_INF?.CLASS_OBJ)) {
    const cls = asArray(obj.CLASS);
    console.log(`  [${obj['@id']}] ${obj['@name']}  (${cls.length}件)`);
    if (cls.length <= 60) {
      for (const c of cls) console.log(`      ${c['@code']}  ${c['@name']}`);
    } else {
      for (const c of cls.slice(0, 10)) console.log(`      ${c['@code']}  ${c['@name']}`);
      console.log(`      … 他 ${cls.length - 10} 件`);
    }
  }
  console.log('');
}
