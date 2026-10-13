// 昼夜間人口比率（A6108）と、昼間人口・夜間人口の元の数を年ごとに出して、国の公表値（令和2年 東京都119.2）とくらべる
import fs from 'node:fs';
for (const line of fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g, '');
}
const appId = process.env.ESTAT_APP_ID;
const qs = new URLSearchParams({ appId, lang: 'J', statsDataId: '0000010101', cdCat01: 'A6108,A6107,A1101,A6106,A6105', cdArea: '13000,11000,27000', metaGetFlg: 'Y', cntGetFlg: 'N' });
const j = await (await fetch('https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData?' + qs)).json();
const sd = j.GET_STATS_DATA.STATISTICAL_DATA;
const cls = [].concat(sd.CLASS_INF.CLASS_OBJ);
const nameOf = (id, code) => [].concat(cls.find((o) => o['@id'] === id).CLASS).find((c) => c['@code'] === code)?.['@name'];
const rows = [].concat(sd.DATA_INF.VALUE).filter((v) => v['@time'] >= '2000');
rows.sort((a, b) => (a['@area'] + a['@cat01'] + a['@time']).localeCompare(b['@area'] + b['@cat01'] + b['@time']));
for (const v of rows) console.log(nameOf('area', v['@area']), nameOf('cat01', v['@cat01']), v['@time'].slice(0, 4), v['$']);
