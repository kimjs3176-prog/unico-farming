const KEY = 'unico-farm-save-v1';
let blocked = false; // 초기화(clearSave) 뒤 새로 불러오기 전까지 저장 막음: 떠날 때 저장(숨김·pagehide)이 지운 농장을 되살리지 않게

export function saveGame(game) {
  if (blocked) return false;
  try {
    const data = {
      v: SAVE_VERSION, at: Date.now(), name: game.playerName,
      farm: game.farm.sim.toJSON(), economy: game.economy.toJSON(), quests: game.quests.toJSON(), ranch: game.ranch.toJSON(),
      rice: game.rice.toJSON(), nature: game.nature.toJSON(), villagers: game.villagers.toJSON(), collection: game.collection.toJSON(), koat: game.koat.toJSON(),
      world: { time: game.world.time, day: game.world.day },
      player: game.home?.inside ? { ...game.home.outPos } : { x: game.player.position.x, z: game.player.position.z }, // 집 안이면 문 앞으로 저장
      flags: game.flags || {},
      explore: game.explore?.toJSON(),
      bees: game.bees?.toJSON(),
      angling: game.angling?.toJSON(),
      farmcraft: game.farmcraft?.toJSON(),
      town: game.town?.toJSON(),
      home: game.home?.toJSON(),
      costume: game.costume?.toJSON(),
      social: game.social?.toJSON(),
      decor: game.decor?.toJSON(),
      pet: game.pet?.ok ? game.pet.toJSON() : undefined,
    };
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch { return false; }
}

const SAVE_VERSION = 1;
/** 저장 포맷이 바뀌면 여기에 v(n-1) → v(n) 변환을 추가 (vendored skill `save-systems` 의 버전/마이그레이션 패턴) */
const MIGRATIONS = {
  // 2: (d) => ({ ...d, v: 2 }),
};

export function migrate(data) {
  if (!data) return null;
  let d = data;
  for (let v = d.v || 1; v < SAVE_VERSION; v++) d = MIGRATIONS[v + 1] ? MIGRATIONS[v + 1](d) : { ...d, v: v + 1 };
  return d;
}

export function loadSave() {
  try { return migrate(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch { return null; }
}

export function clearSave() { blocked = true; try { localStorage.removeItem(KEY); } catch {} }
