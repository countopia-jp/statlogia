// =====================================================
// Countopia Stats - 市区町村版 人口の動き（社会増減）取得モジュール
// src/lib/muni-migration.js
//   社会・人口統計体系 市区町村データ 基礎データ A人口 0000020101（# 不要）
//   社会増減 = 転入(A5101) − 転出(A5102)。率は人口千人あたりで自作計算。
//   地域の扱いは muni-population.js に準拠。
//   転入・転出は総人口と違い、データのある年度が揃わない場合があるため、
//   カード・コメント・時系列グラフはすべて「3指標が揃っている最新年度」で統一する。
//   3指標×全市区町村を1回でまとめて取得するとe-Statの取得上限を超えて
//   データが途中で切り詰められるため、指標ごとに別々のAPIリクエストに分けている。
// =====================================================

const API_BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json';
const STATS_ID = '0000020101';
const RECENT_YEARS = 40; // 指標ごとに別々のAPIリクエストに分けるので、単一指標なら安全に取得できる件数

const FETCH = ['A1101', 'A5101', 'A5102'];

export const INDICATORS = [
  { key: '総人口',       unit: '人',           kind: 'base', code: 'A1101' },
  { key: '転入者数',     unit: '人',           kind: 'base', code: 'A5101' },
  { key: '転出者数',     unit: '人',           kind: 'base', code: 'A5102' },
  { key: '社会増減',     unit: '人',           kind: 'rate', signed: true,
    calc: (v) => (v.A5101 != null && v.A5102 != null ? v.A5101 - v.A5102 : null) },
  { key: '社会増減率',   unit: '（千人あたり）', kind: 'rate', signed: true, decimal: true,
    calc: (v) => per1000(v.A5101 != null && v.A5102 != null ? v.A5101 - v.A5102 : null, v.A1101) },
];

// 時系列グラフ・カード・コメントすべてで、この3指標が揃っている年度だけを「その地域の正式な最新値」とする
const SERIES_CODES = ['A1101', 'A5101', 'A5102'];

function per1000(delta, pop) {
  if (delta == null || pop == null || pop === 0) return null;
  return Math.round((delta / pop) * 1000 * 10) / 10; // 千人あたり・小数1桁（符号つき）
}

let _cache = null;

function getAppId() {
  const appId = import.meta.env.ESTAT_APP_ID || process.env.ESTAT_APP_ID;
  if (!appId) throw new Error('[muni-migration.js] ESTAT_APP_ID が設定されていません');
  return appId;
}

async function apiGet(path, params) {
  const qs = new URLSearchParams({ appId: getAppId(), lang: 'J', ...params });
  const res = await fetch(`${API_BASE}/${path}?${qs.toString()}`);
  if (!res.ok) throw new Error(`[muni-migration.js] API HTTP ${res.status}: ${path}`);
  return await res.json();
}

const asArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);

function classifyArea(code, name) {
  const nm = (name || '').trim();
  if (code === '00000' || nm === '全国') return 'exclude';
  if (/^\d{2}000$/.test(code)) return 'exclude';
  if (/（旧|\(旧/.test(nm)) return 'exclude';
  if (code === '13100') return 'x';
  if (/^\d{2}1\d\d$/.test(code) && !code.endsWith('100')) return 'x';
  return 'rank';
}

async function fetchMeta() {
  const json = await apiGet('getMetaInfo', { statsDataId: STATS_ID });
  const root = json.GET_META_INFO;
  if (!root || root.RESULT.STATUS !== 0) {
    throw new Error(`[muni-migration.js] getMetaInfo失敗: ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  const timeObj = asArray(root.METADATA_INF.CLASS_INF.CLASS_OBJ).find((o) => o['@id'] === 'time');
  if (!timeObj) throw new Error('[muni-migration.js] 時間軸メタが見つかりません');
  const times = asArray(timeObj.CLASS)
    .map((c) => ({ code: c['@code'], name: c['@name'] }))
    .sort((a, b) => b.code.localeCompare(a.code));
  return { times };
}

async function fetchStatsData(codes, timeCodes) {
  const params = {
    statsDataId: STATS_ID,
    cdCat01: codes.join(','),
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
    throw new Error(`[muni-migration.js] getStatsData失敗: ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  return root.STATISTICAL_DATA;
}

export async function getMuniMigrationData() {
  if (_cache) return _cache;

  const { times } = await fetchMeta();
  const recentTimes = times.slice(0, RECENT_YEARS);
  const timeNameByCode = {};
  for (const t of recentTimes) timeNameByCode[t.code] = t.name;

  const areas = new Map();

  // 指標ごとに別々のAPIリクエストに分ける（1リクエストあたりの件数を抑え、e-Statの取得上限を超えないようにする）
  for (const code of FETCH) {
    const statData = await fetchStatsData([code], recentTimes);

    const areaObj = asArray(statData.CLASS_INF.CLASS_OBJ).find((o) => o['@id'] === 'area');
    if (areaObj) {
      for (const c of asArray(areaObj.CLASS)) {
        const areaCode = c['@code'];
        const name = (c['@name'] || '').trim();
        const kind = classifyArea(areaCode, name);
        if (kind === 'exclude') continue;
        if (!areas.has(areaCode)) areas.set(areaCode, { c: areaCode, n: name, x: kind === 'x', h: {} });
      }
    }

    const valueList = asArray(statData.DATA_INF.VALUE);
    // 履歴を時系列順（古い→新しい）で積みたいので昇順ソート
    valueList.sort((a, b) => a['@time'].localeCompare(b['@time']));
    for (const rec of valueList) {
      const area = areas.get(rec['@area']);
      if (!area) continue;
      const cat = rec['@cat01'];
      const raw = rec['$'];
      if (raw === undefined || raw === null || raw === '' || raw === '-' || raw === '***' || raw === 'X') continue;
      const num = Number(String(raw).replace(/,/g, ''));
      if (!Number.isFinite(num)) continue;

      // 年度ごとにまとめて蓄積（3指標が揃う年度だけ後で採用する）
      if (!area.h[rec['@time']]) area.h[rec['@time']] = {};
      area.h[rec['@time']][cat] = num;
    }
  }

  let overallLatestCompleteTime = null;

  const areaList = [...areas.values()]
    .map((a) => {
      // 3指標（総人口・転入・転出）すべてが揃っている年度だけを対象にする
      const completeTimes = Object.keys(a.h)
        .filter((t) => SERIES_CODES.every((c) => a.h[t][c] !== undefined))
        .sort();

      const latestComplete = completeTimes[completeTimes.length - 1] || null;
      if (latestComplete && (!overallLatestCompleteTime || latestComplete > overallLatestCompleteTime)) {
        overallLatestCompleteTime = latestComplete;
      }

      // カード・コメント用の値は「揃っている最新年度」のスナップショットから作る
      const snapshot = latestComplete ? a.h[latestComplete] : {};
      const v = INDICATORS.map((ind) =>
        ind.kind === 'base'
          ? (snapshot[ind.code] !== undefined ? snapshot[ind.code] : null)
          : ind.calc(snapshot)
      );

      // 時系列グラフ：揃っている年度ぶんすべての社会増減率
      const series = completeTimes.map((time) => {
        const snap = a.h[time];
        const delta = snap.A5101 - snap.A5102;
        const rate = per1000(delta, snap.A1101);
        return { year: timeNameByCode[time] || time, value: rate };
      });

      return { c: a.c, n: a.n, x: a.x, v, series };
    })
    .filter((a) => a.v.some((val) => val !== null))
    .sort((a, b) => a.c.localeCompare(b.c));

  _cache = {
    generated: new Date().toISOString().slice(0, 10),
    source: '政府統計の総合窓口(e-Stat) 社会・人口統計体系 市区町村データ 基礎データ（表番号0000020101）',
    note: '社会増減＝転入者数−転出者数。率は人口千人あたり。日本人移動者ベース。総人口・転入・転出の3指標が揃っている年度の値のみ採用しています。区・特別区部計はランキング除外（選択には表示）。',
    year: overallLatestCompleteTime ? timeNameByCode[overallLatestCompleteTime] || null : null,
    indicators: INDICATORS.map((i) => ({ key: i.key, unit: i.unit, kind: i.kind, signed: !!i.signed, decimal: !!i.decimal })),
    areas: areaList,
  };
  return _cache;
}