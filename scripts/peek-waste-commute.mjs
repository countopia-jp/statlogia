import fs from 'node:fs';

for (const line of fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g, '');
}
const appId = process.env.ESTAT_APP_ID;
const BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json';
const asArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);

async function fetchStats({ statsDataId, cdCat01, cdArea }) {
  const qs = new URLSearchParams({
    appId, lang: 'J', statsDataId, cdCat01,
    metaGetFlg: 'Y', cntGetFlg: 'N', limit: '5000',
  });
  if (cdArea) qs.set('cdArea', cdArea);
  const res = await fetch(`${BASE}/getStatsData?${qs.toString()}`);
  const root = (await res.json()).GET_STATS_DATA;
  if (root.RESULT.STATUS !== 0) throw new Error(root.RESULT.ERROR_MSG);
  const inf = root.STATISTICAL_DATA;
  const cls = asArray(inf.CLASS_INF.CLASS_OBJ);
  const nameOf = (id) => {
    const o = cls.find((c) => c['@id'] === id);
    return new Map(asArray(o?.CLASS).map((c) => [c['@code'], c['@name']]));
  };
  return {
    areaName: nameOf('area'), timeName: nameOf('time'),
    values: asArray(inf.DATA_INF.VALUE),
  };
}

// ===== 1. ごみ排出量（都道府県）=====
console.log('\n########## H5610 1人1日当たりごみ排出量（都道府県）##########');
{
  const d = await fetchStats({ statsDataId: '0000010108', cdCat01: 'H5610' });
  const times = [...new Set(d.values.map((v) => v['@time']))].sort();
  console.log('時点:', times.join(' '));
  const latest = times[times.length - 1];
  console.log('最新時点:', latest, d.timeName.get(latest));
  const rows = d.values
    .filter((v) => v['@time'] === latest && /^\d{5}$/.test(v['@area']) && v['@area'] !== '00000')
    .map((v) => ({ code: v['@area'], name: d.areaName.get(v['@area']), val: Number(v.$) }))
    .filter((r) => Number.isFinite(r.val))
    .sort((a, b) => b.val - a.val);
  console.log('件数:', rows.length, '単位:', d.values[0]?.['@unit']);
  console.log('--- 上位5 ---');
  rows.slice(0, 5).forEach((r, i) => console.log(`${i + 1}\t${r.name}\t${r.val}`));
  console.log('--- 下位5 ---');
  rows.slice(-5).forEach((r, i) => console.log(`${rows.length - 4 + i}\t${r.name}\t${r.val}`));
  const all = d.values.find((v) => v['@time'] === latest && v['@area'] === '00000');
  console.log('全国:', all ? all.$ : '（なし）');
}

// ===== 2. リサイクル率（都道府県）=====
console.log('\n########## H5614 ごみのリサイクル率（都道府県）##########');
{
  const d = await fetchStats({ statsDataId: '0000010108', cdCat01: 'H5614' });
  const times = [...new Set(d.values.map((v) => v['@time']))].sort();
  const latest = times[times.length - 1];
  console.log('最新時点:', latest, d.timeName.get(latest));
  const rows = d.values
    .filter((v) => v['@time'] === latest && /^\d{5}$/.test(v['@area']) && v['@area'] !== '00000')
    .map((v) => ({ name: d.areaName.get(v['@area']), val: Number(v.$) }))
    .filter((r) => Number.isFinite(r.val))
    .sort((a, b) => b.val - a.val);
  console.log('単位:', d.values[0]?.['@unit']);
  console.log('--- 上位5 ---');
  rows.slice(0, 5).forEach((r, i) => console.log(`${i + 1}\t${r.name}\t${r.val}`));
  console.log('--- 下位5 ---');
  rows.slice(-5).forEach((r, i) => console.log(`${rows.length - 4 + i}\t${r.name}\t${r.val}`));
  const all = d.values.find((v) => v['@time'] === latest && v['@area'] === '00000');
  console.log('全国:', all ? all.$ : '（なし）');
}

// ===== 3. 通勤時間の分布（市区町村・サンプル3市）=====
console.log('\n########## H7405系 通勤時間の分布（市区町村）##########');
{
  const CODES = {
    H7405: '雇用者世帯 総数',
    H740501: '30分未満',
    H740502: '30分〜1時間',
    H740503: '1時間〜1時間30分',
    H740504: '1時間30分以上',
  };
  const SAMPLE = ['13101', '27100', '01100']; // 千代田区・大阪市・札幌市
  for (const [code, label] of Object.entries(CODES)) {
    const d = await fetchStats({ statsDataId: '0000020108', cdCat01: code });
    const times = [...new Set(d.values.map((v) => v['@time']))].sort();
    const latest = times[times.length - 1];
    const line = SAMPLE.map((a) => {
      const v = d.values.find((x) => x['@time'] === latest && x['@area'] === a);
      return `${d.areaName.get(a) || a}=${v ? v.$ : '—'}`;
    }).join('  ');
    console.log(`${code}\t${label}\t[${latest}]\t${line}\t単位:${d.values[0]?.['@unit'] || ''}`);
  }
}
