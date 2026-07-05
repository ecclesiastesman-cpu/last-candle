// Игровые данные: классы, навыки, таланты, монстры, предметы, аффиксы, акты.
// Все балансовые числа живут здесь (правится без кода).

export const TILE = 64;
export const MAXLEVEL = 40;
export const XP_CURVE = lvl => Math.floor(60 * lvl * Math.pow(1.09, lvl - 1)); // ~6*lvl убийств на уровень

export const CLASSES = {
  barbarian: {
    resource: 'fury', resMax: 100, resRegen: -4, resOnHit: 12, // ярость копится от ударов, распадается
    base: { str: 25, dex: 12, int: 8, vit: 22 }, gain: { hp: 9, dmgStat: 'str' },
    weapons: ['axe', 'sword2h', 'dagger'], sprite: 'hero_barbarian', baseWeapon: 'wpn_axe',
  },
  huntress: {
    resource: 'focus', resMax: 80, resRegen: 9,
    base: { str: 12, dex: 26, int: 10, vit: 16 }, gain: { hp: 6.5, dmgStat: 'dex' },
    weapons: ['bow'], sprite: 'hero_huntress', baseWeapon: 'wpn_bow',
  },
  mage: {
    resource: 'mana', resMax: 120, resRegen: 10,
    base: { str: 8, dex: 12, int: 28, vit: 13 }, gain: { hp: 5.5, dmgStat: 'int' },
    weapons: ['staff', 'dagger'], sprite: 'hero_mage', baseWeapon: 'wpn_staff',
  },
  warlock: {
    resource: 'souls', resMax: 60, resRegen: 0, resOnKill: 8,
    base: { str: 10, dex: 12, int: 25, vit: 16 }, gain: { hp: 6.5, dmgStat: 'int' },
    weapons: ['scythe', 'dagger', 'staff'], sprite: 'hero_warlock', baseWeapon: 'wpn_scythe',
  },
  druid: {
    resource: 'wrath', resMax: 90, resRegen: 4, resOnHit: 8,
    base: { str: 18, dex: 14, int: 18, vit: 18 }, gain: { hp: 7.5, dmgStat: 'str' },
    weapons: ['staff', 'axe'], sprite: 'hero_druid', baseWeapon: 'wpn_staff',
  },
};

// ---- НАВЫКИ ----
// kind: melee|proj|nova|zone|buff|summon|dash|curse|form ; ranks 5
// dmg: [базовый на ранге1, прирост за ранг] — множитель от урона героя
export const SKILLS = {
  // Варвар — Оружие
  cleave:    { cls: 'barbarian', br: 0, lvl: 1,  cost: 12, cd: 0,   kind: 'melee', arc: 2.4, range: 60, dmg: [1.4, .25], name: 'Рассечение', d: 'Широкий удар по дуге перед собой.' },
  whirlwind: { cls: 'barbarian', br: 0, lvl: 4,  cost: 30, cd: 5,   kind: 'nova', range: 85, dmg: [1.7, .3], name: 'Вихрь', d: 'Круговой смерч стали вокруг себя.' },
  leap:      { cls: 'barbarian', br: 0, lvl: 8, cost: 20, cd: 6,   kind: 'dash', range: 240, dmg: [1.2, .25], stun: .8, name: 'Прыжок', d: 'Прыжок с сотрясающим ударом, оглушает.' },
  execute:   { cls: 'barbarian', br: 0, lvl: 18, cost: 40, cd: 8,   kind: 'melee', arc: 1, range: 70, dmg: [3.2, .6], execBonus: .3, name: 'Казнь', d: 'Огромный урон; добивает раненых (+урон по целям <30% HP).' },
  warcry:    { cls: 'barbarian', br: 1, lvl: 3,  cost: 25, cd: 12,  kind: 'buff', dur: 8, buff: { dmgMul: .25 }, name: 'Боевой клич', d: 'Рёв ярости: +25% урона на время.' },
  terrify:   { cls: 'barbarian', br: 1, lvl: 9,  cost: 30, cd: 10,  kind: 'nova', range: 150, fear: 2.2, dmg: [.3, .1], name: 'Устрашение', d: 'Враги вокруг бегут в ужасе.' },
  bloodcry:  { cls: 'barbarian', br: 1, lvl: 15, cost: 35, cd: 14,  kind: 'buff', dur: 8, buff: { leech: .12 }, name: 'Клич крови', d: 'Удары пьют жизнь врагов.' },
  ironskin:  { cls: 'barbarian', br: 2, lvl: 4,  passive: { armorMul: .12 }, name: 'Железная кожа', d: '+12% брони за ранг.' },
  thorns:    { cls: 'barbarian', br: 2, lvl: 10, passive: { thorns: 8 }, name: 'Шипы', d: 'Возвращает урон атакующим.' },
  secondwind:{ cls: 'barbarian', br: 2, lvl: 16, passive: { lowHpArmor: .3 }, name: 'Второе дыхание', d: 'Ниже 30% HP — большой бонус защиты.' },

  // Охотница
  multishot: { cls: 'huntress', br: 0, lvl: 1,  cost: 14, cd: 0,  kind: 'proj', n: 3, spread: .5, dmg: [.85, .15], name: 'Мультивыстрел', d: 'Веер из стрел.' },
  pierce:    { cls: 'huntress', br: 0, lvl: 6,  cost: 18, cd: 3,  kind: 'proj', n: 1, pierce: 99, speed: 1.4, dmg: [1.9, .35], name: 'Пронзающая стрела', d: 'Пробивает всех на своём пути.' },
  volley:    { cls: 'huntress', br: 0, lvl: 14, cost: 34, cd: 7,  kind: 'zone', r: 110, ticks: 5, dmg: [.7, .14], name: 'Залп', d: 'Град стрел накрывает область.' },
  firetrap:  { cls: 'huntress', br: 1, lvl: 3,  cost: 20, cd: 4,  kind: 'trap', r: 90, dmg: [1.6, .3], elem: 'fire', name: 'Огненная ловушка', d: 'Мина: взрыв огня.' },
  frosttrap: { cls: 'huntress', br: 1, lvl: 9,  cost: 20, cd: 5,  kind: 'trap', r: 100, dmg: [.9, .2], slow: 2.5, elem: 'cold', name: 'Морозная ловушка', d: 'Мина: взрыв льда, замедляет.' },
  blasttrap: { cls: 'huntress', br: 1, lvl: 16, cost: 30, cd: 7,  kind: 'trap', r: 130, dmg: [2.6, .5], name: 'Взрывная ловушка', d: 'Мощная мина большого радиуса.' },
  dash:      { cls: 'huntress', br: 2, lvl: 4,  cost: 15, cd: 3,  kind: 'dash', range: 190, dmg: [0, 0], name: 'Рывок тени', d: 'Мгновенный уход с линии удара.' },
  poison:    { cls: 'huntress', br: 2, lvl: 10, passive: { poisonOnHit: .35 }, name: 'Ядовитые клинки', d: 'Атаки отравляют (урон со временем).' },
  deadeye:   { cls: 'huntress', br: 2, lvl: 15, passive: { crit: 4, critDmg: .12 }, name: 'Меткий глаз', d: '+крит шанс и урон.' },

  // Маг
  fireball:  { cls: 'mage', br: 0, lvl: 1,  cost: 14, cd: 0,  kind: 'proj', splash: 60, elem: 'fire', dmg: [1.5, .28], name: 'Огненный шар', d: 'Взрывается о первую цель.' },
  firewall:  { cls: 'mage', br: 0, lvl: 5,  cost: 30, cd: 7,  kind: 'zone', r: 120, ticks: 8, elem: 'fire', dmg: [.5, .12], name: 'Стена огня', d: 'Полоса пламени жжёт стоящих в ней.' },
  meteor:    { cls: 'mage', br: 0, lvl: 16, cost: 45, cd: 9,  kind: 'zone', r: 90, delay: .8, elem: 'fire', dmg: [3.4, .6], name: 'Метеор', d: 'С неба падает пылающая скала.' },
  icebolt:   { cls: 'mage', br: 1, lvl: 3,  cost: 12, cd: 0,  kind: 'proj', slow: 1.6, elem: 'cold', dmg: [1.1, .2], name: 'Ледяная стрела', d: 'Ранит и замедляет.' },
  frostnova: { cls: 'mage', br: 1, lvl: 9,  cost: 28, cd: 8,  kind: 'nova', range: 130, freeze: 1.6, elem: 'cold', dmg: [.9, .2], name: 'Ледяная нова', d: 'Кольцо мороза сковывает врагов.' },
  shards:    { cls: 'mage', br: 1, lvl: 15, cost: 26, cd: 4,  kind: 'proj', n: 5, spread: .9, elem: 'cold', dmg: [.7, .15], name: 'Осколки льда', d: 'Веер ледяных игл.' },
  chain:     { cls: 'mage', br: 2, lvl: 5,  cost: 22, cd: 2,  kind: 'chain', jumps: 4, elem: 'light', dmg: [1.2, .24], name: 'Цепная молния', d: 'Прыгает между врагами.' },
  teleport:  { cls: 'mage', br: 2, lvl: 8, cost: 18, cd: 5,  kind: 'dash', range: 230, dmg: [0,0], name: 'Телепорт', d: 'Мгновенное перемещение.' },
  storm:     { cls: 'mage', br: 2, lvl: 18, cost: 40, cd: 10, kind: 'zone', r: 150, ticks: 10, elem: 'light', dmg: [.6, .14], name: 'Гроза', d: 'Молнии лупят область с неба.' },

  // Чернокнижник
  rot:       { cls: 'warlock', br: 0, lvl: 1,  cost: 10, cd: 0,  kind: 'curse', dot: [.6, .14], dur: 4, elem: 'poison', name: 'Гниение', d: 'Проклятие: плоть гниёт заживо.' },
  weakness:  { cls: 'warlock', br: 0, lvl: 5,  cost: 20, cd: 6,  kind: 'nova', range: 160, curse: { dmgTaken: .25, dur: 6 }, dmg: [0,0], name: 'Слабость', d: 'Проклятые получают +25% урона.' },
  harvest:   { cls: 'warlock', br: 0, lvl: 14, cost: 0,  cd: 6,  kind: 'nova', range: 120, dmg: [2.0, .4], soulPerHit: 6, name: 'Жатва', d: 'Косит души: урон + запас душ.' },
  skeletons: { cls: 'warlock', br: 1, lvl: 3,  cost: 25, cd: 1,  kind: 'summon', mob: 'skeleton_minion', max: [2, .5], name: 'Восставшие', d: 'Поднимает скелетов-слуг (макс растёт).' },
  demon:     { cls: 'warlock', br: 1, lvl: 12, cost: 45, cd: 10, kind: 'summon', mob: 'demon_minion', max: [1, .25], name: 'Прислужник-демон', d: 'Призывает демона-бойца.' },
  masterY:   { cls: 'warlock', br: 1, lvl: 17, passive: { minionDmg: .2, minionHp: .2 }, name: 'Повелитель мёртвых', d: '+20% урона и HP слуг за ранг.' },
  bloodspike:{ cls: 'warlock', br: 2, lvl: 4,  cost: 0, hpCost: .06, cd: 0, kind: 'proj', dmg: [1.7, .3], name: 'Кровавый шип', d: 'Платит жизнью — бьёт больно.' },
  vamp:      { cls: 'warlock', br: 2, lvl: 10, passive: { leech: .05 }, name: 'Вампиризм', d: 'Весь урон лечит тебя.' },
  sacrifice: { cls: 'warlock', br: 2, lvl: 16, cost: 0, cd: 12, kind: 'buff', dur: 6, hpCost: .2, buff: { dmgMul: .5 }, name: 'Жертва', d: 'Отдай пятую часть жизни — получи мощь.' },

  // Друид
  wolfform:  { cls: 'druid', br: 0, lvl: 1,  cost: 20, cd: 2,  kind: 'form', form: 'wolf', name: 'Облик волка', d: 'Быстрый зверь: скорость и кровотечение.' },
  rend:      { cls: 'druid', br: 0, lvl: 6,  cost: 15, cd: 0,  kind: 'melee', form: 'wolf', arc: 1.8, range: 58, dmg: [1.3, .25], bleed: [.5, .1], name: 'Разрыв', d: '[Волк] Рвёт когтями, кровотечение.' },
  frenzy:    { cls: 'druid', br: 0, lvl: 13, cost: 30, cd: 8,  kind: 'buff', form: 'wolf', dur: 6, buff: { aspd: .4, moveMul: .2 }, name: 'Бешенство', d: '[Волк] Шквал скорости.' },
  bearform:  { cls: 'druid', br: 1, lvl: 3,  cost: 20, cd: 2,  kind: 'form', form: 'bear', name: 'Облик медведя', d: 'Живая крепость: броня и оглушение.' },
  maul:      { cls: 'druid', br: 1, lvl: 5,  cost: 18, cd: 0,  kind: 'melee', form: 'bear', arc: 2.2, range: 66, dmg: [1.6, .3], stun: .5, name: 'Трёпка', d: '[Медведь] Тяжёлая лапа, оглушает.' },
  roar:      { cls: 'druid', br: 1, lvl: 14, cost: 30, cd: 10, kind: 'nova', form: 'bear', range: 150, dmg: [.6, .15], slow: 2, name: 'Рёв', d: '[Медведь] Замедляет и ранит всех вокруг.' },
  roots:     { cls: 'druid', br: 2, lvl: 4,  cost: 18, cd: 5,  kind: 'zone', r: 90, ticks: 3, root: 1.5, dmg: [.5, .12], name: 'Корни', d: 'Хватают и держат врагов.' },
  swarm:     { cls: 'druid', br: 2, lvl: 10, cost: 22, cd: 4,  kind: 'proj', pierce: 3, elem: 'poison', dot: [.4, .1], dmg: [.7, .15], name: 'Рой', d: 'Туча жалящих насекомых.' },
  heal:      { cls: 'druid', br: 2, lvl: 15, cost: 35, cd: 9,  kind: 'buff', healPct: .25, dur: 0, buff: {}, name: 'Соки земли', d: 'Лечит четверть здоровья.' },
};

// ---- МОНСТРЫ ---- (hp/dmg — база 1 уровня, скалируются)
export const MOBS = {
  skeleton: { hp: 26, dmg: 7, speed: 95, r: 13, xp: 8, sprite: 'mob_skeleton', flare: 'e_skeleton', ai: 'melee', family: 'undead' },
  zombie:   { hp: 48, dmg: 11, speed: 55, r: 15, xp: 10, sprite: 'mob_zombie', flare: 'e_zombie', ai: 'melee', family: 'undead' },
  ghoul:    { hp: 20, dmg: 6, speed: 165, r: 12, xp: 9, sprite: 'mob_ghoul', flare: 'e_goblin', ai: 'melee', family: 'undead', lunge: true },
  bloater:  { hp: 60, dmg: 24, speed: 50, r: 17, xp: 14, sprite: 'mob_bloater', flare: 'e_zombie', fscale: 1.3, tint: '#9ccc65', ai: 'bomber', boomR: 90, family: 'undead' },
  cultist:  { hp: 30, dmg: 12, speed: 80, r: 13, xp: 13, sprite: 'mob_cultist', flare: 'e_skeleton_mage', ai: 'caster', proj: 'shadow', family: 'demon' },
  hound:    { hp: 34, dmg: 10, speed: 185, r: 13, xp: 12, sprite: 'mob_hound', flare: 'e_antlion', ai: 'melee', family: 'demon', lunge: true },
  imp:      { hp: 24, dmg: 11, speed: 110, r: 11, xp: 12, sprite: 'mob_imp', flare: 'e_wyvern', fscale: .8, ai: 'caster', proj: 'fire', family: 'demon' },
  knight:   { hp: 110, dmg: 18, speed: 75, r: 17, xp: 22, sprite: 'mob_knight', flare: 'e_minotaur', ai: 'melee', family: 'demon' },
  skeleton_minion: { hp: 40, dmg: 9, speed: 120, r: 12, xp: 0, sprite: 'mob_skeleton', flare: 'e_skeleton', ai: 'ally', tint: '#7fd6a0' },
  demon_minion:    { hp: 90, dmg: 16, speed: 130, r: 13, xp: 0, sprite: 'mob_imp', flare: 'e_wyvern', fscale: .8, ai: 'ally', tint: '#b388ff', scale: 1.25 },
  boss_bone:        { hp: 950, dmg: 22, speed: 70, r: 26, xp: 500, sprite: 'boss_bone', flare: 'e_skeleton_mage', fscale: 1.8, ai: 'boss', boss: 1, skills: ['summon:skeleton', 'nova:cold'] },
  boss_plague:      { hp: 1500, dmg: 26, speed: 60, r: 30, xp: 500, sprite: 'boss_plague', flare: 'e_zombie', fscale: 2, tint: '#9ccc65', ai: 'boss', boss: 2, skills: ['summon:ghoul', 'zone:poison'] },
  boss_executioner: { hp: 2300, dmg: 38, speed: 95, r: 28, xp: 800, sprite: 'boss_executioner', flare: 'e_minotaur', fscale: 1.5, ai: 'boss', boss: 3, skills: ['charge', 'melee:big'] },
  boss_abyss:       { hp: 5200, dmg: 42, speed: 85, r: 30, xp: 1500, sprite: 'boss_abyss', flare: 'e_wyvern', fscale: 1.6, tint: '#ff7043', ai: 'boss', boss: 4, skills: ['proj:fire3', 'nova:fire', 'summon:imp'] },
};
export const MOB_SCALE = lvl => ({ hp: Math.pow(1.11, lvl - 1), dmg: Math.pow(1.09, lvl - 1), xp: Math.pow(1.09, lvl - 1) });

export const ACTS = {
  1: { tiles: 'tile_crypt', mobs: ['skeleton', 'zombie', 'ghoul'], boss: 'boss_bone', floors: 2, mobLvl: [1, 6], wall: '#1a1d24', fog: '#05060a', decor: ['dec_sarcophagus', 'dec_bones'] },
  2: { tiles: 'tile_catacomb', mobs: ['ghoul', 'bloater', 'cultist', 'zombie'], boss: 'boss_plague', floors: 3, mobLvl: [7, 13], wall: '#22201a', fog: '#070604', decor: ['dec_sarcophagus', 'dec_bones'] },
  3: { tiles: 'tile_torture', mobs: ['hound', 'cultist', 'knight', 'ghoul'], boss: 'boss_executioner', floors: 3, mobLvl: [14, 21], wall: '#241a1a', fog: '#080404', decor: ['dec_bones'] },
  4: { tiles: 'tile_hell', mobs: ['imp', 'hound', 'knight', 'bloater'], boss: 'boss_abyss', floors: 3, mobLvl: [22, 30], wall: '#2a1512', fog: '#0a0302', decor: ['dec_bones'] },
};
export const ELITE_MODS = {
  fast: { speed: 1.5, tint: '#ffd54f' }, fire: { elem: 'fire', tint: '#ff7043' },
  cold: { elem: 'cold', tint: '#4fc3f7' }, vampiric: { leech: .5, tint: '#ef5350' }, storm: { elem: 'light', tint: '#b388ff' },
};

// ---- ПРЕДМЕТЫ ----
// icon — базовая иконка; iconT — тиры по ilvl (<9, <20, 20+)
export const BASE_ITEMS = {
  axe:      { slot: 'weapon', icon: 'loot/battle_axe', iconT: ['loot/hand_axe', 'loot/battle_axe', 'loot/great_axe'], dmg: [7, 12], aspd: 1.1, cls: null, name: 'Топор' },
  sword2h:  { slot: 'weapon', icon: 'loot/greatsword', dmg: [13, 22], aspd: .8, twoHand: true, name: 'Двуручный меч' },
  bow:      { slot: 'weapon', icon: 'loot/longbow', iconT: ['loot/shortbow', 'loot/longbow', 'loot/greatbow'], dmg: [6, 11], aspd: 1.25, ranged: true, twoHand: true, name: 'Лук' },
  staff:    { slot: 'weapon', icon: 'loot/staff', iconT: ['loot/staff', 'loot/wand', 'loot/greatstaff'], dmg: [8, 14], aspd: .95, caster: true, name: 'Посох' },
  scythe:   { slot: 'weapon', icon: 'loot/skull_staff', dmg: [9, 16], aspd: .9, caster: true, name: 'Коса' },
  dagger:   { slot: 'weapon', icon: 'loot/dagger', iconT: ['loot/dagger', 'loot/dagger', 'loot/sword'], dmg: [4, 8], aspd: 1.5, name: 'Кинжал' },
  shield:   { slot: 'offhand', icon: 'loot/kite_shield', iconT: ['loot/buckler', 'loot/kite_shield', 'loot/crest_shield'], armor: 14, block: 12, name: 'Щит' },
  tome:     { slot: 'offhand', icon: 'loot/book2', armor: 2, caster: true, spellDmg: .1, name: 'Гримуар' },
  helm:     { slot: 'helm', icon: 'loot/plate_helm', iconT: ['loot/leather_hood', 'loot/chain_coif', 'loot/plate_helm'], armor: 8, name: 'Шлем' },
  plate:    { slot: 'chest', icon: 'loot/plate_armor', iconT: ['loot/leather_armor', 'loot/chain_mail', 'loot/plate_armor'], armor: 18, name: 'Латы' },
  robe:     { slot: 'chest', icon: 'loot/mage_vest', armor: 7, caster: true, spellDmg: .08, name: 'Роба' },
  gloves:   { slot: 'gloves', icon: 'loot/plate_gloves', iconT: ['loot/leather_gloves', 'loot/chain_gloves', 'loot/plate_gloves'], armor: 5, name: 'Перчатки' },
  belt:     { slot: 'belt', icon: 'loot/belt2', armor: 4, potions: 1, name: 'Пояс' },
  boots:    { slot: 'boots', icon: 'loot/plate_boots', iconT: ['loot/leather_boots', 'loot/chain_boots', 'loot/plate_boots'], armor: 5, name: 'Сапоги' },
  amulet:   { slot: 'amulet', icon: 'loot/amu_red', iconT: ['loot/amu_green', 'loot/amu_red', 'loot/amu_blue'], name: 'Амулет' },
  ring:     { slot: 'ring', icon: 'loot/ring_gold', iconT: ['loot/ring_silver', 'loot/ring_gold', 'loot/ring_ruby'], name: 'Кольцо' },
};

// Аффиксы: [id, слоты|null=все, стат, мин..макс за ур.1, рост/ур, префикс?, имя]
export const AFFIXES = [
  ['dmgF',   ['weapon','ring','amulet'], 'dmgFlat', [2, 5], .5, 1, 'жестокости', '+{v} к урону'],
  ['dmgP',   ['weapon'], 'dmgMul', [.08, .15], .004, 1, 'ярости', '+{v}% урона'],
  ['aspd',   ['weapon','gloves'], 'aspd', [.06, .12], .002, 1, 'скорости', '+{v}% скор. атаки'],
  ['crit',   ['weapon','gloves','amulet','ring'], 'crit', [2, 5], .1, 0, 'хищника', '+{v}% крит. шанса'],
  ['critD',  ['weapon','amulet'], 'critDmg', [.15, .3], .01, 0, 'палача', '+{v}% крит. урона'],
  ['skills', ['weapon','helm','amulet'], 'plusSkills', [1, 1], .025, 1, 'мастера', '+{v} ко всем умениям'],
  ['leech',  ['weapon','ring'], 'leech', [.02, .04], .001, 0, 'пиявки', '{v}% урона в здоровье'],
  ['hp',     null, 'hpFlat', [8, 20], 2.2, 1, 'быка', '+{v} к здоровью'],
  ['hpReg',  ['chest','belt','amulet'], 'hpRegen', [.5, 1.5], .12, 0, 'тролля', '+{v} HP/сек'],
  ['armor',  ['helm','chest','gloves','belt','boots','offhand'], 'armorFlat', [4, 10], 1.4, 1, 'камня', '+{v} к броне'],
  ['armorP', ['chest','offhand'], 'armorMul', [.1, .2], .004, 0, 'бастиона', '+{v}% брони'],
  ['rFire',  null, 'resFire', [8, 18], .5, 0, 'огнеупорный', '+{v}% сопр. огню'],
  ['rCold',  null, 'resCold', [8, 18], .5, 0, 'незамерзающий', '+{v}% сопр. холоду'],
  ['rLight', null, 'resLight', [8, 18], .5, 0, 'заземлённый', '+{v}% сопр. молнии'],
  ['rPois',  null, 'resPoison', [8, 18], .5, 0, 'противоядный', '+{v}% сопр. яду'],
  ['rAll',   ['amulet','chest'], 'resAll', [4, 8], .3, 0, 'стойкости', '+{v}% ко всем сопр.'],
  ['move',   ['boots'], 'moveMul', [.08, .14], .002, 0, 'ветра', '+{v}% скорости бега'],
  ['gold',   null, 'goldFind', [.15, .35], .01, 0, 'скряги', '+{v}% золота'],
  ['mf',     ['helm','amulet','ring','boots'], 'magicFind', [.08, .2], .008, 0, 'кладоискателя', '+{v}% магических находок'],
  ['thorns', ['chest','offhand'], 'thorns', [3, 8], 1.2, 0, 'ежа', 'шипы: {v} урона в ответ'],
  ['str',    null, 'str', [3, 7], .8, 0, 'медведя', '+{v} к Силе'],
  ['dex',    null, 'dex', [3, 7], .8, 0, 'рыси', '+{v} к Ловкости'],
  ['int',    null, 'int', [3, 7], .8, 0, 'ворона', '+{v} к Интеллекту'],
  ['vit',    null, 'vit', [3, 7], .8, 0, 'дуба', '+{v} к Живучести'],
  ['undead', ['weapon'], 'vsUndead', [.2, .4], .01, 1, 'святости', '+{v}% урона нежити'],
  ['demon',  ['weapon'], 'vsDemon', [.2, .4], .01, 1, 'изгнания', '+{v}% урона демонам'],
  ['light',  ['helm','amulet'], 'lightR', [.1, .2], .005, 0, 'светоча', '+{v}% радиуса света'],
  ['potions',['belt'], 'potions', [1, 2], .04, 0, 'запасливый', '+{v} ячейки зелий'],
  ['spell',  ['weapon','offhand','helm'], 'spellDmg', [.1, .2], .006, 1, 'колдовства', '+{v}% урона умений'],
  ['resrc',  ['helm','amulet','ring'], 'resMax', [10, 22], 1.5, 0, 'глубин', '+{v} к запасу ресурса'],
  ['cdr',    ['helm','amulet'], 'cdr', [.05, .1], .003, 0, 'спешки', '-{v}% перезарядки'],
];

// ---- УНИКАЛЬНЫЕ ----
export const UNIQUES = [
  { base: 'axe', name: 'Вдоводел', lvl: 4, fixed: { dmgMul: .35, leech: .05, crit: 6 }, lore: 'Он не различает виновных.' },
  { base: 'sword2h', name: 'Могильный Клык', lvl: 9, fixed: { dmgMul: .5, vsUndead: .6, lightR: .15 }, lore: 'Выкован из ворот склепа.' },
  { base: 'bow', name: 'Шёпот Вдовы', lvl: 8, fixed: { aspd: .25, crit: 9, critDmg: .4 }, lore: 'Тетива свита из последних слов.' },
  { base: 'staff', name: 'Костяной Пастух', lvl: 11, fixed: { spellDmg: .4, plusSkills: 1, resMax: 25 }, lore: 'Стадо его безмолвно.' },
  { base: 'scythe', name: 'Жнец Свечей', lvl: 14, fixed: { dmgMul: .4, leech: .07, spellDmg: .25 }, lore: 'Каждая жизнь — фитиль.' },
  { base: 'dagger', name: 'Игла Милосердия', lvl: 6, fixed: { aspd: .5, crit: 12 }, lore: 'Быстрее, чем молитва.' },
  { base: 'helm', name: 'Корона Утопленника', lvl: 10, fixed: { resAll: 15, hpRegen: 3, magicFind: .25 }, lore: 'Тяжела и мокра.' },
  { base: 'plate', name: 'Панцирь Мученика', lvl: 13, fixed: { armorMul: .5, thorns: 20, hpFlat: 60 }, lore: 'Боль — тоже броня.' },
  { base: 'robe', name: 'Саван Полуночи', lvl: 12, fixed: { spellDmg: .3, cdr: .12, resAll: 10 }, lore: 'Сшит из тени.' },
  { base: 'shield', name: 'Дверь Сироты', lvl: 7, fixed: { armorMul: .4, thorns: 12, hpFlat: 40 }, lore: 'Больше некому стучать.' },
  { base: 'gloves', name: 'Хватка Гуля', lvl: 9, fixed: { aspd: .2, leech: .04 }, lore: 'Они помнят голод.' },
  { base: 'boots', name: 'Шаги Беглеца', lvl: 8, fixed: { moveMul: .25, dex: 10 }, lore: 'Он так и не остановился.' },
  { base: 'belt', name: 'Пояс Трупных Мух', lvl: 11, fixed: { potions: 2, hpRegen: 2.5, resPoison: 25 }, lore: 'Жужжит на удачу.' },
  { base: 'amulet', name: 'Око Патриарха', lvl: 16, fixed: { plusSkills: 1, magicFind: .3, resAll: 12 }, lore: 'Оно всё ещё моргает.' },
  { base: 'ring', name: 'Обручальное Кольцо Чумы', lvl: 15, fixed: { dmgMul: .2, hpFlat: 45, resPoison: 30 }, lore: 'До гроба — и после.' },
];

// ---- СЕТЫ ----
export const SETS = [
  { id: 'gravedigger', name: 'Ноша Могильщика', items: [
      { base: 'helm', name: 'Капюшон Могильщика', fixed: { armorFlat: 12, magicFind: .15 } },
      { base: 'gloves', name: 'Рукавицы Могильщика', fixed: { aspd: .15, str: 8 } },
      { base: 'boots', name: 'Ботфорты Могильщика', fixed: { moveMul: .15, vit: 8 } }],
    bonus2: { hpFlat: 50 }, bonus3: { dmgMul: .3, vsUndead: .5, lore: 'Земля им пухом. Всем.' }, lvl: 12 },
  { id: 'candle', name: 'Обет Последней Свечи', items: [
      { base: 'amulet', name: 'Фитиль Обета', fixed: { lightR: .25, plusSkills: 1 } },
      { base: 'ring', name: 'Воск Обета', fixed: { hpRegen: 2, resAll: 8 } },
      { base: 'robe', name: 'Пламя Обета', fixed: { spellDmg: .25, cdr: .08 } }],
    bonus2: { resAll: 12 }, bonus3: { spellDmg: .35, lightR: .3, lore: 'Пока горит — мы живы.' }, lvl: 18 },
];

export const RARITY = {
  common: { c: '#c8c2b8', mult: 0, chance: 100 },
  magic:  { c: '#7aa9ff', affixes: [1, 2], chance: 34 },
  rare:   { c: '#ffd75e', affixes: [3, 5], chance: 9 },
  set:    { c: '#61d97a', chance: 0.4 },
  unique: { c: '#ff9840', chance: 0.5 },
};
export const POTION_HEAL = .35; // доля макс HP
export const GAMBLE_COST = lvl => 400 + lvl * 120;
export const RESPEC_COST = lvl => 500 + lvl * 250;
export const DEATH_GOLD_LOSS = .1;
