// e-Stat APIからデータを取得するビルド時ユーティリティ
const APP_ID = import.meta.env.ESTAT_APP_ID ?? process.env.ESTAT_APP_ID;

const BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData';

// 統計表 0003457337（社会生活基本調査 68-1-2）を1回だけ取得して使い回すキャッシュ
let cachedData = null;

async function fetchTable() {
  if (cachedData) return cachedData;
  const url = `${BASE}?appId=${APP_ID}&lang=J&statsDataId=0003457337&metaGetFlg=Y&cntGetFlg=N`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`e-Stat API error: ${res.status}`);
  const json = await res.json();
  cachedData = json.GET_STATS_DATA.STATISTICAL_DATA;
  return cachedData;
}

// 指定した行動・男女区分の都道府県別・週全体の総平均時間を取得する共通関数
async function fetchActivityByPrefecture(activityWord, sexWord = '総数') {
  const data = await fetchTable();

  const axes = [];
  for (const obj of data.CLASS_INF.CLASS_OBJ) {
    const cls = Array.isArray(obj.CLASS) ? obj.CLASS : [obj.CLASS];
    axes.push({
      id: obj['@id'],
      name: obj['@name'],
      map: Object.fromEntries(cls.map((c) => [c['@code'], c['@name']])),
    });
  }

  const findAxis = (word) =>
    axes.find((a) => Object.values(a.map).some((n) => n.includes(word)));

  const koudouAxis = findAxis('睡眠');
  const youbiAxis  = findAxis('週全体');
  const areaAxis   = axes.find((a) => a.id === 'area');
  const danjoAxis  = axes.find((a) => a.name.includes('男女'));
  const chikuAxis  = axes.find((a) => a.name.includes('人口集中'));

  const nameOf = (axis, v) =>
    axis ? axis.map[v['@' + axis.id]] ?? '' : '';

  const values = data.DATA_INF.VALUE;
  const rows = [];
  for (const v of values) {
    const koudou = nameOf(koudouAxis, v);
    const youbi  = nameOf(youbiAxis, v);
    const area   = nameOf(areaAxis, v);
    const danjo  = nameOf(danjoAxis, v);
    const chiku  = nameOf(chikuAxis, v);

    if (
      koudou.includes(activityWord) &&
      youbi.includes('週全体') &&
      (!danjoAxis || danjo.includes(sexWord)) &&
      (!chikuAxis || chiku.includes('総数')) &&
      area && !area.includes('全国')
    ) {
      const num = Number(v['$']);
      if (!Number.isNaN(num)) rows.push({ pref: area, minutes: num });
    }
  }

  return rows;
}

// 睡眠時間（短い順 = 眠らない順）
export async function fetchSleepByPrefecture() {
  const rows = await fetchActivityByPrefecture('睡眠');
  rows.sort((a, b) => a.minutes - b.minutes);
  return rows;
}

// 通勤・通学時間（長い順 = 通勤がつらい順）
export async function fetchCommuteByPrefecture() {
  const rows = await fetchActivityByPrefecture('通勤・通学');
  rows.sort((a, b) => b.minutes - a.minutes);
  return rows;
}

// 家事時間・男女別（女性の長い順）
export async function fetchHouseworkBySex() {
  const women = await fetchActivityByPrefecture('家事', '女');
  const men = await fetchActivityByPrefecture('家事', '男');
  const menMap = Object.fromEntries(men.map((r) => [r.pref, r.minutes]));
  const rows = women.map((w) => ({
    pref: w.pref,
    women: w.minutes,
    men: menMap[w.pref] ?? 0,
    gap: w.minutes - (menMap[w.pref] ?? 0),
  }));
  rows.sort((a, b) => b.gap - a.gap); // 男女差の大きい順
  return rows;
}
// 趣味・娯楽の時間（長い順 = 遊んでる順）
export async function fetchHobbyByPrefecture() {
  const rows = await fetchActivityByPrefecture('趣味・娯楽');
  rows.sort((a, b) => b.minutes - a.minutes);
  return rows;
}

// 学習・自己啓発・訓練の時間（長い順 = 学ぶ順）
export async function fetchStudyByPrefecture() {
  const rows = await fetchActivityByPrefecture('学習・自己啓発');
  rows.sort((a, b) => b.minutes - a.minutes);
  return rows;
}
