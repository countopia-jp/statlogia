import { getMuniPopulationData } from '../../lib/muni-population.js';

export async function GET() {
  const data = await getMuniPopulationData();
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
