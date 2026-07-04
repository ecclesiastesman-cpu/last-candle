// Процедурная генерация этажей: комнаты + коридоры, декор, спавны, светильники.
import { TILE } from './data.js';
import { makeRng } from './core.js';

export const T_WALL = 0, T_FLOOR = 1, T_EXIT = 2, T_ENTRY = 3;

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

  // декор, светильники, сундуки, спавны
  const decor = [], torches = [], spawns = [], chests = [], decals = [];
  for (let i = 1; i < rooms.length; i++) {
    const r = rooms[i];
    const area = r.w * r.h;
    // колонны в больших залах (архитектура + укрытия)
    if (!isBossFloor && r.w >= 9 && r.h >= 9) {
      const px = [r.x + 2, r.x + r.w - 3], py = [r.y + 2, r.y + r.h - 3];
      for (const cx of px) for (const cy of py) if (rng.chance(.8)) g[cy * W + cx] = T_WALL;
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
      if (rng.chance(.55)) decor.push({ x: rng.int(r.x + 1, r.x + r.w - 2), y: rng.int(r.y + 1, r.y + r.h - 2), kind: rng.int(0, 1) });
    }
    torches.push({ x: r.x + 1, y: r.y + 1 }, { x: r.x + r.w - 2, y: r.y + r.h - 2 });
  }
  let bossSpawn = null;
  if (isBossFloor) bossSpawn = { x: exit.cx, y: exit.cy };
  const visited = new Uint8Array(W * H);
  return { W, H, g, rooms, entry, exit, decor, torches, spawns, chests, decals, visited, bossSpawn, act, floorNum, isBossFloor };
}

export const isWall = (f, tx, ty) => tx < 0 || ty < 0 || tx >= f.W || ty >= f.H || f.g[ty * f.W + tx] === T_WALL;

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
