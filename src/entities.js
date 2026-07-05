// Сущности и бой: герой, монстры, снаряды, зоны, статусы, дроп.
import { TILE, MOBS, MOB_SCALE, SKILLS, CLASSES, ELITE_MODS, POTION_HEAL } from './data.js';
import { collide, losClear } from './world.js';
import { dist2, len, clamp, bus, isoAngle } from './core.js';
import { armorReduction, makeItem } from './items.js';

export function makeMob(rng, kind, x, y, lvl, eliteMod) {
  const base = MOBS[kind];
  const sc = MOB_SCALE(lvl);
  const m = {
    type: 'mob', kind, x, y, r: base.r * (base.scale || 1), lvl,
    hp: base.hp * sc.hp, maxHp: base.hp * sc.hp, dmg: base.dmg * sc.dmg,
    speed: base.speed, xp: base.xp * sc.xp, ai: base.ai, family: base.family,
    sprite: base.sprite, flare: base.flare, fscale: base.fscale || 1,
    tint: base.tint || null, scale: base.scale || 1,
    cd: 0, hitT: 0, slowT: 0, freezeT: 0, stunT: 0, fearT: 0, rootT: 0,
    dots: [], dir: 1, animT: Math.random() * 10, aggro: false, boss: base.boss || 0,
    lunge: base.lunge, boomR: base.boomR, proj: base.proj, skills: base.skills, phase: 0,
    angle: Math.PI / 2, action: null,
  };
  if (eliteMod) {
    const em = ELITE_MODS[eliteMod];
    m.elite = eliteMod; m.tint = em.tint;
    m.maxHp *= 3.2; m.hp = m.maxHp; m.dmg *= 1.5; m.xp *= 4; m.scale *= 1.22; m.r *= 1.22;
    if (em.speed) m.speed *= em.speed;
    if (em.elem) m.elem = em.elem;
    if (em.leech) m.leech = em.leech;
  }
  if (base.ai === 'ally') { m.type = 'ally'; m.ttl = 25; }
  return m;
}

// --- урон герою/от героя с резистами и бронёй ---
export function damageMob(g, m, raw, opts = {}) {
  const s = g.stats;
  let dmg = raw;
  if (opts.canCrit !== false && g.rng.chance(s.critCh / 100)) { dmg *= 1.5 + s.critDmg; opts.crit = true; }
  if (m.family === 'undead') dmg *= 1 + s.vsUndead;
  if (m.family === 'demon') dmg *= 1 + s.vsDemon;
  if (opts.spell) dmg *= 1 + s.spellDmg;
  dmg *= 1 + (m.dmgTakenMul || 0); // проклятие «Слабость» и подобные
  m.hp -= dmg; m.hitT = .12; m.aggro = true;
  // отдача по-DI: отбрасывание слабых, хит-стоп и встряска на критах
  if (!m.boss && !opts.noKb) {
    const kdx = m.x - g.hero.x, kdy = m.y - g.hero.y, kd = Math.hypot(kdx, kdy) || 1;
    const imp = (opts.crit ? 240 : 130) * (m.elite ? .35 : 1);
    m.kvx = (m.kvx || 0) + kdx / kd * imp; m.kvy = (m.kvy || 0) + kdy / kd * imp;
  }
  // хит-стоп с троттлингом: АоЕ-криты по толпе не складываются в постоянный фриз
  if (opts.crit && (!g._hsT || g.time - g._hsT > .35)) {
    g._hsT = g.time;
    g.hitStop = Math.max(g.hitStop || 0, .05); g.fx.shake(5);
    try { navigator.vibrate?.(15); } catch {}
  }
  if (s.leech > 0 && !opts.noLeech) healHero(g, dmg * s.leech);
  if (s.poisonOnHit && !opts.spell) m.dots.push({ dps: dmg * s.poisonOnHit / 3, t: 3, elem: 'poison' });
  if (opts.slow) { m.slowT = Math.max(m.slowT, opts.slow); }
  if (opts.freeze && !m.boss) m.freezeT = Math.max(m.freezeT, opts.freeze);
  if (opts.stun && !m.boss) m.stunT = Math.max(m.stunT, opts.stun);
  if (opts.fear && !m.boss) m.fearT = Math.max(m.fearT, opts.fear);
  if (opts.root && !m.boss) m.rootT = Math.max(m.rootT, opts.root);
  if (opts.dot) m.dots.push({ dps: opts.dot, t: opts.dotT || 4, elem: opts.elem || 'poison' });
  bus.emit('hit', m, dmg, opts);
  g.fx.number(m.x, m.y - m.r - 6, Math.round(dmg), opts.crit ? '#ffd75e' : opts.elem ? ({ fire: '#ff7043', cold: '#4fc3f7', light: '#b388ff', poison: '#9ccc65' })[opts.elem] : '#eee', opts.crit);
  if (m.hp <= 0) killMob(g, m);
}

export function killMob(g, m) {
  if (m.dead) return; m.dead = true;
  bus.emit('mobDied', m);
  // фриз на убийстве — тоже с троттлингом (вихрь по толпе не должен фризить постоянно)
  if (m.boss || m.elite || !g._hsKT || g.time - g._hsKT > .4) {
    g._hsKT = g.time;
    g.hitStop = Math.max(g.hitStop || 0, m.boss ? .12 : m.elite ? .08 : .045);
    if (m.boss || m.elite) try { navigator.vibrate?.(35); } catch {}
  }
  g.fx.burst(m.x, m.y, m.elite ? 22 : 12, '#8b0f23');
  if (m.flare && g.corpses) g.corpses.push({ flare: m.flare, x: m.x, y: m.y, angle: m.angle, r: m.r, fscale: m.fscale, tint: m.tint, t: 0 });
  if (m.type === 'ally') return;
  // опыт
  gainXp(g, m.xp);
  const hero = g.hero, s = g.stats;
  if (CLASSES[hero.cls].resOnKill) hero.res = Math.min(s.maxRes, hero.res + CLASSES[hero.cls].resOnKill);
  // дроп
  const rng = g.rng;
  const goldCh = m.boss ? 1 : m.elite ? .9 : .3;
  if (rng.chance(goldCh)) {
    const amt = Math.round((3 + m.lvl * 2.2 + rng.int(0, m.lvl * 3)) * (1 + s.goldFind) * (m.boss ? 8 : m.elite ? 3 : 1));
    g.drops.push({ kind: 'gold', x: m.x + rng.range(-14, 14), y: m.y + rng.range(-14, 14), amt, t: 0 });
  }
  let itemCh = m.boss ? 3.2 : m.elite ? 1.1 : .09;
  itemCh *= 1 + s.magicFind * .5;
  while (itemCh > 0) {
    if (rng.chance(Math.min(1, itemCh))) {
      const it = makeItem(rng, clamp(m.lvl + rng.int(-1, 2), 1, 60), { magicFind: s.magicFind + (m.boss ? .6 : m.elite ? .25 : 0) });
      g.drops.push({ kind: 'item', x: m.x + rng.range(-18, 18), y: m.y + rng.range(-18, 18), item: it, t: 0 });
    }
    itemCh -= 1;
  }
  if (rng.chance(m.boss ? 1 : .05)) g.drops.push({ kind: 'potion', x: m.x, y: m.y + 10, t: 0 });
  // сфера жизни (как в DI): шанс с обычных, всегда с элиток и боссов
  if (m.boss || m.elite || rng.chance(.12)) g.drops.push({ kind: 'globe', x: m.x + rng.range(-16, 16), y: m.y + rng.range(-10, 18), t: 0 });
  if (m.name) { // именной редкий: гарантированный магический+ дроп
    const it2 = makeItem(rng, m.lvl + 1, { magicFind: 1.2 });
    g.drops.push({ kind: 'item', x: m.x, y: m.y + 14, item: it2, t: 0 });
  }
  if (m.boss) bus.emit('bossDied', m);
}

export function gainXp(g, xp) {
  const h = g.hero;
  if (h.level >= 40) return;
  h.xp += Math.round(xp);
  bus.emit('xp');
  while (h.xp >= h.xpNext && h.level < 40) {
    h.xp -= h.xpNext; h.level++;
    h.xpNext = g.xpCurve(h.level);
    h.statPts += 5; h.talentPts += 1;
    unlockSkills(g);
    g.recalc();
    h.hp = g.stats.maxHp; h.res = g.stats.maxRes;
    g.fx.levelUp(h.x, h.y);
    try { navigator.vibrate?.([30, 40, 30]); } catch {}
    bus.emit('levelUp', h.level);
  }
}

// DI-разблокировка: умения открываются уровнями сами (ранг 1),
// очки талантов дальше усиливают их до ранга 5
export function unlockSkills(g) {
  const h = g.hero;
  for (const id in SKILLS) {
    const sk = SKILLS[id];
    if (sk.cls !== h.cls || sk.lvl > h.level) continue;
    if (h.talents[id]) continue;
    h.talents[id] = 1;
    if (!sk.passive && h.skillBar.length < 4 && !h.skillBar.includes(id)) h.skillBar.push(id);
    bus.emit('skillUnlocked', sk);
    g.ui?.toast(`Новое умение: ${sk.name}`, '#7fd68a');
  }
}

export function healHero(g, amt) { g.hero.hp = Math.min(g.stats.maxHp, g.hero.hp + amt); }

export function damageHero(g, raw, elem, attackerLvl = 1) {
  const h = g.hero, s = g.stats;
  if (h.invulnT > 0 || h.dead) return;
  let dmg = raw;
  if (elem) {
    const res = ({ fire: s.resFire, cold: s.resCold, light: s.resLight, poison: s.resPoison })[elem] || 0;
    dmg *= 1 - res / 100;
  } else {
    let arm = s.armor;
    if (s.lowHpArmor && h.hp < s.maxHp * .3) arm *= 1 + s.lowHpArmor;
    dmg *= 1 - armorReduction(arm, attackerLvl);
    if (s.blockCh && g.rng.chance(Math.min(.6, s.blockCh / 100))) { g.fx.text(h.x, h.y - 24, 'БЛОК', '#9fb4c7'); return 0; }
  }
  if (h.form === 'bear') dmg *= .7;
  dmg = Math.max(1, Math.round(dmg));
  h.hp -= dmg; h.hurtT = .25; h.invulnT = .15;
  bus.emit('heroHurt', dmg);
  if (h.hp <= 0) { h.hp = 0; h.dead = true; bus.emit('heroDied'); }
  return dmg;
}

export function thornsBack(g, m) {
  if (g.stats.thorns > 0) { m.hp -= g.stats.thorns; m.hitT = .1; if (m.hp <= 0) killMob(g, m); }
}

// ---- ОБНОВЛЕНИЕ МОНСТРА ----
export function updateMob(g, m, dt) {
  m.animT += dt;
  m.moving = false;
  if (m.action) { m.action.t += dt * 1000; if (m.action.t > 650) m.action = null; }
  if (m.hitT > 0) m.hitT -= dt;
  // доты
  for (let i = m.dots.length - 1; i >= 0; i--) {
    const d = m.dots[i];
    m.hp -= d.dps * dt; d.t -= dt;
    if (d.t <= 0) m.dots.splice(i, 1);
    if (m.hp <= 0) { killMob(g, m); return; }
  }
  // отбрасывание (затухающий импульс)
  if (m.kvx || m.kvy) {
    const [cx, cy] = collide(g.floor, m.x + m.kvx * dt, m.y + m.kvy * dt, m.r);
    m.x = cx; m.y = cy;
    const dec = Math.max(0, 1 - 9 * dt);
    m.kvx *= dec; m.kvy *= dec;
    if (Math.abs(m.kvx) + Math.abs(m.kvy) < 6) m.kvx = m.kvy = 0;
  }
  if (m.freezeT > 0) { m.freezeT -= dt; return; }
  if (m.stunT > 0) { m.stunT -= dt; return; }
  // замах: стоим и телеграфируем удар, урон применит телеграф
  if (m.windup) { m.windup -= dt; if (m.windup <= 0) m.windup = null; return; }
  const h = g.hero;
  const dx = h.x - m.x, dy = h.y - m.y, d = Math.hypot(dx, dy) || 1;
  if (!m.aggro) { if (d < 260 && losClear(g.floor, m.x, m.y, h.x, h.y)) m.aggro = true; else return; }
  let sp = m.speed * (m.slowT > 0 ? .45 : 1);
  if (m.slowT > 0) m.slowT -= dt;
  if (m.rootT > 0) { m.rootT -= dt; sp = 0; }
  m.dir = dx < 0 ? -1 : 1;
  m.angle = isoAngle(dx, dy);
  m.cd -= dt;

  // союзники героя воюют с монстрами
  if (m.type === 'ally') { updateAlly(g, m, dt); return; }

  if (m.fearT > 0) { m.fearT -= dt; moveMob(g, m, -dx / (d || 1), -dy / (d || 1), sp * 1.2, dt); return; }

  if (m.ai === 'bomber') {
    if (d < 52 && !m.fused) { // фитиль: круг-телеграф, взрыв через полсекунды
      m.fused = true;
      m.windup = .55;
      g.telegraphs.push({ kind: 'circle', x: m.x, y: m.y, r: m.boomR, t: 0, dur: .55, hit: () => {
        m.hp = 0; killMob(g, m);
        g.fx.explosion(m.x, m.y, m.boomR, '#9ccc65');
        if (dist2(m.x, m.y, g.hero.x, g.hero.y) < m.boomR * m.boomR) damageHero(g, m.dmg, 'poison', m.lvl);
      } });
      return;
    }
    if (!m.fused) moveMob(g, m, dx / d, dy / d, sp, dt);
  } else if (m.ai === 'caster') {
    if (d > 420) { moveMob(g, m, dx / d, dy / d, sp, dt); }
    else if (d < 140) { moveMob(g, m, -dx / d, -dy / d, sp * .8, dt); }
    if (m.cd <= 0 && d < 460 && losClear(g.floor, m.x, m.y, h.x, h.y)) {
      m.cd = 2.2;
      m.action = { name: 'cast', t: 0 };
      g.projectiles.push({ from: 'mob', x: m.x, y: m.y, vx: dx / d * 300, vy: dy / d * 300, r: 7,
        dmg: m.dmg, elem: m.proj === 'fire' ? 'fire' : null, ttl: 2.2, color: m.proj === 'fire' ? '#ff7043' : '#b388ff', lvl: m.lvl });
      bus.emit('mobCast', m);
    }
  } else if (m.ai === 'boss') {
    updateBoss(g, m, dt, d, dx, dy);
  } else { // melee
    if (m.lunge && d < 200 && d > 70 && m.cd <= 0) { m.vx = dx / d * 520; m.vy = dy / d * 520; m.lungeT = .25; m.cd = 2.5; }
    if (m.lungeT > 0) { m.lungeT -= dt; moveMob(g, m, m.vx / 520, m.vy / 520, 520, dt); }
    else if (d > m.r + 16) moveMob(g, m, dx / d, dy / d, sp, dt);
    if (d < m.r + 26 && m.cd <= 0) {
      // замах 0.42с с красным сектором — можно выйти из-под удара
      m.cd = 1.25;
      m.windup = .48;
      m.action = { name: 'swing', t: 0 };
      const ang = Math.atan2(dy, dx);
      g.telegraphs.push({ kind: 'arc', src: m, r: m.r + 52, angle: ang, spread: 1.6, t: 0, dur: .48, hit: () => {
        if (m.dead || m.stunT > 0 || m.freezeT > 0 || m.fearT > 0) return;
        const hh = g.hero, ddx = hh.x - m.x, ddy = hh.y - m.y, dd = Math.hypot(ddx, ddy);
        if (dd > m.r + 52 || Math.abs(((Math.atan2(ddy, ddx) - ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI) > .8) return;
        const dealt = damageHero(g, m.dmg, m.elem, m.lvl);
        if (dealt) thornsBack(g, m);
        if (m.leech) m.hp = Math.min(m.maxHp, m.hp + dealt * m.leech);
        bus.emit('mobAttack', m);
      } });
    }
  }
  // сепарация от других монстров (дёшево: каждые несколько кадров)
  if (((g.tick + (m.sepPhase ||= (Math.random() * 4) | 0)) & 3) === 0) {
    for (const o of g.mobs) {
      if (o === m || o.dead) continue;
      const d2v = dist2(m.x, m.y, o.x, o.y), rr = (m.r + o.r) * .9;
      if (d2v < rr * rr && d2v > 1) {
        const dd = Math.sqrt(d2v), push = (rr - dd) / dd * .5;
        m.x += (m.x - o.x) * push; m.y += (m.y - o.y) * push;
      }
    }
  }
}

function moveMob(g, m, nx, ny, sp, dt) {
  const [cx, cy] = collide(g.floor, m.x + nx * sp * dt, m.y + ny * sp * dt, m.r);
  m.x = cx; m.y = cy; m.moving = true;
}

function updateAlly(g, m, dt) {
  m.ttl -= dt; if (m.ttl <= 0) { m.dead = true; return; }
  const s = g.stats;
  let target = null, best = 1e12;
  for (const o of g.mobs) { if (o.dead || o.type === 'ally') continue; const dd = dist2(m.x, m.y, o.x, o.y); if (dd < best) { best = dd; target = o; } }
  const h = g.hero;
  if (!target || best > 500 * 500) { // идём к герою
    const dx = h.x - m.x, dy = h.y - m.y, d = Math.hypot(dx, dy);
    if (d > 60) moveMob(g, m, dx / d, dy / d, m.speed, dt);
    return;
  }
  const dx = target.x - m.x, dy = target.y - m.y, d = Math.hypot(dx, dy) || 1;
  m.dir = dx < 0 ? -1 : 1;
  m.angle = isoAngle(dx, dy);
  if (d > m.r + target.r + 6) moveMob(g, m, dx / d, dy / d, m.speed, dt);
  else if (m.cd <= 0) {
    m.cd = 1;
    m.action = { name: 'swing', t: 0 };
    const dmg = m.dmg * (1 + s.minionDmg);
    target.hp -= dmg; target.hitT = .12; target.aggro = true;
    g.fx.number(target.x, target.y - target.r, Math.round(dmg), '#7fd6a0');
    if (target.hp <= 0) killMob(g, target);
  }
}

function updateBoss(g, m, dt, d, dx, dy) {
  const h = g.hero;
  const enraged = m.hp < m.maxHp * .4;
  const sp = m.speed * (enraged ? 1.35 : 1) * (m.slowT > 0 ? .6 : 1);
  if (d > m.r + 26) moveMob(g, m, dx / d, dy / d, sp, dt);
  else if (m.cd <= 0) {
    m.cd = enraged ? .9 : 1.3;
    m.windup = .5;
    m.action = { name: 'swing', t: 0 };
    const ang = Math.atan2(dy, dx);
    g.telegraphs.push({ kind: 'arc', src: m, r: m.r + 64, angle: ang, spread: 1.9, t: 0, dur: .5, hit: () => {
      if (m.dead || m.stunT > 0 || m.freezeT > 0) return;
      const hh = g.hero, ddx = hh.x - m.x, ddy = hh.y - m.y, dd = Math.hypot(ddx, ddy);
      if (dd > m.r + 64 || Math.abs(((Math.atan2(ddy, ddx) - ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI) > .95) return;
      const dealt = damageHero(g, m.dmg, m.elem, m.lvl);
      if (dealt) thornsBack(g, m);
    } });
  }
  m.skillCd = (m.skillCd ?? 3) - dt;
  if (m.skillCd <= 0 && m.skills) {
    m.skillCd = enraged ? 3.2 : 5;
    const sk = g.rng.pick(m.skills);
    const [kind, arg] = sk.split(':');
    if (kind === 'summon') {
      for (let i = 0; i < (enraged ? 4 : 3); i++) {
        const mm = makeMob(g.rng, arg, m.x + g.rng.range(-70, 70), m.y + g.rng.range(-70, 70), m.lvl);
        mm.aggro = true; g.mobs.push(mm);
      }
      bus.emit('bossSummon', m);
    } else if (kind === 'nova') {
      // большая нова — телеграф 0.8с, из круга можно выбежать
      m.windup = 1.2;
      g.telegraphs.push({ kind: 'circle', src: m, r: 190, t: 0, dur: 1.2, hit: () => {
        if (m.dead) return;
        g.fx.explosion(m.x, m.y, 190, arg === 'cold' ? '#4fc3f7' : '#ff7043');
        if (dist2(m.x, m.y, h.x, h.y) < 190 * 190) { damageHero(g, m.dmg * 1.2, arg, m.lvl); if (arg === 'cold') h.slowT = 2; }
      } });
    } else if (kind === 'zone') {
      g.zones.push({ from: 'mob', x: h.x, y: h.y, r: 95, t: 4, tickT: 0, dps: m.dmg * .5, elem: 'poison', color: '#9ccc65', lvl: m.lvl });
    } else if (kind === 'charge') {
      m.vx = dx / d * 700; m.vy = dy / d * 700; m.lungeT = .4; bus.emit('bossCharge', m);
    } else if (kind === 'proj') {
      for (let i = -1; i <= 1; i++) {
        const a = Math.atan2(dy, dx) + i * .3;
        g.projectiles.push({ from: 'mob', x: m.x, y: m.y, vx: Math.cos(a) * 340, vy: Math.sin(a) * 340, r: 9,
          dmg: m.dmg * .8, elem: 'fire', ttl: 2.5, color: '#ff7043', lvl: m.lvl });
      }
    }
  }
  if (m.lungeT > 0) {
    m.lungeT -= dt;
    const [cx, cy] = collide(g.floor, m.x + m.vx * dt, m.y + m.vy * dt, m.r);
    m.x = cx; m.y = cy;
    if (d < m.r + 30 && !m.chargeHit) { m.chargeHit = true; damageHero(g, m.dmg * 1.5, null, m.lvl); }
  } else m.chargeHit = false;
  // фазы: на 66% и 33% — «костяная волна»: телеграф-круг, затем кольцо снарядов + призыв
  const phase = m.hp < m.maxHp * .33 ? 2 : m.hp < m.maxHp * .66 ? 1 : 0;
  if (phase > (m.wavePhase || 0)) {
    m.wavePhase = phase;
    m.windup = .9;
    g.fx.shake(12);
    bus.emit('bossRage', m);
    const mx = m.x, my = m.y;
    g.telegraphs.push({ kind: 'circle', x: mx, y: my, r: 240, t: 0, dur: .9, hit: () => {
      if (m.dead) return;
      const n = 14;
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2;
        g.projectiles.push({ from: 'mob', x: mx, y: my, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300, r: 8,
          dmg: m.dmg * .9, ttl: 1.6, color: '#e8dcc0', lvl: m.lvl });
      }
      for (let i = 0; i < 2 + phase; i++) {
        const mm = makeMob(g.rng, 'skeleton', mx + g.rng.range(-90, 90), my + g.rng.range(-90, 90), m.lvl);
        mm.aggro = true; g.mobs.push(mm);
      }
      g.fx.explosion(mx, my, 200, '#e8dcc0');
    } });
  }
}
