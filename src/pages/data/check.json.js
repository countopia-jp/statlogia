// =====================================================
// Countopia Stats - 数字の照合結果（ビルド時）
// src/pages/data/check.json.js → /data/check.json
// 照合で食い違い（error）が1つでもあればビルドを止める。warning は記録だけ。
// =====================================================
import { verifyAll } from '../../lib/verify-data.js';

export async function GET() {
  const res = await verifyAll();
  console.log(`[check] 照合 ${res.checked} 件、食い違い ${res.errors.length} 件、表示年の値なし ${res.warnings.length} 件`);
  if (res.errors.length) {
    for (const e of res.errors.slice(0, 50)) console.error('[check] ' + e);
    throw new Error(`[check] 表示する年の e-Stat の値と食い違う数字が ${res.errors.length} 件あります。ビルドを止めました。`);
  }
  return new Response(JSON.stringify(res), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
