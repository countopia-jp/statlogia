// =====================================================
// Countopia Stats - 展望塔の台帳（日本全体・県・町を1つ選んで、いろいろな数字を一覧で見る）
// src/lib/area-ledger.js
//
// 新しく e-Stat を引かず、閲覧室で使っている数字（共通エンジンと手書きページの lib。
// どれもビルド中はキャッシュされている）から、地域ごとの一覧を組み立てる。
// 方針：数字を並べるだけ。合計点・偏差値のように1つにまとめることはしない。
//   県：値・年・全国（または47都道府県の平均）・47都道府県の中の順位・その窓口へのリンク
//   町：値・年・全国の順位（政令市の区などは順位外）・県内の順位・その窓口へのリンク
// 財政力指数は豊かさの序列に読まれやすいので、順位は出さない（noRank）。
// =====================================================
import { ROOMS } from '../data/rooms/index.js';
import { ROOM_NAMES } from '../data/page-names.js';
import { getRoomData } from './room-engine.js';
import { getPopulationData } from './population.js';
import { getLivingData } from './living.js';
import { getPriceLedgerData } from './price-ledger.js';
import { getIctData } from './ict.js';
import { getMuniPopulationData } from './muni-population.js';
import { getMuniMigrationData } from './muni-migration.js';
import { getMuniHousingData } from './muni-housing.js';
import { getMuniCommuteTimeData } from './muni-commute-time.js';
import { getMuniMedicalData } from './muni-medical.js';
import { getMuniCultureData } from './muni-culture.js';
import { getMuniFinanceData } from './muni-finance.js';
import { getEducationData } from './education.js';

const nameOf = (href, fallback) => (ROOM_NAMES[href] || fallback || '').replace(/^(閲覧室|別館)\s+/, '');
const ok = (v) => typeof v === 'number' && Number.isFinite(v);
const lastOk = (arr) => {
  for (let i = (arr || []).length - 1; i >= 0; i--) if (ok(arr[i])) return i;
  return -1;
};
const decOf = (vals) => {
  let d = 0;
  for (const v of vals) if (ok(v)) { const s = String(v); if (s.includes('.')) d = Math.max(d, s.split('.')[1].length); }
  return Math.min(d, 2);
};
const cleanUnit = (u) => (!u || u === '‐' || u === '-' ? '' : u.replace('ｍ2', '㎡').replace(/^%$/, '％'));

// 共通エンジンの窓口から1項目
async function fromRoom(roomId, key, opt = {}) {
  const room = ROOMS[roomId];
  const data = await getRoomData(room);
  const ind = data.indicators.find((i) => i.key === key);
  if (!ind) return null; // 揃っている時点がなく外れた項目
  const last = ind.years.length - 1;
  const values = {};
  for (const a of data.areas) values[a.c] = { v: a.v[key]?.[last] ?? null, x: !!a.x, n: a.n };
  let compare = null;
  if (data.scope === 'pref') {
    const isTotal = data.nationalIsTotal?.[key];
    const isAvg = data.nationalIsAvg?.[key];
    if (isTotal) compare = { label: '47都道府県の平均', v: data.prefAverage[key][last] };
    else compare = { label: isAvg ? '47都道府県の平均' : '全国', v: data.national[key][last] };
  }
  return {
    label: opt.label || ind.label, unit: cleanUnit(ind.unit), decimals: ind.decimals, rankWord: ind.rankWord,
    year: ind.yearLabels[last], href: room.path, room: nameOf(room.path, room.title), values, compare, noRank: !!opt.noRank,
  };
}

// 手書きページ（都道府県・indicators と areas[].v が同じ並び）から1項目
function fromPrefList(data, code, href, room, opt = {}) {
  const idx = data.indicators.findIndex((i) => i.code === code);
  if (idx < 0) return null;
  const ind = data.indicators[idx];
  const values = {};
  for (const a of data.areas) values[a.c] = { v: a.v[idx] ?? null, n: a.n };
  return {
    label: opt.label || ind.label, unit: cleanUnit(opt.unit ?? ind.unit), decimals: decOf(Object.values(values).map((o) => o.v)),
    rankWord: opt.rankWord || '多い順', year: ind.year, href, room: nameOf(href, room), values, compare: null, noRank: !!opt.noRank,
  };
}

// 手書きページ（市区町村・indicators[].key と areas[].v が同じ並び）から1項目
function fromTownList(data, key, href, room, opt = {}) {
  const idx = data.indicators.findIndex((i) => (i.key || i.label) === key);
  if (idx < 0) return null;
  const ind = data.indicators[idx];
  const values = {};
  for (const a of data.areas) values[a.c] = { v: a.v[idx] ?? null, x: !!a.x, n: a.n };
  return {
    label: opt.label || key, unit: cleanUnit(opt.unit ?? ind.unit), decimals: decOf(Object.values(values).map((o) => o.v)),
    rankWord: opt.rankWord || '多い順', year: ind.year || opt.year || data.year || data.medYear || data.culYear || '', href, room: nameOf(href, room),
    values, compare: null, noRank: !!opt.noRank,
  };
}

// 順位をつける（大きい順。同じ値は同じ順位。x の地域は順位の外）
function rankOf(item, codes) {
  const list = codes.map((c) => item.values[c]).filter((o) => o && !o.x && ok(o.v)).map((o) => o.v);
  const rank = {};
  for (const c of codes) {
    const o = item.values[c];
    if (!o || o.x || !ok(o.v)) continue;
    rank[c] = 1 + list.filter((v) => v > o.v).length;
  }
  return { rank, count: list.length };
}

const group = (title, items) => ({ title, items: items.filter(Boolean) });

// ---------------- 都道府県 ----------------
let _pref = null;
export async function getPrefLedger() {
  if (_pref) return _pref;
  const pop = await getPopulationData();
  const liv = await getLivingData();
  const price = await getPriceLedgerData();
  const ict = await getIctData();
  const priceItem = (() => {
    const values = {};
    for (const a of price.areas) { const arr = a.v.C5701 || []; values[a.c] = { v: arr[arr.length - 1] ?? null, n: a.n }; }
    return { label: '物価の水準（総合、全国平均＝100）', unit: '', decimals: 1, rankWord: '高い順', year: price.yearLabel, href: '/prices/', room: nameOf('/prices/', '物価の帳場'), values, compare: { label: '全国', v: 100 }, noRank: false };
  })();

  const groups = [
    group('人と世帯', [
      fromPrefList(pop, 'A1101', '/population/', '国勢の間', { label: '総人口' }),
      fromPrefList(pop, 'A1306', '/population/', '国勢の間', { label: '高齢化率（65歳以上の割合）', rankWord: '高い順' }),
      fromPrefList(pop, 'A1304', '/population/', '国勢の間', { label: '年少人口率（15歳未満の割合）', rankWord: '高い順' }),
      fromPrefList(pop, 'A7101', '/population/', '国勢の間', { label: '世帯数' }),
      fromPrefList(pop, 'A4103', '/population/', '国勢の間', { label: '合計特殊出生率', rankWord: '高い順' }),
      fromPrefList(pop, 'A9121', '/population/', '国勢の間', { label: '婚姻率（人口千人あたり）', rankWord: '高い順' }),
    ]),
    group('空と土地', [
      await fromRoom('sky', 'temp'), await fromRoom('sky', 'sun'), await fromRoom('sky', 'rain'), await fromRoom('sky', 'snowDays'),
      await fromRoom('nature', 'parkShare'),
    ]),
    group('暮らしの値段', [
      priceItem,
      fromPrefList(liv, 'H410431', '/living/', '暮らしの見積書', { label: '民営借家の家賃（1畳あたり）', rankWord: '高い順' }),
      fromPrefList(liv, 'H2130', '/living/', '暮らしの見積書', { label: '1住宅あたりの広さ', rankWord: '広い順' }),
      fromPrefList(liv, 'OWNRATE', '/living/', '暮らしの見積書', { label: '持ち家率', rankWord: '高い順' }),
      await fromRoom('land-price', 'residential'),
    ]),
    group('働く', [
      fromPrefList(liv, 'F620215', '/living/', '暮らしの見積書', { label: '毎月の給与（男）', rankWord: '高い順' }),
      fromPrefList(liv, 'F620216', '/living/', '暮らしの見積書', { label: '毎月の給与（女）', rankWord: '高い順' }),
      fromPrefList(liv, 'F6501', '/living/', '暮らしの見積書', { label: '最低賃金（時間額）', rankWord: '高い順' }),
      await fromRoom('work-style', 'unemployment'), await fromRoom('work-style', 'laborWomen'),
      await fromRoom('work-style', 'regular'), await fromRoom('work-style', 'elderly'),
    ]),
    group('県のお金', [
      await fromRoom('pref-economy', 'perCapita'), await fromRoom('pref-spending', 'perCapita'),
      await fromRoom('pref-spending', 'welfare'), await fromRoom('pref-spending', 'education'),
    ]),
    group('家計（県庁所在市の二人以上の世帯）', [
      await fromRoom('household', 'spending'), await fromRoom('household', 'food'), await fromRoom('household', 'utility'),
    ]),
    group('産業と観光', [
      await fromRoom('farm-sea', 'farmOutput'), await fromRoom('farm-sea', 'fishOutput'),
      await fromRoom('stay', 'outside'), await fromRoom('stay', 'foreignShare'), await fromRoom('stay', 'occupancy'),
    ]),
    group('学びと文化', [
      await fromRoom('library', 'libs'), await fromRoom('library', 'lend'), await fromRoom('culture', 'museums'),
      await fromRoom('sports-fields', 'gym'),
      fromPrefList(ict, 'E9421', '/ict/', '情報化の帳場', { label: 'デジタル教科書の整備率（小学校）', rankWord: '高い順' }),
    ]),
    group('消防と救急', [await fromRoom('fire-ems', 'volunteers'), await fromRoom('fire-ems', 'emsCalls')]),
    group('過ごし方', [await fromRoom('leisure', 'sport'), await fromRoom('leisure', 'trip'), await fromRoom('volunteer', 'all')]),
  ].filter((g) => g.items.length);

  // 人口の窓口は全国の行を持たないので、47都道府県から計算する（総数は合計、割合は人口で重みづけた平均）
  const popItems = groups[0].items;
  const popOf = Object.fromEntries((popItems.find((it) => it.label === '総人口')?.values ? Object.entries(popItems.find((it) => it.label === '総人口').values) : []).map(([c, o]) => [c, o.v]));
  const sumOf = (it) => Object.values(it.values).reduce((s, o) => s + (ok(o.v) ? o.v : 0), 0);
  const wAvg = (it) => {
    let s = 0, w = 0;
    for (const [c, o] of Object.entries(it.values)) if (ok(o.v) && ok(popOf[c])) { s += o.v * popOf[c]; w += popOf[c]; }
    return w ? Number((s / w).toFixed(it.decimals)) : null;
  };
  for (const it of popItems) {
    if (it.label === '総人口' || it.label === '世帯数') it.compare = { label: '全国', v: sumOf(it), calc: true };
    else if (/高齢化率|年少人口率|婚姻率/.test(it.label)) it.compare = { label: '全国', v: wAvg(it), calc: true };
  }
  for (const g of groups) for (const it of g.items) if (it.href === '/prices/') it.hideNational = true;

  const prefs = pop.areas.map((a) => ({ c: a.c, n: a.n })).sort((a, b) => a.c.localeCompare(b.c));
  const codes = prefs.map((p) => p.c);
  for (const g of groups) for (const it of g.items) { const r = rankOf(it, codes); it.rank = r.rank; it.count = r.count; }
  _pref = { prefs, groups };
  return _pref;
}

// 日本全体：全国の値がある項目だけ（全国の値のない項目、全国の値が合計になる項目は出さない）
export function nationalRows(ledger) {
  return ledger.groups.map((g) => ({
    title: g.title,
    rows: g.items.filter((it) => !it.hideNational && it.compare && it.compare.label === '全国' && typeof it.compare.v === 'number')
      .map((it) => ({ label: it.label, unit: it.unit, decimals: it.decimals, year: it.year, href: it.href, room: it.room, v: it.compare.v })),
  })).filter((g) => g.rows.length);
}

// 1つの県の行だけを取り出す（ページに渡す形）
export function prefRows(ledger, code) {
  return ledger.groups.map((g) => ({
    title: g.title,
    rows: g.items.map((it) => ({
      label: it.label, unit: it.unit, decimals: it.decimals, year: it.year, href: it.href, room: it.room, rankWord: it.rankWord,
      v: it.values[code]?.v ?? null, compare: it.compare, rank: it.noRank ? null : it.rank[code] ?? null, count: it.count,
    })),
  }));
}

// ---------------- 市区町村 ----------------
let _town = null;
export async function getTownLedger() {
  if (_town) return _town;
  const pop = await getMuniPopulationData();
  const mig = await getMuniMigrationData();
  const hou = await getMuniHousingData();
  const com = await getMuniCommuteTimeData();
  const med = await getMuniMedicalData();
  const cul = await getMuniCultureData();
  const fin = await getMuniFinanceData();
  const edu = await getEducationData();
  // 学びの登記所は名前が「町名だけ」なので、形をそろえる
  const eduT = { year: edu.indicators[0]?.year, indicators: edu.indicators.map((i) => ({ key: i.label, unit: i.unit, year: i.year })), areas: edu.areas.map((a) => ({ c: a.c, n: `${a.p} ${a.n}`, x: a.x, v: a.v })) };
  const perSchool = (() => {
    const iN = edu.indicators.findIndex((i) => i.code === 'E2101' || i.label === '小学校数');
    const iK = edu.indicators.findIndex((i) => i.label === '小学校児童数');
    const values = {};
    for (const a of edu.areas) { const n = a.v[iN], k = a.v[iK]; values[a.c] = { v: ok(n) && n > 0 && ok(k) ? Math.round(k / n) : null, x: !!a.x }; }
    return { label: '小学校1校あたりの児童数', unit: '人', decimals: 0, rankWord: '多い順', year: edu.indicators[iK]?.year, href: '/education/', room: nameOf('/education/', '学びの登記所'), values, compare: null, noRank: false };
  })();

  const groups = [
    group('人と土地', [
      fromTownList(pop, '総人口', '/town-population/', 'わが町の人口'),
      fromTownList(pop, '高齢化率', '/town-population/', 'わが町の人口', { label: '高齢化率（65歳以上の割合）', rankWord: '高い順' }),
      fromTownList(pop, '年少人口率', '/town-population/', 'わが町の人口', { label: '年少人口率（15歳未満の割合）', rankWord: '高い順' }),
      fromTownList(mig, '社会増減率', '/town-migration/', 'わが町の人の出入り', { label: '社会増減率（転入−転出、人口千人あたり）', unit: '', rankWord: '高い順' }),
      await fromRoom('town-forest', 'area'), await fromRoom('town-forest', 'habitableShare'), await fromRoom('town-forest', 'forestShare'),
    ]),
    group('住まいと通勤', [
      fromTownList(hou, '空き家率', '/town-housing/', 'わが町の住まい', { rankWord: '高い順' }),
      fromTownList(hou, '持ち家率', '/town-housing/', 'わが町の住まい', { rankWord: '高い順' }),
      fromTownList(hou, '1住宅当たり延べ面積', '/town-housing/', 'わが町の住まい', { label: '1住宅あたりの広さ', rankWord: '広い順' }),
      fromTownList(hou, '1畳当たり家賃', '/town-housing/', 'わが町の住まい', { label: '家賃（1畳あたり）', rankWord: '高い順' }),
      fromTownList(com, '1時間以上の割合', '/town-commute-time/', 'わが町の通勤時間', { label: '片道の通勤が1時間以上の世帯の割合', rankWord: '高い順' }),
    ]),
    group('働く', [
      await fromRoom('town-work', 'primary'), await fromRoom('town-work', 'secondary'), await fromRoom('town-work', 'tertiary'),
      await fromRoom('town-industry', 'care'),
      await fromRoom('town-workplace', 'inTown'), await fromRoom('town-workplace', 'comeIn'),
      await fromRoom('town-business-size', 's1'),
    ]),
    group('産業', [await fromRoom('town-shops', 'shipments'), await fromRoom('town-shops', 'shops'), await fromRoom('town-farm', 'farms')]),
    group('近くにあるもの', [
      fromTownList(med, '病院', '/town-medical/', 'わが町の医療', { year: med.medYear }),
      fromTownList(med, '一般診療所', '/town-medical/', 'わが町の医療', { year: med.medYear }),
      fromTownList(med, 'お医者さん', '/town-medical/', 'わが町の医療', { year: med.medYear }),
      await fromRoom('town-kids', 'nurseries'), await fromRoom('town-elderly', 'tokuyo'),
      fromTownList(cul, '図書館', '/town-culture/', 'わが町の図書館と公民館', { year: cul.culYear }),
      fromTownList(cul, '公民館', '/town-culture/', 'わが町の図書館と公民館', { year: cul.culYear }),
      fromTownList(eduT, '小学校数', '/education/', '学びの登記所', { label: '小学校', year: eduT.year }),
      fromTownList(eduT, '中学校数', '/education/', '学びの登記所', { label: '中学校', year: eduT.year }),
      perSchool,
    ]),
    group('町の財政', [
      fromTownList(fin, '財政力指数', '/town-finance/', 'わが町の財政と教育費', { noRank: true }),
      fromTownList(fin, '住民1人当たり教育費', '/town-finance/', 'わが町の財政と教育費', { label: '住民1人あたりの教育費', rankWord: '多い順' }),
    ]),
  ].filter((g) => g.items.length);

  // 町の一覧：人口の窓口の地域（政令市の区なども含む）。名前は「県名 町名」→ 県と町に分ける
  const towns = pop.areas.map((a) => {
    const [p, ...rest] = a.n.split(' ');
    return { c: a.c, p, n: rest.join(' ') || a.n, x: !!a.x };
  }).sort((a, b) => a.c.localeCompare(b.c));
  const codes = towns.map((t) => t.c);
  for (const g of groups) for (const it of g.items) {
    const r = rankOf(it, codes); it.rank = r.rank; it.count = r.count;
    // 県内の順位
    it.prefRank = {}; it.prefCount = {};
    const byPref = {};
    for (const c of codes) (byPref[c.slice(0, 2)] ??= []).push(c);
    for (const [pc, cs] of Object.entries(byPref)) { const rr = rankOf(it, cs); Object.assign(it.prefRank, rr.rank); it.prefCount[pc] = rr.count; }
  }
  _town = { towns, groups };
  return _town;
}

// 1つの県の町ぶんを、ページに埋め込む小さな形にする
export function townPack(ledger, prefCode) {
  const towns = ledger.towns.filter((t) => t.c.startsWith(prefCode));
  const items = ledger.groups.flatMap((g) => g.items.map((it) => ({ g: g.title, it })));
  return {
    towns,
    groups: ledger.groups.map((g) => g.title),
    items: items.map(({ g, it }) => ({
      g, label: it.label, unit: it.unit, d: it.decimals, year: it.year, href: it.href, room: it.room, rw: it.rankWord,
      count: it.count, prefCount: it.prefCount?.[prefCode] ?? null, noRank: it.noRank,
      v: Object.fromEntries(towns.map((t) => [t.c, [it.values[t.c]?.v ?? null, it.noRank ? null : it.rank[t.c] ?? null, it.noRank ? null : it.prefRank?.[t.c] ?? null]])),
    })),
  };
}
