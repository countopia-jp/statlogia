import { getMuniNurseryData } from '../../lib/muni-nursery.js';

export async function GET() {
  const data = await getMuniNurseryData();
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
