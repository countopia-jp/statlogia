// =====================================================
// Statlogia - 閲覧室の共通エンジン
// src/lib/room-engine.js
//
// 窓口ごとの設定（src/data/rooms/*.js）を渡すと、e-Stat 社会・人口統計体系から
// 必要なコードを取りに行き、ページが読むJSONの形にそろえて返す。
//   scope: 'pref' … 47都道府県（表 00000101xx）
//   scope: 'town' … 市区町村（表 00000201xx）
//
// 指標の書き方（rooms/*.js）
//   { key, label, table, code }                 … その値をそのまま使う
//   { key, label, unit, needs:[[table,code],…], calc:(g)=>… , carry:[code…] }
//       … いくつかのコードから計算する（割合・人口あたりなど）。
//         g(code) はその地域・その時点の値。carry に入れたコードは
//         「その時点か、それより前でいちばん新しい値」を使う（国勢調査の人口など、年がまばらなもの）。
//   decimals（小数の桁）、dir（'desc'＝多いほど上位）、rankWord（「多い順」など）、note（指標の注記）、
//   scale（単位の換算。百万円→億円なら0.01と unit:'億円'）。窓口に dashAsZero:true を付けると「-」を0として扱う
//   lq:true（窓口か項目）… 構成の割合（％）に特化係数（全国の割合に対する倍率）を添える
//   perCapita:false … 人口あたりを添えない（数の項目には自動で添える。perCapKind を参照）
//   noRank:true（窓口）… 重い数字の窓口。順位・上位下位・ばらつきを出さず、値と全国との比較と推移だけ（Room.astro が読む）
//
// 【取得の決まり】コードごとに1リクエスト（まとめると取得上限で切り詰められる）。
//   e-Stat が応答しないことがあるので、タイムアウト付きで3回まで取り直す。
// =====================================================

const API_BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json';
const asArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);

function getAppId() {
  const appId = import.meta.env?.ESTAT_APP_ID || process.env.ESTAT_APP_ID;
  if (!appId) throw new Error('[room-engine] ESTAT_APP_ID が設定されていません');
  return appId;
}

async function apiGet(path, params, tries = 3) {
  const qs = new URLSearchParams({ appId: getAppId(), lang: 'J', ...params });
  let lastErr;
  for (let i = 0; i < tries; i++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 120000);
    try {
      return await cachedJsonFetch(`${API_BASE}/${path}?${qs.toString()}`, { signal: ctl.signal });
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 3000 * (i + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`[room-engine] ${path} を${tries}回試して取れませんでした: ${lastErr?.message || lastErr}`);
}

// 全角の単位を、ページで読みやすい形に
const UNIT_FIX = { 'ｈａ': 'ha', 'ｍｍ': 'mm', 'ｃｍ': 'cm', 'ｍ2': '㎡', 'ｍ3': '㎥', 'ｋｍ': 'km', '‐': '' };
const fixUnit = (u) => (u in UNIT_FIX ? UNIT_FIX[u] : u || '');

const rawCache = new Map();
// 10-18 社会・人口統計体系でない表（経済センサスなど）は、code を 'E|cat02=0|tab=158-2021' のように書く。
//   先頭が cat01、続く「名前=値」が cdCat02・cdTab などの絞り込み（応答もその値の行だけを使う）
function parseCode(code) {
  const [c1, ...rest] = String(code).split('|');
  const extra = Object.fromEntries(rest.map((s) => s.split('=')));
  return { c1, extra };
}
async function fetchRaw(table, code) {
  const k = `${table}:${code}`;
  if (rawCache.has(k)) return rawCache.get(k);
  const { c1, extra } = parseCode(code);
  // 1回の応答は10万件まで。市区町村×長い年数だと溢れるので、NEXT_KEY で続きを取る
  const values = [];
  let root;
  let start = 1;
  for (let page = 0; page < 20; page++) {
    const params = {
      statsDataId: table,
      cdCat01: c1,
      ...Object.fromEntries(Object.entries(extra).map(([n, v]) => [`cd${n[0].toUpperCase()}${n.slice(1)}`, v])),
      metaGetFlg: page === 0 ? 'Y' : 'N',
      cntGetFlg: 'N',
      annotationGetFlg: 'N',
      explanationGetFlg: 'N',
      replaceSpChars: '0',
    };
    if (start > 1) params.startPosition = String(start);
    const json = await apiGet('getStatsData', params);
    const r = json.GET_STATS_DATA;
    if (!r || r.RESULT.STATUS !== 0) {
      throw new Error(`[room-engine] getStatsData失敗(${table} ${code}): ${r?.RESULT?.ERROR_MSG || '不明'}`);
    }
    if (page === 0) root = r;
    values.push(...asArray(r.STATISTICAL_DATA?.DATA_INF?.VALUE));
    const next = r.STATISTICAL_DATA?.RESULT_INF?.NEXT_KEY;
    if (!next) break;
    start = Number(next);
  }
  const sd = root.STATISTICAL_DATA;
  const objs = asArray(sd.CLASS_INF?.CLASS_OBJ);
  const areaNames = {};
  for (const c of asArray(objs.find((o) => o['@id'] === 'area')?.CLASS)) areaNames[c['@code']] = (c['@name'] || '').trim();
  const timeNames = {};
  for (const c of asArray(objs.find((o) => o['@id'] === 'time')?.CLASS)) timeNames[c['@code']] = (c['@name'] || '').trim();
  const cat = asArray(objs.find((o) => o['@id'] === 'cat01')?.CLASS).find((c) => c['@code'] === c1);
  const byTime = {};
  const dash = {}; // 「-」（該当なし）だった欄。窓口の設定 dashAsZero:true のときだけ0として扱う
  for (const v of values) {
    if (v['@cat01'] && v['@cat01'] !== c1) continue;
    if (Object.entries(extra).some(([n, x]) => v[`@${n}`] !== undefined && v[`@${n}`] !== x)) continue;
    const raw = v['$'];
    if (raw === '-') { (dash[v['@time']] ??= {})[v['@area']] = true; continue; }
    if (raw === undefined || raw === null || raw === '' || raw === '-' || raw === '***' || raw === 'X') continue;
    const num = Number(String(raw).replace(/,/g, ''));
    if (!Number.isFinite(num)) continue;
    (byTime[v['@time']] ??= {})[v['@area']] = num;
  }
  const out = { areaNames, timeNames, byTime, dash, times: [...new Set([...Object.keys(byTime), ...Object.keys(dash)])].sort(), unit: fixUnit(cat?.['@unit'] || ''), name: (cat?.['@name'] || '').replace(/^[A-Z0-9]+_/, '') };
  rawCache.set(k, out);
  return out;
}

// 市区町村の仕分け（muni-*.js と同じ）。'x'＝政令市の区（表示はするが順位に入れない）
function classifyTown(code, name) {
  const nm = (name || '').trim();
  if (code === '00000' || nm === '全国') return 'exclude';
  if (/^\d{2}000$/.test(code)) return 'exclude';
  if (/（旧|\(旧/.test(nm)) return 'exclude';
  if (code === '13100') return 'x';
  if (/^131\d\d$/.test(code)) return 'rank';
  if (/^\d{2}1\d\d$/.test(code) && !code.endsWith('100')) return 'x';
  return 'rank';
}

const roundTo = (v, d) => (v === null || v === undefined || !Number.isFinite(v) ? null : Number(v.toFixed(Math.max(0, d) + 1)));

// 10-18 数の項目（人・施設・件・金額の合計など）は、規模の違う地域どうしでは比べにくいので人口あたりを添える
//   'p100k' … 人口10万人あたり、'man' … 1人あたり万円（億円の項目）。
//   すでに「〜あたり」「割合」「率」の項目、面積・気象・平均値の項目には付けない。窓口や項目に perCapita:false で止められる
const PERCAP_UNITS = new Set(['人', 'か所', '所', '施設', '件', '戸', '台', '事業所', '店', '校', '館', '棟', '世帯', '事業体', '人泊', '者', '法人', '講座', '園', '署', '団', '億円']);
function perCapKind(room, ind, unit) {
  if (room.perCapita === false || ind.perCapita === false) return null;
  if (ind.perCapita === true) return unit === '億円' ? 'man' : 'p100k';
  if (!PERCAP_UNITS.has(unit)) return null;
  if (/あたり|当たり|割合|率|平均|倍|1人|１人|1か月|1校|1園|1学級|1住宅|1戸/.test(ind.label || '')) return null;
  return unit === '億円' ? 'man' : 'p100k';
}
import { seForRoom } from './sampling-error.js';
import { cachedJsonFetch } from './estat-cache.js';
const cache = new Map();

// 10-24 「揃っている時点がないため外した」指標の控え。照合（verify-data）が最後に一覧で出す。
// 警告を標準出力に流すだけだと、何百行もあるログに埋もれて何か月も気づけないため。
export const dropped = [];

// 10-24 指標ごとの台帳。scripts/audit-data.mjs が「そもそも何をどう出しているか」を一覧にするために使う。
// 照合（verify-data）は出している値が合っているかしか見ないので、単位や分母の取り違えはここでしか捕まらない。
// 外れた指標も dropped: true で1行入れる。
export const ledger = [];

export async function getRoomData(room) {
  if (cache.has(room.id)) return cache.get(room.id);

  const scope = room.scope;
  const inds = room.indicators.map((ind) => ({
    ...ind,
    needs: ind.needs || [[ind.table, ind.code]],
    calc: ind.calc || ((g) => g(ind.code)),
    carry: ind.carry || [],
  }));

  // 必要なコードを1つずつ取る
  const raws = {};
  for (const ind of inds) for (const [t, c] of ind.needs) raws[c] ??= await fetchRaw(t, c);

  // 地域の一覧（最初の指標の表から）
  const first = raws[inds[0].needs[0][1]];
  const areaList = [];
  for (const [c, n] of Object.entries(first.areaNames)) {
    if (scope === 'pref') {
      if (/^\d{2}000$/.test(c) && c !== '00000') areaList.push({ c, n, x: false });
    } else {
      const kind = classifyTown(c, n);
      if (kind !== 'exclude') areaList.push({ c, n, x: kind === 'x' });
    }
  }
  areaList.sort((a, b) => a.c.localeCompare(b.c));
  const rankCount = areaList.filter((a) => !a.x).length;

  const maxYears = room.maxYears || (scope === 'pref' ? 30 : 8);
  const timeNameOf = (t) => {
    for (const r of Object.values(raws)) if (r.timeNames[t]) return r.timeNames[t];
    return t.slice(0, 4) + '年';
  };

  const indicatorsOut = [];
  const values = {}; // key -> { areaCode: [..] }
  const national = {};
  const nationalIsAvg = {};
  const nationalIsTotal = {};
  const prefAverage = {};

  for (const ind of inds) {
    const ownCodes = ind.needs.map(([, c]) => c).filter((c) => !ind.carry.includes(c));
    const baseCodes = ownCodes.length ? ownCodes : [ind.needs[0][1]];
    const timeSet = new Set();
    for (const c of baseCodes) for (const t of raws[c].times) timeSet.add(t);
    const times = [...timeSet].sort();

    const getter = (area, t) => (code) => {
      const r = raws[code];
      if (!r) return null;
      if (ind.carry.includes(code)) {
        for (let i = r.times.length - 1; i >= 0; i--) {
          const tt = r.times[i];
          if (tt <= t && r.byTime[tt]?.[area] !== undefined) return r.byTime[tt][area];
        }
        return null;
      }
      const v = r.byTime[t]?.[area];
      if (v === undefined) return room.dashAsZero && r.dash[t]?.[area] ? 0 : null;
      return v;
    };
    const calcAt = (area, t) => {
      try {
        const v = ind.calc(getter(area, t));
        return typeof v === 'number' && Number.isFinite(v) ? v * (ind.scale ?? 1) : null;
      } catch {
        return null;
      }
    };

    // 揃っている時点だけを使う（県＝47すべて、町＝順位対象の8割以上）
    // 10-24 県も minCoverage を見る。既定は1＝47県すべて（これまでと同じ）。
    //       以前は 47 固定で、県の窓口に minCoverage を書いても黙って無視されていた
    const need = scope === 'pref'
      ? Math.ceil(47 * (ind.minCoverage ?? room.minCoverage ?? 1))
      : Math.ceil(rankCount * (ind.minCoverage ?? room.minCoverage ?? 0.8)); // 地価の商業地・工業地のように、もともと一部の町にしか無い項目は minCoverage で下げる
    let useTimes = times.filter((t) => areaList.filter((a) => !a.x && calcAt(a.c, t) !== null).length >= need);
    useTimes = useTimes.slice(-maxYears);
    if (ind.onlyLatest) useTimes = useTimes.slice(-1); // 10-20 推計の版が複数ある項目（将来推計人口など）は、いちばん新しい版だけ
    if (useTimes.length === 0) {
      // 10-24 黙って外れると気づけないので、集めておいて照合の最後に一覧で出す
      const best = times.reduce((m, t) => Math.max(m, areaList.filter((a) => !a.x && calcAt(a.c, t) !== null).length), 0);
      dropped.push({ room: room.id, key: ind.key, label: ind.label || ind.key, best, rankCount, need });
      ledger.push({
        room: room.id, scope, key: ind.key, label: ind.label || ind.key, dropped: true,
        needs: ind.needs.map(([t, c]) => [t, c]),
        estat: Object.fromEntries(ind.needs.map(([, c]) => [c, { name: raws[c]?.name || '', unit: raws[c]?.unit || '' }])),
        unit: ind.unit ?? raws[baseCodes[0]].unit, unitFromRoom: ind.unit !== undefined, scale: ind.scale ?? 1, decimals: ind.decimals ?? 0,
        calcCustom: !!room.indicators.find((x) => x.key === ind.key)?.calc,
        carry: ind.carry, carryYears: {}, onlyLatest: !!ind.onlyLatest, dashAsZero: !!room.dashAsZero,
        minCoverage: ind.minCoverage ?? room.minCoverage ?? null,
        years: [], allYears: times.map((t) => t.slice(0, 4)),
        have: best, rankCount, need, coverage: rankCount ? best / rankCount : null,
        national: null, natFrom: null, lastMin: null, lastMax: null, note: ind.note || '', roomNotes: room.notes || [],
      });
      console.warn(`[room-engine] ${room.id}/${ind.key}: 揃っている時点がないため外します`);
      continue;
    }

    const d = ind.decimals ?? 0;
    values[ind.key] = {};
    for (const a of areaList) values[ind.key][a.c] = useTimes.map((t) => roundTo(calcAt(a.c, t), d));

    if (scope === 'pref') {
      const nat = useTimes.map((t) => calcAt('00000', t));
      const avg = useTimes.map((t) => {
        const vs = areaList.map((a) => calcAt(a.c, t)).filter((v) => v !== null);
        return vs.length ? vs.reduce((s, v) => s + v, 0) / vs.length : null;
      });
      const isAvg = nat[nat.length - 1] === null || ind.nationalAverage === true;
      nationalIsAvg[ind.key] = isAvg;
      national[ind.key] = isAvg ? avg.map((v) => roundTo(v, d)) : nat.map((v) => roundTo(v, d));
      // 全国の値が47県の合計（件数・面積など）なら、グラフでは47県の平均とくらべる
      const lastNat = nat[nat.length - 1];
      const lastSum = avg[avg.length - 1] === null ? null : avg[avg.length - 1] * areaList.length;
      // 全国が47県の合計（差2%以内）か、どの県よりも大きい（平均ならあり得ない＝合計の類）なら「合計」とみなす
      const lastVals = areaList.map((a) => calcAt(a.c, useTimes[useTimes.length - 1])).filter((v) => v !== null);
      const lastMax = lastVals.length ? Math.max(...lastVals) : null;
      const isTotal = !isAvg && lastNat !== null && lastNat > 0 && ((lastSum !== null && Math.abs(lastNat - lastSum) / lastNat < 0.02) || (lastMax !== null && lastNat > lastMax * 1.05));
      nationalIsTotal[ind.key] = isTotal;
      prefAverage[ind.key] = avg.map((v) => roundTo(v, d));
    }

    // 10-18 市区町村の窓口でも、全国の値があれば持っておく（特化係数＝その町の割合÷全国の割合 に使う）
    let natFrom = null; // 全国の値の出どころ：'row'＝表の全国行、'sum'＝全市区町村の足し上げ、null＝無し
    if (scope === 'town') {
      const tLast = useTimes[useTimes.length - 1];
      let natT = calcAt('00000', tLast);
      natFrom = natT === null ? null : 'row';
      // 市区町村の表に全国の行が無いときは、計算で作る項目（分子・分母のコードがある割合）に限り、
      // 全市区町村（政令市の区を除く）のもとの数を足し上げてから同じ計算をして、全国の値とする
      if (natT === null && room.indicators.find((x) => x.key === ind.key)?.needs) {
        const sums = {};
        // 10-24 足し上げる相手は「その項目が計算できる地域」だけにする。
        // 市町村民税のように市と特別区にしか値がない項目で、分子を市だけ・分母を全市区町村で
        // 合計してしまうと、全国の値が低く出て、どの市も全国を大きく上回って見えてしまうため。
        const usable = areaList.filter((a) => !a.x && calcAt(a.c, tLast) !== null).map((a) => a.c);
        const sumOf = (code) => {
          if (code in sums) return sums[code];
          let tot = 0, n = 0;
          for (const c of usable) {
            const v = getter(c, tLast)(code);
            if (typeof v === 'number') { tot += v; n++; }
          }
          return (sums[code] = n ? tot : null);
        };
        try {
          const v = ind.calc(sumOf);
          natT = typeof v === 'number' && Number.isFinite(v) ? v * (ind.scale ?? 1) : null;
          natFrom = natT === null ? null : 'sum';
        } catch {
          natT = null;
        }
      }
      if (natT !== null) national[ind.key] = roundTo(natT, d + 1);
    }
    const unit = ind.unit ?? raws[baseCodes[0]].unit;
    indicatorsOut.push({
      key: ind.key,
      label: ind.label || raws[baseCodes[0]].name,
      unit,
      decimals: d,
      dir: ind.dir || 'desc',
      rankWord: ind.rankWord || '多い順',
      note: ind.note || '',
      years: useTimes.map((t) => t.slice(0, 4)),
      yearLabels: useTimes.map(timeNameOf),
      ...(perCapKind(room, ind, unit) ? { perCap: perCapKind(room, ind, unit) } : {}),
      ...((ind.lq ?? room.lq) && unit === '％' ? { lq: true } : {}),
      // 標本調査の誤差の目安（ind.se = [表, 項目, 年] か ['kakei', 行]。県の標準誤差率％。年があればその年の値にだけ添える）
      ...(ind.se ? { se: seForRoom(ind.se) } : {}),
    });

    // 10-24 台帳に1行。audit-data.mjs がここを読んで一覧と検算を出す
    {
      const tLast2 = useTimes[useTimes.length - 1];
      const have = areaList.filter((a) => !a.x && calcAt(a.c, tLast2) !== null).length;
      // もっと新しい時点が表にあるのに使えていないか（カバー率で落ちた＝§27の型）。maxYears は後ろから切るので新しい側は落とさない
      const tNew = times[times.length - 1];
      const missingAt = (t) => areaList.filter((a) => !a.x && calcAt(a.c, t) === null).map((a) => a.n);
      const newerUnused = tNew && tNew > tLast2
        ? { year: tNew.slice(0, 4), have: areaList.filter((a) => !a.x && calcAt(a.c, tNew) !== null).length, missing: missingAt(tNew) }
        : null;
      // 値のない地域の名前（注記に「どこに無いか」を書くための材料）。多いときは頭だけ
      const missing = have < rankCount ? missingAt(tLast2) : [];
      // carry を使う項目は、基準の年に対して実際どの年が拾われたかを見ておく（分母だけ古い、を見つけるため）
      const carryYears = {};
      for (const code of ind.carry) {
        const r = raws[code];
        const ys = new Set();
        for (const a of areaList) {
          if (a.x) continue;
          for (let i = r.times.length - 1; i >= 0; i--) {
            const tt = r.times[i];
            if (tt <= tLast2 && r.byTime[tt]?.[a.c] !== undefined) { ys.add(tt.slice(0, 4)); break; }
          }
        }
        carryYears[code] = [...ys].sort();
      }
      ledger.push({
        room: room.id, scope, key: ind.key, label: ind.label || raws[baseCodes[0]].name, dropped: false,
        needs: ind.needs.map(([t, c]) => [t, c]),
        estat: Object.fromEntries(ind.needs.map(([, c]) => [c, { name: raws[c]?.name || '', unit: raws[c]?.unit || '' }])),
        unit, unitFromRoom: ind.unit !== undefined, scale: ind.scale ?? 1, decimals: d,
        calcCustom: !!room.indicators.find((x) => x.key === ind.key)?.calc,
        carry: ind.carry, carryYears, onlyLatest: !!ind.onlyLatest, dashAsZero: !!room.dashAsZero,
        minCoverage: ind.minCoverage ?? room.minCoverage ?? null,
        years: useTimes.map((t) => t.slice(0, 4)), allYears: times.map((t) => t.slice(0, 4)),
        have, rankCount, need, coverage: rankCount ? have / rankCount : null, newerUnused, missing,
        nationalIsAvg: scope === 'pref' ? !!nationalIsAvg[ind.key] : undefined,
        nationalIsTotal: scope === 'pref' ? !!nationalIsTotal[ind.key] : undefined,
        national: scope === 'pref' ? national[ind.key]?.[national[ind.key].length - 1] ?? null : (national[ind.key] ?? null),
        natFrom: scope === 'town' ? natFrom : (nationalIsAvg[ind.key] ? 'avg' : 'row'),
        lastMin: (() => { const v = areaList.filter((a) => !a.x).map((a) => calcAt(a.c, tLast2)).filter((x) => x !== null); return v.length ? Math.min(...v) : null; })(),
        lastMax: (() => { const v = areaList.filter((a) => !a.x).map((a) => calcAt(a.c, tLast2)).filter((x) => x !== null); return v.length ? Math.max(...v) : null; })(),
        note: ind.note || '', roomNotes: room.notes || [],
      });
    }
  }

  // 10-18 人口あたりにそろえるための総人口（県＝毎年の推計、町＝国勢調査）。各地域のいちばん新しい値
  let pop;
  let popYear;
  if (indicatorsOut.some((i) => i.perCap)) {
    try {
      const pr = await fetchRaw(scope === 'pref' ? '0000010101' : '0000020101', 'A1101');
      const lastT = [...pr.times].reverse().find((t) => areaList.filter((a) => !a.x && pr.byTime[t]?.[a.c] > 0).length >= (scope === 'pref' ? 47 : rankCount * 0.8));
      if (lastT) {
        pop = {};
        for (const a of areaList) { const v = pr.byTime[lastT][a.c]; if (v > 0) pop[a.c] = v; }
        popYear = pr.timeNames[lastT] || lastT.slice(0, 4) + '年';
      }
    } catch (e) {
      console.warn(`[room-engine] ${room.id}: 総人口が取れないため、人口あたりは出しません（${e.message}）`);
    }
    if (!pop) for (const i of indicatorsOut) delete i.perCap;
  }

  const tables = [...new Set(inds.flatMap((i) => i.needs.map(([t]) => t)))];
  const out = {
    id: room.id,
    scope,
    generated: new Date().toISOString().slice(0, 10),
    source: room.source || `政府統計の総合窓口(e-Stat) 社会・人口統計体系 ${scope === 'pref' ? '都道府県' : '市区町村'}データ（表番号${tables.join('・')}）`,
    indicators: indicatorsOut,
    national: scope === 'pref' ? national : undefined,
    nationalLatest: scope === 'town' && Object.keys(national).length ? national : undefined,
    nationalIsAvg: scope === 'pref' ? nationalIsAvg : undefined,
    nationalIsTotal: scope === 'pref' ? nationalIsTotal : undefined,
    prefAverage: scope === 'pref' ? prefAverage : undefined,
    pop,
    popYear,
    // どの項目にも値のない地域（北方領土の村など）は、選ぶ欄に出さない
    areas: areaList
      .filter((a) => indicatorsOut.some((i) => (values[i.key][a.c] || []).some((v) => v !== null)))
      .map((a) => ({ c: a.c, n: a.n, ...(a.x ? { x: 1 } : {}), v: Object.fromEntries(indicatorsOut.map((i) => [i.key, values[i.key][a.c]])) })),
  };
  cache.set(room.id, out);
  return out;
}

// ページの出典欄用：指標ごとの年の範囲をまとめる
export function yearSummary(data) {
  const parts = data.indicators.map((i) => (i.years.length > 1 ? `${i.years[0]}〜${i.years[i.years.length - 1]}` : i.years[0]));
  const uniq = [...new Set(parts)];
  return uniq.length === 1 ? `${uniq[0]}年` : uniq.join('・') + '年';
}
