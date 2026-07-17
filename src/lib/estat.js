// e-Stat APIからデータを取得するビルド時ユーティリティ
const APP_ID = import.meta.env.ESTAT_APP_ID ?? process.env.ESTAT_APP_ID;

const BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData';

export async function fetchSleepByPrefecture() {
  const url = `${BASE}?appId=${APP_ID}&lang=J&statsDataId=0003457337&metaGetFlg=Y&cntGetFlg=N`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`e-Stat API error: ${res.status}`);
  const json = await res.json();

  const data = json.GET_STATS_DATA.STATISTICAL_DATA;

  // メタ情報からコード→名前の対応表を作る
  const classMaps = {};
  for (const obj of data.CLASS_INF.CLASS_OBJ) {
    const cls = Array.isArray(obj.CLASS) ? obj.CLASS : [obj.CLASS];
    classMaps[obj['@id']] = Object.fromEntries(
      cls.map((c) => [c['@code'], c['@name']])
    );
  }

  // 値を絞り込み: 週全体 × 男女総数 × 地区総数 × 睡眠 × 都道府県のみ
  const values = data.DATA_INF.VALUE;
  const rows = [];
  for (const v of values) {
    const youbi = classMaps['cat02']?.[v['@cat02']] ?? '';
    const danjo = classMaps['cat03']?.[v['@cat03']] ?? '';
    const chiku = classMaps['cat04']?.[v['@cat04']] ?? '';
    const koudou = classMaps['cat01']?.[v['@cat01']] ?? '';
    const area = classMaps['area']?.[v['@area']] ?? '';

    if (
      youbi.includes('週全体') &&
      danjo.includes('総数') &&
      chiku.includes('総数') &&
      koudou.includes('睡眠') &&
      area !== '全国'
    ) {
      rows.push({ pref: area, minutes: Number(v['$']) });
    }
  }

  rows.sort((a, b) => a.minutes - b.minutes); // 短い順 = 眠らない順
  return rows;
}
