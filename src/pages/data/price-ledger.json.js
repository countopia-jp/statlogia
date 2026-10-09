// =====================================================
// Countopia Stats - 物価の帳場データ静的エンドポイント
// src/pages/data/price-ledger.json.js
//
// ビルド時に /data/price-ledger.json として静的出力される。
// 閲覧者のブラウザはこのJSONを読むだけで、e-Stat APIには
// 一切アクセスしない（appIdも露出しない）。
// =====================================================

import { getPriceLedgerData } from '../../lib/price-ledger.js';

export async function GET() {
  const data = await getPriceLedgerData();
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
