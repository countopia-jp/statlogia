// =====================================================
// Statlogia - 数字の規模（玄関と出典一覧で使う）
// src/lib/counts.js
// catalog.js の公開済み指標のうち、この都市のページ（/exhibits/ 以外）で使っているものだけを数える。
// =====================================================
import { catalog } from '../data/catalog.js';

const live = catalog.filter((c) => c.status === 'published' && (c.usedIn || []).some((p) => !p.startsWith('/exhibits/')));

export const INDICATOR_COUNT = new Set(live.map((c) => c.key)).size;
export const TABLE_COUNT = new Set(live.flatMap((c) => Object.values(c.statsDataId || {}).filter(Boolean))).size;
