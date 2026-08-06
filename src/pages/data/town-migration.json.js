import { getMuniMigrationData } from '../../lib/muni-migration.js';

export async function GET() {
  const data = await getMuniMigrationData();
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
