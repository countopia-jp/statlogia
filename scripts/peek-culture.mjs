// scripts/peek-culture.mjs — G1201公民館数・G1401図書館数（市区町村 0000020107）の時点と揃い具合を見る
import fs from 'node:fs';
for (const line of fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g, '');
}
const appId = process.env.ESTAT_APP_ID;
const BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json';
const asArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);
const ID = '0000020107';

const meta = (await (await fetch(`${BASE}/getMetaInfo?${new URLSearchParams({ appId, lang: 'J', statsDataId: ID })}`)).json()).GET_META_INFO;
const times = asArray(asArray(meta.METADATA_INF.CLASS_INF.CLASS_OBJ).find((o) => o['@id'] === 'time')?.CLASS)
  .map((c) => ({ code: c['@code'], name: c['@name'] })).sort((a, b) => b.code.localeCompare(a.code));
console.log(`時点 ${times.length}件: ${times.map((t) => t.name).join(', ')}`);

const kindOf = (code, name) => {
  if (code === '00000' || /^\d{2}000$/.test(code)) return 'pref';
  if (/（旧|\(旧/.test(name)) return 'old';
  if (code === '13100' || (/^\d{2}1\d\d$/.test(code) && !code.endsWith('100') && !/^131\d\d$/.test(code))) return 'x';
  if (/^131\d\d$/.test(code) || /区$/.test(name)) return '区';
  if (/市$/.test(name)) return '市';
  if (/町$/.test(name)) return '町';
  if (/村$/.test(name)) return '村';
  return '他';
};

for (const code of ['G1201', 'G1401']) {
  const qs = new URLSearchParams({ appId, lang: 'J', statsDataId: ID, cdCat01: code,
    cdTime: times.map((t) => t.code).join(','), metaGetFlg: 'Y', cntGetFlg: 'N', annotationGetFlg: 'N', explanationGetFlg: 'N', replaceSpChars: '0' });
  const root = (await (await fetch(`${BASE}/getStatsData?${qs}`)).json()).GET_STATS_DATA;
  if (!root || root.RESULT.STATUS !== 0) { console.log(`${code} 失敗: ${root?.RESULT?.ERROR_MSG}`); continue; }
  const sd = root.STATISTICAL_DATA;
  const names = {};
  for (const c of asArray(asArray(sd.CLASS_INF.CLASS_OBJ).find((o) => o['@id'] === 'area')?.CLASS)) names[c['@code']] = (c['@name'] || '').trim();
  const total = {}; const have = {}; const byTime = {}; const latest = {};
  for (const [ac, nm] of Object.entries(names)) { const k = kindOf(ac, nm); total[k] = (total[k] || 0) + 1; }
  for (const v of asArray(sd.DATA_INF.VALUE)) {
    const raw = v['$']; if (['', '-', '***', 'X', undefined, null].includes(raw)) continue;
    const num = Number(String(raw).replace(/,/g, '')); if (!Number.isFinite(num)) continue;
    byTime[v['@time']] = (byTime[v['@time']] || 0) + 1;
    if (!latest[v['@area']] || v['@time'] > latest[v['@area']].t) latest[v['@area']] = { t: v['@time'], num };
  }
  for (const [ac, r] of Object.entries(latest)) { const k = kindOf(ac, names[ac] || ''); have[k] = (have[k] || 0) + 1; }
  console.log(`\n===== ${code} =====`);
  console.log('時点別件数: ' + Object.entries(byTime).sort().map(([t, n]) => `${t.slice(0,4)}:${n}`).join(' '));
  console.log('最新値あり/全体: ' + ['市','区','町','村'].map((k) => `${k} ${have[k] || 0}/${total[k] || 0}`).join('  '));
  const rows = Object.entries(latest).filter(([ac]) => ['市','区','町','村'].includes(kindOf(ac, names[ac] || ''))).map(([ac, r]) => ({ n: names[ac], v: r.num, t: r.t.slice(0,4) })).sort((a, b) => b.v - a.v);
  console.log('上位8: ' + rows.slice(0, 8).map((r) => `${r.n}${r.v}(${r.t})`).join(' '));
  console.log('ゼロの数: ' + rows.filter((r) => r.v === 0).length + ' / ' + rows.length);
  const pick = ['千代田区', '世田谷区', '逗子市', '仙台市', '若林区', '中野区'];
  console.log('例: ' + rows.filter((r) => pick.includes(r.n)).map((r) => `${r.n}${r.v}`).join(' '));
}
