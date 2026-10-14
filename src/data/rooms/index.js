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
import { FIRE_EMS } from './fire-ems.js';
import { CULTURE } from './culture.js';
import { TOWN_ELDERLY } from './town-elderly.js';
import { TOWN_KIDS } from './town-kids.js';
import { TOWN_INDUSTRY } from './town-industry.js';
import { TOWN_WORKPLACE } from './town-workplace.js';
import { SPORTS_FIELDS } from './sports-fields.js';
import { VOLUNTEER } from './volunteer.js';
import { LEISURE } from './leisure.js';
import { PREF_SPENDING } from './pref-spending.js';
import { APPLIANCES } from './appliances.js';
import { LIBRARY } from './library.js';
import { TOWN_FARM } from './town-farm.js';
import { TOWN_BUSINESS_SIZE } from './town-business-size.js';

export const ROOMS = Object.fromEntries([SKY, DISASTER, TOWN_FOREST, NATURE, TOWN_WORK, TOWN_SHOPS, FARM_SEA, STAY, LAND_PRICE, WORK_STYLE, PREF_ECONOMY, HOUSEHOLD, FIRE_EMS, CULTURE, TOWN_ELDERLY, TOWN_KIDS, TOWN_INDUSTRY, TOWN_WORKPLACE, SPORTS_FIELDS, LIBRARY, TOWN_FARM, TOWN_BUSINESS_SIZE, VOLUNTEER, LEISURE, PREF_SPENDING, APPLIANCES].map((r) => [r.id, r]));
