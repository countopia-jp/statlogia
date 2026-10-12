import fs from 'node:fs';
const env = fs.readFileSync('.env', 'utf8');
const APP_ID = (env.match(/^ESTAT_APP_ID\s*=\s*(.+)$/m) || [])[1]?.trim();
const API = 'https://api.e-stat.go.jp/rest/3.0/app/json';
const asArray = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
async function get(p) {
  const r = await fetch(`${API}/${p}&appId=${APP_ID}&lang=J`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
const ID = '0004023605';
const KUBUN = '03';
const WORDS = ['生鮮肉', '牛肉', '豚肉', '鶏肉', '生鮮魚介', 'まぐろ', 'さけ', 'ぶり', 'かつお', '米', 'パン', 'めん', '生鮮野菜', '生鮮果物', '菓子', 'コーヒー', '緑茶', '酒類', 'ビール', '外食'];
const meta = await get(`getMetaInfo?statsDataId=${ID}`);
const objs = asArray(meta.GET_META_INFO?.METADATA_INF?.CLASS_INF?.CLASS_OBJ);
const axis = (id) => objs.find((o) => o['@id'] === id);
const items = asArray(axis('cat01')?.CLASS);
const times = asArray(axis('time')?.CLASS).sort((a, b) => Number(b['@code']) - Number(a['@code']));
const areas = asArray(axis('area')?.CLASS);
const nameOf = Object.fromEntries(areas.map((a) => [a['@code'], a['@name']]));
console.log('■ 最新3年:', times.slice(0, 3).map((t) => `${t['@code']}=${t['@name']}`).join(' / '));
console.log('■ 品目（名前に含む語で抜き出し）');
const hits = items.filter((c) => WORDS.some((w) => c['@name'].includes(w)));
hits.forEach((c) => console.log(`  ${c['@code']}\t${c['@name']}\t${c['@unit'] ?? ''}`));
const pick = (word) => hits.find((c) => c['@name'].replace(/^[0-9.\s]+/, '').startsWith(word));
for (const word of ['牛肉', '豚肉', '鶏肉', '生鮮魚介']) {
  const c = pick(word);
  if (!c) { console.log(`\n${word}：見つからず`); continue; }
  for (const t of times.slice(0, 3)) {
    const j = await get(`getStatsData?statsDataId=${ID}&cdCat01=${c['@code']}&cdCat02=${KUBUN}&cdTime=${t['@code']}`);
    const vals = asArray(j.GET_STATS_DATA?.STATISTICAL_DATA?.DATA_INF?.VALUE);
    if (!vals.length) continue;
    const rows = vals.map((v) => ({ n: nameOf[v['@area']] ?? v['@area'], v: Number(v.$) })).filter((r) => Number.isFinite(r.v));
    const nat = rows.find((r) => r.n.includes('全国'));
    const cities = rows.filter((r) => !r.n.includes('全国')).sort((a, b) => b.v - a.v);
    console.log(`\n===== ${word}（${c['@code']} ${c['@name']}）${t['@name']} 都市${cities.length} 全国=${nat?.v}`);
    console.log('  上位5:', cities.slice(0, 5).map((r) => `${r.n}:${r.v}`).join(' '));
    console.log('  下位5:', cities.slice(-5).map((r) => `${r.n}:${r.v}`).join(' '));
    break;
  }
}
console.log('\n完了。');
