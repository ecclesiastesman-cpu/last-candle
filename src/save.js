// Сохранения: localStorage, автосейв. Версионирование на будущее.
const KEY = 'lastcandle_save_v1';

export function saveGame(g) {
  try {
    const h = g.hero;
    const data = {
      v: 1, ts: Date.now(),
      hero: {
        cls: h.cls, level: h.level, xp: h.xp, xpNext: h.xpNext,
        statPts: h.statPts, talentPts: h.talentPts, alloc: h.alloc, talents: h.talents,
        gold: h.gold, potionCharges: h.potionCharges,
        equip: h.equip, inventory: h.inventory, skillBar: h.skillBar,
      },
      stash: g.stash,
      quest: g.quest,
      progress: g.progress, // { act, floor, unlockedActs, cleared, difficulty, riftLvl }
      settings: g.settings,
      seedBase: g.seedBase,
      uid: g.nextUid(),
    };
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch { return false; }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (d.v !== 1 || !d.hero?.cls) return null;
    return d;
  } catch { return null; }
}

export function wipeSave() { try { localStorage.removeItem(KEY); } catch {} }
export function hasSave() { return !!loadGame(); }
