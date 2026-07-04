// Точка входа: состояния (титул/выбор класса/лагерь/подземелье), игровой цикл.
import { STR } from './strings.js';
import { TILE, CLASSES, SKILLS, ACTS, MOBS, XP_CURVE, POTION_HEAL, DEATH_GOLD_LOSS, RARITY } from './data.js';
import { makeRng, Input, bus, clamp, dist2, proj, unprojDir, isoAngle } from './core.js';
import { genFloor, collide, T_EXIT } from './world.js';
import { makeMob, updateMob, damageMob, damageHero, healHero, gainXp } from './entities.js';
import { useSkill, basicAttack, autoAim, canUse } from './skills.js';
import { makeItem, computeStats, newUid, setUidBase } from './items.js';
import { SETS } from './data.js';
import { Renderer } from './render.js';
import { UI } from './ui.js';
import { Sound } from './audio.js';
import { saveGame, loadGame, wipeSave, hasSave } from './save.js';
import { Flare, gearLayers } from './flare.js';

const ASSET_LIST = [
  'hero_barbarian', 'hero_huntress', 'hero_mage', 'hero_warlock', 'hero_druid', 'form_wolf', 'form_bear',
  'mob_skeleton', 'mob_zombie', 'mob_ghoul', 'mob_bloater', 'mob_cultist', 'mob_hound', 'mob_imp', 'mob_knight',
  'boss_bone', 'boss_plague', 'boss_executioner', 'boss_abyss',
  'wpn_axe', 'wpn_greatsword', 'wpn_bow', 'wpn_staff', 'wpn_scythe', 'wpn_dagger',
  'helm_iron', 'shield_tower', 'chest_plate', 'chest_robe',
  'item_potion', 'item_potion2', 'item_gold', 'item_ring', 'item_amulet', 'item_belt', 'item_boots', 'item_gloves', 'item_tome',
  'tile_crypt', 'tile_catacomb', 'tile_torture', 'tile_hell',
  'dec_sarcophagus', 'dec_bones', 'dec_chest', 'dec_portal', 'title_bg',
];

class Game {
  constructor() {
    this.canvas = document.getElementById('c');
    this.assets = {};
    this.state = 'loading'; // loading|title|classpick|town|dungeon|dead
    this.input = new Input(this.canvas);
    this.sound = new Sound();
    this.settings = { sound: true, shake: true, flash: true, bigText: false };
    this.isTouch = matchMedia('(pointer: coarse)').matches;
    this.paused = false;
    this.tick = 0;
    this.time = 0;
    this.seedBase = (Date.now() % 100000) | 0;
    this.xpCurve = XP_CURVE;
    this.saveApi = { hasSave, loadGame };
    this.dev = new URLSearchParams(location.search).has('dev');
  }
  async loadAssets() {
    this.flare = new Flare();
    const flareReady = this.flare.init();
    let done = 0;
    const jobs = ASSET_LIST.map(id => new Promise(res => {
      const img = new Image();
      img.onload = () => { img.__id = id; this.assets[id] = img; done++; res(); };
      img.onerror = () => { done++; res(); }; // отсутствующий ассет не валит игру
      img.src = './assets/' + id + '.webp';
    }));
    await Promise.all(jobs);
    await flareReady;
    // атлас тайлсета подземелья
    this.tilesImg = await new Promise(res => {
      const img = new Image();
      img.onload = () => res(img); img.onerror = () => res(null);
      img.src = './assets/flare/tiles.webp';
    });
  }
  rebuildHeroSheet() {
    if (!this.hero || !this.flare?.meta) return;
    const gender = this.hero.cls === 'huntress' ? 'f' : 'm';
    const layers = gearLayers(this.hero, gender);
    this.flare.composeHero(layers, JSON.stringify(layers), () => {});
  }
  start() {
    this.renderer = new Renderer(this.canvas, this.assets);
    this.renderer.tilesImg = this.tilesImg;
    this.renderer.tilesMeta = this.flare?.meta?.__tiles || null;
    this.fx = this.renderer.fxApi();
    this.ui = new UI(this);
    addEventListener('resize', () => this.renderer.resize());
    addEventListener('orientationchange', () => this.renderer.resize());
    this.renderer.resize();
    addEventListener('blur', () => { this.blurPause = true; });
    addEventListener('focus', () => { this.blurPause = false; this.last = performance.now(); });
    bus.on('heroDied', () => this.onDeath());
    bus.on('bossDied', m => this.onBossDied(m));
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.save(); });
    addEventListener('pagehide', () => this.save());
    this.state = 'title';
    this.ui.open('mainmenu');
    this.last = performance.now();
    requestAnimationFrame(t => this.frame(t));
  }

  // ---------- ГЕРОЙ/ПРОГРЕСС ----------
  newHero(cls) {
    this.hero = {
      cls, level: 1, xp: 0, xpNext: XP_CURVE(1), statPts: 0, talentPts: 1,
      alloc: { str: 0, dex: 0, int: 0, vit: 0 }, talents: {}, skillBar: [],
      gold: 50, potionCharges: 3,
      equip: {}, inventory: [],
      x: 0, y: 0, r: 14, dir: 1, hp: 1, res: 0, form: null,
      cooldowns: {}, buffs: [], attackCd: 0, attackT: 0, hurtT: 0, invulnT: 0, animT: 0, dead: false, slowT: 0,
    };
    this.stash = [];
    this.progress = { act: 1, floor: 1, unlockedActs: 1, cleared: false, riftLvl: 1, rift: false };
    this.vendorStock = [];
    this.rng = makeRng(this.seedBase ^ 0x9e37);
    // стартовое оружие
    const baseW = { barbarian: 'axe', huntress: 'bow', mage: 'staff', warlock: 'scythe', druid: 'staff' }[cls];
    const it = makeItem(this.rng, 1, { base: baseW, rarity: 'common' });
    this.hero.equip.weapon = it;
    this.cls = CLASSES[cls];
    this.recalc();
    this.rebuildHeroSheet();
    this.hero.hp = this.stats.maxHp;
    this.hero.res = this.stats.maxRes * .5;
    this.save();
  }
  doContinue() {
    const d = loadGame();
    if (!d) return;
    this.sound.ensure(); this.sound.resume();
    this.restore(d);
    this.state = 'town'; this.restockVendor(); this.ui.open('town');
  }
  doNewGame(cls) {
    this.sound.ensure(); this.sound.resume();
    wipeSave();
    this.newHero(cls);
    this.state = 'town'; this.restockVendor(); this.ui.open('town');
  }
  recalc() {
    this.cls = CLASSES[this.hero.cls];
    this.stats = computeStats(this.hero, CLASSES, SKILLS);
    this.recalcBuffs();
  }
  recalcBuffs() {
    this.buffMods = { dmgMul: 0, aspd: 0, moveMul: 0, leech: 0 };
    for (const b of this.hero.buffs) for (const k in b.mods) this.buffMods[k] += b.mods[k];
    // формы друида
    if (this.hero.form === 'wolf') { this.buffMods.moveMul += .3; this.buffMods.aspd += .25; }
    this.stats.dmgTotal = this.stats.dmgBase * (1 + this.stats[this.cls.gain.dmgStat] * .012) * (1 + this.stats.dmgMul + this.buffMods.dmgMul) * (this.hero.form === 'bear' ? 1.1 : 1);
    this.stats.moveSpeed = 150 * (1 + (this.stats.moveMul || 0) + this.buffMods.moveMul) * (this.hero.form === 'wolf' ? 1.3 : this.hero.form === 'bear' ? .85 : 1);
    this.stats.attackSpeed = (this.hero.equip.weapon?.aspd || 1.1) * (1 + this.stats.aspd + this.buffMods.aspd);
    this.stats.leech = (this.stats.leech || 0) + this.buffMods.leech;
  }
  nextUid() { return newUid(); }
  save() { if (this.hero) saveGame(this); }
  restore(d) {
    this.hero = Object.assign({
      x: 0, y: 0, r: 14, dir: 1, form: null, cooldowns: {}, buffs: [], attackCd: 0,
      attackT: 0, hurtT: 0, invulnT: 0, animT: 0, dead: false, slowT: 0, hp: 1, res: 0,
    }, d.hero);
    this.stash = d.stash || [];
    this.progress = d.progress;
    this.settings = Object.assign(this.settings, d.settings);
    this.seedBase = d.seedBase;
    setUidBase(d.uid || 1000);
    this.vendorStock = [];
    this.rng = makeRng((this.seedBase ^ (Date.now() & 0xffff)) >>> 0);
    this.recalc();
    this.rebuildHeroSheet();
    this.hero.hp = this.stats.maxHp; this.hero.res = this.stats.maxRes * .5;
    this.applySettings();
  }
  applySettings() {
    this.sound.setEnabled(this.settings.sound);
    this.renderer.reduceShake = !this.settings.shake;
    this.renderer.reduceFlash = !this.settings.flash;
    document.body.classList.toggle('bigtext', !!this.settings.bigText);
  }
  restockVendor() {
    this.vendorStock = [];
    for (let i = 0; i < 8; i++) {
      const r = this.rng.chance(.25) ? 'rare' : 'magic';
      this.vendorStock.push(makeItem(this.rng, clamp(this.hero.level + this.rng.int(-1, 2), 1, 60), { rarity: r }));
    }
  }

  // ---------- УРОВНИ ----------
  enterAct(act) {
    this.progress.act = act; this.progress.floor = 1; this.progress.rift = false;
    this.loadFloor();
  }
  enterRift() {
    this.progress.rift = true;
    this.loadFloor();
  }
  loadFloor() {
    const p = this.progress;
    const act = p.rift ? 1 + ((p.riftLvl - 1) % 4) : p.act;
    this.actData = ACTS[act];
    const isBoss = p.rift ? false : p.floor > ACTS[act].floors;
    const seed = (this.seedBase + act * 1000 + p.floor * 77 + (p.rift ? p.riftLvl * 31337 : 0)) >>> 0;
    this.floor = genFloor(seed, act, p.floor, isBoss);
    this.frng = makeRng(seed ^ 0xabcdef);
    const h = this.hero;
    h.x = this.floor.entry.cx * TILE + TILE / 2; h.y = this.floor.entry.cy * TILE + TILE / 2;
    h.dead = false;
    this.mobs = []; this.projectiles = []; this.zones = []; this.traps = []; this.drops = []; this.corpses = [];
    // предзагрузка листов монстров акта + слуг
    if (this.flare?.meta) {
      const names = new Set(['e_skeleton', 'e_wyvern']);
      for (const k of this.actData.mobs) if (MOBS[k].flare) names.add(MOBS[k].flare);
      if (MOBS[this.actData.boss]?.flare) names.add(MOBS[this.actData.boss].flare);
      this.flare.preload([...names]);
      this.rebuildHeroSheet();
    }
    // спавны
    const lvlRange = this.actData.mobLvl;
    const mobLvl = p.rift ? 30 + p.riftLvl * 2 : clamp(lvlRange[0] + (p.floor - 1) * 2, lvlRange[0], lvlRange[1]);
    this.mobLvl = mobLvl;
    for (const sp of this.floor.spawns) {
      for (let i = 0; i < sp.n; i++) {
        const kind = this.frng.pick(this.actData.mobs);
        const elite = (i === 0 && sp.elite) ? this.frng.pick(['fast', 'fire', 'cold', 'vampiric', 'storm']) : null;
        const m = makeMob(this.frng, kind, sp.x * TILE + this.frng.range(8, TILE - 8), sp.y * TILE + this.frng.range(8, TILE - 8), mobLvl + (p.rift ? this.frng.int(0, 2) : 0), elite);
        if (p.rift) { m.maxHp *= 1 + p.riftLvl * .12; m.hp = m.maxHp; m.dmg *= 1 + p.riftLvl * .08; }
        this.mobs.push(m);
      }
    }
    if (this.floor.bossSpawn) {
      const b = makeMob(this.frng, this.actData.boss, this.floor.bossSpawn.x * TILE, this.floor.bossSpawn.y * TILE, lvlRange[1] + 1);
      this.mobs.push(b);
      bus.emit('bossStart');
      this.ui.toast(STR.bossWarning, '#c62828');
    }
    // сундуки как "монстры"-объекты попроще: массив
    this.chestObjs = this.floor.chests.map(c => ({ x: c.x * TILE + TILE / 2, y: c.y * TILE + TILE / 2, opened: false }));
    const [cpx, cpy] = proj(h.x, h.y);
    this.renderer.cam.px = cpx; this.renderer.cam.py = cpy;
    this.state = 'dungeon';
    bus.emit('portal');
    this.save();
  }
  nextFloor() {
    const p = this.progress;
    if (p.rift) { p.riftLvl++; this.ui.toast(`${STR.rift} ${p.riftLvl}`, '#b388ff'); this.loadFloor(); return; }
    p.floor++;
    const act = ACTS[p.act];
    if (p.floor > act.floors + 1) { /* босс убит - в лагерь через onBossDied */ }
    this.loadFloor();
  }
  onBossDied(m) {
    const p = this.progress;
    this.fx.shake(16);
    setTimeout(() => {
      if (p.act < 4) {
        p.unlockedActs = Math.max(p.unlockedActs, p.act + 1);
        this.ui.toast(STR.actCleared, '#ffd75e');
      } else if (!p.cleared) {
        p.cleared = true;
        this.ui.toast(STR.gameCleared, '#ffd75e');
      }
      p.floor = 1;
      this.save();
      this.state = 'town'; this.ui.open('town'); this.restockVendor();
    }, 1600);
  }
  onDeath() {
    const lost = Math.floor(this.hero.gold * DEATH_GOLD_LOSS);
    this.hero.gold -= lost;
    this.save();
    setTimeout(() => this.ui.open('death', { goldLost: lost }), 900);
  }
  revive() {
    this.hero.dead = false;
    this.hero.deadT = 0;
    this.recalc();
    this.hero.hp = this.stats.maxHp; this.hero.res = this.stats.maxRes * .5;
    this.hero.potionCharges = this.stats.potions;
    this.state = 'town'; this.ui.open('town'); this.restockVendor();
  }

  // ---------- ПРЕДМЕТЫ ----------
  equipItem(id) {
    const h = this.hero;
    const it = h.inventory.find(x => x.id === id);
    if (!it) return;
    if (h.level < it.req) { this.ui.toast(`${STR.requires} ${it.req} ${STR.levelShort}`, '#c62828'); return; }
    let slot = it.slot;
    if (slot === 'ring') slot = !h.equip.ring1 ? 'ring1' : !h.equip.ring2 ? 'ring2' : 'ring1';
    // класс-ограничение оружия
    if (slot === 'weapon' && !this.cls.weapons.includes(it.base)) { this.ui.toast('Не для этого класса', '#c62828'); return; }
    const old = h.equip[slot];
    h.inventory = h.inventory.filter(x => x !== it);
    h.equip[slot] = it;
    // двуручное вытесняет щит
    if (slot === 'weapon' && it.twoHand && h.equip.offhand) { h.inventory.push(h.equip.offhand); h.equip.offhand = null; }
    if (slot === 'offhand' && h.equip.weapon?.twoHand) { h.inventory.push(h.equip.weapon); h.equip.weapon = null; }
    if (old) h.inventory.push(old);
    this.recalc();
    this.rebuildHeroSheet();
    this.hero.potionCharges = Math.min(this.hero.potionCharges, this.stats.potions);
  }
  unequipItem(slot) {
    const h = this.hero;
    const it = h.equip[slot];
    if (!it || h.inventory.length >= 24) return;
    h.equip[slot] = null; h.inventory.push(it); this.recalc(); this.rebuildHeroSheet();
  }

  // ---------- ЦИКЛ ----------
  frame(now) {
    requestAnimationFrame(t => this.frame(t));
    const STEP = 1000 / 60;
    if (this.blurPause) { this.last = now; return; }
    this.acc = Math.min((this.acc || 0) + (now - this.last), 100);
    this.last = now;
    const cmds = this.input.poll();
    while (this.acc >= STEP) {
      if (!this.paused) this.update(STEP / 1000, cmds);
      this.acc -= STEP; this.tick++;
    }
    this.render(now / 1000, cmds);
    if (this.dev) {
      this.frames = (this.frames || 0) + 1;
      if (now - (this.fpsAt || 0) >= 500) {
        document.getElementById('dev').textContent =
          `${Math.round(this.frames * 1000 / (now - this.fpsAt))} fps · mobs ${this.mobs?.filter(m => !m.dead).length ?? 0} · part ${this.renderer.particles.length}`;
        this.frames = 0; this.fpsAt = now;
      }
    }
  }

  update(dt, cmds) {
    this.time += dt;
    if (this.state !== 'dungeon') return; // меню — DOM-панели
    const h = this.hero, s = this.stats;
    for (let i = this.corpses.length - 1; i >= 0; i--) { this.corpses[i].t += dt; if (this.corpses[i].t > 4) this.corpses.splice(i, 1); }
    if (h.dead) { h.deadT = (h.deadT || 0) + dt; return; }
    h.animT += dt;
    if (h.action) { h.action.t += dt * 1000; if (h.action.t > 520) h.action = null; }
    if (h.attackCd > 0) h.attackCd -= dt;
    if (h.attackT > 0) h.attackT -= dt;
    if (h.hurtT > 0) h.hurtT -= dt;
    if (h.invulnT > 0) h.invulnT -= dt;
    for (const k in h.cooldowns) if (h.cooldowns[k] > 0) h.cooldowns[k] -= dt;
    // баффы
    let buffDirty = false;
    for (let i = h.buffs.length - 1; i >= 0; i--) { h.buffs[i].t -= dt; if (h.buffs[i].t <= 0) { h.buffs.splice(i, 1); buffDirty = true; } }
    if (buffDirty) this.recalcBuffs();
    // ресурс
    const cls = this.cls;
    if (cls.resRegen) h.res = clamp(h.res + cls.resRegen * dt * (cls.resource === 'focus' && h.moving ? 1.6 : 1), 0, s.maxRes);
    h.hp = Math.min(s.maxHp, h.hp + s.hpRegen * dt);
    // движение
    let mx = cmds.moveX, my = cmds.moveY;
    const ml = Math.hypot(mx, my);
    h.moving = ml > .05;
    if (h.moving) {
      if (ml > 1) { mx /= ml; my /= ml; }
      if (!h.action) h.faceAngle = Math.atan2(my, mx); // экранный угол стика
      if (mx) h.dir = mx < 0 ? -1 : 1;
      const [wx, wy] = unprojDir(mx, my); // экран -> мир
      h.faceX = wx; h.faceY = wy;
      const sp = s.moveSpeed * (h.slowT > 0 ? .5 : 1) * ml;
      const [nx, ny] = collide(this.floor, h.x + wx * sp * dt, h.y + wy * sp * dt, h.r);
      h.x = nx; h.y = ny;
    }
    if (h.slowT > 0) h.slowT -= dt;
    // атака/умения: правый стик задаёт направление удара, иначе автоприцел
    let ax, ay;
    if (cmds.aimX !== undefined) {
      const [wx, wy] = unprojDir(cmds.aimX, cmds.aimY);
      ax = h.x + wx * 220; ay = h.y + wy * 220;
    }
    else [ax, ay] = autoAim(this);
    if (cmds.attack) basicAttack(this, ax, ay);
    for (let i = 0; i < 4; i++) {
      if (cmds['skill' + (i + 1)] && h.skillBar[i]) useSkill(this, h.skillBar[i], ax, ay);
    }
    if (cmds.once.has('potion')) this.drinkPotion();
    if (cmds.once.has('inventory')) this.ui.open('inventory');
    if (cmds.once.has('character')) this.ui.open('character');
    if (cmds.once.has('talents')) this.ui.open('talents');
    if (cmds.once.has('menu')) this.ui.open('town');
    // тап по миру = движение к точке? нет: базовая атака в направлении тапа (десктоп-клик)
    if (cmds.tap && !this.isTouch) {
      const [wx, wy] = this.renderer.screenToWorld(cmds.tap.x, cmds.tap.y);
      basicAttack(this, wx, wy);
    }
    // монстры
    const mobsAlive = this.mobs;
    for (let i = mobsAlive.length - 1; i >= 0; i--) {
      const m = mobsAlive[i];
      if (m.dead) { mobsAlive.splice(i, 1); continue; }
      // спим далёких
      if (Math.abs(m.x - h.x) > 1400 || Math.abs(m.y - h.y) > 1400) continue;
      if (m.curseT > 0) { m.curseT -= dt; } else m.dmgTakenMul = 0;
      updateMob(this, m, dt);
    }
    // снаряды
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.ttl -= dt;
      let dead = p.ttl <= 0;
      const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE);
      if (!dead && (tx < 0 || ty < 0 || tx >= this.floor.W || ty >= this.floor.H || this.floor.g[ty * this.floor.W + tx] === 0)) dead = true;
      if (!dead) {
        if (p.from === 'hero') {
          for (const m of this.mobs) {
            if (m.dead || m.type === 'ally') continue;
            if (dist2(p.x, p.y, m.x, m.y) < (m.r + p.r) ** 2) {
              const mul = 1 + (m.dmgTakenMul || 0);
              damageMob(this, m, p.dmg * mul, { spell: p.spell, elem: p.elem, slow: p.slow, dot: p.dot });
              if (p.splash) {
                for (const o of this.mobs) {
                  if (o === m || o.dead || o.type === 'ally') continue;
                  if (dist2(o.x, o.y, m.x, m.y) < p.splash ** 2) damageMob(this, o, p.dmg * .6 * (1 + (o.dmgTakenMul || 0)), { spell: p.spell, elem: p.elem });
                }
                this.fx.explosion(m.x, m.y, p.splash, p.color);
              }
              if (p.pierce > 0) { p.pierce--; } else { dead = true; }
              break;
            }
          }
        } else {
          if (dist2(p.x, p.y, h.x, h.y) < (h.r + p.r) ** 2) { damageHero(this, p.dmg, p.elem, p.lvl); dead = true; }
        }
      }
      if (dead) this.projectiles.splice(i, 1);
    }
    // зоны
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.tickT -= dt;
      if (z.tickT <= 0) {
        z.tickT = z.tickEvery || .5;
        if (z.from === 'hero') {
          for (const m of this.mobs) {
            if (m.dead || m.type === 'ally') continue;
            if (dist2(m.x, m.y, z.x, z.y) < (z.r + m.r) ** 2)
              damageMob(this, m, z.dps * (1 + (m.dmgTakenMul || 0)), { spell: true, elem: z.elem, root: z.root, noLeech: true });
          }
        } else if (dist2(h.x, h.y, z.x, z.y) < (z.r + h.r) ** 2) damageHero(this, z.dps, z.elem, z.lvl || 1);
        if (z.oneshot) z.t = 0;
        this.fx.burst(z.x + (this.rng() - .5) * z.r, z.y + (this.rng() - .5) * z.r, 4, z.color);
      }
      z.t -= dt;
      if (z.t <= 0) this.zones.splice(i, 1);
    }
    // ловушки
    for (let i = this.traps.length - 1; i >= 0; i--) {
      const t = this.traps[i];
      if (t.armT > 0) { t.armT -= dt; continue; }
      t.t -= dt;
      let boom = t.t <= 0;
      for (const m of this.mobs) {
        if (m.dead || m.type === 'ally') continue;
        if (dist2(m.x, m.y, t.x, t.y) < 45 * 45) { boom = true; break; }
      }
      if (boom) {
        this.fx.explosion(t.x, t.y, t.r, t.elem === 'cold' ? '#4fc3f7' : '#ff7043');
        for (const m of this.mobs) {
          if (m.dead || m.type === 'ally') continue;
          if (dist2(m.x, m.y, t.x, t.y) < (t.r + m.r) ** 2)
            damageMob(this, m, t.dmg * (1 + (m.dmgTakenMul || 0)), { spell: true, elem: t.elem, slow: t.slow });
        }
        this.traps.splice(i, 1);
      }
    }
    // подбор дропа
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.t += dt;
      if (d.t < .4) continue;
      const rr = d.kind === 'item' ? 34 : 52;
      if (dist2(d.x, d.y, h.x, h.y) < rr * rr) {
        if (d.kind === 'gold') { h.gold += d.amt; bus.emit('pickupGold'); this.fx.number(h.x, h.y - 30, '+' + d.amt + '✦', '#ffd75e'); }
        else if (d.kind === 'potion') {
          if (h.potionCharges < s.potions) { h.potionCharges++; bus.emit('potion'); } else { healHero(this, s.maxHp * .12); }
        } else {
          if (h.inventory.length >= 24) { if (d.t > 2 && ((this.tick & 63) === 0)) this.ui.toast(STR.inventoryFull, '#c62828'); continue; }
          h.inventory.push(d.item);
          bus.emit('pickupItem', d.item.rarity, d.item.name);
        }
        this.drops.splice(i, 1);
      }
    }
    // сундуки
    for (const c of this.chestObjs) {
      if (c.opened) continue;
      if (dist2(c.x, c.y, h.x, h.y) < 55 * 55) {
        c.opened = true;
        bus.emit('openChest');
        const n = this.rng.int(1, 3);
        for (let k = 0; k < n; k++) {
          if (this.rng.chance(.6)) this.drops.push({ kind: 'gold', x: c.x + this.rng.range(-20, 20), y: c.y + 16, amt: this.rng.int(10, 25) * this.mobLvl, t: 0 });
          else this.drops.push({ kind: 'item', x: c.x + this.rng.range(-20, 20), y: c.y + 16, item: makeItem(this.rng, this.mobLvl, { magicFind: s.magicFind }), t: 0 });
        }
      }
    }
    // выход с этажа
    const ex = this.floor.exit;
    if (!this.floor.isBossFloor || this.mobs.every(m => !m.boss || m.dead)) {
      if (dist2(h.x, h.y, ex.cx * TILE + TILE / 2, ex.cy * TILE + TILE / 2) < 40 * 40) {
        if (!this.floor.isBossFloor) this.nextFloor();
      }
    }
    // разведка миникарты
    if ((this.tick & 15) === 0) {
      const f = this.floor, htx = Math.floor(h.x / TILE), hty = Math.floor(h.y / TILE);
      for (let ty = Math.max(0, hty - 4); ty <= Math.min(f.H - 1, hty + 4); ty++)
        for (let tx = Math.max(0, htx - 4); tx <= Math.min(f.W - 1, htx + 4); tx++)
          f.visited[ty * f.W + tx] = 1;
    }
    // камера (в проекционных координатах)
    const cam = this.renderer.cam;
    const [hpx, hpy] = proj(h.x, h.y);
    cam.px = (cam.px ?? hpx) + (hpx - (cam.px ?? hpx)) * Math.min(1, dt * 7);
    cam.py = (cam.py ?? hpy) + (hpy - (cam.py ?? hpy)) * Math.min(1, dt * 7);
  }
  drinkPotion() {
    const h = this.hero, s = this.stats;
    if (h.potionCharges <= 0) { this.ui.toast(STR.noPotions, '#c62828'); return; }
    if (h.hp >= s.maxHp - 1) { this.ui.toast(STR.potionFull); return; }
    h.potionCharges--;
    healHero(this, s.maxHp * POTION_HEAL);
    bus.emit('potion');
    this.fx.burst(h.x, h.y, 12, '#c62828');
  }

  // ---------- РЕНДЕР ----------
  render(timeS, cmds) {
    const r = this.renderer, ctx = r.ctx;
    if (this.state === 'title') {
      ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
      const bgi = this.assets.title_bg;
      ctx.fillStyle = '#05060a'; ctx.fillRect(0, 0, innerWidth, innerHeight);
      if (bgi) {
        const sc = Math.max(innerWidth / bgi.width, innerHeight / bgi.height);
        ctx.globalAlpha = .85;
        ctx.drawImage(bgi, innerWidth / 2 - bgi.width * sc / 2, innerHeight / 2 - bgi.height * sc / 2, bgi.width * sc, bgi.height * sc);
        ctx.globalAlpha = 1;
      }
      const flick = .9 + Math.sin(timeS * 9) * .05 + Math.sin(timeS * 17) * .05;
      ctx.textAlign = 'center';
      let fs = 52;
      ctx.font = `bold ${fs}px Georgia, serif`;
      const tw = ctx.measureText(STR.title).width;
      if (tw > innerWidth * .92) fs = Math.floor(fs * innerWidth * .92 / tw);
      ctx.font = `bold ${fs}px Georgia, serif`;
      ctx.shadowColor = '#b9781f'; ctx.shadowBlur = 26 * flick;
      ctx.fillStyle = '#e8dcc0';
      ctx.fillText(STR.title, innerWidth / 2, innerHeight * .26);
      ctx.shadowBlur = 0;
      ctx.font = '16px Georgia'; ctx.fillStyle = '#8d8574';
      ctx.fillText(STR.subtitle, innerWidth / 2, innerHeight * .26 + 30);
      return; // кнопки меню — DOM-панель
    }
    if (this.state === 'town' || this.state === 'dead') {
      ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
      ctx.fillStyle = '#0a0906'; ctx.fillRect(0, 0, innerWidth, innerHeight);
      const bgi = this.assets.title_bg;
      if (bgi) { ctx.globalAlpha = .3; const sc = Math.max(innerWidth / bgi.width, innerHeight / bgi.height); ctx.drawImage(bgi, innerWidth / 2 - bgi.width * sc / 2, innerHeight / 2 - bgi.height * sc / 2, bgi.width * sc, bgi.height * sc); ctx.globalAlpha = 1; }
      return;
    }
    // dungeon
    r.drawFloor(this, timeS);
    r.drawCorpses(this);
    r.drawDrops(this, timeS);
    // глубинный проход: стены-блоки + жаровни + декор + сундуки + мобы + герой, сортировка по (x+y)
    const [vx0, vx1, vy0, vy1] = r.visRange || [0, 0, 0, 0];
    const list = [];
    const f = this.floor;
    for (let ty = vy0; ty <= vy1; ty++) {
      for (let tx = vx0; tx <= vx1; tx++) {
        if (f.g[ty * f.W + tx] !== 0) continue;
        // рисуем только стены, видимые с пола
        list.push({ kind: 'wall', tx, ty, key: (tx + ty + 1.6) * TILE });
      }
    }
    for (const t of f.torches) {
      const wx = t.x * TILE + TILE / 2, wy = t.y * TILE + TILE / 2;
      if (t.x < vx0 || t.x > vx1 || t.y < vy0 || t.y > vy1) continue;
      list.push({ kind: 'brazier', x: wx, y: wy, key: wx + wy });
    }
    for (const d of f.decor) {
      const wx = d.x * TILE + TILE / 2, wy = d.y * TILE + TILE / 2;
      if (d.x < vx0 || d.x > vx1 || d.y < vy0 || d.y > vy1) continue;
      list.push({ kind: 'decor', d, x: wx, y: wy, key: wx + wy });
    }
    for (const c of this.chestObjs) {
      list.push({ kind: 'chest', c, key: c.x + c.y });
    }
    for (const m of this.mobs) {
      if (m.dead) continue;
      const [mpx, mpy] = proj(m.x, m.y);
      if (Math.abs(mpx - r.cam.px) > innerWidth || Math.abs(mpy - r.cam.py) > innerHeight) continue;
      list.push({ kind: 'mob', m, key: m.x + m.y });
    }
    list.push({ kind: 'hero', key: this.hero.x + this.hero.y });
    list.sort((a, b) => a.key - b.key);
    for (const e of list) {
      if (e.kind === 'wall') r.drawWallCell(this, e.tx, e.ty);
      else if (e.kind === 'brazier') r.drawBrazier(e.x, e.y, timeS);
      else if (e.kind === 'decor') {
        const img = this.assets[this.actData.decor[e.d.kind] || 'dec_bones'];
        if (img) {
          const [px, py] = proj(e.x, e.y);
          r.ctx.save(); r.ctx.translate(px, py); r.ctx.scale(1.4, .8);
          r.ctx.drawImage(img, -42, -42, 84, 84); r.ctx.restore();
        }
      } else if (e.kind === 'chest') {
        const img = this.assets.dec_chest;
        if (img) {
          const [px, py] = proj(e.c.x, e.c.y);
          r.ctx.globalAlpha = e.c.opened ? .45 : 1;
          r.ctx.save(); r.ctx.translate(px, py); r.ctx.scale(1.2, .85);
          r.ctx.drawImage(img, -30, -46, 60, 60); r.ctx.restore();
          r.ctx.globalAlpha = 1;
        }
      } else if (e.kind === 'mob') r.drawMob(this, e.m, timeS);
      else r.drawHero(this, timeS);
    }
    r.drawEffects(this, 1 / 60, timeS);
    r.drawLight(this, timeS); // включает restore из мировых координат
    this.ui.drawHud(ctx, this, this.input);
    r.postFlash(1 / 60);
  }
}

const game = new Game();
if (game.dev) window.__game = game; // отладочный доступ (?dev=1)
(async () => {
  await game.loadAssets();
  game.start();
})();
// PWA
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
