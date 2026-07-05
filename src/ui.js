// UI: HUD на канвасе (джойстик, кнопки, орбы) + DOM-экраны (инвентарь, герой, таланты, лагерь).
import { STR } from './strings.js';
import { SKILLS, CLASSES, BASE_ITEMS, SETS, RARITY, GAMBLE_COST, RESPEC_COST, MAXLEVEL } from './data.js';
import { QUESTS } from './act1.js';
import { makeItem } from './items.js';
import { canUse } from './skills.js';
import { bus, clamp } from './core.js';

const RC = { common: '#c8c2b8', magic: '#7aa9ff', rare: '#ffd75e', set: '#61d97a', unique: '#ff9840' };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class UI {
  constructor(game) {
    this.g = game;
    this.root = document.getElementById('ui');
    this.screen = null; // 'inventory'|'character'|'talents'|'town'|'vendor'|'stash'|'death'|null
    this.statNames = { str: STR.stats.str, dex: STR.stats.dex, int: STR.stats.int, vit: STR.stats.vit };
    bus.on('levelUp', lvl => { if (typeof lvl === 'number') game.banner = { text: `УРОВЕНЬ ${lvl}`, t: 2.2 }; });
    bus.on('skillUnlocked', sk => this.skillCard(sk));
    bus.on('pickupItem', (r, name) => { if (r !== 'common') this.toast(name, RC[r]); });
  }
  // карточка нового умения (DI-стиль): по центру сверху, с иконкой.
  // В разгар боя не заслоняем телеграфы — ждём паузы (до ~8 с, потом показываем всё равно)
  skillCard(sk, waitedMs = 0) {
    const g = this.g;
    const hot = g.hero.hurtT > 0 || g.mobs?.some(m => m.aggro && !m.dead && m.type !== 'ally');
    if (hot && waitedMs < 8000) { setTimeout(() => this.skillCard(sk, waitedMs + 2000), 2000); return; }
    this.root.querySelector('.skillcard')?.remove();
    const id = Object.keys(SKILLS).find(k => SKILLS[k] === sk);
    const el = document.createElement('div');
    el.className = 'skillcard';
    el.innerHTML = `<img src="./assets/skills/${id}.webp" alt="" onerror="this.remove()">
      <div><b>Новое умение</b><span>${sk.name}</span><i>${sk.d}</i></div>`;
    this.root.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }
  // DI-попап: подобрано улучшение — «Надеть?» одним тапом
  equipPrompt(it, retried) {
    if (this.g.hero.hurtT > 0 && !retried) { setTimeout(() => this.equipPrompt(it, true), 1500); return; }
    this.root.querySelector('.equipprompt')?.remove();
    const el = document.createElement('div');
    el.className = 'equipprompt';
    el.innerHTML = `<img src="./assets/${esc(it.icon)}.webp" alt="">
      <div class="epinfo"><b style="color:${RC[it.rarity]}">${esc(it.name)}</b><span>лучше надетого</span></div>
      <button class="primary" data-ep="equip">Надеть</button><button data-ep="no">✕</button>`;
    el.style.pointerEvents = 'auto';
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-ep]');
      if (!b) return;
      if (b.dataset.ep === 'equip') { this.g.equipItem(it.id); this.toast(it.name, RC[it.rarity]); }
      el.remove();
    });
    this.root.appendChild(el);
    setTimeout(() => el.remove(), 7000);
  }
  toast(txt, color = '#e0d9c8') {
    const el = document.createElement('div');
    el.className = 'toast'; el.textContent = txt; el.style.color = color;
    this.root.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  // ---------- HUD на канвасе ----------
  // ---- кэш статичной графики HUD (перерисовывается при смене размера) ----
  hudCache(key, w, h, drawFn) {
    this._hud = this._hud || {};
    const k = key + '|' + w + 'x' + h;
    if (!this._hud[k]) {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      drawFn(c.getContext('2d'), w, h);
      this._hud[k] = c;
    }
    return this._hud[k];
  }
  // резная каменная рама орба с металлическими когтями (в духе D2)
  orbFrame(r) {
    const pad = 18;
    return this.hudCache('orbframe2', r * 2 + pad * 2, r * 2 + pad * 2, (x, w, h) => {
      const c = w / 2;
      // тень под рамой
      x.fillStyle = 'rgba(0,0,0,0.45)';
      x.beginPath(); x.ellipse(c, c + r * .28, r + 10, r + 4, 0, 0, 7); x.fill();
      // широкое каменное кольцо
      const ring = x.createRadialGradient(c - r * .35, c - r * .4, r * .4, c, c, r + 12);
      ring.addColorStop(0, '#7a684a'); ring.addColorStop(.55, '#4a3c24'); ring.addColorStop(.85, '#241b0e'); ring.addColorStop(1, '#0e0a05');
      x.strokeStyle = ring; x.lineWidth = 11;
      x.beginPath(); x.arc(c, c, r + 5.5, 0, 7); x.stroke();
      // резные сегменты кольца (радиальные насечки камня)
      for (let i = 0; i < 20; i++) {
        const a = i / 20 * Math.PI * 2;
        x.strokeStyle = i % 2 ? 'rgba(0,0,0,0.4)' : 'rgba(255,225,170,0.10)';
        x.lineWidth = i % 2 ? 1.6 : 1;
        x.beginPath();
        x.moveTo(c + Math.cos(a) * (r + 1), c + Math.sin(a) * (r + 1));
        x.lineTo(c + Math.cos(a) * (r + 10), c + Math.sin(a) * (r + 10));
        x.stroke();
      }
      // внешняя золочёная кромка + внутренний тёмный шов
      x.strokeStyle = 'rgba(200,160,90,0.5)'; x.lineWidth = 1.6;
      x.beginPath(); x.arc(c, c, r + 11, 0, 7); x.stroke();
      x.strokeStyle = 'rgba(255,232,180,0.16)'; x.lineWidth = 1;
      x.beginPath(); x.arc(c, c, r + 12.5, 0, 7); x.stroke();
      x.strokeStyle = 'rgba(0,0,0,0.75)'; x.lineWidth = 2;
      x.beginPath(); x.arc(c, c, r, 0, 7); x.stroke();
      x.strokeStyle = 'rgba(214,178,104,0.55)'; x.lineWidth = 1.4;
      x.beginPath(); x.arc(c, c, r + .8, 0, 7); x.stroke();
      // четыре кованых когтя, обхватывающих стекло
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + i * Math.PI / 2;
        x.save();
        x.translate(c + Math.cos(a) * (r + 4), c + Math.sin(a) * (r + 4));
        x.rotate(a + Math.PI / 2);
        const mg = x.createLinearGradient(-5, 0, 5, 0);
        mg.addColorStop(0, '#2a2118'); mg.addColorStop(.45, '#9c8557'); mg.addColorStop(.6, '#d8ba7a'); mg.addColorStop(1, '#3a2d18');
        x.fillStyle = mg;
        x.beginPath();
        x.moveTo(-6, -3); x.quadraticCurveTo(-7, 6, 0, 13.5);
        x.quadraticCurveTo(7, 6, 6, -3);
        x.quadraticCurveTo(0, -7, -6, -3); x.closePath(); x.fill();
        x.strokeStyle = 'rgba(0,0,0,0.6)'; x.lineWidth = 1.2; x.stroke();
        // заклёпка на когте
        x.fillStyle = '#e0c88a'; x.beginPath(); x.arc(0, 0, 1.8, 0, 7); x.fill();
        x.fillStyle = 'rgba(0,0,0,0.5)'; x.beginPath(); x.arc(.6, .6, .9, 0, 7); x.fill();
        x.restore();
      }
      // малые заклёпки между когтями
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        const bx = c + Math.cos(a) * (r + 5.5), by = c + Math.sin(a) * (r + 5.5);
        x.fillStyle = '#8a7448'; x.beginPath(); x.arc(bx, by, 2.2, 0, 7); x.fill();
        x.fillStyle = 'rgba(255,235,190,0.5)'; x.beginPath(); x.arc(bx - .7, by - .7, .8, 0, 7); x.fill();
      }
    });
  }
  // стеклянный орб с жидкостью, волной, пузырьками и бликом
  drawOrb(ctx, cx, cy, r, frac, c1, c2, label, timeS, low) {
    ctx.save();
    // полость
    const cave = ctx.createRadialGradient(cx - r * .25, cy - r * .3, r * .2, cx, cy, r);
    cave.addColorStop(0, '#191517'); cave.addColorStop(1, '#050405');
    ctx.fillStyle = cave;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
    // жидкость
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.clip();
    const lvl = cy + r - frac * r * 2;
    const w1 = Math.sin(timeS * 1.7) * 2.4, w2 = Math.sin(timeS * 2.9 + 2) * 1.6;
    ctx.beginPath();
    ctx.moveTo(cx - r, lvl + w1);
    ctx.quadraticCurveTo(cx - r / 2, lvl - w1 - w2, cx, lvl + w2);
    ctx.quadraticCurveTo(cx + r / 2, lvl + w1 + w2, cx + r, lvl - w1);
    ctx.lineTo(cx + r, cy + r + 2); ctx.lineTo(cx - r, cy + r + 2); ctx.closePath();
    const liq = ctx.createLinearGradient(0, lvl, 0, cy + r);
    liq.addColorStop(0, c1); liq.addColorStop(1, c2);
    ctx.fillStyle = liq; ctx.fill();
    // светлая кромка поверхности
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx - r, lvl + w1);
    ctx.quadraticCurveTo(cx - r / 2, lvl - w1 - w2, cx, lvl + w2);
    ctx.quadraticCurveTo(cx + r / 2, lvl + w1 + w2, cx + r, lvl - w1);
    ctx.stroke();
    // пузырьки
    if (frac > .05) {
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      for (let i = 0; i < 3; i++) {
        const ph = (timeS * (.25 + i * .11) + i * .37) % 1;
        const bx = cx + Math.sin(i * 2.4 + timeS * .6) * r * .45;
        const by = cy + r - ph * frac * r * 1.9;
        if (by > lvl + 3) { ctx.beginPath(); ctx.arc(bx, by, 1.3 + i * .5, 0, 7); ctx.fill(); }
      }
    }
    // стеклянный блик
    const gl = ctx.createRadialGradient(cx - r * .38, cy - r * .45, 0, cx - r * .38, cy - r * .45, r * .7);
    gl.addColorStop(0, 'rgba(255,255,255,0.28)'); gl.addColorStop(.4, 'rgba(255,255,255,0.08)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
    ctx.restore();
    // пульс при низком уровне
    if (low) {
      ctx.strokeStyle = `rgba(230,60,60,${.4 + Math.sin(timeS * 7) * .3})`;
      ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(cx, cy, r + 9, 0, 7); ctx.stroke();
    }
    // рама
    const fr = this.orbFrame(r);
    ctx.drawImage(fr, cx - fr.width / 2, cy - fr.height / 2);
    ctx.fillStyle = '#efe6d0'; ctx.font = `bold ${Math.round(r * .38)}px Georgia, serif`; ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 3;
    ctx.strokeText(label, cx, cy + r * .13);
    ctx.fillText(label, cx, cy + r * .13);
  }
  // кованая база стика: железное кольцо с рунами и фаской
  stickBase(r, gold) {
    return this.hudCache('stick2' + (gold ? 'G' : 'S'), r * 2 + 18, r * 2 + 18, (x, w) => {
      const c = w / 2;
      // утопленная площадка
      const face = x.createRadialGradient(c - r * .3, c - r * .35, r * .15, c, c, r);
      if (gold) { face.addColorStop(0, 'rgba(84,66,30,0.42)'); face.addColorStop(.8, 'rgba(30,22,9,0.5)'); face.addColorStop(1, 'rgba(12,9,4,0.6)'); }
      else { face.addColorStop(0, 'rgba(64,64,72,0.35)'); face.addColorStop(.8, 'rgba(20,20,25,0.48)'); face.addColorStop(1, 'rgba(8,8,10,0.6)'); }
      x.fillStyle = face; x.beginPath(); x.arc(c, c, r, 0, 7); x.fill();
      // широкий кованый обод с фаской
      const rim = x.createLinearGradient(c, c - r, c, c + r);
      if (gold) { rim.addColorStop(0, '#8a6c2e'); rim.addColorStop(.5, '#4a3814'); rim.addColorStop(1, '#1c1406'); }
      else { rim.addColorStop(0, '#6a6a76'); rim.addColorStop(.5, '#3a3a44'); rim.addColorStop(1, '#141418'); }
      x.strokeStyle = rim; x.lineWidth = 6.5;
      x.beginPath(); x.arc(c, c, r + 1, 0, 7); x.stroke();
      x.strokeStyle = gold ? 'rgba(255,220,140,0.35)' : 'rgba(220,225,255,0.18)'; x.lineWidth = 1.3;
      x.beginPath(); x.arc(c, c, r + 4.5, 0, 7); x.stroke();
      x.strokeStyle = 'rgba(0,0,0,0.7)'; x.lineWidth = 1.4;
      x.beginPath(); x.arc(c, c, r - 2.6, 0, 7); x.stroke();
      // руны по ободу (детерминированные штрихи)
      x.strokeStyle = gold ? 'rgba(230,192,110,0.85)' : 'rgba(160,164,178,0.6)';
      x.lineWidth = 1.6; x.lineCap = 'round';
      for (let i = 0; i < 12; i++) {
        const an = i * Math.PI / 6;
        x.save();
        x.translate(c + Math.cos(an) * (r + 1), c + Math.sin(an) * (r + 1));
        x.rotate(an + Math.PI / 2);
        x.beginPath();
        const v = (i * 7) % 4; // «руна» из 2-3 штрихов
        if (v === 0) { x.moveTo(-1.6, -2.4); x.lineTo(-1.6, 2.4); x.moveTo(-1.6, 0); x.lineTo(1.8, -2.2); }
        else if (v === 1) { x.moveTo(0, -2.4); x.lineTo(0, 2.4); x.moveTo(-1.8, -1); x.lineTo(1.8, 1); }
        else if (v === 2) { x.moveTo(-1.6, 2.2); x.lineTo(0, -2.4); x.lineTo(1.6, 2.2); }
        else { x.moveTo(-1.6, -2.2); x.lineTo(1.6, -2.2); x.moveTo(0, -2.2); x.lineTo(0, 2.4); }
        x.stroke();
        x.restore();
      }
      // крестовые метки направлений на площадке
      x.strokeStyle = gold ? 'rgba(216,178,90,0.4)' : 'rgba(150,150,165,0.3)'; x.lineWidth = 1.8;
      for (let i = 0; i < 4; i++) {
        const an = i * Math.PI / 2;
        x.beginPath();
        x.moveTo(c + Math.cos(an) * (r - 13), c + Math.sin(an) * (r - 13));
        x.lineTo(c + Math.cos(an) * (r - 6), c + Math.sin(an) * (r - 6));
        x.stroke();
      }
      // лёгкое внутреннее свечение по низу (отражение)
      x.strokeStyle = gold ? 'rgba(255,220,140,0.12)' : 'rgba(220,230,255,0.07)'; x.lineWidth = 2.4;
      x.beginPath(); x.arc(c, c, r - 4.5, Math.PI * .15, Math.PI * .85); x.stroke();
    });
  }
  // рукоятка стика: кованый набалдашник с ободом и насечкой
  drawKnob(ctx, x, y, r, gold, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    // тень
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(x + 1.5, y + r * .55, r * .85, r * .4, 0, 0, 7); ctx.fill();
    const k = ctx.createRadialGradient(x - r * .32, y - r * .38, r * .08, x, y, r);
    if (gold) { k.addColorStop(0, '#f2d489'); k.addColorStop(.4, '#b08e3e'); k.addColorStop(.75, '#6a4e18'); k.addColorStop(1, '#2a1d08'); }
    else { k.addColorStop(0, '#c8c8d4'); k.addColorStop(.4, '#82828e'); k.addColorStop(.75, '#46464f'); k.addColorStop(1, '#1a1a1f'); }
    ctx.fillStyle = k; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
    // врезанное кольцо
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(x, y, r * .62, 0, 7); ctx.stroke();
    ctx.strokeStyle = gold ? 'rgba(255,235,170,0.4)' : 'rgba(230,235,255,0.25)'; ctx.lineWidth = .9;
    ctx.beginPath(); ctx.arc(x, y, r * .62 + 1.3, 0, 7); ctx.stroke();
    // насечка хвата по краю
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.2;
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r * .8, y + Math.sin(a) * r * .8);
      ctx.lineTo(x + Math.cos(a) * r * .95, y + Math.sin(a) * r * .95);
      ctx.stroke();
    }
    // блик
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath(); ctx.ellipse(x - r * .32, y - r * .44, r * .26, r * .14, -.6, 0, 7); ctx.fill();
    ctx.restore();
  }
  // каменный сокет скилла с золотыми когтями
  skillSocket(r) {
    return this.hudCache('socket2', r * 2 + 14, r * 2 + 14, (x, w) => {
      const c = w / 2;
      x.fillStyle = 'rgba(0,0,0,0.4)';
      x.beginPath(); x.ellipse(c, c + 3, r + 4, r + 1, 0, 0, 7); x.fill();
      const face = x.createRadialGradient(c, c - r * .3, r * .1, c, c, r);
      face.addColorStop(0, '#2a2318'); face.addColorStop(.85, '#0e0b07'); face.addColorStop(1, '#070503');
      x.fillStyle = face; x.beginPath(); x.arc(c, c, r, 0, 7); x.fill();
      // золочёный обод с фаской
      const rim = x.createLinearGradient(c, c - r, c, c + r);
      rim.addColorStop(0, '#a4813a'); rim.addColorStop(.5, '#6a5016'); rim.addColorStop(1, '#2c1f08');
      x.strokeStyle = rim; x.lineWidth = 3;
      x.beginPath(); x.arc(c, c, r, 0, 7); x.stroke();
      x.strokeStyle = 'rgba(0,0,0,0.7)'; x.lineWidth = 1.4; x.beginPath(); x.arc(c, c, r - 3.2, 0, 7); x.stroke();
      x.strokeStyle = 'rgba(255,220,140,0.2)'; x.lineWidth = 1.1; x.beginPath(); x.arc(c, c, r + 2.6, 0, 7); x.stroke();
      // четыре мини-когтя
      for (let i = 0; i < 4; i++) {
        const a = Math.PI / 4 + i * Math.PI / 2;
        x.save();
        x.translate(c + Math.cos(a) * r, c + Math.sin(a) * r);
        x.rotate(a + Math.PI / 2);
        x.fillStyle = '#8c6d1f';
        x.beginPath(); x.moveTo(-3.4, -1.6); x.quadraticCurveTo(0, 6.5, 3.4, -1.6);
        x.quadraticCurveTo(0, -3.8, -3.4, -1.6); x.closePath(); x.fill();
        x.strokeStyle = 'rgba(0,0,0,0.55)'; x.lineWidth = .9; x.stroke();
        x.restore();
      }
    });
  }
  // тёмная плашка со скошенными углами и двойным золотым кантом
  drawPlaque(ctx, x, y, w, h, align) {
    ctx.save();
    if (align === 'right') x -= w;
    const cut = Math.min(6, h * .3);
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(x + cut, y); ctx.lineTo(x + w - cut, y); ctx.lineTo(x + w, y + cut);
      ctx.lineTo(x + w, y + h - cut); ctx.lineTo(x + w - cut, y + h); ctx.lineTo(x + cut, y + h);
      ctx.lineTo(x, y + h - cut); ctx.lineTo(x, y + cut); ctx.closePath();
    };
    const gr = ctx.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, 'rgba(28,22,12,0.9)'); gr.addColorStop(1, 'rgba(10,8,4,0.9)');
    ctx.fillStyle = gr; path(); ctx.fill();
    ctx.strokeStyle = 'rgba(150,118,40,0.75)'; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,225,150,0.1)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + cut + 1, y + 1.5); ctx.lineTo(x + w - cut - 1, y + 1.5); ctx.stroke();
    ctx.restore();
    return align === 'right' ? x : x;
  }

  // круглый портрет героя (DI): голова с собранной куклы Flare, кэш по экипировке
  portraitCache(g) {
    const s = g.flare?.heroSheet;
    if (!s) return null;
    const key = g.flare.heroKey;
    if (this._port && this._portKey === key) return this._port;
    const D = 108; // рисуем в 2x — чётко на Retina
    const c = document.createElement('canvas'); c.width = c.height = D;
    const x = c.getContext('2d');
    x.imageSmoothingQuality = 'high';
    const bg = x.createRadialGradient(D / 2, D * .38, 6, D / 2, D / 2, D / 2);
    bg.addColorStop(0, '#43331c'); bg.addColorStop(.7, '#1c1409'); bg.addColorStop(1, '#0a0704');
    x.fillStyle = bg; x.beginPath(); x.arc(D / 2, D / 2, D / 2, 0, 7); x.fill();
    x.save(); x.beginPath(); x.arc(D / 2, D / 2, D / 2 - 1, 0, 7); x.clip();
    const m = s.meta, anim = m.anims.stance;
    // ищем макушку по альфе в колонке вокруг оси (ax): голова всегда по центру фигуры
    const probe = document.createElement('canvas');
    probe.width = m.cw; probe.height = m.ch;
    const px2 = probe.getContext('2d', { willReadFrequently: true });
    px2.drawImage(s.canvas, anim.start * m.cw, 4 * m.ch, m.cw, m.ch, 0, 0, m.cw, m.ch);
    let top = m.ay - 96;
    try {
      const id = px2.getImageData(Math.max(0, m.ax - 14), 0, 28, m.ch).data;
      scan: for (let ry = 0; ry < m.ch; ry++)
        for (let rx = 0; rx < 28; rx++)
          if (id[(ry * 28 + rx) * 4 + 3] > 60) { top = ry; break scan; }
    } catch {}
    const headCY = top + 17; // центр головы чуть ниже макушки
    const half = 30;
    x.drawImage(s.canvas, anim.start * m.cw + m.ax - half, 4 * m.ch + headCY - half * .9,
      half * 2, half * 2, 5, 7, D - 10, D - 14);
    x.restore();
    // лёгкая внутренняя виньетка, чтобы портрет «сидел» в раме
    const vg = x.createRadialGradient(D / 2, D / 2, D * .30, D / 2, D / 2, D / 2);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.5)');
    x.fillStyle = vg; x.beginPath(); x.arc(D / 2, D / 2, D / 2, 0, 7); x.fill();
    this._port = c; this._portKey = key;
    return c;
  }
  // портрет + золотая рама + ромб-бейдж уровня (сверху-слева, как в DI)
  drawPortrait(ctx, g, pcx, pcy, pr, timeS) {
    const port = this.portraitCache(g);
    ctx.save();
    if (port) ctx.drawImage(port, pcx - pr, pcy - pr, pr * 2, pr * 2);
    else {
      ctx.fillStyle = '#140f08';
      ctx.beginPath(); ctx.arc(pcx, pcy, pr, 0, 7); ctx.fill();
    }
    // кованая золотая рама
    const ring = ctx.createLinearGradient(pcx, pcy - pr, pcx, pcy + pr);
    ring.addColorStop(0, '#c9a153'); ring.addColorStop(.5, '#6a5016'); ring.addColorStop(1, '#33240a');
    ctx.strokeStyle = ring; ctx.lineWidth = 3.2;
    ctx.beginPath(); ctx.arc(pcx, pcy, pr + .5, 0, 7); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(pcx, pcy, pr - 1.6, 0, 7); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,228,160,0.28)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(pcx, pcy, pr + 2.6, 0, 7); ctx.stroke();
    // четыре декоративные заклёпки по диагоналям рамы
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2;
      const bx = pcx + Math.cos(a) * (pr + .5), by = pcy + Math.sin(a) * (pr + .5);
      ctx.fillStyle = '#8a7448'; ctx.beginPath(); ctx.arc(bx, by, 2, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,235,190,0.55)'; ctx.beginPath(); ctx.arc(bx - .6, by - .6, .7, 0, 7); ctx.fill();
    }
    // ромб уровня внизу рамы
    const lx = pcx, ly = pcy + pr + 2;
    ctx.translate(lx, ly); ctx.rotate(Math.PI / 4);
    const bs = 9;
    const bgr = ctx.createLinearGradient(-bs, -bs, bs, bs);
    bgr.addColorStop(0, '#241a08'); bgr.addColorStop(1, '#0c0803');
    ctx.fillStyle = bgr; ctx.fillRect(-bs, -bs, bs * 2, bs * 2);
    ctx.strokeStyle = '#b8934a'; ctx.lineWidth = 1.6; ctx.strokeRect(-bs, -bs, bs * 2, bs * 2);
    ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = '#ffe9b0'; ctx.font = 'bold 11px Forum, Georgia, serif'; ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 2.6;
    ctx.strokeText(g.hero.level, 0, 4);
    ctx.fillText(g.hero.level, 0, 4);
    ctx.restore();
  }

  // ---------- HUD ----------
  drawHud(ctx, g, input) {
    const W = innerWidth, H = innerHeight;
    const h = g.hero, s = g.stats;
    const touch = g.isTouch;
    const timeS = g.time;
    const safeB = 16;
    // лендскейп-first: телефон держат горизонтально — орбы внутрь от стиков
    const land = W > H * 1.15;
    const SL = land ? 34 : 0; // сейф-поля под чёлку iPhone
    ctx.font = '13px Georgia, serif';
    const orbR = land ? 40 : touch ? 37 : 42;
    let hpPos, mpPos, lsHome, asHome, potPos;
    if (land && touch) {
      lsHome = [SL + 112, H - 102];
      asHome = [W - SL - 112, H - 102];
      hpPos = [SL + 264, H - orbR - 14];
      mpPos = [W - SL - 264, H - orbR - 14];
      potPos = [W - SL - 194, H - 42]; // в правом кластере — достаёт большой палец
    } else {
      lsHome = [96, H - 148 - safeB];
      asHome = [W - 96, H - 148 - safeB];
      hpPos = [orbR + 14, H - orbR - 16 - safeB / 2];
      mpPos = [W - orbR - 14, H - orbR - 16 - safeB / 2];
      potPos = [orbR * 2 + 52, H - 48 - safeB];
    }
    // ОРБЫ (стекло + камень)
    const resCol = {
      fury: ['#ff7a2e', '#7f2c00'], focus: ['#cdd45a', '#4a4a10'], mana: ['#3d8bff', '#0a2e63'],
      souls: ['#a55cff', '#320d49'], wrath: ['#5cd162', '#123615'],
    }[g.cls.resource];
    this.drawOrb(ctx, hpPos[0], hpPos[1], orbR, clamp(h.hp / s.maxHp, 0, 1),
      '#e0402e', '#5e0a0a', Math.ceil(h.hp), timeS, h.hp < s.maxHp * .3);
    this.drawOrb(ctx, mpPos[0], mpPos[1], orbR, clamp(h.res / s.maxRes, 0, 1),
      resCol[0], resCol[1], Math.ceil(h.res), timeS, false);
    // XP: золочёный жёлоб с насечками (шире, как нижняя кромка DI)
    const xw = W * (land ? .40 : .44), xx = W / 2 - xw / 2, xy = H - 12; // зазор под home-индикатор iPhone
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.beginPath(); ctx.roundRect(xx - 2, xy - 2, xw + 4, 9, 4); ctx.fill();
    ctx.strokeStyle = 'rgba(140,109,31,0.5)'; ctx.lineWidth = 1; ctx.stroke();
    const xf = clamp(h.xp / h.xpNext, 0, 1);
    const xg = ctx.createLinearGradient(xx, 0, xx + xw * xf, 0);
    xg.addColorStop(0, '#7a5c14'); xg.addColorStop(1, '#e8bc4a');
    ctx.fillStyle = xg; ctx.fillRect(xx, xy, xw * xf, 5);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    for (let i = 1; i < 10; i++) ctx.fillRect(xx + xw * i / 10, xy, 1, 5);
    // портрет героя с уровнем (DI: сверху-слева), рядом плашка золота
    const pcx = (land ? SL : 6) + 32, pcy = 36, pr = 26;
    this.drawPortrait(ctx, g, pcx, pcy, pr, timeS);
    ctx.font = '13px Georgia, serif';
    const goldTxt = `${h.gold}`;
    const gw = ctx.measureText(goldTxt).width + 34;
    const gx = pcx + pr + 10;
    this.drawPlaque(ctx, gx, 10, gw, 24);
    ctx.fillStyle = '#ffd75e'; ctx.textAlign = 'left';
    ctx.fillText(goldTxt, gx + 26, 27);
    // монетка
    ctx.beginPath(); ctx.arc(gx + 14, 22, 5.5, 0, 7);
    const coin = ctx.createRadialGradient(gx + 12, 20, 1, gx + 14, 22, 6);
    coin.addColorStop(0, '#ffe9a0'); coin.addColorStop(1, '#8a6a1a');
    ctx.fillStyle = coin; ctx.fill();
    // ---- стики (тач) ----
    if (touch) {
      // левый стик
      const lR = 52;
      const lsx = input.stick.active ? input.stick.ox : lsHome[0], lsy = input.stick.active ? input.stick.oy : lsHome[1];
      const lb = this.stickBase(lR, false);
      ctx.globalAlpha = input.stick.active ? .85 : .42;
      ctx.drawImage(lb, lsx - lb.width / 2, lsy - lb.height / 2);
      ctx.globalAlpha = 1;
      const ldx = input.stick.active ? clamp(input.stick.x - input.stick.ox, -lR, lR) : 0;
      const ldy = input.stick.active ? clamp(input.stick.y - input.stick.oy, -lR, lR) : 0;
      this.drawKnob(ctx, lsx + ldx, lsy + ldy, 24, false, input.stick.active ? .95 : .5);
      // правый стик прицеливания
      const aR = 46;
      const asx = asHome[0], asy = asHome[1];
      const aimOn = input.aim.active;
      const ab = this.stickBase(aR, true);
      ctx.globalAlpha = aimOn ? .95 : .5;
      ctx.drawImage(ab, asx - ab.width / 2, asy - ab.height / 2);
      ctx.globalAlpha = 1;
      let adx = 0, ady = 0;
      if (aimOn) {
        adx = clamp(input.aim.x - input.aim.ox, -aR, aR);
        ady = clamp(input.aim.y - input.aim.oy, -aR, aR);
      }
      this.drawKnob(ctx, asx + adx, asy + ady, 23, true, aimOn ? 1 : .6);
      ctx.save();
      ctx.globalAlpha = aimOn ? .95 : .6;
      try { ctx.filter = 'brightness(0.28)'; } catch {}
      ctx.strokeStyle = '#241a06'; ctx.fillStyle = '#241a06';
      this.drawSkillGlyph(ctx, { id: 'attack' }, asx + adx, asy + ady, 14);
      ctx.restore();
      // скиллы дугой над прицельным стиком
      const bar = g.hero.skillBar;
      const sock = this.skillSocket(27);
      bar.forEach((id, i) => {
        if (!id) return;
        const ang = land ? Math.PI * (1.04 + i * .155) : Math.PI * (1.02 + i * .17);
        const rad = land ? 88 : 108;
        const pos = { x: asx + Math.cos(ang) * rad, y: asy + Math.sin(ang) * rad };
        input.addButton('sk' + (i + 1), pos.x, pos.y, 28, 'skill' + (i + 1));
        const usable = canUse(g, id);
        ctx.globalAlpha = usable ? 1 : .38;
        ctx.drawImage(sock, pos.x - sock.width / 2, pos.y - sock.height / 2);
        ctx.strokeStyle = '#d9cba3'; ctx.fillStyle = '#d9cba3';
        this.drawSkillGlyph(ctx, { id }, pos.x, pos.y, 14);
        const cd = g.hero.cooldowns[id];
        if (cd > 0 && SKILLS[id]?.cd) {
          ctx.fillStyle = 'rgba(0,0,0,0.68)';
          ctx.beginPath(); ctx.moveTo(pos.x, pos.y);
          ctx.arc(pos.x, pos.y, 25, -Math.PI / 2, -Math.PI / 2 + (cd / SKILLS[id].cd) * 7); ctx.fill();
          if (cd > .35) { // цифра секунд, как в DI
            ctx.fillStyle = '#fff'; ctx.font = 'bold 15px Georgia'; ctx.textAlign = 'center';
            ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 3;
            const txt = cd >= 1 ? Math.ceil(cd) : cd.toFixed(1);
            ctx.strokeText(txt, pos.x, pos.y + 5);
            ctx.fillText(txt, pos.x, pos.y + 5);
          }
        } else if (usable) { // готово: тонкое свечение
          ctx.strokeStyle = 'rgba(255,215,120,0.35)'; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.arc(pos.x, pos.y, 27.5, 0, 7); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      });
      // активные баффы: ряд иконок с кольцом длительности (DI-стиль)
      const bfs = g.hero.buffs;
      if (bfs.length) {
        bfs.slice(0, 4).forEach((b, i) => {
          const bx = asx - 30 + i * 34, by = asy - 158;
          const ic = this.skillIcon(b.id);
          ctx.save();
          ctx.fillStyle = 'rgba(10,8,5,0.75)';
          ctx.beginPath(); ctx.arc(bx, by, 15, 0, 7); ctx.fill();
          if (ic) ctx.drawImage(ic, bx - 11, by - 11, 22, 22);
          const sk = SKILLS[b.id];
          const frac = sk?.dur ? clamp(b.t / sk.dur, 0, 1) : 1;
          ctx.strokeStyle = '#7fd68a'; ctx.lineWidth = 2.2;
          ctx.beginPath(); ctx.arc(bx, by, 15, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); ctx.stroke();
          ctx.restore();
        });
      }
      // зелье-колба у орба HP
      const px = potPos[0], py = potPos[1];
      input.addButton('potion', px, py, 26, 'potion');
      const hasPot = h.potionCharges > 0;
      ctx.save();
      ctx.globalAlpha = hasPot ? 1 : .45;
      // колба
      ctx.fillStyle = '#1a130c';
      ctx.beginPath(); ctx.roundRect(px - 14, py - 12, 28, 26, 7); ctx.fill();
      ctx.strokeStyle = '#8c6d1f'; ctx.lineWidth = 2; ctx.stroke();
      const pf = ctx.createLinearGradient(0, py - 8, 0, py + 12);
      pf.addColorStop(0, '#e0402e'); pf.addColorStop(1, '#5e0a0a');
      ctx.fillStyle = hasPot ? pf : '#2a1414';
      ctx.beginPath(); ctx.roundRect(px - 10, py - 6, 20, 17, 5); ctx.fill();
      ctx.fillStyle = '#8d6e63'; ctx.fillRect(px - 4, py - 18, 8, 7);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath(); ctx.ellipse(px - 5, py - 2, 3, 5, -.4, 0, 7); ctx.fill();
      ctx.restore();
      // счётчик зарядов
      ctx.fillStyle = '#efe6d0'; ctx.font = 'bold 12px Georgia'; ctx.textAlign = 'center';
      ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 3;
      ctx.strokeText(h.potionCharges, px + 16, py + 16);
      ctx.fillText(h.potionCharges, px + 16, py + 16);
    }
    // кнопка городского портала (в подземелье)
    if (!g.townMode) {
      input.addButton('tp', W - 26, 106, 20, 'townportal');
      ctx.fillStyle = 'rgba(21,19,16,0.85)'; ctx.beginPath(); ctx.arc(W - 26, 106, 17, 0, 7); ctx.fill();
      ctx.strokeStyle = '#4a7ab8'; ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = '#7fb2ff';
      ctx.beginPath(); ctx.ellipse(W - 26, 106, 8, 10.5, 0, 0, 7); ctx.stroke();
      ctx.globalAlpha = .6;
      ctx.beginPath(); ctx.ellipse(W - 26, 106, 4, 7, 0, 0, 7); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // кнопка меню
    input.addButton('inv', W - 26, 60, 22, 'inventory');
    ctx.fillStyle = 'rgba(21,19,16,0.85)'; ctx.beginPath(); ctx.arc(W - 26, 60, 18, 0, 7); ctx.fill();
    ctx.strokeStyle = '#8c6d1f'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#e8dcc0'; ctx.textAlign = 'center'; ctx.font = '15px Georgia'; ctx.fillText('\u2630', W - 26, 65);
    if (g.hero.statPts > 0 || g.hero.talentPts > 0) {
      ctx.fillStyle = '#ffd75e'; ctx.beginPath(); ctx.arc(W - 12, 46, 5, 0, 7); ctx.fill();
    }
    // баннер зоны (зачистка)
    if (g.banner) {
      const a = Math.min(1, g.banner.t, (3 - g.banner.t) * 2);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = `bold ${Math.min(44, W * .05)}px Forum, Georgia, serif`;
      ctx.textAlign = 'center';
      ctx.shadowColor = '#b9781f'; ctx.shadowBlur = 22;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 5;
      ctx.strokeText(g.banner.text, W / 2, H * .3);
      ctx.fillStyle = '#ffd75e';
      ctx.fillText(g.banner.text, W / 2, H * .3);
      ctx.restore();
    }
    // трекер задания (акт 1)
    const q = g.quest;
    if (q && q.i < QUESTS.length) {
      const qd = QUESTS[q.i];
      let txt = qd.text;
      if (qd.kills) txt += ` (${Math.min(q.k, qd.kills)}/${qd.kills})`;
      ctx.font = '12px Georgia, serif';
      const qx = (land ? SL : 6) + 4;
      const qw = Math.min(ctx.measureText(txt).width + 26, W * .5);
      this.drawPlaque(ctx, qx, 80, qw, 22);
      ctx.fillStyle = '#e8c85a'; ctx.textAlign = 'left';
      ctx.fillText('✦', qx + 7, 96);
      ctx.fillStyle = '#cfc4a2';
      ctx.fillText(txt, qx + 19, 96);
      // стрелка-указатель к цели
      const tgt = g.questTarget?.();
      if (tgt && !g.hero.dead) {
        const [sx, sy] = g.renderer.worldToScreen(tgt[0], tgt[1]);
        const on = sx > 40 && sx < W - 40 && sy > 40 && sy < H - 40;
        if (on) { // ромб над целью
          const bob = Math.sin(timeS * 4) * 4;
          ctx.save(); ctx.translate(sx, sy - 86 + bob); ctx.rotate(Math.PI / 4);
          ctx.fillStyle = 'rgba(255,215,94,0.9)'; ctx.fillRect(-5, -5, 10, 10);
          ctx.strokeStyle = 'rgba(40,28,6,0.9)'; ctx.lineWidth = 2; ctx.strokeRect(-5, -5, 10, 10);
          ctx.restore();
        } else { // стрелка по краю от героя
          const [hx, hy] = g.renderer.worldToScreen(g.hero.x, g.hero.y);
          const an = Math.atan2(sy - hy, sx - hx);
          const ax2 = hx + Math.cos(an) * 96, ay2 = hy + Math.sin(an) * 96;
          ctx.save(); ctx.translate(ax2, ay2); ctx.rotate(an);
          ctx.globalAlpha = .85;
          ctx.fillStyle = '#ffd75e';
          ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-7, -7); ctx.lineTo(-3, 0); ctx.lineTo(-7, 7); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(40,28,6,0.9)'; ctx.lineWidth = 1.5; ctx.stroke();
          ctx.restore(); ctx.globalAlpha = 1;
        }
      }
    }
    // миникарта
    this.drawMinimap(ctx, g, W, land);
    // босс-бар
    const boss = g.mobs.find(m => m.boss && !m.dead && m.aggro);
    if (boss) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(W * .18, 54, W * .64, 14);
      ctx.strokeStyle = 'rgba(140,109,31,0.7)'; ctx.lineWidth = 1.5; ctx.strokeRect(W * .18, 54, W * .64, 14);
      const bg2 = ctx.createLinearGradient(0, 54, 0, 68);
      bg2.addColorStop(0, '#b81f36'); bg2.addColorStop(1, '#5e0a14');
      ctx.fillStyle = bg2;
      ctx.fillRect(W * .18 + 2, 56, (W * .64 - 4) * clamp(boss.hp / boss.maxHp, 0, 1), 10);
      ctx.fillStyle = '#e8dcc0'; ctx.textAlign = 'center'; ctx.font = 'bold 13px Georgia';
      ctx.fillText(STR.mobNames[boss.kind] || '', W / 2, 50);
    }
  }
  drawMinimap(ctx, g, W, land) {
    const f = g.floor;
    if (!f) return;
    const size = land ? 86 : 96, cell = size / Math.max(f.W, f.H);
    const mx = W - size - (land ? 58 : 10), my = land ? 46 : 84;
    const cx = mx + size / 2, cy = my + size / 2, R = size / 2 + 3;
    ctx.save();
    ctx.globalAlpha = .85;
    // круглая линза (DI-стиль)
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7);
    ctx.fillStyle = 'rgba(6,5,3,0.8)'; ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R - 1, 0, 7); ctx.clip();
    for (let ty = 0; ty < f.H; ty++) {
      for (let tx = 0; tx < f.W; tx++) {
        if (!f.visited[ty * f.W + tx]) continue;
        const t = f.g[ty * f.W + tx];
        ctx.fillStyle = t === 0 ? '#4a3d28' : '#191512';
        ctx.fillRect(mx + tx * cell, my + ty * cell, cell + .5, cell + .5);
      }
    }
    // выход
    const e = f.exit;
    if (f.visited[e.cy * f.W + e.cx]) {
      ctx.fillStyle = '#ff9840';
      ctx.fillRect(mx + e.cx * cell - 1.5, my + e.cy * cell - 1.5, 4, 4);
    }
    // босс
    const boss = g.mobs.find(m => m.boss && !m.dead && m.aggro);
    if (boss) { ctx.fillStyle = '#c62828'; ctx.beginPath(); ctx.arc(mx + boss.x / 64 * cell, my + boss.y / 64 * cell, 2.5, 0, 7); ctx.fill(); }
    // цель квеста — золотой ромб
    const qt = g.questTarget?.();
    if (qt) {
      ctx.save();
      ctx.translate(mx + qt[0] / 64 * cell, my + qt[1] / 64 * cell);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#ffd75e'; ctx.fillRect(-2.4, -2.4, 4.8, 4.8);
      ctx.restore();
    }
    // вейпоинт — синяя точка
    if (f.waypoint) {
      const wkey = 'a' + g.progress.act + 'f' + g.progress.floor;
      ctx.fillStyle = g.progress.wps?.[wkey] ? '#7fb2ff' : '#44506a';
      ctx.beginPath(); ctx.arc(mx + f.waypoint.tx * cell, my + f.waypoint.ty * cell, 2.4, 0, 7); ctx.fill();
    }
    // герой
    ctx.fillStyle = '#e8dcc0';
    ctx.beginPath(); ctx.arc(mx + g.hero.x / 64 * cell, my + g.hero.y / 64 * cell, 2.2, 0, 7); ctx.fill();
    ctx.restore(); // конец клипа линзы
    // золотое компасное кольцо с насечками и меткой севера
    const ring = ctx.createLinearGradient(cx, cy - R, cx, cy + R);
    ring.addColorStop(0, '#b8934a'); ring.addColorStop(.5, '#6a5016'); ring.addColorStop(1, '#3a2a0c');
    ctx.strokeStyle = ring; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,225,150,0.25)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, R + 2, 0, 7); ctx.stroke();
    ctx.strokeStyle = 'rgba(216,178,90,0.7)'; ctx.lineWidth = 1.6;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (R - 3), cy + Math.sin(a) * (R - 3));
      ctx.lineTo(cx + Math.cos(a) * (R + 1), cy + Math.sin(a) * (R + 1));
      ctx.stroke();
    }
    ctx.fillStyle = '#ffd75e'; ctx.font = 'bold 9px Georgia'; ctx.textAlign = 'center';
    ctx.fillText('С', cx, cy - R + 10);
    // имя зоны под линзой (DI-стиль)
    const zone = g.townMode ? STR.town : g.progress.rift ? `${STR.rift} ${g.progress.riftLvl}`
      : g.floor?.zoneName ? g.floor.zoneName : `${STR.acts[g.progress.act].name} · ${STR.floor} ${g.progress.floor}`;
    ctx.font = '11px Forum, Georgia, serif';
    ctx.fillStyle = '#cfc4a2';
    ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
    ctx.strokeText(zone, cx, cy + R + 14);
    ctx.fillText(zone, cx, cy + R + 14);
    ctx.restore();
    ctx.globalAlpha = 1;
  }
  skillButtons(g) {
    const bar = g.hero.skillBar;
    return [{ id: 'attack', cmd: 'attack', glyph: 'atk' },
      ...bar.map((id, i) => ({ id, cmd: 'skill' + (i + 1), glyph: id }))].filter(b => b.id);
  }
  // иконка умения (game-icons, CC-BY): лениво грузим, пока нет — рисуем руну
  skillIcon(id) {
    this._sIcons = this._sIcons || new Map();
    let e = this._sIcons.get(id);
    if (!e) {
      e = { img: new Image(), ready: false };
      e.img.onload = () => { e.ready = true; };
      e.img.src = './assets/skills/' + id + '.webp';
      this._sIcons.set(id, e);
    }
    return e.ready ? e.img : null;
  }
  drawSkillGlyph(ctx, b, x, y, r) {
    const icon = this.skillIcon(b.id);
    if (icon) {
      const s = r * 2.1;
      ctx.drawImage(icon, x - s / 2, y - s / 2, s, s);
      return;
    }
    const sk = SKILLS[b.id];
    ctx.strokeStyle = '#d9cba3'; ctx.fillStyle = '#d9cba3'; ctx.lineWidth = 2;
    ctx.save(); ctx.translate(x, y);
    const kind = b.id === 'attack' ? 'atk' : sk?.kind;
    ctx.beginPath();
    switch (kind) { // простые руны по видам умений
      case 'atk': ctx.moveTo(-r * .6, r * .6); ctx.lineTo(r * .6, -r * .6); ctx.moveTo(r * .2, -r * .6); ctx.lineTo(r * .6, -r * .6); ctx.lineTo(r * .6, -r * .2); break;
      case 'melee': ctx.moveTo(-r * .6, r * .4); ctx.lineTo(r * .5, -r * .5); ctx.moveTo(-r * .6, -r * .4); ctx.lineTo(r * .5, r * .5); break;
      case 'proj': ctx.moveTo(-r * .6, 0); ctx.lineTo(r * .6, 0); ctx.lineTo(r * .2, -r * .35); ctx.moveTo(r * .6, 0); ctx.lineTo(r * .2, r * .35); break;
      case 'nova': ctx.arc(0, 0, r * .55, 0, 7); ctx.moveTo(r * .25, 0); ctx.arc(0, 0, r * .25, 0, 7); break;
      case 'zone': ctx.rect(-r * .5, -r * .5, r, r); ctx.moveTo(0, -r * .15); ctx.arc(0, 0, r * .15, 0, 7); break;
      case 'buff': ctx.moveTo(0, r * .6); ctx.lineTo(0, -r * .6); ctx.moveTo(-r * .4, -r * .2); ctx.lineTo(0, -r * .6); ctx.lineTo(r * .4, -r * .2); break;
      case 'dash': ctx.moveTo(-r * .6, 0); ctx.lineTo(r * .5, 0); ctx.moveTo(-r * .2, 0); ctx.lineTo(-r * .6, -r * .3); ctx.moveTo(-r * .2, 0); ctx.lineTo(-r * .6, r * .3); ctx.moveTo(r * .5, -r * .3); ctx.lineTo(r * .5, r * .3); break;
      case 'summon': ctx.arc(-r * .3, r * .2, r * .25, 0, 7); ctx.moveTo(r * .55, r * .2); ctx.arc(r * .3, r * .2, r * .25, 0, 7); ctx.moveTo(0, -r * .5); ctx.arc(0, -r * .3, r * .2, 0, 7); break;
      case 'trap': ctx.moveTo(-r * .5, r * .3); ctx.lineTo(0, -r * .5); ctx.lineTo(r * .5, r * .3); ctx.closePath(); break;
      case 'form': ctx.moveTo(-r * .5, r * .5); ctx.lineTo(0, -r * .55); ctx.lineTo(r * .5, r * .5); ctx.moveTo(-r * .25, r * .1); ctx.lineTo(r * .25, r * .1); break;
      case 'curse': ctx.arc(0, -r * .1, r * .4, Math.PI, 0); ctx.moveTo(0, r * .3); ctx.lineTo(0, r * .6); break;
      case 'chain': ctx.moveTo(-r * .5, -r * .5); ctx.lineTo(0, 0); ctx.lineTo(-r * .15, r * .15); ctx.lineTo(r * .5, r * .55); break;
      default: ctx.arc(0, 0, r * .4, 0, 7);
    }
    ctx.stroke(); ctx.restore();
  }

  // ---------- DOM-экраны ----------
  open(name, opt) { this.screen = name; this.opt = opt; this.render(); this.g.paused = true; }
  closeScreen() { this.screen = null; this.root.querySelector('.panel')?.remove(); this.g.paused = false; this.g.save(); }
  render() {
    this.root.querySelector('.panel')?.remove();
    if (!this.screen) return;
    const p = document.createElement('div');
    p.className = 'panel' + (this.screen === 'mainmenu' ? ' transparent' : '');
    const fn = { inventory: this.rInventory, character: this.rCharacter, talents: this.rTalents,
      town: this.rTown, vendor: this.rVendor, stash: this.rStash, death: this.rDeath, settings: this.rSettings,
      mainmenu: this.rMainMenu, classpick: this.rClassPick, portals: this.rPortals, dialog: this.rDialog }[this.screen];
    p.innerHTML = fn.call(this);
    this.root.appendChild(p);
    this.bindPanel(p);
  }
  tabs(active) {
    const t = [['inventory', STR.inventory], ['character', STR.character], ['talents', STR.talents]];
    return `<div class="tabs">${t.map(([id, n]) =>
      `<button class="tab ${id === active ? 'on' : ''}" data-act="tab" data-id="${id}">${n}${id === 'talents' && this.g.hero.talentPts ? ' ●' : ''}${id === 'character' && this.g.hero.statPts ? ' ●' : ''}</button>`).join('')}
      <button class="tab x" data-act="close">✕</button></div>`;
  }
  itemHtml(it, ctx) {
    const req = this.g.hero.level < it.req ? `<span class="lvlreq">${it.req}</span>` : '';
    return `<div class="cell r-${it.rarity}" data-act="item" data-ctx="${ctx}" data-id="${it.id}">
      <img src="./assets/${esc(it.icon)}.webp" alt="" draggable="false">${req}
    </div>`;
  }
  emptyCell(label) {
    return `<div class="cell empty"><span class="slotname">${label}</span></div>`;
  }
  // сравнение с надетым предметом того же слота (как в D2)
  compareHtml(it, ctx) {
    if (!['bag', 'shop', 'stash'].includes(ctx)) return '';
    const h = this.g.hero;
    let slot = it.slot;
    if (slot === 'ring') slot = h.equip.ring1 ? 'ring1' : 'ring2';
    const cur = h.equip[slot];
    if (!cur) return `<div class="cmphead">${STR.slotEmpty || 'слот свободен'}</div>`;
    if (cur.id === it.id) return '';
    const rows = [];
    const push = (label, nv, ov, pct) => {
      const d = (nv || 0) - (ov || 0);
      if (Math.abs(d) < .05) return;
      const val = pct ? Math.round(Math.abs(d) * 100) + '%' : Math.round(Math.abs(d) * 10) / 10;
      rows.push(`<div class="cmp ${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${label} ${d > 0 ? '+' : '−'}${val}</div>`);
    };
    if (it.dmg || cur.dmg) push(STR.dmg, it.dmg ? (it.dmg[0] + it.dmg[1]) / 2 : 0, cur.dmg ? (cur.dmg[0] + cur.dmg[1]) / 2 : 0);
    push(STR.armor, it.armor, cur.armor);
    const keys = new Set([...Object.keys(it.stats || {}), ...Object.keys(cur.stats || {})]);
    const NAME = { dmgFlat: 'урон', dmgMul: 'урон%', aspd: 'скор. атаки', crit: 'крит', critDmg: 'крит. урон', plusSkills: 'умения',
      leech: 'вампиризм', hpFlat: 'здоровье', hpRegen: 'реген', armorFlat: 'броня', armorMul: 'броня%', resAll: 'все сопр.',
      resFire: 'сопр. огню', resCold: 'сопр. холоду', resLight: 'сопр. молнии', resPoison: 'сопр. яду', moveMul: 'бег',
      goldFind: 'золото', magicFind: 'находки', str: 'сила', dex: 'ловкость', int: 'интеллект', vit: 'живучесть', spellDmg: 'урон умений', potions: 'зелья',
      vsUndead: 'урон нежити', vsDemon: 'урон демонам', lightR: 'свет', cdr: 'перезарядка', resMax: 'запас ресурса', thorns: 'шипы', blockCh: 'блок' };
    for (const k of keys) {
      const pct = /Mul|leech|goldFind|magicFind|lightR|spellDmg|cdr|vsUndead|vsDemon|aspd/.test(k);
      push(NAME[k] || k, (it.stats || {})[k], (cur.stats || {})[k], pct);
    }
    if (!rows.length) return '';
    return `<div class="cmphead">против «${esc(cur.name)}»</div>${rows.slice(0, 6).join('')}`;
  }
  tooltip(it, actions, ctx) {
    const st = [];
    if (it.dmg) st.push(`${STR.dmg}: ${it.dmg[0]}–${it.dmg[1]} (${it.aspd}/с)`);
    if (it.armor) st.push(`${STR.armor}: ${it.armor}`);
    const AFF_T = { dmgFlat: '+# к урону', dmgMul: '+#% урона', aspd: '+#% скор. атаки', crit: '+#% крит. шанса', critDmg: '+#% крит. урона',
      plusSkills: '+# ко всем умениям', leech: '#% урона в здоровье', hpFlat: '+# к здоровью', hpRegen: '+# HP/сек', armorFlat: '+# к броне',
      armorMul: '+#% брони', resFire: '+#% сопр. огню', resCold: '+#% сопр. холоду', resLight: '+#% сопр. молнии', resPoison: '+#% сопр. яду',
      resAll: '+#% ко всем сопр.', moveMul: '+#% скорости бега', goldFind: '+#% золота', magicFind: '+#% магич. находок', thorns: 'шипы: # урона',
      str: '+# к Силе', dex: '+# к Ловкости', int: '+# к Интеллекту', vit: '+# к Живучести', vsUndead: '+#% урона нежити', vsDemon: '+#% урона демонам',
      lightR: '+#% радиуса света', potions: '+# ячейки зелий', spellDmg: '+#% урона умений', resMax: '+# к запасу ресурса', cdr: '-#% перезарядки' };
    for (const k in it.stats) {
      const v = it.stats[k];
      const isPct = /Mul|leech|goldFind|magicFind|lightR|spellDmg|cdr|vsUndead|vsDemon|aspd/.test(k);
      const val = isPct ? Math.round(v * 100) : Math.round(v * 10) / 10;
      st.push((AFF_T[k] || k + ' #').replace('#', val));
    }
    if (it.setId) { const set = SETS.find(s => s.id === it.setId); st.push(`<i>${esc(set.name)} (сет)</i>`); }
    if (it.lore) st.push(`<i class="lore">«${esc(it.lore)}»</i>`);
    const hint = ctx === 'bag' ? `<div class="tthint">двойной тап по предмету — надеть</div>`
      : ctx === 'equip' ? `<div class="tthint">двойной тап — снять</div>` : '';
    return `<div class="tt">
      <button class="ttclose" data-act="closett">✕</button>
      <div class="ttname" style="color:${RC[it.rarity]}">${esc(it.name)}</div>
      ${it.typeName ? `<div class="ttt">${esc(it.typeName)}</div>` : ''}
      <div class="ttreq">${STR.requires}: ${it.req} ${STR.levelShort} · ${it.price} ✦</div>
      ${st.map(x => `<div class="tts">${x}</div>`).join('')}
      ${this.compareHtml(it, ctx)}
      <div class="ttbtns">${actions.map((a, i) => `<button ${i === 0 ? 'class="primary"' : ''} data-act="${a[0]}" data-id="${it.id}">${a[1]}</button>`).join('')}</div>
      ${hint}
    </div>`;
  }

  // кадр героя (юг, stance) из собранного листа — «кукла» для меню
  heroDollUrl(scale = 2.2) {
    const s = this.g.flare?.heroSheet;
    if (!s) return null;
    const anim = s.meta.anims.stance;
    const c = document.createElement('canvas');
    c.width = s.meta.cw * scale; c.height = s.meta.ch * scale;
    const x = c.getContext('2d');
    x.imageSmoothingQuality = 'high';
    x.drawImage(s.canvas, anim.start * s.meta.cw, 4 * s.meta.ch, s.meta.cw, s.meta.ch, 0, 0, c.width, c.height);
    return c.toDataURL();
  }
  // превью класса: один кадр (юг, stance), слои собираются на лету
  classPreviewUrl(cls) {
    const fl = this.g.flare;
    if (!fl?.meta) return null;
    const g2 = cls === 'huntress' ? 'f_' : 'm_';
    const layers = [g2 + 'default_feet', g2 + 'default_legs', g2 + 'default_hands',
      cls === 'mage' || cls === 'warlock' ? g2 + 'mage_vest' : cls === 'barbarian' ? g2 + 'default_chest' : g2 + 'leather_chest',
      g2 + (cls === 'huntress' ? 'head_long' : 'head_short'),
      ({ barbarian: 'm_battle_axe', huntress: 'f_greatbow', mage: 'm_staff', warlock: 'm_greatstaff', druid: 'm_staff' })[cls]];
    fl.preload(layers);
    if (!layers.every(l => fl.loaded(l))) return null;
    let ax = 0, ay = 0, r = 0, d = 0;
    for (const l of layers) { const m = fl.meta[l]; ax = Math.max(ax, m.ax); ay = Math.max(ay, m.ay); r = Math.max(r, m.cw - m.ax); d = Math.max(d, m.ch - m.ay); }
    const c = document.createElement('canvas');
    c.width = (ax + r) * 1.2; c.height = (ay + d) * 1.2;
    const x = c.getContext('2d');
    for (const l of layers) {
      const m = fl.meta[l], img = fl.images.get(l).img;
      const st = m.anims.stance;
      x.drawImage(img, st.start * m.cw, 4 * m.ch, m.cw, m.ch, (ax - m.ax) * 1.2, (ay - m.ay) * 1.2, m.cw * 1.2, m.ch * 1.2);
    }
    return c.toDataURL();
  }

  rInventory() {
    const h = this.g.hero;
    const doll = this.heroDollUrl();
    const S = sl => h.equip[sl] ? this.itemHtml(h.equip[sl], 'equip') : this.emptyCell(STR.slots[sl]);
    return `${this.tabs('inventory')}
    <div class="powerline">⚔ Сила героя: <b>${this.g.stats.power}</b></div>
    <div class="invwrap">
    <div class="invleft">
      <div class="paperdoll">
        <div class="dcol">${S('helm')}${S('weapon')}${S('gloves')}${S('ring1')}</div>
        <div class="dollimg">${doll ? `<img src="${doll}" alt="">` : ''}</div>
        <div class="dcol">${S('amulet')}${S('offhand')}${S('chest')}${S('ring2')}</div>
      </div>
      <div class="paperdoll beltrow" style="grid-template-columns:1fr;padding:6px">
        <div class="dcol" style="flex-direction:row">${S('belt')}${S('boots')}
          <span class="gold" style="margin-left:auto">${h.gold} <span style="color:#ffd75e">✦</span></span></div>
      </div>
    </div>
    <div class="invright">
      <div class="h2">${STR.inventory} (${h.inventory.length}/24)</div>
      <div class="grid">${h.inventory.map(it => this.itemHtml(it, 'bag')).join('')}${Array(Math.max(0, 24 - h.inventory.length)).fill('<div class="cell empty"></div>').join('')}</div>
    </div>
    </div>
    <div id="ttbox"></div>`;
  }
  rCharacter() {
    const h = this.g.hero, s = this.g.stats;
    const rows = [
      [STR.dmg, Math.round(s.dmgTotal)], [STR.aspd, s.attackSpeed.toFixed(2) + '/с'],
      [STR.crit, Math.round(s.critCh) + '% ×' + (1.5 + s.critDmg).toFixed(1)],
      ['HP', `${Math.ceil(h.hp)}/${s.maxHp}`], [STR.armor, s.armor],
      [STR.resFire, Math.round(s.resFire) + '%'], [STR.resCold, Math.round(s.resCold) + '%'], [STR.resLight, Math.round(s.resLight) + '%'], [STR.resPoison, Math.round(s.resPoison) + '%'],
      ['Скорость', Math.round(s.moveSpeed)], ['Магич. находки', Math.round(s.magicFind * 100) + '%'],
    ];
    return `${this.tabs('character')}
    <div class="cols"><div>
      <div class="h2">${STR.classes[h.cls].name} · ${STR.level} ${h.level}</div>
      <div class="powerline">⚔ Сила героя: <b>${s.power}</b></div>
      <div class="xpline">${STR.exp}: ${h.xp}/${h.xpNext}</div>
      <div class="h2">${STR.statPoints}: <b>${h.statPts}</b></div>
      ${['str', 'dex', 'int', 'vit'].map(k => `<div class="statrow">${this.statNames[k]}: <b>${Math.round(this.g.stats[k])}</b>
        ${h.statPts > 0 ? `<button data-act="stat" data-id="${k}">+</button>` : ''}</div>`).join('')}
    </div><div>
      <div class="h2">Сводка</div>
      ${rows.map(r => `<div class="statrow">${r[0]}: <b>${r[1]}</b></div>`).join('')}
    </div></div>`;
  }
  rTalents() {
    const h = this.g.hero;
    const cls = h.cls;
    const brs = [[], [], []];
    for (const id in SKILLS) { const sk = SKILLS[id]; if (sk.cls === cls) brs[sk.br].push([id, sk]); }
    brs.forEach(b => b.sort((a, c) => a[1].lvl - c[1].lvl));
    const brName = {
      barbarian: ['Оружие', 'Крики', 'Стойкость'], huntress: ['Лук', 'Ловушки', 'Тени'], mage: ['Огонь', 'Лёд', 'Молния'],
      warlock: ['Проклятия', 'Призыв', 'Кровь'], druid: ['Волк', 'Медведь', 'Природа'] }[cls];
    return `${this.tabs('talents')}
    <div class="h2">${STR.talentPoints}: <b>${h.talentPts}</b> · ${STR.respec}: ${RESPEC_COST(h.level)} ✦ <button data-act="respec">↺</button></div>
    <div class="cols3">${brs.map((b, bi) => `<div class="branch"><div class="h2">${brName[bi]}</div>
      ${b.map(([id, sk]) => {
        const rank = h.talents[id] || 0;
        const locked = h.level < sk.lvl;
        const onBar = h.skillBar.indexOf(id);
        const pips = '<span class="pips">' + '<b>' + '●'.repeat(rank) + '</b>' + '○'.repeat(5 - rank) + '</span>';
        return `<div class="talent ${locked ? 'locked' : ''} ${rank ? 'known' : ''}">
          <div class="tname"><img class="ticon" src="./assets/skills/${id}.webp" alt="" onerror="this.remove()">${sk.name} ${pips}</div>
          <div class="tdesc">${sk.d}${sk.passive ? '' : ` · ${sk.cost || 0}⚡${sk.cd ? ` · ${sk.cd}с` : ''}`}</div>
          <div class="tdesc">${locked ? `${STR.requires} ${sk.lvl} ${STR.levelShort}` : ''}</div>
          <div>
          ${!locked && rank < 5 && h.talentPts > 0 ? `<button data-act="learn" data-id="${id}">${STR.learn}</button>` : ''}
          ${rank > 0 && !sk.passive && sk.kind !== 'form' ? `<button data-act="assign" data-id="${id}">${onBar >= 0 ? '✓' + (onBar + 1) : STR.assign}</button>` : ''}
          ${rank > 0 && sk.kind === 'form' ? `<button data-act="assign" data-id="${id}">${onBar >= 0 ? '✓' + (onBar + 1) : STR.assign}</button>` : ''}
          </div>
        </div>`;
      }).join('')}</div>`).join('')}</div>`;
  }
  rMainMenu() {
    const { hasSave, loadGame } = this.g.saveApi;
    const saved = hasSave() ? loadGame() : null;
    const info = saved ? `${STR.classes[saved.hero.cls]?.name || ''} · ${STR.level} ${saved.hero.level}` : '';
    return `<div class="menuwrap">
      <div class="menuspacer"></div>
      ${saved ? `<button class="big menubtn" data-act="continue">▶ ${STR.continueGame}<div class="sub">${info}</div></button>` : ''}
      <button class="big menubtn" data-act="newgame">${saved ? '✚ ' : '▶ '}${STR.newGame}</button>
      ${this.confirmWipe ? `<div class="warn">${STR.confirmDelete}
        <button data-act="classpick">${STR.yes}</button><button data-act="mainmenu">${STR.no}</button></div>` : ''}
      <div class="credits">${STR.credits}</div>
    </div>`;
  }
  rClassPick() {
    let missing = false;
    const html = `<div class="tabs"><div class="h1">${STR.chooseClass}</div><button class="tab x" data-act="mainmenu">←</button></div>
    <div class="townbtns">
      ${Object.keys(CLASSES).map(k => {
        const url = this.classPreviewUrl(k);
        if (!url) missing = true;
        return `<button class="big classbtn" data-act="pickclass" data-id="${k}">
          ${url ? `<img class="cprev" src="${url}" alt="">` : '<span class="cprev"></span>'}
          <span class="ctext"><b>${STR.classes[k].name}</b><span class="sub">${STR.classes[k].desc}</span></span>
        </button>`;
      }).join('')}
    </div>`;
    if (missing) setTimeout(() => { if (this.screen === 'classpick') this.render(); }, 600); // дорисуем, когда слои догрузятся
    return html;
  }
  rTown() { // ☰ пауза-меню
    const g = this.g;
    return `<div class="tabs"><div class="h1">${STR.town}</div><button class="tab x" data-act="close">✕</button></div>
    <div class="townbtns">
      ${!g.townMode ? `<button class="big portal" data-act="townportal">🌀 ${STR.townPortalBtn}</button>` : ''}
      <button class="big" data-act="tab" data-id="inventory">🎒 ${STR.inventory}</button>
      <button class="big" data-act="settings">⚙ ${STR.settings}</button>
      <button class="big" data-act="mainmenu">☰ ${STR.mainMenuBtn}</button>
    </div>
    <div class="note">${STR.saveNote}</div>`;
  }
  rPortals() {
    const g = this.g;
    const acts = [1, 2, 3, 4].filter(a => a <= g.progress.unlockedActs);
    return `<div class="tabs"><div class="h1">${STR.portalTo}</div><button class="tab x" data-act="close">✕</button></div>
    <div class="townbtns">
      ${acts.map(a => `<button class="big portal" data-act="goact" data-id="${a}">${STR.acts[a].name}${a === g.progress.act ? ` · ${STR.floor} ${g.progress.floor}` : ''}</button>`).join('')}
      ${g.progress.wps?.a1f1 ? `<button class="big portal" data-act="gowp" data-id="1">⚑ Кладбищенский тракт — вейпоинт</button>` : ''}
      ${g.progress.wps?.a1f2 ? `<button class="big portal" data-act="gowp" data-id="2">⚑ Проклятый склеп — вейпоинт</button>` : ''}
      ${g.progress.cleared ? `<button class="big portal rift" data-act="gorift">🌀 ${STR.rift} ${g.progress.riftLvl}</button>` : ''}
    </div>`;
  }
  rVendor() {
    const g = this.g, h = g.hero;
    if (!g.vendorStock.length) g.restockVendor();
    return `<div class="tabs"><div class="h1">${STR.vendor}</div><button class="tab x" data-act="town">←</button></div>
    <div class="gold">${STR.gold}: <b>${h.gold} ✦</b> · <button data-act="gamble">${STR.gamble} (${GAMBLE_COST(h.level)} ✦)</button>
      <button data-act="sellJunk">Продать хлам (${h.inventory.filter(x => x.rarity === 'common' || x.rarity === 'magic').reduce((a, x) => a + Math.floor(x.price / 3), 0)} ✦)</button></div>
    <div class="invwrap">
      <div class="invleft"><div class="h2">${STR.buy}</div><div class="grid">${g.vendorStock.map(it => this.itemHtml(it, 'shop')).join('')}</div></div>
      <div class="invright"><div class="h2">${STR.sell}</div><div class="grid">${h.inventory.map(it => this.itemHtml(it, 'sellbag')).join('') || '<span class="empty">пусто</span>'}</div></div>
    </div>
    <div id="ttbox"></div>`;
  }
  rStash() {
    const g = this.g, h = g.hero;
    return `<div class="tabs"><div class="h1">${STR.stash} (${g.stash.length}/48)</div><button class="tab x" data-act="town">←</button></div>
    <div class="invwrap">
      <div class="invleft"><div class="h2">${STR.stash}</div><div class="grid">${g.stash.map(it => this.itemHtml(it, 'stash')).join('')}${Array(Math.max(0, 48 - g.stash.length)).fill('<div class="cell empty"></div>').join('')}</div></div>
      <div class="invright"><div class="h2">${STR.inventory}</div><div class="grid">${h.inventory.map(it => this.itemHtml(it, 'tostash')).join('') || '<span class="empty">пусто</span>'}</div></div>
    </div>
    <div id="ttbox"></div>`;
  }
  rDialog() {
    const o = this.opt || {};
    return `<div class="dialogbox">
      <div class="h1">${esc(o.name || '')}</div>
      <div class="dlgtext">«${esc(o.text || '')}»</div>
      <button class="big primary" data-act="dialogok">Продолжить</button>
    </div>`;
  }
  rDeath() {
    return `<div class="death"><div class="h1red">${STR.youDied}</div>
    <div class="note">${STR.deathHint}${this.opt?.goldLost || 0} ✦</div>
    <button class="big" data-act="revive">${STR.revive}</button></div>`;
  }
  rSettings() {
    const st = this.g.settings;
    return `<div class="tabs"><div class="h1">${STR.settings}</div><button class="tab x" data-act="town">←</button></div>
    <div class="townbtns">
      <button class="big" data-act="set" data-id="sound">${STR.sound}: ${st.sound ? '✔' : '✖'}</button>
      <button class="big" data-act="set" data-id="shake">${STR.shake}: ${st.shake ? '✔' : '✖'}</button>
      <button class="big" data-act="set" data-id="flash">${STR.flash}: ${st.flash ? '✔' : '✖'}</button>
      <button class="big" data-act="set" data-id="bigText">${STR.textSize}: ${st.bigText ? '✔' : '✖'}</button>
    </div>`;
  }

  bindPanel(p) {
    p.addEventListener('click', e => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act, id = b.dataset.id;
      const g = this.g, h = g.hero;
      const find = (arr, iid) => arr.find(x => x.id == iid);
      switch (act) {
        case 'close': this.closeScreen(); break;
        case 'closett': { const box = this.root.querySelector('#ttbox'); if (box) box.style.display = 'none'; break; }
        case 'tab': this.open(id); break;
        case 'mainmenu': this.confirmWipe = false; g.state = 'title'; this.open('mainmenu'); break;
        case 'continue': g.doContinue(); break;
        case 'newgame':
          if (g.saveApi.hasSave()) { this.confirmWipe = true; this.render(); }
          else this.open('classpick');
          break;
        case 'classpick': this.confirmWipe = false; this.open('classpick'); break;
        case 'pickclass': g.doNewGame(id); break;
        case 'town': this.open('town'); break;
        case 'vendor': this.open('vendor'); break;
        case 'stash': this.open('stash'); break;
        case 'settings': this.open('settings'); break;
        case 'townportal': this.closeScreen(); g.castTownPortal(); break;
        case 'set': g.settings[id] = !g.settings[id]; g.applySettings(); this.render(); break;
        case 'stat': if (h.statPts > 0) { h.alloc[id]++; h.statPts--; g.recalc(); this.render(); } break;
        case 'learn': if (h.talentPts > 0 && (h.talents[id] || 0) < 5) { h.talents[id] = (h.talents[id] || 0) + 1; h.talentPts--; g.recalc();
          if (!SKILLS[id].passive && h.skillBar.length < 4 && !h.skillBar.includes(id)) h.skillBar.push(id);
          this.render(); } break;
        case 'assign': {
          const i = h.skillBar.indexOf(id);
          if (i >= 0) h.skillBar.splice(i, 1);
          else { if (h.skillBar.length >= 4) h.skillBar.shift(); h.skillBar.push(id); }
          this.render(); break;
        }
        case 'respec': if (h.gold >= RESPEC_COST(h.level)) { h.gold -= RESPEC_COST(h.level);
          let refund = 0; for (const k in h.talents) refund += h.talents[k];
          h.talents = {}; h.skillBar = []; h.talentPts += refund; g.recalc(); this.render(); } else this.toast(STR.notEnoughGold, '#c62828'); break;
        case 'sellJunk': {
          const junk = h.inventory.filter(x => x.rarity === 'common' || x.rarity === 'magic');
          if (!junk.length) break;
          const sum = junk.reduce((a, x) => a + Math.floor(x.price / 3), 0);
          h.inventory = h.inventory.filter(x => x.rarity !== 'common' && x.rarity !== 'magic');
          h.gold += sum;
          this.toast(`Продано ${junk.length} шт. за ${sum} ✦`, '#ffd75e');
          this.render(); break;
        }
        case 'gamble': {
          const cost = GAMBLE_COST(h.level);
          if (h.gold < cost) { this.toast(STR.notEnoughGold, '#c62828'); break; }
          if (h.inventory.length >= 24) { this.toast(STR.inventoryFull, '#c62828'); break; }
          h.gold -= cost;
          const it = makeItem(g.rng, h.level + g.rng.int(0, 3), { magicFind: .8 });
          h.inventory.push(it); this.toast(it.name, RC[it.rarity]); this.render(); break;
        }
        case 'item': { // двойной тап: bag → надеть, equip → снять
          const now = performance.now();
          const key = b.dataset.ctx + '|' + id;
          if (this._tapKey === key && now - this._tapT < 420) {
            this._tapKey = null;
            if (b.dataset.ctx === 'bag') { g.equipItem(Number(id)); this.render(); }
            else if (b.dataset.ctx === 'equip') { g.unequipItem(id); this.render(); }
            else this.showTooltip(b, id, b.dataset.ctx);
          } else {
            this._tapKey = key; this._tapT = now;
            this.showTooltip(b, id, b.dataset.ctx);
          }
          break;
        }
        case 'equipIt': g.equipItem(Number(id)); this.render(); break;
        case 'unequipIt': g.unequipItem(id); this.render(); break;
        case 'sellIt': { const it = find(h.inventory, id); if (it) { h.inventory = h.inventory.filter(x => x !== it); h.gold += Math.floor(it.price / 3); this.render(); } break; }
        case 'buyIt': { const it = find(g.vendorStock, id);
          if (it && h.gold >= it.price && h.inventory.length < 24) { h.gold -= it.price; g.vendorStock = g.vendorStock.filter(x => x !== it); h.inventory.push(it); this.render(); }
          else this.toast(h.gold < (it?.price || 0) ? STR.notEnoughGold : STR.inventoryFull, '#c62828'); break; }
        case 'dropIt': { h.inventory = h.inventory.filter(x => x.id != id); this.render(); break; }
        case 'stashIt': { const it = find(h.inventory, id); if (it && g.stash.length < 48) { h.inventory = h.inventory.filter(x => x !== it); g.stash.push(it); this.render(); } break; }
        case 'unstashIt': { const it = find(g.stash, id); if (it && h.inventory.length < 24) { g.stash = g.stash.filter(x => x !== it); h.inventory.push(it); this.render(); } break; }
        case 'goact': g.enterAct(Number(id)); this.closeScreen(); break;
        case 'gowp': g.enterAct(1, Number(id), true); this.closeScreen(); break;
        case 'gorift': g.enterRift(); this.closeScreen(); break;
        case 'revive': g.revive(); this.closeScreen(); break;
        case 'dialogok': { const cb = this.opt?.cb; this.closeScreen(); if (cb) cb(); break; }
      }
    });
  }
  showTooltip(el, id, ctx) {
    const g = this.g, h = g.hero;
    const src = { equip: Object.values(h.equip).filter(Boolean), bag: h.inventory, shop: g.vendorStock, sellbag: h.inventory, stash: g.stash, tostash: h.inventory }[ctx];
    const it = src.find(x => x.id == id);
    if (!it) return;
    const acts = {
      equip: [['unequipIt', STR.unequip]],
      bag: [['equipIt', STR.equip], ['stashIt', STR.toStash], ['sellIt', `${STR.sell} (${Math.floor(it.price / 3)}✦)`], ['dropIt', STR.drop]],
      shop: [['buyIt', `${STR.buy} (${it.price}✦)`]],
      sellbag: [['sellIt', `${STR.sell} (${Math.floor(it.price / 3)}✦)`]],
      stash: [['unstashIt', STR.fromStash]],
      tostash: [['stashIt', STR.toStash]],
    }[ctx];
    // экипировка из сундука недоступна — только через инвентарь (честно и просто)
    const box = this.root.querySelector('#ttbox');
    if (box) { box.innerHTML = this.tooltip(it, acts, ctx); box.style.display = 'block'; }
  }
}
