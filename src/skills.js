// Исполнение умений героя: атаки, снаряды, зоны, призывы, формы, баффы.
import { SKILLS, CLASSES } from './data.js';
import { losClear } from './world.js';
import { dist2, clamp, bus, isoAngle } from './core.js';
import { damageMob, makeMob, healHero } from './entities.js';

export function skillRank(hero, id) { return hero.talents[id] || 0; }

// отложенный удар: урон применяется в кадре КОНТАКТА замаха, а не нажатия (DI-вес)
// очередь живёт в g.pendingStrikes и обрабатывается в update — наследует hit-stop
function queueStrike(g, delayS, run) { (g.pendingStrikes ||= []).push({ t: 0, at: delayS, run }); }
const contactS = a => Math.min(Math.max(.35 * a.dur / a.rate, 90), 260) / 1000;

// действие героя: длительность клипа из меты листа, темп проигрывания подгоняется
// под скорость атаки — быстрые билды ускоряют анимацию, а не режут её кадры
function mkAction(g, name, atkSpeed) {
  const dur = g.flare?.heroSheet?.meta?.anims?.[name]?.dur ?? 520;
  // потолок ×3: на пределе скорости атаки замах остаётся различимым
  const rate = Math.max(1, Math.min(3, dur * (atkSpeed || 1) / 1000));
  return { name, t: 0, dur, rate };
}
export function skillDmg(g, sk, rank) {
  const base = sk.dmg ? sk.dmg[0] + sk.dmg[1] * (rank - 1 + g.stats.plusSkills) : 0;
  return base * g.stats.dmgTotal;
}

export function canUse(g, id) {
  const h = g.hero, sk = SKILLS[id];
  if (!sk || !skillRank(h, id)) return false;
  if (sk.form && h.form !== sk.form) return false;
  if (h.cooldowns[id] > 0) return false;
  const cost = sk.cost || 0;
  if (cost > 0 && h.res < cost) return false;
  if (sk.hpCost && h.hp <= g.stats.maxHp * sk.hpCost + 1) return false;
  return true;
}

export function useSkill(g, id, aimX, aimY) {
  const h = g.hero, sk = SKILLS[id];
  if (!canUse(g, id)) return false;
  const rank = skillRank(h, id) + g.stats.plusSkills;
  const s = g.stats;
  if (sk.cost) h.res -= sk.cost;
  if (sk.hpCost) h.hp -= Math.round(s.maxHp * sk.hpCost);
  // GCD: даже у cd:0-умений темп ограничен скоростью атаки (иначе 60 кастов/с)
  h.cooldowns[id] = Math.max((sk.cd || 0) * (1 - s.cdr), 1 / s.attackSpeed);
  const dx = aimX - h.x, dy = aimY - h.y, d = Math.hypot(dx, dy) || 1;
  const nx = dx / d, ny = dy / d;
  const dmg = skillDmg(g, sk, rank);
  h.attackT = .22; h.dir = nx < 0 ? -1 : 1;
  h.faceAngle = isoAngle(nx, ny);
  // вихрь/новы у не-кастеров без лука — это взмах оружием, а не каст
  const meleeNova = sk.kind === 'nova' && !g.cls.weapons.includes('staff') && !g.cls.weapons.includes('bow');
  h.action = mkAction(g, sk.kind === 'melee' || sk.kind === 'dash' || meleeNova ? 'swing'
    : (g.cls.weapons.includes('bow') ? 'shoot' : 'cast'), s.attackSpeed);
  bus.emit('skill', sk, id);

  switch (sk.kind) {
    case 'melee': {
      const ang = Math.atan2(ny, nx);
      queueStrike(g, contactS(h.action), () => {
        for (const m of g.mobs) {
          if (m.dead || m.type === 'ally') continue;
          const md = Math.hypot(m.x - h.x, m.y - h.y);
          if (md > sk.range * 1.08 + m.r) continue; // +8%: цель успевает сместиться за замах
          const ma = Math.atan2(m.y - h.y, m.x - h.x);
          let da = Math.abs(ma - ang); if (da > Math.PI) da = 2 * Math.PI - da;
          if (da > (sk.arc || 2) / 2) continue;
          let dd = dmg;
          if (sk.execBonus && m.hp < m.maxHp * .3) dd *= 1 + sk.execBonus * rank;
          damageMob(g, m, dd, { stun: sk.stun, dot: sk.bleed ? (sk.bleed[0] + sk.bleed[1] * rank) * s.dmgTotal / 3 : 0, dotT: 3, elem: sk.elem });
        }
        g.fx.slash(h.x, h.y, ang, sk.range);
      });
      break;
    }
    case 'nova': {
      for (const m of g.mobs) {
        if (m.dead || m.type === 'ally') continue;
        if (dist2(m.x, m.y, h.x, h.y) > (sk.range + m.r) ** 2) continue;
        if (sk.curse) { m.dmgTakenMul = sk.curse.dmgTaken; m.curseT = sk.curse.dur; }
        if (dmg > 0 || sk.fear || sk.freeze || sk.slow) damageMob(g, m, Math.max(dmg, .1), { spell: true, fear: sk.fear, freeze: sk.freeze, slow: sk.slow, elem: sk.elem });
        if (sk.soulPerHit) h.res = Math.min(s.maxRes, h.res + sk.soulPerHit);
      }
      g.fx.nova(h.x, h.y, sk.range, sk.elem === 'cold' ? '#4fc3f7' : sk.elem === 'fire' ? '#ff7043' : sk.fear ? '#b388ff' : '#e0d9c8');
      break;
    }
    case 'proj': {
      const n = sk.n || 1;
      for (let i = 0; i < n; i++) {
        const off = n > 1 ? (i / (n - 1) - .5) * (sk.spread || .5) : 0;
        const a = Math.atan2(ny, nx) + off;
        g.projectiles.push({ from: 'hero', x: h.x, y: h.y - 14, vx: Math.cos(a) * 460 * (sk.speed || 1), vy: Math.sin(a) * 460 * (sk.speed || 1),
          r: 6, dmg: dmg, elem: sk.elem, splash: sk.splash, pierce: sk.pierce || 0, slow: sk.slow,
          dot: sk.dot ? (sk.dot[0] + sk.dot[1] * rank) * s.dmgTotal / 3 : 0, ttl: 1.4,
          color: sk.elem === 'fire' ? '#ff8a50' : sk.elem === 'cold' ? '#6fd3ff' : sk.elem === 'poison' ? '#9ccc65' : '#f5e9c8', spell: true });
      }
      break;
    }
    case 'chain': {
      let from = { x: h.x, y: h.y }, target = null, hit = new Set();
      for (let j = 0; j <= sk.jumps + Math.floor(rank / 2); j++) {
        let best = 1e12; target = null;
        for (const m of g.mobs) {
          if (m.dead || m.type === 'ally' || hit.has(m)) continue;
          const dd = dist2(m.x, m.y, from.x, from.y);
          if (dd < best && dd < 240 * 240) { best = dd; target = m; }
        }
        if (!target) break;
        hit.add(target);
        g.fx.lightning(from.x, from.y, target.x, target.y);
        damageMob(g, target, dmg * Math.pow(.85, j), { spell: true, elem: 'light' });
        from = target;
      }
      break;
    }
    case 'zone': {
      const zx = clamp(aimX, h.x - 300, h.x + 300), zy = clamp(aimY, h.y - 300, h.y + 300);
      g.zones.push({ from: 'hero', x: zx, y: zy, r: sk.r, t: (sk.ticks || 5) * .5, tickT: sk.delay || 0, tickEvery: .5,
        dps: dmg, elem: sk.elem, root: sk.root, spell: true,
        color: sk.elem === 'fire' ? '#ff7043' : sk.elem === 'light' ? '#b388ff' : sk.elem === 'poison' ? '#9ccc65' : '#d9cba3',
        oneshot: !!sk.delay });
      break;
    }
    case 'trap': {
      g.traps.push({ x: h.x + nx * 60, y: h.y + ny * 60, r: sk.r, dmg, elem: sk.elem, slow: sk.slow, armT: .5, t: 20 });
      break;
    }
    case 'dash': {
      let tx = h.x + nx * sk.range, ty = h.y + ny * sk.range;
      // не в стену
      for (let t = 1; t >= 0; t -= .1) {
        const px = h.x + nx * sk.range * t, py = h.y + ny * sk.range * t;
        if (losClear(g.floor, h.x, h.y, px, py)) { tx = px; ty = py; break; }
      }
      g.fx.dashTrail(h.x, h.y, tx, ty);
      h.x = tx; h.y = ty; h.invulnT = .3;
      if (dmg > 0) for (const m of g.mobs) {
        if (m.dead || m.type === 'ally') continue;
        if (dist2(m.x, m.y, h.x, h.y) < (90 + m.r) ** 2) damageMob(g, m, dmg, { stun: sk.stun });
      }
      if (sk.stun) g.fx.shake(8);
      break;
    }
    case 'buff': {
      if (sk.healPct) healHero(g, s.maxHp * (sk.healPct + rank * .03));
      if (sk.dur) {
        const ex = h.buffs.find(b => b.id === id);
        if (ex) ex.t = sk.dur; else h.buffs.push({ id, t: sk.dur, mods: sk.buff });
      }
      g.fx.buff(h.x, h.y);
      g.recalcBuffs();
      break;
    }
    case 'summon': {
      const maxN = Math.floor(sk.max[0] + sk.max[1] * rank);
      const mine = g.mobs.filter(m => m.type === 'ally' && m.kind === sk.mob && !m.dead);
      if (mine.length >= maxN) { const oldest = mine[0]; oldest.dead = true; }
      const mm = makeMob(g.rng, sk.mob, h.x + g.rng.range(-40, 40), h.y + g.rng.range(-40, 40), h.level);
      mm.dmg *= (1 + s.minionDmg) * (1 + rank * .12);
      mm.maxHp *= (1 + s.minionHp) * (1 + rank * .15); mm.hp = mm.maxHp;
      g.mobs.push(mm);
      break;
    }
    case 'form': {
      h.form = h.form === sk.form ? null : sk.form;
      g.fx.burst(h.x, h.y, 18, '#9ccc65');
      g.recalc();
      break;
    }
    case 'curse': {
      // ближайший враг в направлении
      let best = 1e12, target = null;
      for (const m of g.mobs) {
        if (m.dead || m.type === 'ally') continue;
        const dd = dist2(m.x, m.y, aimX, aimY);
        if (dd < best) { best = dd; target = m; }
      }
      if (target && Math.hypot(target.x - h.x, target.y - h.y) < 480) {
        damageMob(g, target, dmg * .3 || 1, { spell: true, elem: sk.elem, dot: (sk.dot[0] + sk.dot[1] * rank) * s.dmgTotal, dotT: sk.dur });
      }
      break;
    }
  }
  return true;
}

// Базовая атака (кнопка attack): ближняя или дальняя по оружию/классу.
export function basicAttack(g, aimX, aimY) {
  const h = g.hero, s = g.stats;
  if (h.attackCd > 0) return;
  h.attackCd = 1 / s.attackSpeed;
  const cls = CLASSES[h.cls];
  const wpn = h.equip.weapon;
  const dx = aimX - h.x, dy = aimY - h.y, d = Math.hypot(dx, dy) || 1;
  h.dir = dx < 0 ? -1 : 1; h.attackT = .2;
  h.faceAngle = isoAngle(dx, dy);
  const isRangedA = wpn?.ranged || (wpn?.caster && (h.cls === 'mage' || h.cls === 'warlock'));
  h.action = mkAction(g, h.form ? 'swing' : isRangedA ? (wpn?.ranged ? 'shoot' : 'cast') : 'swing', s.attackSpeed);
  bus.emit('attack', h);
  const dmgRoll = () => g.rng.range(s.wDmg[0], s.wDmg[1]) * (1 + s[cls.gain.dmgStat] * .012) * (1 + s.dmgMul) + s.dmgFlat;
  const isRanged = wpn?.ranged || (wpn?.caster && (h.cls === 'mage' || h.cls === 'warlock'));
  if (h.form === 'wolf' || h.form === 'bear' || (!isRanged)) {
    const range = h.form === 'bear' ? 66 : 56, ang = Math.atan2(dy, dx);
    queueStrike(g, contactS(h.action), () => {
      let hitAny = false;
      for (const m of g.mobs) {
        if (m.dead || m.type === 'ally') continue;
        const md = Math.hypot(m.x - h.x, m.y - h.y);
        if (md > range * 1.08 + m.r) continue;
        const ma = Math.atan2(m.y - h.y, m.x - h.x);
        let da = Math.abs(ma - ang); if (da > Math.PI) da = 2 * Math.PI - da;
        if (da > 1.1) continue;
        damageMob(g, m, dmgRoll() * (h.form === 'bear' ? 1.25 : h.form === 'wolf' ? 1.1 : 1));
        hitAny = true;
      }
      g.fx.slash(h.x, h.y, ang, range);
      if (hitAny) {
        g.fx.shake(2);
        if (cls.resOnHit) h.res = Math.min(s.maxRes, h.res + cls.resOnHit); // ресурс только за попадание
      }
    });
  } else {
    if (cls.resOnHit) h.res = Math.min(s.maxRes, h.res + cls.resOnHit);
    g.projectiles.push({ from: 'hero', x: h.x, y: h.y - 14, vx: dx / d * 520, vy: dy / d * 520, r: 5,
      dmg: dmgRoll(), ttl: 1.1, pierce: 0, color: wpn?.caster ? '#b388ff' : '#f5e9c8', arrow: !wpn?.caster });
  }
}

// автоприцел: ближайший видимый враг, иначе направление движения
export function autoAim(g) {
  const h = g.hero;
  let best = 1e12, target = null;
  for (const m of g.mobs) {
    if (m.dead || m.type === 'ally') continue;
    const dd = dist2(m.x, m.y, h.x, h.y);
    if (dd < best && dd < 520 * 520 && losClear(g.floor, h.x, h.y, m.x, m.y)) { best = dd; target = m; }
  }
  if (target) return [target.x, target.y];
  return [h.x + (h.faceX || 1) * 100, h.y + (h.faceY || 0) * 100];
}
