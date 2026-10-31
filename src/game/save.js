const KEY = 'unico-farm-save-v1';

export function saveGame(game) {
  try {
    const data = {
      v: 1, at: Date.now(), name: game.playerName,
      farm: game.farm.sim.toJSON(), economy: game.economy.toJSON(), quests: game.quests.toJSON(), ranch: game.ranch.sim.toJSON(),
      world: { time: game.world.time, day: game.world.day },
      player: { x: game.player.position.x, z: game.player.position.z },
    };
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch { return false; }
}

export function loadSave() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}

export function clearSave() { try { localStorage.removeItem(KEY); } catch {} }
