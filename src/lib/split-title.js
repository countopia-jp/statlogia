// 展示の題を上下2段に分ける（10-18）
// 「〜、日本一はどの県だ」は「、」のあとで、「日本一「〜」県はどこだ」は「」」のあとで折る。
// 折れない題は [題, ''] を返す。
export function splitTitle(t = '') {
  const i = t.indexOf('、');
  if (i > 0 && i < t.length - 1) return [t.slice(0, i + 1), t.slice(i + 1)];
  const j = t.lastIndexOf('」');
  if (j > 0 && j < t.length - 1) {
    const k = t[j + 1] === 'な' ? j + 2 : j + 1;
    return [t.slice(0, k), t.slice(k)];
  }
  return [t, ''];
}
