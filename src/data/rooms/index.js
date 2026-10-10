// 共通エンジンで動く閲覧室の登録簿。ここに足すと /data/room-<id>.json が出力される。
import { SKY } from './sky.js';
import { DISASTER } from './disaster.js';
import { TOWN_FOREST } from './town-forest.js';
import { NATURE } from './nature.js';

export const ROOMS = Object.fromEntries([SKY, DISASTER, TOWN_FOREST, NATURE].map((r) => [r.id, r]));
