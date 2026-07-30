// =====================================================
// Countopia Stats - 自動車保有率データ取得モジュール
// src/lib/cars.js
//
// 社会・人口統計体系 都道府県データ 社会生活統計指標
//   L 家計  statsDataId: 0000010212
//   指標コード #L03607
//     自動車所有数量（二人以上の世帯）（千世帯当たり）[台]
//   ※社会生活統計指標のため cdCat01 に # プレフィックスが必須。
//   ※出典のおおもとは全国家計構造調査（旧・全国消費実態調査）。
//     二人以上の世帯・全自動車ベース（自家用乗用車限定ではない）。
//
// 表示は「1世帯当たり台数」に直すため 1000 で割る。
// rows/ national は他展示に合わせて {c,n,minutes} 形式（minutes=台/世帯）。
// =====================================================

const API_BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json';
const STATS_ID = '0000010212';
const CODE = '#L03607';
const RECENT_YEARS = 12;

let _cache = null;

function getAppId() {
  const appId = import.meta.env.ESTAT_APP_ID || process.env.ESTAT_APP_ID;
  if (!appId) throw new Error('[cars.js] ESTAT_APP_ID が設定されていません');
  return appId;
}

async function apiGet(path, params) {
  const qs = new URLSearchParams({ appId: getAppId(), lang: 'J', ...params });
  const res = await fetch(`${API_BASE}/${path}?${qs.toString()}`);
  if (!res.ok) throw new Error(`[cars.js] API HTTP ${res.status}: ${path}`);
  return await res.json();
}

const asArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);

async function fetchMeta() {
  const json = await apiGet('getMetaInfo', { statsDataId: STATS_ID });
  const root = json.GET_META_INFO;
  if (!root || root.RESULT.STATUS !== 0) {
    throw new Error(`[cars.js] getMetaInfo失敗: ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  const classObjs = asArray(root.METADATA_INF.CLASS_INF.CLASS_OBJ);
  const timeObj = classObjs.find((o) => o['@id'] === 'time');
  if (!timeObj) throw new Error('[cars.js] 時間軸メタが見つかりません');
  const times = asArray(timeObj.CLASS)
    .map((c) => ({ code: c['@code'], name: c['@name'] }))
    .sort((a, b) => b.code.localeCompare(a.code));
  return { times };
}

async function fetchStatsData(timeCodes) {
  const params = {
    statsDataId: STATS_ID,
    cdCat01: CODE,
    cdTime: timeCodes.map((t) => t.code).join(','),
    metaGetFlg: 'Y',
    cntGetFlg: 'N',
    annotationGetFlg: 'N',
    explanationGetFlg: 'N',
    replaceSpChars: '0',
  };
  const json = await apiGet('getStatsData', params);
  const root = json.GET_STATS_DATA;
  if (!root || root.RESULT.STATUS !== 0) {
    throw new Error(`[cars.js] getStatsData失敗: ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  return root.STATISTICAL_DATA;
}

export async function getCarData() {
  if (_cache) return _cache;

  const { times } = await fetchMeta();
  const recentTimes = times.slice(0, RECENT_YEARS);
  const timeNameByCode = {};
  for (const t of recentTimes) timeNameByCode[t.code] = t.name;

  const statData = await fetchStatsData(recentTimes);

  // 地域一覧（全国行も一旦登録し、あとで仕分ける）
  const areaObj = asArray(statData.CLASS_INF.CLASS_OBJ).find((o) => o['@id'] === 'area');
  const areas = new Map();
  if (areaObj) {
    for (const c of asArray(areaObj.CLASS)) {
      const code = c['@code'];
      const name = (c['@name'] || '').trim();
      if (!areas.has(code)) areas.set(code, { c: code, n: name, value: undefined });
    }
  }

  // 値（指標は1種類なので cat01 でキーせず、地域ごとに最新値を1つ拾う）
  let latestTime = null;
  const valueList = asArray(statData.DATA_INF.VALUE);
  valueList.sort((a, b) => b['@time'].localeCompare(a['@time']));
  for (const rec of valueList) {
    const area = areas.get(rec['@area']);
    if (!area) continue;
    const raw = rec['$'];
    if (raw === undefined || raw === null || raw === '' || raw === '-' || raw === '***' || raw === 'X') continue;
    const num = Number(String(raw).replace(/,/g, ''));
    if (!Number.isFinite(num)) continue;
    if (area.value === undefined) {
      area.value = num;
      if (!latestTime || rec['@time'] > latestTime) latestTime = rec['@time'];
    }
  }

  // 千世帯当たり → 1世帯当たり台数（小数2桁）
  const perHousehold = (v) => (v === undefined ? null : Math.round((v / 1000) * 100) / 100);

  const computed = [...areas.values()].map((a) => ({ c: a.c, n: a.n, minutes: perHousehold(a.value) }));

  const nationalEntry = computed.find((a) => /^0+$/.test(a.c) || a.n === '全国');
  let national = nationalEntry ? nationalEntry.minutes : null;

  const rows = computed
    .filter((a) => a !== nationalEntry && a.minutes !== null)
    .sort((a, b) => b.minutes - a.minutes);

  // 全国行が無い場合のみ、都道府県の単純平均で代替
  if (national === null && rows.length) {
    national = Math.round((rows.reduce((s, r) => s + r.minutes, 0) / rows.length) * 100) / 100;
  }

  _cache = {
    generated: new Date().toISOString().slice(0, 10),
    source: '政府統計の総合窓口(e-Stat) 社会・人口統計体系 都道府県データ 社会生活統計指標（表番号0000010212）',
    note: '二人以上の世帯・全自動車ベース（全国消費実態調査による。自家用乗用車に限らない）。都道府県別のこの項目は2014年度を最後に更新されていないため、表示は当時の数値です。',
    year: latestTime ? timeNameByCode[latestTime] || null : null,
    national,
    rows,
  };
  return _cache;
}