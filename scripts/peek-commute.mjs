import fs from 'node:fs';
for (const line of fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g, '');
}
const url = `https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData?appId=${process.env.ESTAT_APP_ID}&lang=J&statsDataId=0003457337&metaGetFlg=Y&cntGetFlg=N`;
const sd = (await (await fetch(url)).json()).GET_STATS_DATA.STATISTICAL_DATA;
const out = [];
const axes = sd.CLASS_INF.CLASS_OBJ.map((o) => ({ id: o['@id'], name: o['@name'], cls: [].concat(o.CLASS) }));
for (const a of axes) out.push(`軸 ${a.id} ${a.name}：${a.cls.length}件 例=${a.cls.slice(0, 6).map((c) => c['@code'] + ':' + c['@name']).join(' / ')}`);
const kAxis = axes.find((a) => a.cls.some((c) => c['@name'].includes('睡眠')));
const hits = kAxis.cls.filter((c) => /通勤|睡眠|家事|趣味|学習/.test(c['@name']));
out.push('', '行動の名前（通勤・睡眠・家事・趣味・学習を含むもの）：', ...hits.map((c) => `  ${c['@code']} ${c['@name']}`));
const vals = [].concat(sd.DATA_INF.VALUE);
const areaName = Object.fromEntries(axes.find((a) => a.id === 'area').cls.map((c) => [c['@code'], c['@name']]));
for (const h of hits.filter((c) => c['@name'].includes('通勤'))) {
  const rows = vals.filter((v) => v['@' + kAxis.id] === h['@code'] && ['東京都', '山形県', '全国'].includes(areaName[v['@area']]));
  out.push('', `「${h['@name']}」の値（東京都・山形県・全国、ほかの軸の組み合わせごと）：`);
  for (const v of rows.slice(0, 40)) out.push('  ' + Object.entries(v).filter(([k]) => k.startsWith('@')).map(([k, x]) => `${k}=${x}`).join(' ') + ' 値=' + v['$']);
}
fs.mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('./out/peek-commute.txt', import.meta.url), out.join('\n'));
console.log('scripts/out/peek-commute.txt に書き出しました');
