import * as THREE from 'three';
import { ITEMS } from '../sim/items.js';
import { CROPS, PRODUCTS } from '../sim/crops.js';
import { COSTUMES } from '../sim/costume.js';
import { DECOR } from '../sim/decor.js';
import { fishIcon } from './fish.js';
import { bugIcon } from './bugs.js';
import { fruitIcon, cropIcon, productIcon } from './fruit.js';
import { goodsIcon } from './goods.js';

/**
 * 아이템 아이콘 굽기 목록 (scripts/bake-item-icons.mjs 가 브라우저에서 불러 씀, 게임 실행 중에는 안 씀)
 * 열쇠 이름 규칙 (src/ui/item_icons.gen.js 의 CELLS 와 같음)
 *  - ITEMS(sim/items.js) · 작물(CROPS) · 목장 생산물(PRODUCTS): 원래 id 그대로 (예: fish_carp, carrot, egg)
 *  - 사료: feed · 코스튬: costume:<id> · 꾸미기: decor:<id>
 * 분류 이름: ITEMS 의 cat (fish, bug, fruit, goods, ranch, treasure, rice, seed) + crop, product, feed, costume, decor
 */
export { THREE };
export { ICON_VIEW } from './kit.js';
export { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/** 분류 → 열쇠 목록 (아이템이 늘면 여기도 저절로 늘어남 → 구울 수 없는 분류는 CATS_DONE 에서 빠짐) */
export function iconCats() {
  const out = {};
  for (const [k, it] of Object.entries(ITEMS)) (out[it.cat] ||= []).push(k);
  out.crop = Object.keys(CROPS);
  out.product = Object.keys(PRODUCTS);
  out.feed = ['feed'];
  out.costume = COSTUMES.map((c) => 'costume:' + c.id);
  out.decor = DECOR.map((d) => 'decor:' + d.id);
  return out;
}

/** 열쇠 → 메시를 만드는 함수 (없으면 null: 그 열쇠의 분류는 아직 다 구울 수 없음) */
export function iconBuilder(key, cat) {
  if (cat === 'fish') return () => fishIcon(key);
  if (cat === 'bug') return () => bugIcon(key);
  if (cat === 'fruit') return () => fruitIcon(key);
  if (cat === 'crop') return () => cropIcon(key);
  if (cat === 'product') return () => productIcon(key);
  if (cat === 'costume') return async () => (await import('./bust.js')).costumeBust(key.slice(8));
  if (cat === 'decor') return async () => (await import('./decor.js')).decorIcon(key.slice(6));
  return () => goodsIcon(key);
}

/** 굽기 전에 한 번: 모델·캐릭터 메시를 받아 둠 (꾸미기·코스튬만 필요) */
export async function prepareIcons(cats) {
  if (cats.includes('decor')) await (await import('./decor.js')).prepareDecor();
  if (cats.includes('costume')) await (await import('./bust.js')).prepareBust();
}
