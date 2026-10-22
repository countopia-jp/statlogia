// =====================================================
// Statlogia - 数字の照合結果（ビルド時）
// src/pages/data/check.json.js → /data/check.json
// 照合で食い違い（error）が1つでもあればビルドを止める。warning は記録だけ。
// SKIP_CHECK=1（npm run build:quick）のときは照合を飛ばす。数字の取り方を変えたときは必ずふつうの npm run build で照合すること。
// =====================================================
import { verifyAll } from '../../lib/verify-data.js';

export async function GET() {
  // 見た目だけを直したときなどは npm run build:quick（SKIP_CHECK=1）で照合を飛ばせる（照合は約20分かかる）
  if (process.env.SKIP_CHECK === '1') {
    console.log('[check] SKIP_CHECK=1 のため照合を飛ばしました');
    return new Response(JSON.stringify({ skipped: true, checked: 0, errors: [], warnings: [] }), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  }
  const res = await verifyAll();
  console.log(`[check] 照合 ${res.checked} 件、食い違い ${res.errors.length} 件、表示年の値なし ${res.warnings.length} 件`);
  for (const w of res.warnings.filter((w) => w.includes('つながらず'))) console.warn('[check] ' + w);
  if (res.errors.length) {
    for (const e of res.errors.slice(0, 50)) console.error('[check] ' + e);
    throw new Error(`[check] 表示する年の e-Stat の値と食い違う数字が ${res.errors.length} 件あります。ビルドを止めました。`);
  }
  return new Response(JSON.stringify(res), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
