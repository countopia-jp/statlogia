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
  ['A 人口・世帯', '01'], ['D 行政基盤', '04'], ['E 教育', '05'], ['H 居住', '08'],
  ['M 生活時間', '13'],
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
{
  const m = await meta('0000010213');
  out.push(`\n===== M 生活時間（指標の表）  都道府県 0000010213：${m?.cat.length ?? '取得失敗'}件（表の時点 ${m?.times[0]}〜${m?.times.at(-1)}） =====`);
  for (const c of m?.cat || []) out.push(`　 ${c['@code']}\t${c['@name']}\t${c['@unit'] || ''}`);
  console.log('M 生活時間（指標の表） 済');
}
{
  // 展示の素材：社会生活基本調査の行動者率（都道府県）と、家計調査の品目
  const qs = new URLSearchParams({ appId, lang: 'J', searchWord: '種類別行動者率 都道府県', surveyYears: '2021' });
  const res = await fetch(`${BASE}/getStatsList?${qs.toString()}`);
  const list = asArray((await res.json()).GET_STATS_LIST?.DATALIST_INF?.TABLE_INF);
  out.push(`\n===== 展示の素材：社会生活基本調査（2021）の「種類別行動者率」の表 ${list.length}件 =====`);
  for (const t of list) {
    const title = typeof t.TITLE === 'object' ? t.TITLE['$'] : t.TITLE;
    if (!/都道府県/.test(title)) continue;
    const objs = await (async () => {
      const q2 = new URLSearchParams({ appId, lang: 'J', statsDataId: t['@id'] });
      const r2 = await fetch(`${BASE}/getMetaInfo?${q2.toString()}`);
      return asArray((await r2.json()).GET_META_INFO?.METADATA_INF?.CLASS_INF?.CLASS_OBJ);
    })();
    const kinds = objs.filter((o) => /cat/.test(o['@id'])).map((o) => `${o['@id']}=${o['@name']}(${asArray(o.CLASS).length})`).join(' ');
    out.push(`表 ${t['@id']}\t${title}\t${kinds}`);
    const act = objs.find((o) => /種類/.test(o['@name']));
    for (const c of asArray(act?.CLASS)) out.push(`　　${c['@code']}\t${c['@name']}`);
  }
  console.log('社会生活基本調査 済');
  const k = await meta('0004023605');
  out.push(`\n===== 展示の素材：家計調査 品目分類 0004023605：${k?.cat.length ?? '取得失敗'}品目 =====`);
  for (const c of k?.cat || []) out.push(`　 ${c['@code']}\t${c['@name']}\t${c['@unit'] || ''}`);
  console.log('家計調査 済');
}
fs.mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('./out/room-codes-2.txt', import.meta.url), out.join('\n'));
console.log('scripts/out/room-codes-2.txt に書き出しました（◎＝市区町村版にもある）');
