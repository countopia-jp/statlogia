// =====================================================
// Countopia Stats - 人口・世帯データ静的エンドポイント
// src/pages/data/population.json.js
//
// ビルド時に /data/population.json として静的出力される。
// 閲覧者のブラウザはこのJSONを読むだけで、e-Stat APIには
// 一切アクセスしない（appIdも露出しない）。
// =====================================================

import { getPopulationData } from '../../lib/population.js';

export async function GET() {
  const data = await getPopulationData();
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
