// =====================================================
// Countopia Stats - 値と年を組で持つための小さな道具
// src/lib/year-pick.js
//
// 項目（コード）ごとに、地域×年の値を全部ためておき、
// 「その項目の値がそろっている、いちばん新しい年」を1つ決めて、全地域その年の値を使う。
// （地域ごとに最新を拾うと、地域によって年がばらばらになり、見出しの年と合わなくなるため）
// そろっている＝その項目で値のある地域の数が、いちばん多い年の share（既定8割）以上ある年。
// =====================================================
export function makeYearBook() {
  const hist = {}; // code -> time -> area -> value
  return {
    add(code, time, area, value) { ((hist[code] ??= {})[time] ??= {})[area] = value; },
    // その項目の採用年
    pick(code, share = 0.8) {
      const byTime = hist[code];
      if (!byTime) return null;
      const counts = Object.entries(byTime).map(([t, m]) => [t, Object.keys(m).length]);
      const max = Math.max(...counts.map(([, n]) => n));
      const ok = counts.filter(([, n]) => n >= max * share).map(([t]) => t).sort();
      return ok.at(-1) ?? null;
    },
    // 採用年の値（なければ null）
    at(code, time, area) { return time ? hist[code]?.[time]?.[area] ?? null : null; },
    times(code) { return Object.keys(hist[code] || {}).sort(); },
  };
}

// 「総人口・高齢化率は2020年度、世帯数は2023年度」のように、項目ごとの年をまとめた文
export function yearsText(indicators, nameOf = (i) => i.key || i.label) {
  const byYear = new Map();
  for (const i of indicators) if (i.year) (byYear.get(i.year) || byYear.set(i.year, []).get(i.year)).push(nameOf(i));
  if (byYear.size <= 1) return [...byYear.keys()][0] || '';
  return [...byYear.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([y, ns]) => `${ns.join('・')}は${y}`).join('、');
}
