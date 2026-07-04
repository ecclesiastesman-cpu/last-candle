// Рендер: тайлы, стены, спрайты-марионетки с экипировкой, свет, частицы, числа.
import { TILE } from './data.js';
import { STR } from './strings.js';
const STRN = STR.npc;
import { T_WALL, T_EXIT, T_ENTRY, isWall } from './world.js';
import { clamp, lerp, proj, ISOX, ISOY } from './core.js';

export class Renderer {
  constructor(canvas, assets) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.assets = assets;
    this.cam = { x: 0, y: 0, shake: 0 };
    this.particles = []; this.numbers = []; this.flashes = [];
    this.tintCache = new Map();
    this.lightCanvas = document.createElement('canvas');
    this.zoom = 1;
    this.reduceShake = false; this.reduceFlash = false;
    this.wallCache = new Map(); // act -> canvas кирпичной кладки из тайла акта
  }
  // кирпичная стена, выведенная из текстуры пола акта: темнее, с рядами кладки
  wallPattern(g) {
    const key = g.actData.tiles;
    let c = this.wallCache.get(key);
    if (c) return c;
    const tile = this.assets[key];
    c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    if (tile) { x.drawImage(tile, 0, 0, 128, 128); }
    else { x.fillStyle = g.actData.wall; x.fillRect(0, 0, 128, 128); }
    x.fillStyle = 'rgba(8,8,12,0.62)'; x.fillRect(0, 0, 128, 128); // затемнение
    // кладка: ряды кирпичей со швами
    x.strokeStyle = 'rgba(0,0,0,0.55)'; x.lineWidth = 2;
    for (let row = 0; row < 4; row++) {
      const y = row * 32;
      x.beginPath(); x.moveTo(0, y); x.lineTo(128, y); x.stroke();
      const off = (row % 2) * 32;
      for (let bx = off; bx <= 128; bx += 64) { x.beginPath(); x.moveTo(bx, y); x.lineTo(bx, y + 32); x.stroke(); }
      // блик сверху каждого ряда
      x.fillStyle = 'rgba(255,240,210,0.05)'; x.fillRect(0, y + 2, 128, 3);
    }
    this.wallCache.set(key, c);
    return c;
  }
  resize(dprCap = 1.5) {
    const dpr = Math.min(devicePixelRatio || 1, dprCap);
    this.dpr = dpr;
    this.canvas.width = innerWidth * dpr; this.canvas.height = innerHeight * dpr;
    this.canvas.style.width = innerWidth + 'px'; this.canvas.style.height = innerHeight + 'px';
    this.lightCanvas.width = Math.ceil(innerWidth / 4); this.lightCanvas.height = Math.ceil(innerHeight / 4);
    this.zoom = clamp(Math.min(innerWidth, innerHeight) / 760, .5, .95);
  }
  // тонированный спрайт с кэшем
  tinted(img, tint, alpha = .55) {
    const key = img.__id + '|' + tint;
    let c = this.tintCache.get(key);
    if (!c) {
      c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0);
      x.globalCompositeOperation = 'source-atop'; x.globalAlpha = alpha;
      x.fillStyle = tint; x.fillRect(0, 0, c.width, c.height);
      this.tintCache.set(key, c);
    }
    return c;
  }
  worldToScreen(x, y) {
    const [px, py] = proj(x, y);
    return [(px - this.cam.px) * this.zoom + innerWidth / 2, (py - this.cam.py) * this.zoom + innerHeight / 2];
  }
  screenToWorld(sx, sy) {
    const px = (sx - innerWidth / 2) / this.zoom + this.cam.px;
    const py = (sy - innerHeight / 2) / this.zoom + this.cam.py;
    return [px / (2 * ISOX) + py / (2 * ISOY), py / (2 * ISOY) - px / (2 * ISOX)];
  }
  // тайл из атласа тайлсета: рисуется в сценических (проекционных) координатах
  tileEntry(id) { return this.tilesMeta?.rects?.[String(id)]; }
  drawAtlasTile(id, wx, wy) {
    const e = this.tileEntry(id);
    if (!e || !this.tilesImg) return false;
    const [px, py] = proj(wx, wy);
    this.ctx.drawImage(this.tilesImg, e[0], e[1], e[2], e[3], px - e[4], py - e[5], e[2], e[3]);
    return true;
  }
  pickVariant(group, tx, ty) {
    const ids = this.tilesMeta?.groups?.[group];
    if (!ids) return null;
    const h = ((tx * 73856093) ^ (ty * 19349663)) >>> 0;
    return ids[h % ids.length];
  }

  drawFloor(g, timeS) {
    const { ctx } = this;
    const f = g.floor;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = g.actData.fog; ctx.fillRect(0, 0, innerWidth, innerHeight);
    const z = this.zoom;
    let shx = 0, shy = 0;
    if (this.cam.shake > 0 && !this.reduceShake) {
      shx = (Math.random() - .5) * this.cam.shake; shy = (Math.random() - .5) * this.cam.shake;
    }
    ctx.save();
    ctx.translate(innerWidth / 2 + shx, innerHeight / 2 + shy);
    ctx.scale(z, z);
    ctx.translate(-this.cam.px, -this.cam.py);
    // видимый диапазон клеток — по обратной проекции углов экрана
    const cs = [[0, 0], [innerWidth, 0], [0, innerHeight], [innerWidth, innerHeight]]
      .map(c => this.screenToWorld(c[0], c[1]));
    const x0 = Math.max(0, Math.floor(Math.min(cs[0][0], cs[1][0], cs[2][0], cs[3][0]) / TILE) - 1);
    const x1 = Math.min(f.W - 1, Math.ceil(Math.max(cs[0][0], cs[1][0], cs[2][0], cs[3][0]) / TILE) + 1);
    const y0 = Math.max(0, Math.floor(Math.min(cs[0][1], cs[1][1], cs[2][1], cs[3][1]) / TILE) - 1);
    const y1 = Math.min(f.H - 1, Math.ceil(Math.max(cs[0][1], cs[1][1], cs[2][1], cs[3][1]) / TILE) + 1);
    this.visRange = [x0, x1, y0, y1];
    const actGroups = { 1: ['floor', 'paved'], 2: ['dirt', 'floor'], 3: ['paved', 'floor'], 4: ['dirt', 'rune'] }[f.act] || ['floor'];
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const t = f.g[ty * f.W + tx];
        if (t === T_WALL) continue;
        const h = ((tx * 73856093) ^ (ty * 19349663)) >>> 0;
        const group = (h % 100) < 82 ? actGroups[0] : actGroups[1];
        const id = this.pickVariant(group, tx, ty);
        if (id === null || !this.drawAtlasTile(id, tx * TILE, ty * TILE)) {
          // фолбэк-ромб
          const [px, py] = proj(tx * TILE, ty * TILE);
          ctx.fillStyle = '#2b2b31';
          ctx.beginPath();
          ctx.moveTo(px, py); ctx.lineTo(px + 96, py + 48); ctx.lineTo(px, py + 96); ctx.lineTo(px - 96, py + 48);
          ctx.closePath(); ctx.fill();
        }
        if (t === T_EXIT || t === T_ENTRY) {
          // лестницы вниз/вверх (тайлы Flare); фолбэк — портал
          const sid = this.tilesMeta?.groups?.[t === T_EXIT ? 'stairs_down' : 'stairs_up']?.[0];
          if (sid === undefined || !this.drawAtlasTile(sid, tx * TILE, ty * TILE)) {
            const p = this.assets.dec_portal;
            const pul = 1 + Math.sin(timeS * 3) * .06;
            if (p) {
              const [px, py] = proj(tx * TILE + TILE / 2, ty * TILE + TILE / 2);
              ctx.globalAlpha = t === T_EXIT ? 1 : .45;
              ctx.save(); ctx.translate(px, py); ctx.scale(1.25, .66);
              ctx.drawImage(p, -52 * pul, -52 * pul, 104 * pul, 104 * pul);
              ctx.restore(); ctx.globalAlpha = 1;
            }
          } else if (t === T_EXIT) {
            // подсветка выхода, чтобы читался в темноте
            const [px, py] = proj(tx * TILE + TILE / 2, ty * TILE + TILE / 2);
            ctx.save(); ctx.globalAlpha = .18 + Math.sin(timeS * 3) * .07;
            ctx.fillStyle = '#ffd75e';
            ctx.beginPath(); ctx.ellipse(px, py, 60, 30, 0, 0, 7); ctx.fill();
            ctx.restore();
          }
        }
      }
    }
    // настильные пропсы: кости, магические круги (лежат на полу, без сортировки по глубине)
    if (f.propsFloor) for (const p of f.propsFloor) {
      if (p.tx < x0 || p.tx > x1 || p.ty < y0 || p.ty > y1) continue;
      const id = this.pickVariant(p.group, p.tx, p.ty);
      if (id !== null) this.drawAtlasTile(id, p.tx * TILE, p.ty * TILE);
    }
    // декали пола (проецируем и приплюскиваем)
    for (const d of f.decals) {
      const dtx = d.x / TILE | 0, dty = d.y / TILE | 0;
      if (dtx < x0 || dtx > x1 || dty < y0 || dty > y1) continue;
      const [px, py] = proj(d.x, d.y);
      ctx.save();
      ctx.translate(px, py); ctx.scale(1.5, .75);
      if (d.kind === 'blood') {
        ctx.fillStyle = 'rgba(96,10,18,0.45)';
        ctx.beginPath(); ctx.ellipse(0, 0, d.r, d.r * .8, 0, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(70,6,12,0.5)';
        for (let i = 0; i < 4; i++) { const a2 = d.seed * .7 + i * 1.9; ctx.beginPath(); ctx.arc(Math.cos(a2) * d.r * .9, Math.sin(a2) * d.r * .7, d.r * .18, 0, 7); ctx.fill(); }
      } else if (d.kind === 'crack') {
        ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-d.r, 0);
        for (let i = 1; i <= 4; i++) ctx.lineTo(-d.r + d.r * i * .5, Math.sin(d.seed + i * 2.1) * d.r * .35);
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(70,92,48,0.25)';
        ctx.beginPath(); ctx.ellipse(0, 0, d.r, d.r * .8, 0, 0, 7); ctx.fill();
      }
      ctx.restore();
    }
  }

  // стена-блок (рисуется в глубинном проходе)
  drawWallCell(g, tx, ty) {
    const id = this.pickVariant('wall', tx, ty);
    if (id === null || !this.drawAtlasTile(id, tx * TILE, ty * TILE)) {
      const [px, py] = proj(tx * TILE, ty * TILE);
      this.ctx.fillStyle = g.actData.wall;
      this.ctx.fillRect(px - 96, py - 60, 192, 156);
    }
  }
  // стоячий пропс (гробница, статуя, утварь) — в глубинном проходе
  drawProp(group, tx, ty) {
    const id = this.pickVariant(group, tx, ty);
    if (id !== null) this.drawAtlasTile(id, tx * TILE, ty * TILE);
  }
  // костёр лагеря: чаша-тайл уже нарисована как пропс, сверху живое пламя
  drawCampfire(tx, ty, timeS) {
    const { ctx } = this;
    const [px, py] = proj(tx * TILE + TILE / 2, ty * TILE + TILE / 2);
    const fl = Math.sin(timeS * 12) * .2 + Math.sin(timeS * 27) * .12;
    ctx.save();
    ctx.translate(px, py - 46);
    ctx.globalAlpha = .9;
    ctx.fillStyle = '#ff9840';
    ctx.beginPath();
    ctx.moveTo(-13, 0); ctx.quadraticCurveTo(-15, -26 - fl * 12, 0, -40 - fl * 16);
    ctx.quadraticCurveTo(15, -26 - fl * 9, 13, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffd75e';
    ctx.beginPath();
    ctx.moveTo(-7, 0); ctx.quadraticCurveTo(-8, -16 - fl * 7, 0, -25 - fl * 10);
    ctx.quadraticCurveTo(8, -16 - fl * 6, 7, 0); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
    // искры
    if (this.particles.length < 280 && Math.random() < .3) {
      this.particles.push({ x: px + (Math.random() - .5) * 18, y: py - 30, vx: (Math.random() - .5) * 20,
        vy: -40 - Math.random() * 40, t: .5 + Math.random() * .5, c: '#ffb050', s: 2, grav: -20 });
    }
  }
  // NPC лагеря: спрайт Flare (торговец/хранитель), имя над головой
  drawNpc(g, n, timeS) {
    const { ctx } = this;
    const [px, py] = proj(n.x, n.y);
    if (n.kind === 'gates' || n.kind === 'ret') {
      const img = this.assets.dec_portal;
      if (img) {
        const pul = 1 + Math.sin(timeS * 2.5) * .07;
        ctx.save(); ctx.translate(px, py);
        if (n.kind === 'ret') ctx.filter = 'hue-rotate(160deg)';
        ctx.scale(1.5, 1.15);
        ctx.drawImage(img, -55 * pul, -80 * pul, 110 * pul, 110 * pul);
        ctx.restore(); ctx.filter = 'none';
      }
    } else if (n.kind === 'altar') {
      const id = this.tilesMeta?.groups?.altars?.[0] ?? this.tilesMeta?.groups?.pillar?.[0];
      if (id !== undefined) this.drawAtlasTile(id, n.x - 32, n.y - 32);
      ctx.save(); ctx.translate(px, py - 90);
      ctx.fillStyle = `rgba(255,215,94,${.5 + Math.sin(timeS * 3) * .25})`;
      ctx.beginPath(); ctx.arc(0, 0, 6 + Math.sin(timeS * 3) * 2, 0, 7); ctx.fill();
      ctx.restore();
    } else {
      // человек: цельный NPC-спрайт Flare; фолбэк — кукла из слоёв
      const fl = g.flare;
      ctx.save();
      ctx.translate(px, py);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath(); ctx.ellipse(0, 5, 20, 8, 0, 0, 7); ctx.fill();
      ctx.restore();
      const sheet = n.kind === 'vendor' ? 'n_trader' : 'n_guild';
      const sm = fl?.meta?.[sheet];
      const drawn = sm && fl.draw(ctx, sheet, px, py + 5, 'stance', timeS * 1000 + n.x, n.angle ?? Math.PI / 2, 104 / sm.ay);
      if (!drawn) {
        const layers = n.kind === 'vendor'
          ? ['m_default_feet', 'm_default_legs', 'm_default_hands', 'm_cloth_shirt', 'm_head_short']
          : ['m_default_feet', 'm_default_legs', 'm_default_hands', 'm_leather_chest', 'm_leather_hood'];
        let scale = null;
        for (const l of layers) {
          const m = fl?.meta?.[l];
          if (!m) continue;
          if (scale === null) scale = 96 / (fl.meta['m_default_chest']?.ay || m.ay);
          fl.draw(ctx, l, px, py + 5, 'stance', timeS * 1000 + n.x, n.angle ?? Math.PI / 2, scale);
        }
      }
    }
    // имя и приглашение
    const name = ({ vendor: STRN.vendor, keeper: STRN.keeper, altar: STRN.altar, gates: STRN.gates, ret: STRN.ret })[n.kind] || '';
    ctx.font = 'bold 13px Georgia, serif'; ctx.textAlign = 'center';
    const ty = py - (n.kind === 'gates' || n.kind === 'ret' ? 110 : n.kind === 'altar' ? 120 : 115);
    ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 3;
    ctx.strokeText(name, px, ty);
    ctx.fillStyle = '#ffd75e'; ctx.fillText(name, px, ty);
    if (g.nearNpc === n || (n.kind === 'ret' && g.nearReturn)) {
      ctx.strokeStyle = `rgba(255,215,94,${.5 + Math.sin(timeS * 5) * .3})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(px, py + 5, 34, 15, 0, 0, 7); ctx.stroke();
    }
  }

  // стоячая жаровня с живым пламенем
  drawBrazier(wx, wy, timeS) {
    const { ctx } = this;
    const [px, py] = proj(wx, wy);
    ctx.save();
    ctx.translate(px, py);
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(0, 4, 14, 5.5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#241d14'; ctx.fillRect(-2.5, -20, 5, 26);
    ctx.fillStyle = '#382a1c'; ctx.beginPath(); ctx.ellipse(0, -21, 10, 4.5, 0, 0, 7); ctx.fill();
    const fl = Math.sin(timeS * 13 + wx) * .22 + Math.sin(timeS * 29 + wy) * .12;
    ctx.globalAlpha = .85;
    ctx.fillStyle = '#ff9840';
    ctx.beginPath();
    ctx.moveTo(-6, -22); ctx.quadraticCurveTo(-7, -36 - fl * 9, 0, -43 - fl * 11);
    ctx.quadraticCurveTo(7, -36 - fl * 7, 6, -22); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffd75e';
    ctx.beginPath();
    ctx.moveTo(-3, -22); ctx.quadraticCurveTo(-3.5, -30 - fl * 5, 0, -34 - fl * 8);
    ctx.quadraticCurveTo(3.5, -30 - fl * 4, 3, -22); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // трупы (анимация смерти + затухание)
  drawCorpses(g) {
    const { ctx } = this;
    for (const c of g.corpses) {
      const fm = g.flare?.meta?.[c.flare];
      if (!fm) continue;
      const fscale = (c.r * 6.1 / fm.ay) * (c.fscale || 1);
      const alpha = c.t < 2.5 ? 1 : Math.max(0, 1 - (c.t - 2.5) / 1.5);
      const [cpx, cpy] = proj(c.x, c.y);
      g.flare.draw(ctx, c.flare, cpx, cpy + 4, 'die', c.t * 1000, c.angle, fscale, alpha);
    }
  }

  // герой: анимированная кукла Flare (слои экипировки); формы друида — статичный спрайт
  drawHero(g, timeS) {
    const { ctx } = this;
    const h = g.hero;
    if (!h.form && g.flare?.heroSheet) {
      const s = g.flare.heroSheet;
      const fscale = 100 / s.meta.ay;
      ctx.save();
      const [hpx, hpy] = proj(h.x, h.y);
      ctx.translate(hpx, hpy);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath(); ctx.ellipse(0, 5, 22, 9, 0, 0, 7); ctx.fill();
      if (h.hurtT > 0) ctx.globalAlpha = .6 + Math.sin(timeS * 60) * .3;
      const anim = h.dead ? 'die' : h.action ? h.action.name : h.moving ? 'run' : 'stance';
      const t = h.dead ? h.deadT * 1000 : h.action ? h.action.t : h.animT * 1000;
      // редкость оружия — свечение под ногами
      const wr = h.equip.weapon?.rarity;
      if (wr && wr !== 'common' && wr !== 'magic') {
        ctx.save();
        ctx.globalAlpha = .35 + Math.sin(timeS * 4) * .12;
        ctx.strokeStyle = ({ rare: '#ffd75e', set: '#61d97a', unique: '#ff9840' })[wr];
        ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 5, 20, 8.5, 0, 0, 7); ctx.stroke();
        ctx.restore();
      }
      g.flare.drawHeroSheet(ctx, 0, 5, anim, t, h.faceAngle ?? Math.PI / 2, fscale);
      ctx.restore();
      ctx.globalAlpha = 1;
      return;
    }
    const spriteKey = h.form === 'wolf' ? 'form_wolf' : h.form === 'bear' ? 'form_bear' : g.cls.sprite;
    const img = this.assets[spriteKey];
    const size = (h.form === 'bear' ? 78 : 64) * 1.55;
    const bob = Math.sin(h.animT * 9) * (h.moving ? 3 : .8);
    const lunge = h.attackT > 0 ? Math.sin((0.22 - h.attackT) / 0.22 * Math.PI) * 9 : 0;
    ctx.save();
    const [fpx, fpy] = proj(h.x, h.y);
    ctx.translate(fpx + h.dir * lunge * .4, fpy + bob * .3);
    // тень
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.ellipse(0, size * .38, size * .3, size * .11, 0, 0, 7); ctx.fill();
    if (h.hurtT > 0) { ctx.globalAlpha = .6 + Math.sin(timeS * 60) * .3; }
    ctx.scale(h.dir, 1);
    const tilt = h.moving ? Math.sin(h.animT * 9) * .05 : 0;
    ctx.rotate(tilt);
    if (img) ctx.drawImage(img, -size / 2, -size * .62 + bob, size, size);
    // экипировка поверх (только в человеческой форме)
    if (!h.form) {
      const chest = h.equip.chest, helm = h.equip.helm, off = h.equip.offhand, wpn = h.equip.weapon;
      if (chest) {
        const ci = this.assets[chest.icon];
        if (ci) { ctx.globalAlpha = .92; ctx.drawImage(ci, -size * .23, -size * .18 + bob, size * .46, size * .4); ctx.globalAlpha = 1; }
      }
      if (helm) {
        const hi = this.assets[helm.icon];
        if (hi) ctx.drawImage(hi, -size * .17, -size * .62 + bob, size * .34, size * .3);
      }
      if (off) {
        const oi = this.assets[off.icon];
        if (oi) ctx.drawImage(oi, -size * .52, -size * .18 + bob, size * .3, size * .38);
      }
      if (wpn) {
        const wi = this.assets[wpn.icon];
        if (wi) {
          ctx.save();
          ctx.translate(size * .3, -size * .1 + bob);
          const swing = h.attackT > 0 ? -(0.22 - h.attackT) / 0.22 * 1.8 + .9 : .35;
          ctx.rotate(swing);
          const glow = wpn.rarity === 'unique' ? '#ff9840' : wpn.rarity === 'set' ? '#61d97a' : wpn.rarity === 'rare' ? '#ffd75e' : null;
          if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 14; }
          ctx.drawImage(wi, -size * .1, -size * .42, size * .48, size * .48);
          ctx.restore();
        }
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  drawMob(g, m, timeS) {
    const { ctx } = this;
    const size = m.r * 4.6;
    ctx.save();
    const [mpx, mpy] = proj(m.x, m.y);
    ctx.translate(mpx, mpy);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(0, 4, m.r * 1.6, m.r * .6, 0, 0, 7); ctx.fill();
    if (m.elite) { // аура элитки
      ctx.strokeStyle = m.tint; ctx.globalAlpha = .5 + Math.sin(timeS * 5) * .2;
      ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 4, m.r * 1.4, 0, 7); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (m.hitT > 0) ctx.globalAlpha = .62;
    if (m.freezeT > 0) { ctx.filter = 'saturate(0.3) brightness(1.3)'; }
    let drawn = false;
    if (m.flare && g.flare) {
      const fm = g.flare.meta?.[m.flare];
      if (fm) {
        const fscale = (m.r * 6.1 / fm.ay) * (m.fscale || 1);
        const anim = m.action ? m.action.name : m.moving ? 'run' : 'stance';
        const t = m.action ? m.action.t : m.animT * 1000;
        drawn = g.flare.draw(ctx, m.flare, 0, 4, anim, t, m.angle, fscale);
        if (drawn && m.tint && m.type === 'ally') { // метка слуги
          ctx.fillStyle = m.tint; ctx.globalAlpha = .9;
          ctx.beginPath(); ctx.arc(0, -fm.ay * fscale - 7, 3.2, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
        }
      }
    }
    if (!drawn) {
      const img = this.assets[m.sprite];
      const bob = Math.sin(m.animT * 7) * (m.moving ? 2.5 : .6);
      ctx.scale(m.dir * (m.scale || 1), (m.scale || 1));
      const src = (img && m.tint) ? this.tinted(img, m.tint, .4) : img;
      if (src) ctx.drawImage(src, -size / 2, -size * .58 + bob, size, size);
      else { ctx.fillStyle = m.tint || '#813'; ctx.fillRect(-m.r, -m.r, m.r * 2, m.r * 2); }
    }
    ctx.restore();
    ctx.filter = 'none'; ctx.globalAlpha = 1;
    if (m.hp < m.maxHp && !m.boss) { // полоска HP
      const [bpx, bpy] = proj(m.x, m.y);
      const w = m.r * 2.4;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bpx - w / 2, bpy - size * .62, w, 4);
      ctx.fillStyle = m.elite ? '#ffd54f' : '#a3162e';
      ctx.fillRect(bpx - w / 2, bpy - size * .62, w * clamp(m.hp / m.maxHp, 0, 1), 4);
    }
  }

  drawDrops(g, timeS) {
    const { ctx } = this;
    for (const d of g.drops) {
      const bounce = Math.max(0, Math.sin(Math.min(d.t * 6, Math.PI))) * 14;
      const [dpx, dpyRaw] = proj(d.x, d.y);
      const y = dpyRaw - bounce;
      if (d.kind === 'gold') {
        const gi = this.assets['loot/coins'];
        if (gi) ctx.drawImage(gi, dpx - 11, y - 14, 22, 22);
        else { ctx.fillStyle = '#ffd75e'; ctx.beginPath(); ctx.arc(dpx, y, 5, 0, 7); ctx.fill(); }
      } else if (d.kind === 'potion') {
        const pi = this.assets['loot/hp_flask'];
        if (pi) ctx.drawImage(pi, dpx - 12, y - 16, 24, 24);
        else { ctx.fillStyle = '#c62828'; ctx.beginPath(); ctx.arc(dpx, y, 6, 0, 7); ctx.fill(); }
      } else {
        const col = ({ common: '#c8c2b8', magic: '#7aa9ff', rare: '#ffd75e', set: '#61d97a', unique: '#ff9840' })[d.item.rarity];
        ctx.save();
        ctx.shadowColor = col; ctx.shadowBlur = d.item.rarity === 'common' ? 4 : 12 + Math.sin(timeS * 4) * 4;
        const icon = this.assets[d.item.icon];
        if (icon) ctx.drawImage(icon, dpx - 15, y - 15, 30, 30);
        else { ctx.fillStyle = col; ctx.fillRect(dpx - 8, y - 8, 16, 16); }
        ctx.restore();
        // луч света для редких+
        if (d.item.rarity !== 'common' && d.item.rarity !== 'magic') {
          const grad = ctx.createLinearGradient(dpx, y - 70, dpx, y);
          grad.addColorStop(0, 'rgba(255,255,255,0)');
          grad.addColorStop(1, col + 'aa');
          ctx.fillStyle = grad; ctx.fillRect(dpx - 2, y - 70, 4, 70);
        }
        // D2-стиль: подпись предмета на полу (редкие+ всегда, прочие — рядом с героем)
        const near = Math.abs(d.x - g.hero.x) < 150 && Math.abs(d.y - g.hero.y) < 150;
        if ((near || (d.item.rarity !== 'common' && d.item.rarity !== 'magic')) && d.t > .5) {
          ctx.font = 'bold 11px Georgia, serif';
          const tw = ctx.measureText(d.item.name).width;
          ctx.fillStyle = 'rgba(5,4,2,0.78)';
          ctx.fillRect(dpx - tw / 2 - 5, y - 42, tw + 10, 15);
          ctx.fillStyle = col; ctx.textAlign = 'center';
          ctx.fillText(d.item.name, dpx, y - 31);
        }
      }
    }
  }

  drawEffects(g, dt, timeS) {
    const { ctx } = this;
    // зоны
    for (const z of g.zones) {
      const [zpx, zpy] = proj(z.x, z.y);
      ctx.globalAlpha = .16 + Math.sin(timeS * 8) * .05;
      ctx.fillStyle = z.color; ctx.beginPath(); ctx.ellipse(zpx, zpy, z.r * ISOX, z.r * ISOY, 0, 0, 7); ctx.fill();
      ctx.globalAlpha = .5; ctx.strokeStyle = z.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(zpx, zpy, z.r * ISOX, z.r * ISOY, 0, 0, 7); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (const t of g.traps) {
      const [tpx, tpy] = proj(t.x, t.y);
      ctx.globalAlpha = t.armT > 0 ? .35 : .8;
      ctx.strokeStyle = t.elem === 'cold' ? '#4fc3f7' : '#ff7043'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(tpx, tpy, (9 + Math.sin(timeS * 6) * 2) * 1.5, (9 + Math.sin(timeS * 6) * 2) * .75, 0, 0, 7); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // снаряды
    for (const p of g.projectiles) {
      ctx.save();
      const [ppx, ppy] = proj(p.x, p.y);
      ctx.translate(ppx, ppy);
      ctx.rotate(Math.atan2((p.vx + p.vy) * ISOY, (p.vx - p.vy) * ISOX));
      if (p.arrow) { ctx.strokeStyle = '#e8dcc0'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(9, 0); ctx.stroke(); }
      else { ctx.shadowColor = p.color; ctx.shadowBlur = 10; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(0, 0, p.r, 0, 7); ctx.fill(); }
      ctx.restore();
    }
    // частицы
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.t -= dt; if (p.t <= 0) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.grav || 0) * dt;
      ctx.globalAlpha = Math.min(1, p.t * 2.5);
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
    }
    ctx.globalAlpha = 1;
    // числа урона
    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const n = this.numbers[i];
      n.t -= dt; if (n.t <= 0) { this.numbers.splice(i, 1); continue; }
      n.y -= 34 * dt;
      ctx.globalAlpha = Math.min(1, n.t * 3);
      ctx.font = (n.big ? 'bold 17px' : 'bold 13px') + ' Georgia, serif';
      ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 3; ctx.strokeText(n.txt, n.x, n.y);
      ctx.fillStyle = n.c; ctx.fillText(n.txt, n.x, n.y);
    }
    ctx.globalAlpha = 1;
  }

  // Свет: тьма с вырезанными радиальными градиентами (низкое разрешение, растянуто)
  drawLight(g, timeS) {
    const lc = this.lightCanvas, lx = lc.getContext('2d');
    const z = this.zoom / 4 * this.dpr / this.dpr;
    lx.globalCompositeOperation = 'source-over';
    lx.fillStyle = 'rgba(0,0,0,0.9)';
    lx.fillRect(0, 0, lc.width, lc.height);
    lx.globalCompositeOperation = 'destination-out';
    const put = (wx, wy, r, a) => {
      const [sx, sy] = this.worldToScreen(wx, wy);
      const x = sx / 4, y = sy / 4, rr = r * this.zoom / 4;
      const grad = lx.createRadialGradient(x, y, rr * .15, x, y, rr);
      grad.addColorStop(0, `rgba(0,0,0,${a})`); grad.addColorStop(1, 'rgba(0,0,0,0)');
      lx.fillStyle = grad;
      lx.beginPath(); lx.arc(x, y, rr, 0, 7); lx.fill();
    };
    const flick = 1 + Math.sin(timeS * 11) * .04 + Math.sin(timeS * 23) * .02;
    put(g.hero.x, g.hero.y, g.stats.lightRadius * flick, 1);
    const fires = []; // экранные позиции огней для тёплого свечения
    for (const t of g.floor.torches) {
      const wx = t.x * TILE + TILE / 2, wy = t.y * TILE + TILE / 2;
      const [tpx, tpy] = proj(wx, wy);
      if (Math.abs(tpx - this.cam.px) > innerWidth * 1.2 || Math.abs(tpy - this.cam.py) > innerHeight * 1.2) continue;
      put(wx, wy, 190 * flick, .85);
      fires.push([wx, wy, 120]);
    }
    if (g.floor.campfire) {
      const wx = g.floor.campfire.tx * TILE + TILE / 2, wy = g.floor.campfire.ty * TILE + TILE / 2;
      put(wx, wy, 300 * flick, .95);
      fires.push([wx, wy, 210]);
    }
    for (const p of g.projectiles) if (p.color && !p.arrow) put(p.x, p.y, 60, .7);
    for (const z2 of g.zones) put(z2.x, z2.y, z2.r * 1.2, .5);
    const ctx = this.ctx;
    ctx.restore(); // выходим из мировых координат
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(lc, 0, 0, innerWidth, innerHeight);
    // тёплое аддитивное свечение вокруг огня — оживляет картинку
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const [wx, wy, r] of fires) {
      const [sx, sy] = this.worldToScreen(wx, wy);
      const rr = r * this.zoom * flick;
      if (!isFinite(sx + sy + rr)) continue;
      const grad = ctx.createRadialGradient(sx, sy - 20 * this.zoom, 0, sx, sy - 20 * this.zoom, rr);
      grad.addColorStop(0, 'rgba(255,140,50,0.16)');
      grad.addColorStop(.5, 'rgba(255,100,30,0.07)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(sx - rr, sy - 20 * this.zoom - rr, rr * 2, rr * 2);
    }
    ctx.restore();
  }

  // ---- fx API (вызывается геймплеем через g.fx) ----
  fxApi() {
    const self = this;
    const P = (x, y) => proj(x, y);
    return {
      number(xw, yw, v, c, big) { const [x, y] = P(xw, yw); if (self.numbers.length < 60) self.numbers.push({ x, y, txt: String(v), c, t: .8, big }); },
      text(xw, yw, txt, c) { const [x, y] = P(xw, yw); self.numbers.push({ x, y, txt, c, t: 1.2, big: true }); },
      burst(xw, yw, n, c) { const [x, y] = P(xw, yw); for (let i = 0; i < n && self.particles.length < 300; i++) { const a = Math.random() * 7, sp = 40 + Math.random() * 120; self.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, t: .4 + Math.random() * .4, c, s: 2 + Math.random() * 3, grav: 300 }); } },
      explosion(xw, yw, r, c) { const x = xw, y = yw; this.burst(x, y, 26, c); self.cam.shake = Math.max(self.cam.shake, 10); },
      slash(xw, yw, ang, r) { const [x, y] = P(xw, yw); for (let i = 0; i < 6 && self.particles.length < 300; i++) { const a = ang + (Math.random() - .5) * 1; self.particles.push({ x: x + Math.cos(a) * r * .7, y: y + Math.sin(a) * r * .7, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, t: .18, c: '#e8dcc0', s: 2.5 }); } },
      nova(xw, yw, r, c) { const [x, y] = P(xw, yw); for (let i = 0; i < 22 && self.particles.length < 300; i++) { const a = i / 22 * 7; self.particles.push({ x, y, vx: Math.cos(a) * r * 2.4, vy: Math.sin(a) * r * 2.4, t: .4, c, s: 3.5 }); } },
      lightning(x0w, y0w, x1w, y1w) { const [x0, y0] = P(x0w, y0w); const [x1, y1] = P(x1w, y1w); const n = 7; for (let i = 0; i <= n && self.particles.length < 298; i++) { const t = i / n; self.particles.push({ x: lerp(x0, x1, t) + (Math.random() - .5) * 14, y: lerp(y0, y1, t) + (Math.random() - .5) * 14, vx: 0, vy: 0, t: .15, c: '#c9b3ff', s: 3.5 }); } },
      dashTrail(x0w, y0w, x1w, y1w) { const [x0, y0] = P(x0w, y0w); const [x1, y1] = P(x1w, y1w); const n = 9; for (let i = 0; i <= n && self.particles.length < 298; i++) { const t = i / n; self.particles.push({ x: lerp(x0, x1, t), y: lerp(y0, y1, t), vx: 0, vy: 0, t: .25, c: '#9fb4c7', s: 4 }); } },
      buff(xw, yw) { this.burst(xw, yw, 14, '#ffd75e'); },
      levelUp(xw, yw) { this.burst(xw, yw, 40, '#ffd75e'); self.cam.shake = Math.max(self.cam.shake, 6); self.flashes.push({ t: .4, c: '255,215,94' }); },
      shake(v) { self.cam.shake = Math.max(self.cam.shake, v); },
    };
  }

  postFlash(dt) {
    const { ctx } = this;
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t -= dt; if (f.t <= 0) { this.flashes.splice(i, 1); continue; }
      if (this.reduceFlash) continue;
      ctx.fillStyle = `rgba(${f.c},${f.t * .35})`;
      ctx.fillRect(0, 0, innerWidth, innerHeight);
    }
    if (this.cam.shake > 0) this.cam.shake = Math.max(0, this.cam.shake - dt * 46);
  }
}
