'use strict';

/* ==========================================================================
   WORLD — generation, collision, line of sight
   ========================================================================== */

const MAP = {
  obstacles: [],   // {kind:'rect', x,y,w,h,type, blocks:true}
  rocks: [],       // {kind:'circle', x,y,r, type:'rock'}
  trees: [],       // {kind:'circle', x,y,r, type:'tree', blocksBullets:false}
  loot: [],
  patches: [],
  buildings: [],
  roads: [],
  cell: 220,
  cols: 0,
  grid: []
};

function addRect(x, y, w, h, type) {
  const o = { kind: 'rect', x, y, w, h, type, blocksBullets: true };
  MAP.obstacles.push(o);
  return o;
}
function addRock(x, y, r) {
  const o = { kind: 'circle', x, y, r, type: 'rock', blocksBullets: true };
  MAP.rocks.push(o);
  return o;
}
function addTree(x, y, r) {
  const o = { kind: 'circle', x, y, r, type: 'tree', blocksBullets: false, seed: Math.random() * 1000 };
  MAP.trees.push(o);
  return o;
}

/* ---------- spatial grid ---------- */
function buildGrid() {
  MAP.cols = Math.ceil(WORLD_SIZE / MAP.cell);
  MAP.grid = new Array(MAP.cols * MAP.cols);
  for (let i = 0; i < MAP.grid.length; i++) MAP.grid[i] = [];

  const push = (o, x, y, w, h) => {
    const c0 = clamp(Math.floor(x / MAP.cell), 0, MAP.cols - 1);
    const c1 = clamp(Math.floor((x + w) / MAP.cell), 0, MAP.cols - 1);
    const r0 = clamp(Math.floor(y / MAP.cell), 0, MAP.cols - 1);
    const r1 = clamp(Math.floor((y + h) / MAP.cell), 0, MAP.cols - 1);
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) MAP.grid[cy * MAP.cols + cx].push(o);
  };
  for (const o of MAP.obstacles) push(o, o.x, o.y, o.w, o.h);
  for (const o of MAP.rocks) push(o, o.x - o.r, o.y - o.r, o.r * 2, o.r * 2);
  for (const o of MAP.trees) push(o, o.x - o.r, o.y - o.r, o.r * 2, o.r * 2);
}

let _qbuf = [];
function queryObstacles(minx, miny, maxx, maxy) {
  const out = [];
  if (!MAP.cols) return out;
  const c0 = clamp(Math.floor(minx / MAP.cell), 0, MAP.cols - 1);
  const c1 = clamp(Math.floor(maxx / MAP.cell), 0, MAP.cols - 1);
  const r0 = clamp(Math.floor(miny / MAP.cell), 0, MAP.cols - 1);
  const r1 = clamp(Math.floor(maxy / MAP.cell), 0, MAP.cols - 1);
  for (let cy = r0; cy <= r1; cy++) {
    for (let cx = c0; cx <= c1; cx++) {
      const cell = MAP.grid[cy * MAP.cols + cx];
      for (let i = 0; i < cell.length; i++) {
        const o = cell[i];
        if (out.indexOf(o) === -1) out.push(o);
      }
    }
  }
  return out;
}

/* ---------- collision ---------- */
function rectCircleHit(o, x, y, r) {
  const cx = clamp(x, o.x, o.x + o.w);
  const cy = clamp(y, o.y, o.y + o.h);
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy < r * r;
}

function blockedAt(x, y, r) {
  if (x < r || y < r || x > WORLD_SIZE - r || y > WORLD_SIZE - r) return true;
  const list = queryObstacles(x - r - 4, y - r - 4, x + r + 4, y + r + 4);
  for (const o of list) {
    if (o.kind === 'rect') {
      if (rectCircleHit(o, x, y, r)) return true;
    } else {
      const dx = x - o.x, dy = y - o.y, rr = r + o.r;
      if (dx * dx + dy * dy < rr * rr) return true;
    }
  }
  return false;
}

/* pushes a moving circle out of solid geometry; mutates position */
function resolveCollision(ent, r) {
  ent.x = clamp(ent.x, r, WORLD_SIZE - r);
  ent.y = clamp(ent.y, r, WORLD_SIZE - r);
  const list = queryObstacles(ent.x - r - 6, ent.y - r - 6, ent.x + r + 6, ent.y + r + 6);
  for (const o of list) {
    if (o.kind === 'rect') {
      const cx = clamp(ent.x, o.x, o.x + o.w);
      const cy = clamp(ent.y, o.y, o.y + o.h);
      let dx = ent.x - cx, dy = ent.y - cy;
      let d = Math.sqrt(dx * dx + dy * dy);
      if (d < r) {
        if (d < 0.0001) {
          // center inside the rect: push out through the nearest side
          const left = ent.x - o.x, right = o.x + o.w - ent.x;
          const top = ent.y - o.y, bottom = o.y + o.h - ent.y;
          const m = Math.min(left, right, top, bottom);
          if (m === left) ent.x = o.x - r;
          else if (m === right) ent.x = o.x + o.w + r;
          else if (m === top) ent.y = o.y - r;
          else ent.y = o.y + o.h + r;
        } else {
          const push = (r - d) / d;
          ent.x += dx * push;
          ent.y += dy * push;
        }
      }
    } else {
      const dx = ent.x - o.x, dy = ent.y - o.y;
      const rr = r + o.r;
      const d2 = dx * dx + dy * dy;
      if (d2 < rr * rr) {
        const d = Math.sqrt(d2) || 0.001;
        const push = (rr - d) / d;
        ent.x += dx * push;
        ent.y += dy * push;
      }
    }
  }
  ent.x = clamp(ent.x, r, WORLD_SIZE - r);
  ent.y = clamp(ent.y, r, WORLD_SIZE - r);
}

/* ---------- line of sight ---------- */
function segRectHit(x1, y1, x2, y2, o) {
  // slab test
  const dx = x2 - x1, dy = y2 - y1;
  let t0 = 0, t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - o.x, o.x + o.w - x1, y1 - o.y, o.y + o.h - y1];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-9) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
  }
  return true;
}

function segCircleHit(x1, y1, x2, y2, o) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((o.x - x1) * dx + (o.y - y1) * dy) / len2;
  t = clamp(t, 0, 1);
  const px = x1 + dx * t, py = y1 + dy * t;
  return dist2(px, py, o.x, o.y) < o.r * o.r;
}

function hasLineOfSight(x1, y1, x2, y2) {
  const minx = Math.min(x1, x2) - 4, maxx = Math.max(x1, x2) + 4;
  const miny = Math.min(y1, y2) - 4, maxy = Math.max(y1, y2) + 4;
  const list = queryObstacles(minx, miny, maxx, maxy);
  for (const o of list) {
    if (o.kind === 'rect') {
      if (segRectHit(x1, y1, x2, y2, o)) return false;
    } else if (o.blocksBullets) {
      if (segCircleHit(x1, y1, x2, y2, o)) return false;
    }
  }
  return true;
}

/* ---------- loot ---------- */
function addLoot(x, y, type, extra) {
  MAP.loot.push(Object.assign({ x, y, type, taken: false, bob: Math.random() * TAU }, extra || {}));
}

function randomWeaponId() {
  const r = Math.random();
  if (r < 0.3) return 'pistol';
  if (r < 0.55) return 'smg';
  if (r < 0.78) return 'ar';
  if (r < 0.92) return 'shotgun';
  return 'sniper';
}

function spawnLootAt(x, y) {
  const r = Math.random();
  if (r < 0.42) {
    addLoot(x, y, 'weapon', { weapon: randomWeaponId(), ammo: randInt(0, 30) });
  } else if (r < 0.66) {
    addLoot(x, y, 'ammo', { amount: randInt(24, 48) });
  } else if (r < 0.84) {
    addLoot(x, y, 'medkit', { amount: 1 });
  } else {
    addLoot(x, y, 'shield', { amount: 50 });
  }
}

/* ---------- map generation ---------- */
function carveWall(x, y, w, h, buildings) {
  // horizontal wall from (x,y) length w, thickness h  → with door gap(s)
  if (w > 160 && Math.random() < 0.8) {
    const doorW = 78;
    const gap = rand(x + 40, x + w - 40 - doorW);
    addRect(x, y, gap - x, h, 'wall');
    addRect(gap + doorW, y, x + w - (gap + doorW), h, 'wall');
  } else {
    addRect(x, y, w, h, 'wall');
  }
}
function carveVWall(x, y, h, w) {
  if (h > 160 && Math.random() < 0.8) {
    const doorW = 78;
    const gap = rand(y + 40, y + h - 40 - doorW);
    addRect(x, y, w, gap - y, 'wall');
    addRect(x, gap + doorW, w, y + h - (gap + doorW), 'wall');
  } else {
    addRect(x, y, w, h, 'wall');
  }
}

function generateMap() {
  MAP.obstacles.length = 0;
  MAP.rocks.length = 0;
  MAP.trees.length = 0;
  MAP.loot.length = 0;
  MAP.patches.length = 0;
  MAP.buildings.length = 0;
  MAP.roads.length = 0;

  // decorative ground patches
  for (let i = 0; i < 90; i++) {
    MAP.patches.push({
      x: rand(0, WORLD_SIZE), y: rand(0, WORLD_SIZE), r: rand(140, 460),
      c: choice(['#2f4a2b', '#365430', '#294225', '#3d5b34'])
    });
  }
  // dirt roads
  MAP.roads.push({ x: 0, y: WORLD_SIZE * 0.5 - 55, w: WORLD_SIZE, h: 110 });
  MAP.roads.push({ x: WORLD_SIZE * 0.35 - 50, y: 0, w: 100, h: WORLD_SIZE });

  const T = 20;
  let tries = 0;
  while (MAP.buildings.length < 34 && tries < 900) {
    tries++;
    const w = rand(230, 560), h = rand(210, 480);
    const x = Math.round(rand(170, WORLD_SIZE - w - 170));
    const y = Math.round(rand(170, WORLD_SIZE - h - 170));
    let ok = true;
    for (const b of MAP.buildings) {
      if (x < b.x + b.w + 140 && x + w + 140 > b.x && y < b.y + b.h + 140 && y + h + 140 > b.y) { ok = false; break; }
    }
    if (!ok) continue;

    MAP.buildings.push({ x, y, w, h });
    // outer walls
    carveWall(x, y, w, T);
    carveWall(x, y + h - T, w, T);
    carveVWall(x, y, h, T);
    carveVWall(x + w - T, y, h, T);

    // inner wall for some buildings
    if (Math.random() < 0.45 && w > 320) {
      carveVWall(x + w * 0.55, y + T, h - T * 2, T);
    }

    // interior crates
    const crates = randInt(1, 3);
    for (let i = 0; i < crates; i++) {
      const cw = rand(38, 62), ch = rand(38, 62);
      const cxp = rand(x + T + 30, x + w - T - 30 - cw);
      const cyp = rand(y + T + 30, y + h - T - 30 - ch);
      addRect(cxp, cyp, cw, ch, 'crate');
      if (Math.random() < 0.5) {
        addLoot(cxp + cw / 2, cyp + ch + 18, 'ammo', { amount: 30 });
      } else {
        addLoot(cxp + cw / 2, cyp + ch + 18, 'weapon', { weapon: randomWeaponId(), ammo: 20 });
      }
    }
    // building loot
    const n = randInt(2, 4);
    for (let i = 0; i < n; i++) {
      let lx, ly, guard = 0;
      do {
        lx = rand(x + T + 28, x + w - T - 28);
        ly = rand(y + T + 28, y + h - T - 28);
        guard++;
      } while (blockedAt(lx, ly, 14) && guard < 24);
      if (!blockedAt(lx, ly, 14)) spawnLootAt(lx, ly);
    }
  }

  // rocks
  for (let i = 0; i < 46; i++) {
    const r = rand(22, 46);
    const x = rand(120, WORLD_SIZE - 120), y = rand(120, WORLD_SIZE - 120);
    if (nearBuilding(x, y, 40)) continue;
    addRock(x, y, r);
  }
  // trees
  for (let i = 0; i < 220; i++) {
    const x = rand(90, WORLD_SIZE - 90), y = rand(90, WORLD_SIZE - 90);
    if (nearBuilding(x, y, 26)) continue;
    let ok = true;
    for (const t of MAP.trees) {
      if (dist2(t.x, t.y, x, y) < 90 * 90) { ok = false; break; }
    }
    if (!ok) continue;
    addTree(x, y, rand(24, 40));
  }
  // scattered outdoor loot
  for (let i = 0; i < 100; i++) {
    let x, y, guard = 0;
    do {
      x = rand(120, WORLD_SIZE - 120);
      y = rand(120, WORLD_SIZE - 120);
      guard++;
    } while (blockedAt(x, y, 18) && guard < 30);
    if (!blockedAt(x, y, 18)) spawnLootAt(x, y);
  }
  // extra ammo spread out so nobody runs dry
  for (let i = 0; i < 45; i++) {
    let x, y, guard = 0;
    do {
      x = rand(120, WORLD_SIZE - 120);
      y = rand(120, WORLD_SIZE - 120);
      guard++;
    } while (blockedAt(x, y, 18) && guard < 24);
    if (!blockedAt(x, y, 18)) addLoot(x, y, 'ammo', { amount: randInt(30, 54) });
  }

  buildGrid();
}

function nearBuilding(x, y, pad) {
  for (const b of MAP.buildings) {
    if (x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad) return true;
  }
  return false;
}

function findSpawn(minDistFromOthers) {
  for (let i = 0; i < 220; i++) {
    const x = rand(200, WORLD_SIZE - 200);
    const y = rand(200, WORLD_SIZE - 200);
    if (blockedAt(x, y, PLAYER_R + 12)) continue;
    let ok = true;
    if (minDistFromOthers && typeof otherSpawnPoints !== 'undefined') {
      for (const p of otherSpawnPoints) {
        if (dist2(p.x, p.y, x, y) < 260 * 260) { ok = false; break; }
      }
    }
    if (ok) return { x, y };
  }
  return { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2 };
}
