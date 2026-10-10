import fs from 'node:fs';

for (const line of fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g, '');
}
const appId = process.env.ESTAT_APP_ID;
if (!appId) throw new Error('ESTAT_APP_ID が読めていません');

const BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json';
const asArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);

const SYSTEMS = [
  ['B 自然環境', '02'], ['C 経済基盤', '03'], ['F 労働', '06'], ['G 文化・スポーツ', '07'],
  ['I 健康・医療', '09'], ['J 福祉・社会保障', '10'], ['K 安全', '11'], ['L 家計', '12'],
];

async function meta(id) {
  const qs = new URLSearchParams({ appId, lang: 'J', statsDataId: id });
  const res = await fetch(`${BASE}/getMetaInfo?${qs.toString()}`);
  const root = (await res.json()).GET_META_INFO;
  if (!root || root.RESULT.STATUS !== 0) return null;
  const objs = asArray(root.METADATA_INF.CLASS_INF.CLASS_OBJ);
  const cat = asArray(objs.find((o) => o['@id'] === 'cat01')?.CLASS);
  const times = asArray(objs.find((o) => o['@id'] === 'time')?.CLASS).map((t) => t['@code'].slice(0, 4)).sort();
  return { cat, times };
}

const out = [];
for (const [label, s] of SYSTEMS) {
  const pref = await meta(`00000101${s}`);
  const muni = await meta(`00000201${s}`);
  const muniCodes = new Set((muni?.cat || []).map((c) => c['@code']));
  out.push(`\n===== ${label}  都道府県 00000101${s}：${pref?.cat.length ?? '取得失敗'}件（表の時点 ${pref?.times[0]}〜${pref?.times.at(-1)}）／市区町村 00000201${s}：${muni?.cat.length ?? '取得失敗'}件（${muni?.times[0]}〜${muni?.times.at(-1)}） =====`);
  for (const c of pref?.cat || []) out.push(`${muniCodes.has(c['@code']) ? '◎' : '　'} ${c['@code']}\t${c['@name']}\t${c['@unit'] || ''}`);
  const prefCodes = new Set((pref?.cat || []).map((c) => c['@code']));
  for (const c of muni?.cat || []) if (!prefCodes.has(c['@code'])) out.push(`町だけ ${c['@code']}\t${c['@name']}\t${c['@unit'] || ''}`);
  console.log(`${label} 済`);
}
fs.mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('./out/room-codes.txt', import.meta.url), out.join('\n'));
console.log('scripts/out/room-codes.txt に書き出しました（◎＝市区町村版にもある）');
