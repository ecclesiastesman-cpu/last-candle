// Процедурная генерация этажей: комнаты + коридоры, декор, спавны, светильники.
import { TILE } from './data.js';
import { makeRng } from './core.js';

export const T_WALL = 0, T_FLOOR = 1, T_EXIT = 2, T_ENTRY = 3;

// палитры пропсов по актам: solid — стоячие (клетка непроходима), floor — настил (кости и т.п.)
const PROPS = {
  1: { solid: ['tombs', 'tombs', 'statues', 'altars'], floor: ['bones'] },
  2: { solid: ['furniture', 'furniture', 'tombs', 'banners'], floor: ['bones'] },
  3: { solid: ['chains', 'chains', 'banners', 'thrones', 'furniture'], floor: ['bones', 'circle'] },
  4: { solid: ['obelisks', 'obelisks', 'altars', 'thrones'], floor: ['bones', 'circle'] },
};

export function genFloor(seed, act, floorNum, isBossFloor) {
  const rng = makeRng(seed);
  const W = isBossFloor ? 26 : 40 + floorNum * 2, H = isBossFloor ? 26 : 40 + floorNum * 2;
  const g = new Uint8Array(W * H); // стены
  const rooms = [];
  const nRooms = isBossFloor ? 2 : 9 + floorNum * 2;
  for (let i = 0; i < nRooms * 8 && rooms.length < nRooms; i++) {
    const w = rng.int(6, isBossFloor ? 14 : 13), h = rng.int(6, isBossFloor ? 14 : 13);
    const x = rng.int(2, W - w - 2), y = rng.int(2, H - h - 2);
    if (rooms.some(r => x < r.x + r.w + 1 && x + w + 1 > r.x && y < r.y + r.h + 1 && y + h + 1 > r.y)) continue;
    rooms.push({ x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) });
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) g[yy * W + xx] = T_FLOOR;
  }
  rooms.sort((a, b) => (a.cx + a.cy) - (b.cx + b.cy));
  for (let i = 1; i < rooms.length; i++) { // коридоры
    const a = rooms[i - 1], b = rooms[i];
    let x = a.cx, y = a.cy;
    while (x !== b.cx) { g[y * W + x] = g[(y + 1) * W + x] = T_FLOOR; x += Math.sign(b.cx - x); }
    while (y !== b.cy) { g[y * W + x] = g[y * W + x + 1] = T_FLOOR; y += Math.sign(b.cy - y); }
  }
  const entry = rooms[0], exit = rooms[rooms.length - 1];
  g[entry.cy * W + entry.cx] = T_ENTRY;
  g[exit.cy * W + exit.cx] = T_EXIT;

  // декор, светильники, сундуки, спавны, пропсы
  const decor = [], torches = [], spawns = [], chests = [], decals = [];
  const propAt = new Map(), propsFloor = [];
  const pal = PROPS[act] || PROPS[1];
  // клетка годна под стоячий пропс: пол, не на линиях коридоров (центры комнат), не вход/выход
  const propOk = (r, tx, ty) => {
    if (g[ty * W + tx] !== T_FLOOR) return false;
    if (Math.abs(tx - r.cx) < 2 || Math.abs(ty - r.cy) < 2) return false;
    for (const q of rooms) { if (Math.abs(tx - q.cx) < 2 && Math.abs(ty - q.cy) < 2) return false; }
    return !propAt.has(ty * W + tx);
  };
  for (let i = 1; i < rooms.length; i++) {
    const r = rooms[i];
    const area = r.w * r.h;
    // колонны в больших залах (архитектура + укрытия)
    if (!isBossFloor && r.w >= 9 && r.h >= 9) {
      const px = [r.x + 2, r.x + r.w - 3], py = [r.y + 2, r.y + r.h - 3];
      for (const cx of px) for (const cy of py) if (rng.chance(.8)) g[cy * W + cx] = T_WALL;
    }
    // стоячие пропсы вдоль стен комнаты (гробницы, статуи, утварь акта)
    const nProps = Math.max(1, Math.round(area / 16));
    for (let k = 0, placed = 0; k < nProps * 6 && placed < nProps; k++) {
      const side = rng.int(0, 3);
      const tx = side === 0 ? r.x : side === 1 ? r.x + r.w - 1 : rng.int(r.x, r.x + r.w - 1);
      const ty = side === 2 ? r.y : side === 3 ? r.y + r.h - 1 : rng.int(r.y, r.y + r.h - 1);
      if (!propOk(r, tx, ty)) continue;
      propAt.set(ty * W + tx, rng.pick(pal.solid));
      placed++;
    }
    // настил: кости, круги — где угодно в комнате
    const nFloor = Math.round(area / 26);
    for (let k = 0; k < nFloor; k++) {
      const tx = rng.int(r.x, r.x + r.w - 1), ty = rng.int(r.y, r.y + r.h - 1);
      if (g[ty * W + tx] !== T_FLOOR || propAt.has(ty * W + tx)) continue;
      propsFloor.push({ tx, ty, group: rng.pick(pal.floor) });
    }
    // декали: кровь, трещины, мох
    const nDec = Math.round(area / 30);
    for (let k = 0; k < nDec; k++) {
      decals.push({ x: rng.range(r.x + .5, r.x + r.w - .5) * 64, y: rng.range(r.y + .5, r.y + r.h - .5) * 64,
        kind: rng.pick(['blood', 'blood', 'crack', 'moss']), r: rng.range(14, 38), a: rng.range(0, 6.28), seed: rng.int(0, 999) });
    }
    if (!isBossFloor) {
      const packs = Math.max(1, Math.round(area / 55));
      for (let p = 0; p < packs; p++) {
        spawns.push({ x: rng.int(r.x + 1, r.x + r.w - 2), y: rng.int(r.y + 1, r.y + r.h - 2),
          n: rng.int(3, 6), elite: rng.chance(.16 + floorNum * .02) });
      }
      if (rng.chance(.3)) chests.push({ x: rng.int(r.x + 1, r.x + r.w - 2), y: rng.int(r.y + 1, r.y + r.h - 2) });
    }
    torches.push({ x: r.x + 1, y: r.y + 1 }, { x: r.x + r.w - 2, y: r.y + r.h - 2 });
  }
  let bossSpawn = null;
  if (isBossFloor) bossSpawn = { x: exit.cx, y: exit.cy };
  const visited = new Uint8Array(W * H);
  return { W, H, g, rooms, entry, exit, decor, torches, spawns, chests, decals, visited, bossSpawn, act, floorNum, isBossFloor, propAt, propsFloor };
}

export const isWall = (f, tx, ty) => tx < 0 || ty < 0 || tx >= f.W || ty >= f.H || f.g[ty * f.W + tx] === T_WALL
  || (f.propAt && f.propAt.has(ty * f.W + tx));

// столкновение круга со стенами
export function collide(f, x, y, r) {
  const minTx = Math.floor((x - r) / TILE), maxTx = Math.floor((x + r) / TILE);
  const minTy = Math.floor((y - r) / TILE), maxTy = Math.floor((y + r) / TILE);
  let nx = x, ny = y;
  for (let ty = minTy; ty <= maxTy; ty++) for (let tx = minTx; tx <= maxTx; tx++) {
    if (!isWall(f, tx, ty)) continue;
    const cx = Math.max(tx * TILE, Math.min(nx, tx * TILE + TILE));
    const cy = Math.max(ty * TILE, Math.min(ny, ty * TILE + TILE));
    const dx = nx - cx, dy = ny - cy, d2 = dx * dx + dy * dy;
    if (d2 < r * r && d2 > 0.0001) {
      const d = Math.sqrt(d2), push = (r - d) / d;
      nx += dx * push; ny += dy * push;
    } else if (d2 <= 0.0001) { nx += r; }
  }
  return [nx, ny];
}

export function losClear(f, x0, y0, x1, y1) {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (TILE * .4));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (isWall(f, Math.floor((x0 + (x1 - x0) * t) / TILE), Math.floor((y0 + (y1 - y0) * t) / TILE))) return false;
  }
  return true;
}

// ---- ЛАГЕРЬ (город): рукотворная площадь с костром и NPC ----
export function genTown() {
  const W = 16, H = 14;
  const g = new Uint8Array(W * H); // всё стены
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) g[y * W + x] = T_FLOOR;
  // выступ-врата на юге
  g[(H - 2) * W + 7] = T_FLOOR; g[(H - 2) * W + 8] = T_FLOOR;
  const cx = 7.5 * 64, cy = 6.5 * 64;
  const npcs = [
    { kind: 'vendor', x: 4.2 * 64, y: 4.6 * 64, angle: Math.PI * .75 },
    { kind: 'keeper', x: 11.2 * 64, y: 4.6 * 64, angle: Math.PI * .25 },
    { kind: 'altar', x: 12.2 * 64, y: 9.2 * 64 },
    { kind: 'gates', x: 7.5 * 64, y: 12.1 * 64 },
  ];
  const torches = [{ x: 3, y: 3 }, { x: 12, y: 3 }, { x: 3, y: 10 }, { x: 12, y: 10 }];
  const decals = [
    { x: 5 * 64, y: 9 * 64, kind: 'moss', r: 34, a: 0, seed: 7 },
    { x: 10 * 64, y: 5 * 64, kind: 'moss', r: 26, a: 0, seed: 11 },
  ];
  // костёр посреди площади + утварь лагеря (ящики у торговца, знамёна у хранителя, стол у врат)
  const campfire = { tx: 7, ty: 6 };
  const propAt = new Map();
  propAt.set(6 * W + 7, 'firepit');
  propAt.set(5 * W + 3, 'furniture'); propAt.set(3 * W + 5, 'furniture');
  propAt.set(3 * W + 10, 'banners'); propAt.set(4 * W + 13, 'banners');
  propAt.set(10 * W + 5, 'furniture');
  const propsFloor = [{ tx: 9, ty: 9, group: 'circle' }];
  const visited = new Uint8Array(W * H); visited.fill(1);
  return { W, H, g, rooms: [], entry: { cx: 7, cy: 8 }, exit: { cx: -9, cy: -9 },
    decor: [], torches, spawns: [], chests: [], decals, visited, propAt, propsFloor, campfire,
    bossSpawn: null, act: 1, floorNum: 0, isBossFloor: false, town: true, npcs };
}
