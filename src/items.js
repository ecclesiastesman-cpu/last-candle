// Генерация предметов, аффиксы, статы героя.
import { BASE_ITEMS, AFFIXES, UNIQUES, SETS, RARITY } from './data.js';

let uid = 1;
export const newUid = () => uid++;
export const setUidBase = v => { uid = Math.max(uid, v); };

const AFF_BY_ID = Object.fromEntries(AFFIXES.map(a => [a[0], a]));

// иконка с тиром по ilvl; refreshIcon чинит предметы из старых сейвов
const iconFor = (b, ilvl) => b.iconT ? b.iconT[ilvl < 9 ? 0 : ilvl < 20 ? 1 : 2] : b.icon;
export function refreshIcon(it) {
  const b = it && BASE_ITEMS[it.base];
  if (b) it.icon = iconFor(b, it.ilvl || 1);
}

export function rollAffix(rng, slot, ilvl, exclude) {
  const pool = AFFIXES.filter(a => (!a[1] || a[1].includes(slot) || (slot.startsWith('ring') && a[1].includes('ring'))) && !exclude.has(a[0]));
  if (!pool.length) return null;
  const a = rng.pick(pool);
  const [id, , stat, [mn, mx], grow, isPre, word, tpl] = a;
  const v = rng.range(mn, mx) + grow * ilvl * rng.range(.6, 1);
  return { id, stat, v, isPre, word, tpl };
}

export function makeItem(rng, ilvl, opts = {}) {
  const baseKey = opts.base || rng.pick(Object.keys(BASE_ITEMS));
  const base = BASE_ITEMS[baseKey];
  const slot = base.slot === 'ring' ? 'ring' : base.slot;
  // редкость
  let rarity = opts.rarity;
  if (!rarity) {
    const mf = 1 + (opts.magicFind || 0);
    const r = rng() * 100;
    if (r < RARITY.unique.chance * mf) rarity = 'unique';
    else if (r < (RARITY.unique.chance + RARITY.set.chance) * mf) rarity = 'set';
    else if (r < 14 * mf) rarity = 'rare';
    else if (r < 46 * mf) rarity = 'magic';
    else rarity = 'common';
  }
  if (rarity === 'unique') {
    const pool = UNIQUES.filter(u => u.lvl <= ilvl + 4 && (!opts.base || u.base === opts.base));
    if (pool.length) {
      const u = rng.pick(pool);
      return finalize({ base: u.base, rarity: 'unique', name: u.name, lore: u.lore, ilvl: Math.max(ilvl, u.lvl),
        stats: scaleFixed(u.fixed, rng), req: u.lvl });
    }
    rarity = 'rare';
  }
  if (rarity === 'set') {
    const spool = [];
    for (const s of SETS) if (s.lvl <= ilvl + 6) for (const it of s.items) if (!opts.base || it.base === opts.base) spool.push([s, it]);
    if (spool.length) {
      const [s, it] = rng.pick(spool);
      return finalize({ base: it.base, rarity: 'set', name: it.name, setId: s.id, ilvl: Math.max(ilvl, s.lvl - 4),
        stats: scaleFixed(it.fixed, rng), req: Math.max(1, s.lvl - 4) });
    }
    rarity = 'rare';
  }
  const item = { base: baseKey, rarity, ilvl, stats: {}, affixes: [], req: Math.max(1, Math.floor(ilvl * .8)) };
  if (rarity !== 'common') {
    const [mn, mx] = RARITY[rarity].affixes;
    const n = rng.int(mn, mx);
    const used = new Set();
    let pre = null, suf = null;
    for (let i = 0; i < n; i++) {
      const a = rollAffix(rng, slot, ilvl, used);
      if (!a) break;
      used.add(a.id);
      item.affixes.push(a);
      item.stats[a.stat] = (item.stats[a.stat] || 0) + a.v;
      if (a.isPre && !pre) pre = a.word; else if (!suf) suf = a.word;
    }
    item.name = (rarity === 'rare' ? rareName() : `${base.name}${pre ? ' ' + cap(pre) : ''}${suf ? ' ' + suf : ''}`);
    if (rarity === 'rare') item.typeName = base.name;
  } else item.name = base.name;
  return finalize(item);

  function finalize(it) {
    const b = BASE_ITEMS[it.base];
    it.id = newUid(); it.slot = b.slot; it.icon = iconFor(b, it.ilvl);
    if (b.dmg) { const s = 1 + it.ilvl * .14; it.dmg = [Math.round(b.dmg[0] * s), Math.round(b.dmg[1] * s)]; it.aspd = b.aspd; }
    if (b.armor) it.armor = Math.round(b.armor * (1 + it.ilvl * .11));
    if (b.block) it.block = b.block;
    if (b.twoHand) it.twoHand = true; if (b.ranged) it.ranged = true; if (b.caster) it.caster = true;
    if (b.spellDmg) it.stats.spellDmg = (it.stats.spellDmg || 0) + b.spellDmg;
    if (b.potions) it.stats.potions = (it.stats.potions || 0) + b.potions;
    it.price = Math.round((10 + it.ilvl * 6) * ({ common: 1, magic: 3, rare: 9, set: 25, unique: 30 })[it.rarity]);
    return it;
  }
  function scaleFixed(fixed, rng2) { const o = {}; for (const k in fixed) o[k] = fixed[k] * rng2.range(.9, 1.1); return o; }
  function rareName() {
    const A = ['Гибельный', 'Стонущий', 'Полуночный', 'Костяной', 'Кровавый', 'Пепельный', 'Вдовий', 'Волчий', 'Проклятый', 'Тлеющий'];
    const B = ['вой', 'клык', 'шёпот', 'страж', 'жнец', 'вестник', 'капкан', 'оскал', 'саван', 'коготь'];
    return `${rng.pick(A)} ${rng.pick(B)}`;
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
}

// Сводные статы героя из базы + шмота + пассивок + баффов.
export function computeStats(hero, CLASSES, SKILLS) {
  const cls = CLASSES[hero.cls];
  const s = {
    str: cls.base.str + hero.alloc.str, dex: cls.base.dex + hero.alloc.dex,
    int: cls.base.int + hero.alloc.int, vit: cls.base.vit + hero.alloc.vit,
    dmgFlat: 0, dmgMul: 0, aspd: 0, crit: 5, critDmg: .5, plusSkills: 0, leech: 0,
    hpFlat: 0, hpRegen: 1, armorFlat: 0, armorMul: 0, resFire: 0, resCold: 0, resLight: 0, resPoison: 0,
    moveMul: 0, goldFind: 0, magicFind: 0, thorns: 0, vsUndead: 0, vsDemon: 0, lightR: 0,
    potions: 3, spellDmg: 0, resMax: 0, cdr: 0, blockCh: 0, poisonOnHit: 0, lowHpArmor: 0,
    minionDmg: 0, minionHp: 0,
  };
  for (const slot in hero.equip) {
    const it = hero.equip[slot]; if (!it) continue;
    for (const k in it.stats) s[k] = (s[k] || 0) + it.stats[k];
    if (it.armor) s.armorFlat += it.armor;
    if (it.block) s.blockCh += it.block;
  }
  // сет-бонусы
  const setCount = {};
  for (const slot in hero.equip) { const it = hero.equip[slot]; if (it?.setId) setCount[it.setId] = (setCount[it.setId] || 0) + 1; }
  for (const set of SETS) {
    const n = setCount[set.id] || 0;
    if (n >= 2) for (const k in set.bonus2) s[k] = (s[k] || 0) + set.bonus2[k];
    if (n >= 3) for (const k in set.bonus3) { if (k !== 'lore') s[k] = (s[k] || 0) + set.bonus3[k]; }
  }
  // пассивные таланты
  for (const skId in hero.talents) {
    const rank = hero.talents[skId]; const sk = SKILLS[skId];
    if (sk?.passive && rank > 0) for (const k in sk.passive) s[k] = (s[k] || 0) + sk.passive[k] * rank;
  }
  // производные
  const wpn = hero.equip.weapon;
  const primary = s[cls.gain.dmgStat];
  s.wDmg = wpn?.dmg || [2, 4];
  s.dmgBase = (s.wDmg[0] + s.wDmg[1]) / 2 + s.dmgFlat;
  s.dmgTotal = s.dmgBase * (1 + primary * .012) * (1 + s.dmgMul);
  s.attackSpeed = (wpn?.aspd || 1.1) * (1 + s.aspd + s.dex * .0015);
  s.maxHp = Math.round(40 + s.vit * 3.2 + hero.level * cls.gain.hp + s.hpFlat);
  s.armor = Math.round((s.armorFlat + s.str * .4) * (1 + s.armorMul));
  s.maxRes = cls.resMax + s.resMax + (cls.resource === 'mana' ? s.int * .8 : 0);
  s.moveSpeed = 150 * (1 + s.moveMul + s.dex * .001);
  s.critCh = Math.min(75, s.crit + s.dex * .05);
  for (const r of ['resFire', 'resCold', 'resLight', 'resPoison']) s[r] = Math.min(75, s[r] + (s.resAll || 0));
  s.lightRadius = 320 * (1 + s.lightR);
  return s;
}
export const armorReduction = (armor, attackerLvl) => Math.min(.8, armor / (armor + 45 + 9 * attackerLvl));
