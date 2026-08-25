// 0004023605 の最新年でぎょうざを検算する（読み取り専用）
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
const GYOZA = '010920070';
const KUBUN = '03';   // 二人以上の世帯（2000年～）

const meta = await get(`getMetaInfo?statsDataId=${ID}`);
const objs = asArray(meta.GET_META_INFO?.METADATA_INF?.CLASS_INF?.CLASS_OBJ);
const axis = (id) => objs.find((o) => o['@id'] === id);
const times = asArray(axis('time')?.CLASS);
const areas = asArray(axis('area')?.CLASS);
const nameOf = Object.fromEntries(areas.map((a) => [a['@code'], a['@name']]));

// 新しい順に並べ替えて、データが入っている年を探す
const sorted = [...times].sort((a, b) => Number(b['@code']) - Number(a['@code']));
console.log('■ 最新5年:', sorted.slice(0, 5).map((t) => t['@name']).join(' / '));

for (const t of sorted.slice(0, 4)) {
  const j = await get(
    `getStatsData?statsDataId=${ID}&cdCat01=${GYOZA}&cdCat02=${KUBUN}&cdTime=${t['@code']}`
  );
  const vals = asArray(j.GET_STATS_DATA?.STATISTICAL_DATA?.DATA_INF?.VALUE);
  console.log(`\n===== ${t['@name']}（${vals.length}件） =====`);
  if (!vals.length) { console.log('   データなし。前の年へ'); continue; }

  console.log('   単位:', vals[0]['@unit'] ?? '(なし)');
  const rows = vals
    .map((v) => ({ n: nameOf[v['@area']] ?? v['@area'], v: Number(v.$) }))
    .filter((r) => Number.isFinite(r.v));
  const zenkoku = rows.find((r) => r.n.includes('全国'));
  const cities = rows.filter((r) => !r.n.includes('全国')).sort((a, b) => b.v - a.v);

  console.log(`   全国: ${zenkoku ? zenkoku.v : '—'}`);
  console.log(`   都市: ${cities.length}件`);
  console.log('   上位10:');
  cities.slice(0, 10).forEach((r, i) => console.log(`     ${i + 1}. ${r.n}  ${r.v}`));
  console.log('   下位5:');
  cities.slice(-5).forEach((r) => console.log(`     ${r.n}  ${r.v}`));
  break;   // データが取れた年で止める
}

console.log('\n完了。');