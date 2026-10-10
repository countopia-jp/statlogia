// 共通エンジンの窓口（src/data/rooms）で使うコードを catalog.js に登録する。
// 既にある指標は usedIn に窓口のパスを足すだけ。無ければ末尾に追加する。二度流しても同じ結果になる。
import fs from 'node:fs';
const { ROOMS } = await import('../src/data/rooms/index.js');
const { catalog } = await import('../src/data/catalog.js');
const file = new URL('../src/data/catalog.js', import.meta.url);
let src = fs.readFileSync(file, 'utf8');
const SYS_CAT = { A: 'population', B: 'nature', C: 'money', D: 'finance', E: 'education', F: 'work', G: 'culture', H: 'housing', I: 'health', J: 'welfare', K: 'safety', L: 'money', M: 'time' };
const added = [];
const touched = [];
for (const room of Object.values(ROOMS)) {
  for (const ind of room.indicators) {
    const needs = ind.needs || [[ind.table, ind.code]];
    for (const [table, code] of needs) {
      const scope = table.startsWith('000002') ? 'muni' : 'pref';
      const hit = catalog.find((c) => c.code === code && Object.values(c.statsDataId || {}).includes(table));
      if (hit) {
        if ((hit.usedIn || []).includes(room.path)) continue;
        const i = src.indexOf(`key: '${hit.key}'`);
        const j = src.indexOf('\n  },', i);
        const block = src.slice(i, j);
        const nb = block.replace(/usedIn: \[(.*?)\]/, (m, inner) => `usedIn: [${inner}${inner.trim() ? ', ' : ''}'${room.path}']`);
        src = src.slice(0, i) + nb + src.slice(j);
        hit.usedIn = [...(hit.usedIn || []), room.path];
        touched.push(`${hit.key} ← ${room.path}`);
        continue;
      }
      const key = `room-${code.toLowerCase()}-${scope}`;
      if (src.includes(`key: '${key}'`)) {
        const i = src.indexOf(`key: '${key}'`);
        const j = src.indexOf('\n  },', i);
        const block = src.slice(i, j);
        if (!block.includes(`'${room.path}'`)) src = src.slice(0, i) + block.replace(/usedIn: \[(.*?)\]/, (m, inner) => `usedIn: [${inner}, '${room.path}']`) + src.slice(j);
        continue;
      }
      const label = needs.length === 1 ? ind.label : `${code}（${ind.label}の計算に使用）`;
      const entry = `  {
    key: '${key}',
    label: '${label}',
    category: '${SYS_CAT[code[0]] || 'other'}',
    system: '${code[0]}',
    scope: '${scope}',
    statsDataId: { ${scope}: '${table}' },
    fetchMode: 'code',
    code: '${code}',
    unit: '${ind.unit ?? ''}',
    direction: 'neutral',
    points: 0,
    status: 'published',
    usedIn: ['${room.path}'],
  },
`;
      src = src.trimEnd().replace(/\];$/, '') + entry + '];\n';
      catalog.push({ key, code, statsDataId: { [scope]: table }, usedIn: [room.path] });
      added.push(key);
    }
  }
}
fs.writeFileSync(file, src);
console.log(`追加 ${added.length}件: ${added.join(' ')}`);
console.log(`usedIn追記 ${touched.length}件: ${touched.join(' / ')}`);
