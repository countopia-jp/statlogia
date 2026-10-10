// =====================================================
// Countopia Stats - 閲覧室（共通エンジン）の静的エンドポイント
// src/pages/data/room-[id].json.js
// /data/room-<id>.json としてビルド時に出力される（ブラウザは e-Stat に触れない）
// =====================================================
import { ROOMS } from '../../data/rooms/index.js';
import { getRoomData } from '../../lib/room-engine.js';

export function getStaticPaths() {
  return Object.keys(ROOMS).map((id) => ({ params: { id } }));
}

export async function GET({ params }) {
  const data = await getRoomData(ROOMS[params.id]);
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
