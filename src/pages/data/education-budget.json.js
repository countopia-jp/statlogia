// =====================================================
// Statlogia - 教育予算・財政力データ静的エンドポイント
// src/pages/data/education-budget.json.js
//
// ビルド時に /data/education-budget.json として静的出力される。
// 閲覧者のブラウザはこのJSONを読むだけで、e-Stat APIには
// 一切アクセスしない（appIdも露出しない）。
// =====================================================

import { getEducationBudgetData } from '../../lib/education-budget.js';

export async function GET() {
  const data = await getEducationBudgetData();
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
