import fs from 'node:fs';
for (const line of fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g, '');
}
const { getActivityPair } = await import('../src/lib/activity-pair.js');
const { getKakeiPair } = await import('../src/lib/kakei-pair.js');
const jobs = [
  ['58 家で見る映画と音楽', () => getActivityPair('05', '08')],
  ['59 バスケットボールとソフトボール', () => getActivityPair('04', '02', '0003456409')],
  ['60 俳句・小説と和裁・洋裁', () => getActivityPair('26', '18')],
  ['61 鶏肉と卵', () => getKakeiPair('010310030', '010430001')],
];
for (const [name, get] of jobs) {
  try {
    const d = await get();
    const show = (o) => JSON.stringify(Object.fromEntries(Object.entries(o || {}).filter(([k, v]) => typeof v !== 'object'))).slice(0, 400);
    console.log(`\n== ${name}`);
    console.log('  ', show(d));
    console.log('   上位', (d.rows || []).slice(0, 5).map((r) => `${r.n || r.name}:${r.minutes ?? r.value ?? r.v}`).join(' '));
    console.log('   2つ目', show(d.second), (d.second?.rows || []).slice(0, 5).map((r) => `${r.n || r.name}:${r.minutes ?? r.value ?? r.v}`).join(' '));
  } catch (e) { console.log(`\n== ${name}  失敗: ${e.message}`); }
}

const app = process.env.ESTAT_APP_ID;
const meta = async (id, objId) => {
  const j = await (await fetch(`https://api.e-stat.go.jp/rest/3.0/app/json/getMetaInfo?appId=${app}&statsDataId=${id}`)).json();
  const objs = [].concat(j.GET_META_INFO.METADATA_INF.CLASS_INF.CLASS_OBJ);
  return Object.fromEntries([].concat(objs.find((o) => o['@id'] === objId).CLASS).map((c) => [c['@code'], c['@name']]));
};
const hobby = await meta('0003456573', 'cat03'), sport = await meta('0003456409', 'cat03'), kakei = await meta('0004023605', 'cat01');
console.log('\n== 項目名の確認');
console.log('  趣味 05:', hobby['05'], ' 08:', hobby['08'], ' 26:', hobby['26'], ' 18:', hobby['18']);
console.log('  スポーツ 04:', sport['04'], ' 02:', sport['02']);
for (const c of ['010310030', '010430001']) console.log('  家計', c, kakei[c]);
