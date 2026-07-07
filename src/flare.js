// Анимированные спрайты из арта Flare (CC-BY-SA, flareteam/flare-game).
// Листы: assets/flare/<name>.webp, ряды = направления [S,SW,W,NW,N], восток зеркалится.
// meta.json: {name: {cw,ch,ax,ay, anims:{stance:{start,frames,dur,type},...}}}

// угол (рад, y вниз) -> [ряд, зеркалить]
// Ряды листа (проверено на человеческой модели): 0=N, 1=NW, 2=W, 3=SW, 4=S.
export function rowFlip(angle) {
  let k = Math.round(angle / (Math.PI / 4));
  if (k > 4) k -= 8; if (k < -4) k += 8;
  switch (k) {
    case 2: return [4, false];   // S
    case 3: return [3, false];   // SW
    case 4: case -4: return [2, false]; // W
    case -3: return [1, false];  // NW
    case -2: return [0, false];  // N
    case -1: return [1, true];   // NE  <- NW
    case 0: return [2, true];    // E   <- W
    default: return [3, true];   // SE  <- SW (k===1)
  }
}

export function frameOf(anim, tMs) {
  const n = anim.frames;
  if (n <= 1) return 0;
  const cyc = tMs / anim.dur;
  if (anim.type === 'play_once') return Math.min(n - 1, Math.floor(cyc * n));
  if (anim.type === 'back_forth') {
    const p = Math.floor((cyc % 1) * (2 * n - 2));
    return p < n ? p : 2 * n - 2 - p;
  }
  return Math.floor((cyc % 1) * n);
}

export class Flare {
  constructor() {
    this.meta = null;
    this.images = new Map();   // name -> {img, ready}
    this.heroSheet = null;     // {canvas, meta}
    this.heroKey = '';
  }
  async init() {
    try {
      this.meta = await (await fetch('./assets/flare/meta.json')).json();
      return true;
    } catch { this.meta = null; return false; }
  }
  has(name) { return !!(this.meta && this.meta[name]); }
  // ленивый лпослойный загрузчик
  get(name) {
    let e = this.images.get(name);
    if (!e) {
      e = { img: new Image(), ready: false, failed: false };
      e.img.onload = () => { e.ready = true; };
      e.img.onerror = () => { e.failed = true; };
      e.img.src = './assets/flare/' + name + '.webp';
      this.images.set(name, e);
    }
    return e;
  }
  preload(names) { for (const n of names) if (this.has(n)) this.get(n); }
  loaded(name) { const e = this.images.get(name); return !!(e && e.ready); }

  // отрисовка сущности; вернёт false если лист ещё не готов (рисуй фолбэк)
  draw(ctx, name, x, y, animName, tMs, angle, scale = 1, alpha = 1) {
    const m = this.meta?.[name];
    const e = m && this.get(name);
    if (!m || !e?.ready) return false;
    const anim = m.anims[animName] || m.anims.stance;
    if (!anim) return false;
    const [row, flip] = rowFlip(angle);
    const col = anim.start + frameOf(anim, tMs);
    ctx.save();
    ctx.translate(x, y);
    if (alpha < 1) ctx.globalAlpha = alpha;
    if (flip) ctx.scale(-scale, scale); else ctx.scale(scale, scale);
    ctx.drawImage(e.img, col * m.cw, row * m.ch, m.cw, m.ch,
      flip ? -(m.cw - m.ax) : -m.ax, -m.ay, m.cw, m.ch);
    ctx.restore();
    return true;
  }
  animDur(name, animName) {
    return this.meta?.[name]?.anims?.[animName]?.dur ?? 600;
  }

  // ---- сборка героя из слоёв ----
  // порядок слоёв по рядам (из engine/hero_layers.txt Flare)
  static ORDER = [
    ['feet', 'legs', 'hands', 'chest', 'off', 'head', 'main'], // ряд 0 = N
    ['main', 'feet', 'legs', 'hands', 'chest', 'off', 'head'], // NW
    ['main', 'feet', 'legs', 'hands', 'chest', 'off', 'head'], // W
    ['main', 'feet', 'legs', 'hands', 'chest', 'off', 'head'], // SW
    ['main', 'feet', 'legs', 'hands', 'chest', 'head', 'off'], // S
  ];
  // layers: {feet,legs,hands,chest,head,off,main} -> имя листа или null
  // onReady(sheet) вызовется, когда все слои догрузятся и лист соберётся
  composeHero(layers, key, onReady) {
    if (this.heroKey === key && this.heroSheet) { onReady(this.heroSheet); return; }
    const names = Object.values(layers).filter(Boolean).filter(n => this.has(n));
    if (!names.length) { onReady(null); return; }
    names.forEach(n => this.get(n)); // старт загрузки слоёв
    const tryBuild = () => {
      if (!names.every(n => this.loaded(n) || this.images.get(n)?.failed)) return false;
      const metas = names.map(n => this.meta[n]);
      const canon = this.meta[layers.chest] || metas[0];
      let ax = 0, ay = 0, right = 0, down = 0;
      for (const m of metas) {
        ax = Math.max(ax, m.ax); ay = Math.max(ay, m.ay);
        right = Math.max(right, m.cw - m.ax); down = Math.max(down, m.ch - m.ay);
      }
      let cw = ax + right, ch = ay + down;
      const totalCols = Object.values(canon.anims).reduce((s, a) => Math.max(s, a.start + a.frames), 0);
      // страховка iOS: канвас с площадью >16.7 Мп или стороной >8192 молча пустеет.
      // Крупное оружие (двуручник) раздувает ячейку — тогда собираем лист с даунскейлом k.
      const MAXA = 15.5e6, MAXS = 8192;
      const w0 = cw * totalCols, h0 = ch * 5;
      const k = Math.min(1, MAXS / w0, MAXS / h0, Math.sqrt(MAXA / (w0 * h0)));
      if (k < 1) { cw = Math.floor(cw * k); ch = Math.floor(ch * k); ax = Math.round(ax * k); ay = Math.round(ay * k); }
      const canvas = document.createElement('canvas');
      canvas.width = cw * totalCols; canvas.height = ch * 5;
      const cx = canvas.getContext('2d');
      cx.imageSmoothingQuality = 'high';
      console.info(`[flare] лист героя ${canvas.width}x${canvas.height}` + (k < 1 ? ` (даунскейл ${k.toFixed(2)})` : ''));
      for (let row = 0; row < 5; row++) {
        for (const slot of Flare.ORDER[row]) {
          const n = layers[slot];
          if (!n || !this.loaded(n)) continue;
          const lm = this.meta[n], le = this.images.get(n);
          const cols = Object.values(lm.anims).reduce((s, a) => Math.max(s, a.start + a.frames), 0);
          for (let col = 0; col < Math.min(cols, totalCols); col++) {
            cx.drawImage(le.img, col * lm.cw, row * lm.ch, lm.cw, lm.ch,
              col * cw + (ax - Math.round(lm.ax * k)), row * ch + (ay - Math.round(lm.ay * k)),
              Math.round(lm.cw * k), Math.round(lm.ch * k));
          }
        }
      }
      this.heroSheet = { canvas, meta: { cw, ch, ax, ay, anims: canon.anims } };
      this.heroKey = key;
      onReady(this.heroSheet);
      return true;
    };
    if (!tryBuild()) {
      const timer = setInterval(() => { if (tryBuild()) clearInterval(timer); }, 120);
      setTimeout(() => clearInterval(timer), 15000);
    }
  }
  drawHeroSheet(ctx, x, y, animName, tMs, angle, scale = 1) {
    const s = this.heroSheet;
    if (!s) return false;
    const anim = s.meta.anims[animName] || s.meta.anims.stance;
    const [row, flip] = rowFlip(angle);
    const col = anim.start + frameOf(anim, tMs);
    const cv = s.canvases ? s.canvases[(col / s.chunkCols) | 0] : s.canvas;
    const ccol = s.canvases ? col % s.chunkCols : col;
    if (!cv) return false;
    ctx.save();
    ctx.translate(x, y);
    if (flip) ctx.scale(-scale, scale); else ctx.scale(scale, scale);
    ctx.drawImage(cv, ccol * s.meta.cw, row * s.meta.ch, s.meta.cw, s.meta.ch,
      flip ? -(s.meta.cw - s.meta.ax) : -s.meta.ax, -s.meta.ay, s.meta.cw, s.meta.ch);
    ctx.restore();
    return true;
  }

  // ---- v25: кукла из Blender-слоёв (body + chest_tX + helm_tX + weapon) ----
  // реестр выложенных классов: не трогаем сеть (и консоль 404-ами), пока ассетов нет
  static B25 = new Set(['barbarian', 'huntress', 'mage', 'warlock', 'druid']);
  async b25Meta(cls) {
    if (!Flare.B25.has(cls)) return null;
    this._b25 = this._b25 || new Map();
    if (this._b25.has(cls)) return this._b25.get(cls);
    let m = null;
    try { m = await (await fetch(`./assets/flare/b25_${cls}.json`)).json(); } catch {}
    this._b25.set(cls, m);
    return m;
  }
  async composeHeroB25(cls, names, key) {
    if (this.heroKey === key && this.heroSheet) return true;
    const meta = await this.b25Meta(cls);
    if (!meta) return false;
    const imgs = await Promise.all(names.map(n => new Promise(res => {
      const im = new Image();
      im.onload = () => res(im); im.onerror = () => res(null);
      im.src = `./assets/flare/${n}.webp`;
    })));
    if (!imgs[0]) return false; // нет тела — нет куклы
    const cols = Object.values(meta.anims).reduce((s, a) => Math.max(s, a.start + a.frames), 0);
    const chunkCols = 20; // 20*256=5120 < лимита стороны канваса iOS (8192)
    const canvases = [];
    for (let c0 = 0; c0 < cols; c0 += chunkCols) {
      const n = Math.min(chunkCols, cols - c0);
      const cv = document.createElement('canvas');
      cv.width = n * meta.cw; cv.height = 5 * meta.ch;
      const cx = cv.getContext('2d');
      for (const im of imgs) {
        if (!im) continue;
        cx.drawImage(im, c0 * meta.cw, 0, n * meta.cw, 5 * meta.ch, 0, 0, n * meta.cw, 5 * meta.ch);
      }
      canvases.push(cv);
    }
    this.heroSheet = { canvases, chunkCols, meta };
    this.heroKey = key;
    return true;
  }
}

// маппинг предметов на слои Flare (тир по ilvl); g='m'|'f'
export function gearLayers(hero, gender) {
  const g = gender + '_';
  const eq = hero.equip;
  const L = {
    feet: g + 'default_feet', legs: g + 'default_legs', hands: g + 'default_hands',
    chest: g + 'default_chest', head: g + (gender === 'f' ? 'head_long' : 'head_short'),
    off: null, main: null,
  };
  const chest = eq.chest;
  if (chest) {
    if (chest.base === 'robe') L.chest = g + 'mage_vest';
    else L.chest = g + (chest.ilvl < 7 ? 'cloth_shirt' : chest.ilvl < 15 ? 'leather_chest' : chest.ilvl < 24 ? 'chain_cuirass' : 'plate_cuirass');
  } else if (hero.cls === 'mage' || hero.cls === 'warlock') L.chest = g + 'mage_vest';
  else if (hero.cls === 'druid' || hero.cls === 'huntress') L.chest = g + 'leather_chest';
  const helm = eq.helm;
  if (helm) L.head = g + (helm.ilvl < 8 ? 'leather_hood' : helm.ilvl < 18 ? 'chain_coif' : 'plate_helm');
  const off = eq.offhand;
  if (off && off.base === 'shield') L.off = 'm_' + (off.ilvl < 10 ? 'buckler' : 'kite_shield');
  const wpn = eq.weapon;
  const W = { axe: 'battle_axe', sword2h: 'greatsword', bow: 'greatbow', staff: 'staff', scythe: 'greatstaff', dagger: 'dagger' };
  if (wpn && W[wpn.base]) L.main = (wpn.base === 'bow' ? 'f_' : 'm_') + W[wpn.base];
  return L;
}
