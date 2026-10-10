// 共通エンジンで動く閲覧室の登録簿。ここに足すと /data/room-<id>.json が出力される。
import { SKY } from './sky.js';
import { DISASTER } from './disaster.js';
import { TOWN_FOREST } from './town-forest.js';
import { NATURE } from './nature.js';
import { TOWN_WORK } from './town-work.js';
import { TOWN_SHOPS } from './town-shops.js';
import { FARM_SEA } from './farm-sea.js';
import { STAY } from './stay.js';
import { LAND_PRICE } from './land-price.js';
import { WORK_STYLE } from './work-style.js';
import { PREF_ECONOMY } from './pref-economy.js';
import { HOUSEHOLD } from './household.js';

export const ROOMS = Object.fromEntries([SKY, DISASTER, TOWN_FOREST, NATURE, TOWN_WORK, TOWN_SHOPS, FARM_SEA, STAY, LAND_PRICE, WORK_STYLE, PREF_ECONOMY, HOUSEHOLD].map((r) => [r.id, r]));
