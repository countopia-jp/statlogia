// =====================================================
// Statlogia - 学校情報化データ 静的エンドポイント
// src/pages/data/ict.json.js
//
// ビルド時に /data/ict.json として静的出力される。
// 閲覧者のブラウザはこのJSONを読むだけで、e-Stat APIには
// 一切アクセスしない（appIdも露出しない）。
// =====================================================

import { getIctData } from '../../lib/ict.js';

export async function GET() {
  const data = await getIctData();
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}