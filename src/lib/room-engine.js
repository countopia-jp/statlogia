// =====================================================
// Countopia Stats - 閲覧室の共通エンジン
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
      const res = await fetch(`${API_BASE}/${path}?${qs.toString()}`, { signal: ctl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
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
async function fetchRaw(table, code) {
  const k = `${table}:${code}`;
  if (rawCache.has(k)) return rawCache.get(k);
  const json = await apiGet('getStatsData', {
    statsDataId: table,
    cdCat01: code,
    metaGetFlg: 'Y',
    cntGetFlg: 'N',
    annotationGetFlg: 'N',
    explanationGetFlg: 'N',
    replaceSpChars: '0',
  });
  const root = json.GET_STATS_DATA;
  if (!root || root.RESULT.STATUS !== 0) {
    throw new Error(`[room-engine] getStatsData失敗(${table} ${code}): ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  const sd = root.STATISTICAL_DATA;
  const objs = asArray(sd.CLASS_INF?.CLASS_OBJ);
  const areaNames = {};
  for (const c of asArray(objs.find((o) => o['@id'] === 'area')?.CLASS)) areaNames[c['@code']] = (c['@name'] || '').trim();
  const timeNames = {};
  for (const c of asArray(objs.find((o) => o['@id'] === 'time')?.CLASS)) timeNames[c['@code']] = (c['@name'] || '').trim();
  const cat = asArray(objs.find((o) => o['@id'] === 'cat01')?.CLASS).find((c) => c['@code'] === code);
  const byTime = {};
  const dash = {}; // 「-」（該当なし）だった欄。窓口の設定 dashAsZero:true のときだけ0として扱う
  for (const v of asArray(sd.DATA_INF?.VALUE)) {
    if (v['@cat01'] && v['@cat01'] !== code) continue;
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

const cache = new Map();

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

    // 揃っている時点だけを使う（県＝47すべて、町＝順位対象の半分以上）
    const need = scope === 'pref' ? 47 : Math.ceil(rankCount * 0.5);
    let useTimes = times.filter((t) => areaList.filter((a) => !a.x && calcAt(a.c, t) !== null).length >= need);
    useTimes = useTimes.slice(-maxYears);
    if (useTimes.length === 0) {
      console.warn(`[room-engine] ${room.id}/${ind.key}: 揃っている時点がないため外します`);
      continue;
    }

    const d = ind.decimals ?? 0;
    values[ind.key] = {};
    for (const a of areaList) values[ind.key][a.c] = useTimes.map((t) => roundTo(calcAt(a.c, t), d));

    if (scope === 'pref') {
      const nat = useTimes.map((t) => calcAt('00000', t));
      const isAvg = nat[nat.length - 1] === null || ind.nationalAverage === true;
      nationalIsAvg[ind.key] = isAvg;
      national[ind.key] = isAvg
        ? useTimes.map((t) => {
            const vs = areaList.map((a) => calcAt(a.c, t)).filter((v) => v !== null);
            return vs.length ? roundTo(vs.reduce((s, v) => s + v, 0) / vs.length, d) : null;
          })
        : nat.map((v) => roundTo(v, d));
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
    });
  }

  const tables = [...new Set(inds.flatMap((i) => i.needs.map(([t]) => t)))];
  const out = {
    id: room.id,
    scope,
    generated: new Date().toISOString().slice(0, 10),
    source: `政府統計の総合窓口(e-Stat) 社会・人口統計体系 ${scope === 'pref' ? '都道府県' : '市区町村'}データ（表番号${tables.join('・')}）`,
    indicators: indicatorsOut,
    national: scope === 'pref' ? national : undefined,
    nationalIsAvg: scope === 'pref' ? nationalIsAvg : undefined,
    areas: areaList.map((a) => ({ c: a.c, n: a.n, ...(a.x ? { x: 1 } : {}), v: Object.fromEntries(indicatorsOut.map((i) => [i.key, values[i.key][a.c]])) })),
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
