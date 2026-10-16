import fs from 'node:fs';
for (const line of fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g, '');
}
const { getActivityPair } = await import('../src/lib/activity-pair.js');
const { getKakeiPair } = await import('../src/lib/kakei-pair.js');
const jobs = [
  ['51 ヨガとトレーニング', () => getActivityPair('21', '22', '0003456409')],
  ['52 テニスとバレーボール', () => getActivityPair('07', '03', '0003456409')],
  ['53 写真と料理・菓子作り', () => getActivityPair('25', '20')],
  ['54 邦楽とコーラス', () => getActivityPair('10', '11')],
  ['55 焼酎とワイン', () => getKakeiPair('011100020', '011100050')],
  ['56 牛乳とヨーグルト', () => getKakeiPair('010410001', '010420020')],
  ['57 すしとハンバーガー', () => getKakeiPair('011211040', '011211090')],
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
console.log('  趣味 25:', hobby['25'], ' 20:', hobby['20'], ' 10:', hobby['10'], ' 11:', hobby['11']);
console.log('  スポーツ 21:', sport['21'], ' 22:', sport['22'], ' 07:', sport['07'], ' 03:', sport['03']);
for (const c of ['011100020', '011100050', '010410001', '010420020', '011211040', '011211090']) console.log('  家計', c, kakei[c]);
