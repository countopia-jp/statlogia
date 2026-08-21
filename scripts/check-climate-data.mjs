#!/usr/bin/env node
/**
 * scripts/check-climate-data.mjs
 *
 * B自然環境（表番号 0000010102）の気候コードを試し取りする。
 *   B4108 = 日照時間（年間）
 *   B4104 = 快晴日数（年間）
 *
 *   node scripts/check-climate-data.mjs
 *
 * 実装に入る前に確定させたいこと:
 *   1. 単位と最新年。2指標で年がそろっているか（ずれていたら「揃っている年」を採る）
 *   2. 全国(00000)の行があるか。無ければ national は47県平均を自分で出す
 *   3. 日照時間と快晴日数で1位がずれるか＝展示の芯があるか
 *   4. 時系列が何時点あるか（展示17と同じ trend の型が使えるか）
 *   5. 値が欠けている県がないか（気象官署の移転などで欠測がありうる）
 */
import fs from 'node:fs';

const BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json';
const STATS_DATA_ID = '0000010102';
const CODES = [
  { key: 'sun', code: 'B4108', label: '日照時間（年間）' },
  { key: 'clear', code: 'B4104', label: '快晴日数（年間）' },
];

// ---- .env の簡易パース（dotenv 未導入のため）------------------------------
function readEnv(key) {
  const raw = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
  for (const line of raw.split('\n')) {
    const i = line.indexOf('=');
    if (i < 0) continue;
    if (line.slice(0, i).trim() !== key) continue;
    return line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  throw new Error(`.env に ${key} が見つかりません`);
}
const APP_ID = readEnv('ESTAT_APP_ID');

const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

async function apiGet(path, params) {
  const url = new URL(`${BASE}/${path}`);
  url.searchParams.set('appId', APP_ID);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  const json = await res.json();
  const root = json.GET_STATS_DATA ?? json.GET_META_INFO;
  if (root?.RESULT?.STATUS !== 0) {
    throw new Error(`${path}: e-Stat ${root?.RESULT?.STATUS} ${root?.RESULT?.ERROR_MSG}`);
  }
  return root;
}

// CLASS_OBJ から code -> {name, unit} を作る
function classMap(inf, id) {
  const objs = asArray(inf.CLASS_INF.CLASS_OBJ);
  const obj = objs.find((o) => o['@id'] === id);
  const map = new Map();
  for (const c of asArray(obj?.CLASS)) {
    map.set(c['@code'], { name: c['@name'], unit: c['@unit'] ?? null });
  }
  return map;
}

const isPref = (code) => /^\d{2}000$/.test(code) && code !== '00000';

function pearson(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  return sxy / Math.sqrt(sxx * syy);
}

// ---- 1. メタ情報 ----------------------------------------------------------
async function showMeta() {
  const root = await apiGet('getMetaInfo', { statsDataId: STATS_DATA_ID });
  const inf = root.METADATA_INF;
  console.log(`表名: ${inf.TABLE_INF?.STATISTICS_NAME ?? ''} / ${inf.TABLE_INF?.TITLE?.$ ?? inf.TABLE_INF?.TITLE ?? ''}`);
  const cat01 = classMap(inf, 'cat01');
  console.log('\n[cat01]');
  for (const { code, label } of CODES) {
    const m = cat01.get(code);
    console.log(`  ${code}  ${m ? m.name : '★見つからない'}  単位=${m?.unit ?? '(表記なし)'}   ※想定=${label}`);
  }
  const area = classMap(inf, 'area');
  const prefs = [...area.keys()].filter(isPref);
  console.log(`\n[area] 全${area.size}件 / 都道府県コード${prefs.length}件 / 全国(00000)=${area.has('00000') ? 'あり' : 'なし'}`);
  const time = classMap(inf, 'time');
  const years = [...time.keys()].map((t) => t.slice(0, 4)).sort();
  console.log(`[time] 全${time.size}時点 ${years[0]}〜${years[years.length - 1]}`);
}

// ---- 2. 実データ ----------------------------------------------------------
async function fetchValues() {
  const root = await apiGet('getStatsData', {
    statsDataId: STATS_DATA_ID,
    cdCat01: CODES.map((c) => c.code).join(','),
    limit: '100000',
  });
  const inf = root.STATISTICAL_DATA;
  const total = Number(inf.RESULT_INF?.TOTAL_NUMBER ?? 0);
  const got = Number(inf.RESULT_INF?.TO_NUMBER ?? 0);
  if (got < total) console.log(`★注意: ${total}件中${got}件しか取れていない＝指標ごとにリクエストを分けること`);

  const areaName = classMap(inf, 'area');
  const rows = asArray(inf.DATA_INF.VALUE).map((v) => ({
    code: v['@cat01'],
    area: v['@area'],
    time: v['@time'],
    year: String(v['@time']).slice(0, 4),
    value: Number(v.$),
    raw: v.$,
  }));
  return { rows, areaName };
}

function latestFullYear(rows) {
  const byYear = new Map();
  for (const r of rows) {
    if (!Number.isFinite(r.value)) continue;
    if (!isPref(r.area)) continue;
    byYear.set(r.year, (byYear.get(r.year) ?? 0) + 1);
  }
  const years = [...byYear.entries()].filter(([, n]) => n >= 47).map(([y]) => y).sort();
  return { year: years[years.length - 1] ?? null, counts: byYear };
}

function rank(list) {
  const m = new Map();
  list.forEach((r, i) => {
    const same = list.findIndex((x) => x.value === r.value);
    m.set(r.area, same + 1); // 同値は同順位
  });
  return m;
}

async function main() {
  await showMeta();
  console.log('\n' + '='.repeat(64));

  const { rows, areaName } = await fetchValues();
  const name = (code) => areaName.get(code)?.name ?? code;
  const snapshots = {};

  for (const { key, code, label } of CODES) {
    const mine = rows.filter((r) => r.code === code);
    const { year, counts } = latestFullYear(mine);
    const years = [...counts.keys()].sort();
    console.log(`\n■ ${code} ${label}`);
    console.log(`  時点数=${years.length}（${years[0]}〜${years[years.length - 1]}） / 47県そろう最新年=${year}`);

    const nat = mine.find((r) => r.area === '00000' && r.year === year);
    const list = mine
      .filter((r) => r.year === year && isPref(r.area) && Number.isFinite(r.value))
      .sort((a, b) => b.value - a.value);
    const missing = mine.filter((r) => r.year === year && isPref(r.area) && !Number.isFinite(r.value));
    const avg = list.reduce((s, r) => s + r.value, 0) / list.length;

    console.log(`  全国行(00000)=${nat ? nat.value : 'なし'} / 47県平均=${avg.toFixed(1)} / 欠測=${missing.length}件${missing.length ? ' → ' + missing.map((r) => name(r.area)).join('・') : ''}`);
    console.log('  上位5: ' + list.slice(0, 5).map((r) => `${name(r.area)}${r.value}`).join('  '));
    console.log('  下位5: ' + list.slice(-5).reverse().map((r) => `${name(r.area)}${r.value}`).join('  '));
    console.log(`  振れ幅: ${list[0].value} 〜 ${list[list.length - 1].value}（${(list[0].value / list[list.length - 1].value).toFixed(2)}倍）`);

    // 時系列（全国行が無ければ47県平均でならす）
    const trend = years.map((y) => {
      const n = mine.find((r) => r.area === '00000' && r.year === y && Number.isFinite(r.value));
      if (n) return { year: y, value: n.value, from: '全国' };
      const ps = mine.filter((r) => r.year === y && isPref(r.area) && Number.isFinite(r.value));
      if (ps.length < 47) return null;
      return { year: y, value: ps.reduce((s, r) => s + r.value, 0) / ps.length, from: '47県平均' };
    }).filter(Boolean);
    if (trend.length >= 3) {
      const a = trend[0], b = trend[trend.length - 1];
      console.log(`  時系列(${a.from}): ${a.year} ${a.value.toFixed(1)} → ${b.year} ${b.value.toFixed(1)}（${(((b.value - a.value) / a.value) * 100).toFixed(1)}%）`);
    }
    snapshots[key] = { year, list, rank: rank(list) };
  }

  // ---- 3. 2指標のズレ＝展示の芯があるか ----------------------------------
  const s = snapshots.sun, c = snapshots.clear;
  if (s && c) {
    console.log('\n' + '='.repeat(64));
    console.log(`\n■ 日照時間(${s.year}) と 快晴日数(${c.year}) の突き合わせ`);
    const cMap = new Map(c.list.map((r) => [r.area, r.value]));
    const pairs = s.list.filter((r) => cMap.has(r.area));
    console.log(`  ピアソン相関 r = ${pearson(pairs.map((r) => r.value), pairs.map((r) => cMap.get(r.area))).toFixed(3)}`);
    console.log(`  日照1位=${name(s.list[0].area)} → 快晴では${c.rank.get(s.list[0].area)}位`);
    console.log(`  快晴1位=${name(c.list[0].area)} → 日照では${s.rank.get(c.list[0].area)}位`);

    const gaps = pairs
      .map((r) => ({ area: r.area, d: (c.rank.get(r.area) ?? 0) - (s.rank.get(r.area) ?? 0) }))
      .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
      .slice(0, 8);
    console.log('  順位の開きが大きい県（+ = 快晴のほうが下位）:');
    for (const g of gaps) {
      console.log(`    ${name(g.area).padEnd(6, '　')} 日照${String(s.rank.get(g.area)).padStart(2)}位 / 快晴${String(c.rank.get(g.area)).padStart(2)}位  (${g.d > 0 ? '+' : ''}${g.d})`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
