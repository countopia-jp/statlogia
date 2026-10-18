// /data/shift-share.json（シフトシェア分析用。ビルド時に出力）
import { getShiftShareData } from '../../lib/shift-share.js';
export async function GET() {
  const data = await getShiftShareData();
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
