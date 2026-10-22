// =====================================================
// Statlogia - 教育データ静的エンドポイント
// src/pages/data/education.json.js
//
// ビルド時に /data/education.json として静的出力される。
// 閲覧者のブラウザはこのJSONを読むだけで、e-Stat APIには
// 一切アクセスしない（appIdも露出しない）。
// =====================================================

import { getEducationData } from '../../lib/education.js';

export async function GET() {
  const data = await getEducationData();
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
