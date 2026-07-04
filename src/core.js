// Ядро: сид-RNG, математика, ввод (клавиатура/тач/геймпад -> команды), шина событий.

export function makeRng(seed) {
  let s = seed >>> 0 || 1;
  const f = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  f.int = (a, b) => a + Math.floor(f() * (b - a + 1));
  f.pick = arr => arr[Math.floor(f() * arr.length)];
  f.chance = p => f() < p;
  f.range = (a, b) => a + f() * (b - a);
  return f;
}
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
export const len = (x, y) => Math.hypot(x, y) || 1;

// Шина событий: геймплей не трогает звук/UI напрямую.
export const bus = {
  m: new Map(),
  on(ev, fn) { (this.m.get(ev) || this.m.set(ev, []).get(ev)).push(fn); },
  emit(ev, a, b, c) { const l = this.m.get(ev); if (l) for (let i = 0; i < l.length; i++) l[i](a, b, c); },
};

// ---- ВВОД ----
// Команды: moveX/moveY [-1..1], attack, skill1..4, potion, aimX/aimY (мир).
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.held = new Set();
    this.stick = { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 };
    this.aim = { active: false, id: -1, ox: 0, oy: 0, x: 0, y: 0, t: 0 };
    this.buttons = new Map(); // экранные кнопки: id -> {x,y,r,cmd,held,touchId}
    this.tapWorld = null;     // тап по миру (десктоп-клик/правая зона без кнопки)
    this.pressedOnce = new Set();
    const BIND = { KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      Space: 'attack', KeyJ: 'attack', KeyK: 'skill1', KeyL: 'skill2', KeyU: 'skill3', KeyI: 'skill4',
      KeyQ: 'potion', KeyE: 'interact', Tab: 'inventory', KeyC: 'character', KeyT: 'talents', Escape: 'menu' };
    addEventListener('keydown', e => { const c = BIND[e.code]; if (c) { if (!this.held.has(c)) this.pressedOnce.add(c); this.held.add(c); e.preventDefault(); } });
    addEventListener('keyup', e => { const c = BIND[e.code]; if (c) this.held.delete(c); });

    this.lastTouchT = 0;
    const onTouch = (e, phase) => {
      this.lastTouchT = performance.now();
      for (const t of e.changedTouches) {
        const x = t.clientX, y = t.clientY;
        if (phase === 'start') {
          let onBtn = false;
          for (const b of this.buttons.values()) {
            if (dist2(x, y, b.x, b.y) < b.r * b.r * 1.9) { b.held = true; b.touchId = t.identifier; this.pressedOnce.add(b.cmd); onBtn = true; break; }
          }
          if (!onBtn && x < innerWidth * .45 && !this.stick.active) {
            this.stick = { active: true, id: t.identifier, ox: x, oy: y, x, y };
          } else if (!onBtn && !this.aim.active) {
            // правая зона: стик прицеливания и удара
            this.aim = { active: true, id: t.identifier, ox: x, oy: y, x, y, t: performance.now() };
          } else if (!onBtn) { this.tapWorld = { x, y }; }
        } else if (phase === 'move') {
          if (this.stick.active && t.identifier === this.stick.id) { this.stick.x = x; this.stick.y = y; }
          if (this.aim.active && t.identifier === this.aim.id) { this.aim.x = x; this.aim.y = y; }
        } else {
          if (this.stick.active && t.identifier === this.stick.id) this.stick.active = false;
          if (this.aim.active && t.identifier === this.aim.id) {
            // короткий тап без наклона = разовый удар по ближайшему
            if (performance.now() - this.aim.t < 220 && Math.hypot(x - this.aim.ox, y - this.aim.oy) < 14) this.pressedOnce.add('attack');
            this.aim.active = false;
          }
          for (const b of this.buttons.values()) if (b.touchId === t.identifier) { b.held = false; b.touchId = -1; }
        }
      }
      if (e.cancelable) e.preventDefault();
    };
    canvas.addEventListener('touchstart', e => onTouch(e, 'start'), { passive: false });
    canvas.addEventListener('touchmove', e => onTouch(e, 'move'), { passive: false });
    canvas.addEventListener('touchend', e => onTouch(e, 'end'), { passive: false });
    canvas.addEventListener('touchcancel', e => onTouch(e, 'end'), { passive: false });
    // Safari после касания синтезирует мышиные события — глушим их окном 700мс
    canvas.addEventListener('mousedown', e => { if (performance.now() - this.lastTouchT < 700) return; this.tapWorld = { x: e.clientX, y: e.clientY }; this.mouseHeld = true; });
    canvas.addEventListener('mousemove', e => { if (performance.now() - this.lastTouchT < 700) return; this.mouse = { x: e.clientX, y: e.clientY }; if (this.mouseHeld) this.tapWorld = { x: e.clientX, y: e.clientY }; });
    canvas.addEventListener('mouseup', () => { this.mouseHeld = false; });
  }
  addButton(id, x, y, r, cmd) { const b = this.buttons.get(id) || {}; Object.assign(b, { x, y, r, cmd }); if (b.held === undefined) { b.held = false; b.touchId = -1; } this.buttons.set(id, b); }
  clearButtons() { this.buttons.clear(); }
  poll() {
    const c = { moveX: 0, moveY: 0 };
    if (this.held.has('left')) c.moveX -= 1; if (this.held.has('right')) c.moveX += 1;
    if (this.held.has('up')) c.moveY -= 1; if (this.held.has('down')) c.moveY += 1;
    if (this.stick.active) {
      const dx = this.stick.x - this.stick.ox, dy = this.stick.y - this.stick.oy, d = Math.hypot(dx, dy);
      if (d > 8) { const m = Math.min(1, d / 52); c.moveX = dx / d * m; c.moveY = dy / d * m; }
    }
    if (this.aim.active) {
      const dx = this.aim.x - this.aim.ox, dy = this.aim.y - this.aim.oy, d = Math.hypot(dx, dy);
      if (d > 16) { c.aimX = dx / d; c.aimY = dy / d; c.attack = true; }
    }
    for (const gp of navigator.getGamepads?.() ?? []) {
      if (!gp) continue;
      if (Math.abs(gp.axes[0]) > .2) c.moveX = gp.axes[0];
      if (Math.abs(gp.axes[1]) > .2) c.moveY = gp.axes[1];
      const ax = gp.axes[2] ?? 0, ay = gp.axes[3] ?? 0;
      if (Math.hypot(ax, ay) > .35) { c.aimX = ax; c.aimY = ay; c.attack = true; }
      const GB = { 0: 'attack', 1: 'skill1', 2: 'skill2', 3: 'skill3', 5: 'skill4', 4: 'potion', 9: 'menu' };
      gp.buttons.forEach((b, i) => { if (b.pressed && GB[i]) { if (!this._gpHeld?.has(i)) this.pressedOnce.add(GB[i]); (this._gpHeld ||= new Set()).add(i); c[GB[i]] = true; } else this._gpHeld?.delete(i); });
    }
    for (const cmd of ['attack', 'skill1', 'skill2', 'skill3', 'skill4', 'potion', 'interact']) if (this.held.has(cmd)) c[cmd] = true;
    for (const b of this.buttons.values()) if (b.held) c[b.cmd] = true;
    c.once = this.pressedOnce; this.pressedOnce = new Set();
    c.tap = this.tapWorld; this.tapWorld = null;
    return c;
  }
}
