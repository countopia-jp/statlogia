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

const FAMILIES = [
  { name: '市区町村・基礎データ',       needsHash: false, prefix: '00000201' },
  { name: '市区町村・社会生活統計指標', needsHash: true,  prefix: '00000202' },
];
const KEYWORD = /財政力|歳入|歳出|地方税|教育費|民生費|土木費|地方債|決算|投資的経費|扶助費|人件費|基準財政|学校費|社会教育費/;

async function scan(statsDataId) {
  const url = `${BASE}?appId=${APP_ID}&lang=J&statsDataId=${statsDataId}`;
  let json;
  try { json = await (await fetch(url)).json(); } catch { return { ok: false }; }
  const root = json.GET_META_INFO;
  if (!root || root.RESULT.STATUS !== 0) return { ok: false };
  const objs = asArray(root.METADATA_INF?.CLASS_INF?.CLASS_OBJ);
  const hits = [];
  for (const obj of objs) for (const c of asArray(obj.CLASS)) {
    const nm = (c['@name'] || '').trim();
    if (KEYWORD.test(nm)) hits.push({ code: c['@code'], name: nm, unit: c['@unit'] || '' });
  }
  return { ok: true, hits };
}

console.log('市区町村データ・財政/教育費系の項目を探索中…\n');
for (const fam of FAMILIES) {
  for (let i = 1; i <= 13; i++) {
    const id = fam.prefix + String(i).padStart(2, '0');
    const r = await scan(id);
    if (!r.ok || r.hits.length === 0) continue;
    console.log(`■ ${fam.name}  statsDataId=${id}  ${fam.needsHash ? '（# 必要）' : '（# 不要）'}`);
    for (const h of r.hits) {
      const shownCode = fam.needsHash ? `#${h.code}` : h.code;
      console.log(`    code=${shownCode}  ${h.name}${h.unit ? `  [単位:${h.unit}]` : ''}`);
    }
    console.log('');
  }
}
console.log('完了。出たコードを教えてください。');
