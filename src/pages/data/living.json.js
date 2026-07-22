// =====================================================
// Countopia Stats - 暮らしデータ静的エンドポイント
// src/pages/data/living.json.js
//
// ビルド時に /data/living.json として静的出力される。
// 閲覧者のブラウザはこのJSONを読むだけで、e-Stat APIには
// 一切アクセスしない（appIdも露出しない）。
// =====================================================

import { getLivingData } from '../../lib/living.js';

export async function GET() {
  const data = await getLivingData();
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
