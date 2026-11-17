'use strict';

/* ==========================================================================
   ENTITIES — players, bots, bullets, storm
   ========================================================================== */

const G = {
  players: [],
  bullets: [],
  parts: [],
  texts: [],
  feed: [],
  storm: null,
  player: null,
  alive: 0,
  time: 0,
  running: false,
  over: false,
  placement: 0,
  kills: 0,
  shake: 0,
  hitFlash: 0,
  hitDirs: [],
  paused: false,
  matchTime: 0
};

/* ---------- creation ---------- */
function makePlayer(x, y, isBot, name) {
  return {
    x, y, vx: 0, vy: 0, angle: rand(0, TAU),
    hp: 100, shield: 0, alive: true, isBot, name,
    weapon: null, mag: 0, ammo: 0, reloading: 0, fireCd: 0,
    medkits: isBot ? randInt(0, 1) : 2, pots: isBot ? randInt(0, 1) : 1,
    kills: 0, damageDealt: 0, hitFlash: 0, kick: 0,
    walkPhase: rand(0, TAU), sprinting: false, lastShot: -99,
    // bot brain
    skill: rand(0.35, 0.95), vision: 470, think: rand(0, 0.2),
    lootPhase: rand(28, 46), burstT: 0, burstAmmo: randInt(3, 6),
    moveAngle: rand(0, TAU), moveSpeed: 0, strafeDir: Math.random() < 0.5 ? -1 : 1,
    strafeT: 0, target: null, targetMemory: 0, react: 0, lastX: x, lastY: y,
    stuckT: 0, lootTarget: null, healCd: 0, aggro: Math.random(),
    bobT: rand(0, 10), team: 0
  };
}

function giveWeapon(p, id, ammo) {
  p.weapon = id;
  p.mag = WEAPONS[id].mag;
  p.ammo = Math.max(p.ammo || 0, ammo == null ? 30 : ammo);
  p.reloading = 0;
  p.fireCd = 0.25;
}

/* ---------- storm ---------- */
function initStorm() {
  const cx = WORLD_SIZE / 2 + rand(-250, 250);
  const cy = WORLD_SIZE / 2 + rand(-250, 250);
  G.storm = {
    cx, cy, r: WORLD_SIZE * 0.8,
    sx: cx, sy: cy, sr: WORLD_SIZE * 0.8,
    tx: cx, ty: cy, tr: WORLD_SIZE * 0.8,
    phase: -1, timer: PHASES[0].wait + 6, state: 'wait', dps: 0, t: 0
  };
  nextPhase();
}

function nextPhase() {
  const s = G.storm;
  s.phase++;
  if (s.phase >= PHASES.length) {
    s.state = 'done';
    return;
  }
  const ph = PHASES[s.phase];
  s.state = 'wait';
  s.timer = s.phase === 0 ? PHASES[0].wait + 5 : ph.wait;
  s.dps = ph.dps;
  s.nextR = WORLD_SIZE * ph.r;
  // pick a new center inside the current circle so the next one fits
  const maxOff = Math.max(0, s.r - s.nextR) * 0.85;
  const a = rand(0, TAU), off = Math.sqrt(Math.random()) * maxOff;
  s.nextX = clamp(s.cx + Math.cos(a) * off, s.nextR, WORLD_SIZE - s.nextR);
  s.nextY = clamp(s.cy + Math.sin(a) * off, s.nextR, WORLD_SIZE - s.nextR);
  s.nextR = Math.min(s.nextR, Math.min(WORLD_SIZE / 2 - 30, WORLD_SIZE / 2 - 30));
}

function updateStorm(dt) {
  const s = G.storm;
  if (!s) return;
  s.t += dt;
  if (s.state === 'wait') {
    s.timer -= dt;
    if (s.timer <= 0) {
      s.state = 'shrink';
      s.timer = PHASES[Math.min(s.phase, PHASES.length - 1)].shrink;
      s.shrinkDuration = s.timer;
      s.sr = s.r; s.sx = s.cx; s.sy = s.cy;
    }
  } else if (s.state === 'shrink') {
    s.timer -= dt;
    const k = 1 - clamp(s.timer / s.shrinkDuration, 0, 1);
    const e = k * k * (3 - 2 * k);
    s.r = lerp(s.sr, s.nextR, e);
    s.cx = lerp(s.sx, s.nextX, e);
    s.cy = lerp(s.sy, s.nextY, e);
    if (s.timer <= 0) {
      s.r = s.nextR; s.cx = s.nextX; s.cy = s.nextY;
      nextPhase();
    }
  }
}

/* ---------- particles / text ---------- */
function addPart(x, y, vx, vy, life, size, color, glow) {
  if (G.parts.length > 700) G.parts.shift();
  G.parts.push({ x, y, vx, vy, life, max: life, size, color, glow: !!glow });
}
function burst(x, y, n, color, speed, life, size) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), sp = rand(speed * 0.3, speed);
    addPart(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(life * 0.5, life), rand(size * 0.6, size), color, false);
  }
}
function addText(x, y, text, color, big) {
  if (G.texts.length > 40) G.texts.shift();
  G.texts.push({ x, y, text, color, life: big ? 1.4 : 0.85, vy: -46, big: !!big });
}
function addFeed(text, color) {
  G.feed.unshift({ text, color: color || '#e6eef8', life: 6 });
  if (G.feed.length > 5) G.feed.pop();
}

/* ---------- shooting ---------- */
function startReload(p) {
  if (!p.weapon || p.reloading > 0) return;
  const w = WEAPONS[p.weapon];
  if (p.mag >= w.mag || p.ammo <= 0) return;
  p.reloading = w.reload;
  if (p === G.player && typeof sfx === 'function') sfx('reload', p.x, p.y);
}

function finishReload(p) {
  const w = WEAPONS[p.weapon];
  const need = w.mag - p.mag;
  const take = Math.min(need, p.ammo);
  p.mag += take;
  p.ammo -= take;
}

function tryFire(p, angle) {
  if (!p.weapon || p.reloading > 0 || p.fireCd > 0) return false;
  const w = WEAPONS[p.weapon];
  if (p.mag <= 0) {
    if (p.ammo > 0) startReload(p);
    return false;
  }
  p.mag--;
  p.fireCd = 60 / w.rpm;
  const spreadMul = p.isBot ? (1.25 + (1 - p.skill) * 1.6) : 1;
  const mx = p.x + Math.cos(angle) * (PLAYER_R + 6);
  const my = p.y + Math.sin(angle) * (PLAYER_R + 6);
  for (let i = 0; i < w.pellets; i++) {
    const a = angle + (Math.random() - 0.5) * 2 * w.spread * spreadMul;
    spawnBullet(mx, my, a, w, p);
  }
  // muzzle flash
  for (let i = 0; i < 4; i++) {
    const a = angle + rand(-0.35, 0.35);
    addPart(mx, my, Math.cos(a) * rand(60, 260), Math.sin(a) * rand(60, 260), rand(0.08, 0.2), rand(2, 5), '#ffd27a', true);
  }
  p.kick = w.kick;
  p.lastShot = G.time;
  if (typeof sfx === 'function') sfx(w.sound, p.x, p.y, p === G.player ? 1 : 0.75);
  if (p.mag <= 0) startReload(p);
  return true;
}

function spawnBullet(x, y, angle, w, owner) {
  if (G.bullets.length >= BULLET_CAP) return;
  const speed = w.speed * rand(0.97, 1.03);
  G.bullets.push({
    x, y, px: x, py: y,
    vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
    dmg: w.dmg, owner, life: w.range / speed, travelled: 0,
    range: w.range, color: w.id === 'sniper' ? '#a6e1ff' : '#ffe08a',
    width: w.id === 'sniper' ? 2.6 : 1.8, big: w.id === 'sniper' || w.id === 'shotgun'
  });
}

/* ---------- damage ---------- */
function damagePlayer(p, dmg, source, sx, sy) {
  if (!p.alive || dmg <= 0) return;
  let left = dmg;
  if (p.shield > 0) {
    const absorb = Math.min(p.shield, left);
    p.shield -= absorb;
    left -= absorb;
  }
  p.hp -= left;
  p.hitFlash = 0.18;
  if (source && source !== p) {
    source.damageDealt = (source.damageDealt || 0) + dmg;
    if (p === G.player) addText(p.x, p.y - 34, '-' + Math.round(dmg), '#ff6b6b');
    if (source === G.player) {
      addText(p.x, p.y - 30, Math.round(dmg), p.shield > 0 ? '#8fd0ff' : '#ffe3a0');
    }
  }
  if (p === G.player) {
    if (typeof sfx === 'function') sfx('hurt', p.x, p.y, 0.9);
    G.shake = Math.min(16, G.shake + Math.min(9, dmg * 0.45));
    G.hitFlash = 0.55;
    if (sx != null) G.hitDirs.push({ a: Math.atan2(sy - p.y, sx - p.x), life: 1.1 });
  }
  burst(p.x, p.y, 3, '#c8324a', 130, 0.35, 3);
  if (p.hp <= 0) killPlayer(p, source);
}

function killPlayer(p, source) {
  if (!p.alive) return;
  p.alive = false;
  p.hp = 0;
  burst(p.x, p.y, 16, '#c8324a', 220, 0.7, 4);
  burst(p.x, p.y, 8, '#ffffff', 150, 0.4, 3);
  // drop loot
  if (p.weapon) addLoot(p.x + rand(-16, 16), p.y + rand(-16, 16), 'weapon', { weapon: p.weapon, ammo: p.ammo });
  if (Math.random() < 0.7) addLoot(p.x + rand(-22, 22), p.y + rand(-22, 22), 'ammo', { amount: randInt(24, 48) });
  if (p.medkits > 0 && Math.random() < 0.6) addLoot(p.x + rand(-22, 22), p.y + rand(-22, 22), 'medkit', { amount: 1 });
  if (p.pots > 0 && Math.random() < 0.5) addLoot(p.x + rand(-22, 22), p.y + rand(-22, 22), 'shield', { amount: 50 });

  if (source && source !== p) {
    source.kills++;
    if (source === G.player) {
      G.kills++;
      addText(p.x, p.y - 50, 'ΕΞΟΥΔΕΤΕΡΩΣΗ', '#ffd166', true);
      addFeed('Εσύ εξουδετέρωσες ' + p.name, '#7dffb0');
      G.shake = 8;
      if (typeof sfx === 'function') sfx('kill', p.x, p.y);
    } else {
      addFeed(source.name + ' ➤ ' + p.name, '#ff9f9f');
    }
  } else {
    addFeed(p.name + ' σκοτώθηκε από την καταιγίδα', '#b9a0ff');
  }
  if (typeof onPlayerDeath === 'function') onPlayerDeath(p, source);
  G.alive = G.players.filter(q => q.alive).length;
  if (typeof checkWin === 'function') checkWin();
}

/* ---------- health items ---------- */
function useMedkit(p) {
  if (p.medkits <= 0 || p.hp >= 100) return false;
  p.medkits--;
  p.hp = Math.min(100, p.hp + 45);
  if (p === G.player) { addText(p.x, p.y - 34, '+45', '#7dffb0'); if (typeof sfx === 'function') sfx('heal', p.x, p.y); }
  burst(p.x, p.y, 8, '#7dffb0', 90, 0.5, 3);
  return true;
}
function usePotion(p) {
  if (p.pots <= 0 || p.shield >= 100) return false;
  p.pots--;
  p.shield = Math.min(100, p.shield + 50);
  if (p === G.player) { addText(p.x, p.y - 34, '+50', '#8fd0ff'); if (typeof sfx === 'function') sfx('heal', p.x, p.y); }
  burst(p.x, p.y, 8, '#8fd0ff', 90, 0.5, 3);
  return true;
}

/* ---------- loot pickup ---------- */
function weaponValue(id) {
  const order = { pistol: 1, smg: 2, ar: 3, shotgun: 3, sniper: 4 };
  const w = WEAPONS[id];
  return order[id] + (w.dmg * w.pellets * w.rpm) / 40000;
}

function tryPickup(p, item) {
  if (item.taken) return false;
  if (item.type === 'ammo') {
    if (p.ammo > 220) return false;
    p.ammo += item.amount;
    item.taken = true;
    if (p === G.player) {
      addText(p.x, p.y - 34, '+' + item.amount + ' σφ.', '#ffe08a');
      if (typeof sfx === 'function') sfx('pickup', p.x, p.y);
    }
    return true;
  }
  if (item.type === 'medkit') {
    if (p.medkits >= 3) return false;
    p.medkits++;
    item.taken = true;
    if (p === G.player) {
      addText(p.x, p.y - 34, 'ΒΟΗΘ. ΥΓΕΙΑΣ', '#7dffb0');
      if (typeof sfx === 'function') sfx('pickup', p.x, p.y);
    }
    return true;
  }
  if (item.type === 'shield') {
    if (p.pots >= 3) return false;
    p.pots++;
    item.taken = true;
    if (p === G.player) {
      addText(p.x, p.y - 34, 'ΑΣΠΙΔΑ +50', '#8fd0ff');
      if (typeof sfx === 'function') sfx('pickup', p.x, p.y);
    }
    return true;
  }
  return false;
}

function pickupWeapon(p, item) {
  if (item.taken || item.type !== 'weapon') return false;
  const prev = p.weapon;
  const prevAmmo = p.ammo;
  giveWeapon(p, item.weapon, item.ammo || 0);
  p.ammo = Math.max(p.ammo, prevAmmo);
  item.taken = true;
  if (prev) {
    addLoot(p.x + rand(-24, 24), p.y + rand(-24, 24), 'weapon', { weapon: prev, ammo: 0 });
  }
  if (p === G.player) {
    addText(p.x, p.y - 34, WEAPONS[item.weapon].name, TIER_COLOR[WEAPONS[item.weapon].tier]);
    if (typeof sfx === 'function') sfx('pickup', p.x, p.y);
  }
  return true;
}

/* ---------- bullet update ---------- */
function updateBullets(dt) {
  const players = G.players;
  for (let i = G.bullets.length - 1; i >= 0; i--) {
    const b = G.bullets[i];
    b.life -= dt;
    if (b.life <= 0) { G.bullets.splice(i, 1); continue; }
    b.px = b.x; b.py = b.y;
    let steps = 1;
    const moveX = b.vx * dt, moveY = b.vy * dt;
    const moveLen = Math.sqrt(moveX * moveX + moveY * moveY);
    steps = Math.max(1, Math.ceil(moveLen / 18));
    const sdt = dt / steps;
    let hit = false;

    for (let s = 0; s < steps && !hit; s++) {
      const nx = b.x + b.vx * sdt;
      const ny = b.y + b.vy * sdt;

      // players
      for (let j = 0; j < players.length; j++) {
        const p = players[j];
        if (!p.alive || p === b.owner) continue;
        if (Math.abs(p.x - nx) > 46 || Math.abs(p.y - ny) > 46) continue;
        const r = PLAYER_R + 2;
        if (dist2(nx, ny, p.x, p.y) < r * r) {
          const hitAngle = Math.atan2(b.vy, b.vx);
          const dmgMul = (b.owner && b.owner.isBot && !p.isBot) ? 0.78 : 1;
          damagePlayer(p, b.dmg * dmgMul, b.owner, b.x, b.y);
          if (b.owner) addPart(nx, ny, Math.cos(hitAngle) * 40, Math.sin(hitAngle) * 40, 0.3, 3, '#ff5d73', true);
          hit = true;
          break;
        }
      }
      if (hit) { b.x = nx; b.y = ny; break; }

      // world geometry (only every other step for speed)
      if (s % 2 === 0 || steps < 4) {
        const obs = queryObstacles(nx - 4, ny - 4, nx + 4, ny + 4);
        for (const o of obs) {
          if (!o.blocksBullets) continue;
          let blocked = false;
          if (o.kind === 'rect') blocked = nx > o.x && nx < o.x + o.w && ny > o.y && ny < o.y + o.h;
          else blocked = dist2(nx, ny, o.x, o.y) < o.r * o.r;
          if (blocked) {
            burst(nx, ny, 3, o.type === 'tree' ? '#6b8f4e' : '#cfd6df', 90, 0.28, 2.4);
            hit = true;
            break;
          }
        }
      }
      b.x = nx; b.y = ny;
      if (hit) break;
    }

    if (hit) {
      if (b.big) burst(b.x, b.y, 4, '#ffcf7a', 120, 0.3, 2);
      G.bullets.splice(i, 1);
    }
  }
}

/* ---------- movement ---------- */
function moveEntity(p, dt) {
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  resolveCollision(p, PLAYER_R);
}

function botSteer(b, tx, ty, speed, dt) {
  let a = Math.atan2(ty - b.y, tx - b.x);
  const probe = 52;
  if (blockedAt(b.x + Math.cos(a) * probe, b.y + Math.sin(a) * probe, PLAYER_R + 2)) {
    let best = null;
    for (let i = 1; i <= 7; i++) {
      for (const s of [1, -1]) {
        const na = a + s * i * 0.32;
        if (!blockedAt(b.x + Math.cos(na) * probe, b.y + Math.sin(na) * probe, PLAYER_R + 2)) {
          best = na;
          break;
        }
      }
      if (best !== null) break;
    }
    if (best === null) a += Math.PI;
    else a = best;
  }
  b.moveAngle = a;
  b.moveSpeed = speed;
}

/* ---------- bot brain ---------- */
function updateBot(b, dt) {
  const w = b.weapon ? WEAPONS[b.weapon] : null;
  b.think -= dt;
  b.healCd -= dt;
  if (b.lootPhase > 0) b.lootPhase -= dt;
  b.strafeT -= dt;
  if (b.strafeT <= 0) { b.strafeDir = Math.random() < 0.5 ? -1 : 1; b.strafeT = rand(0.6, 1.8); }

  const storm = G.storm;
  const stormDist = storm ? dist(b.x, b.y, storm.cx, storm.cy) : 0;
  const outside = storm && stormDist > storm.r - 40;
  const danger = storm && (stormDist > storm.r - 110 && (storm.state === 'shrink' || storm.timer < 6));

  if (b.think <= 0) {
    b.think = rand(0.1, 0.22);
    // ---- perception
    const effSkill = b.skill * (0.3 + 0.7 * clamp(G.time / 110, 0, 1));
    const vision = b.lootPhase > 0 ? 205 : b.vision;
    let best = null, bestD = Infinity;
    for (const p of G.players) {
      if (!p.alive || p === b) continue;
      const d = dist(b.x, b.y, p.x, p.y);
      if (d > vision || d > bestD) continue;
      if (!hasLineOfSight(b.x, b.y, p.x, p.y)) continue;
      best = p; bestD = d;
    }
    b.effSkill = effSkill;
    if (best) {
      if (!b.target || b.target !== best) {
        b.react = rand(0.18, 0.55) * (1.6 - effSkill) * (1 + bestD / 620);
      }
      b.target = best;
      b.targetMemory = 2.2;
    } else {
      b.targetMemory -= 0.22;
      if (b.targetMemory <= 0) { b.target = null; }
    }

    // ---- loot search when unarmed or low
    const closeTarget = b.target && b.target.alive && dist(b.x, b.y, b.target.x, b.target.y) < 470;
    const needLoot = !w || (b.ammo + b.mag) < 12 || (b.hp < 55 && b.medkits === 0) ||
      (b.shield < 30 && b.pots < 1) || weaponValue(b.weapon) < 3.5 || b.lootPhase > 0;
    if (needLoot && !outside) {
      let bestItem = null, bd = closeTarget ? 190 : 520;
      for (const it of MAP.loot) {
        if (it.taken) continue;
        const d = dist(b.x, b.y, it.x, it.y);
        if (d >= bd) continue;
        if (it.type === 'weapon' && (!w || weaponValue(it.weapon) > weaponValue(b.weapon) + 0.3)) { bestItem = it; bd = d; }
        else if (it.type === 'ammo' && b.ammo < 60) { bestItem = it; bd = d; }
        else if (it.type === 'medkit' && b.medkits < 1 && b.hp < 80) { bestItem = it; bd = d; }
        else if (it.type === 'shield' && b.pots < 1 && b.shield < 40) { bestItem = it; bd = d; }
      }
      b.lootTarget = bestItem;
    } else if (!needLoot) {
      b.lootTarget = null;
    }

    // ---- decide movement
    if (!b.target) b.react = 0;
    const shouldHeal = !b.target && b.hp < 62 && (b.medkits > 0) && b.healCd <= 0;
    if (shouldHeal) { useMedkit(b); b.healCd = 2.4; }
    if (!b.target && b.shield < 40 && b.pots > 0 && b.healCd <= 0) { usePotion(b); b.healCd = 2.4; }

    if (outside || (danger && (!b.target || Math.random() < 0.6))) {
      // run to the safe zone
      const a = Math.atan2(storm.cy - b.y, storm.cx - b.x);
      const rr = Math.max(60, storm.r * 0.45);
      botSteer(b, storm.cx + Math.cos(a + rand(-0.6, 0.6)) * rr, storm.cy + Math.sin(a + rand(-0.6, 0.6)) * rr, 1, dt);
      b.sprinting = true;
    } else if (b.lootTarget && !b.lootTarget.taken && !closeTarget) {
      botSteer(b, b.lootTarget.x, b.lootTarget.y, 0.98, dt);
      b.sprinting = false;
    } else if (b.target && b.target.alive) {
      const t = b.target;
      const d = dist(b.x, b.y, t.x, t.y);
      const desired = w ? (w.id === 'shotgun' ? 210 : w.id === 'sniper' ? 620 : 330) : 120;
      const ang = Math.atan2(t.y - b.y, t.x - b.x);
      if (d > desired + 70 || !w) {
        botSteer(b, t.x, t.y, 1, dt);
      } else if (d < desired - 90) {
        botSteer(b, b.x - Math.cos(ang) * 160, b.y - Math.sin(ang) * 160, 0.85, dt);
      } else {
        // strafe around target
        const sa = ang + Math.PI / 2 * b.strafeDir;
        botSteer(b, b.x + Math.cos(sa) * 200, b.y + Math.sin(sa) * 200, 0.8, dt);
      }
      b.sprinting = false;
    } else {
      // roam locally (do not stampede to the middle)
      if (!b.wander || dist2(b.x, b.y, b.wander.x, b.wander.y) < 150 * 150) {
        let wp = null;
        for (let tries = 0; tries < 10; tries++) {
          const a = rand(0, TAU), rr = rand(220, 700);
          const wx = clamp(b.x + Math.cos(a) * rr, 140, WORLD_SIZE - 140);
          const wy = clamp(b.y + Math.sin(a) * rr, 140, WORLD_SIZE - 140);
          if (dist(wx, wy, storm.cx, storm.cy) < storm.r - 80 && !blockedAt(wx, wy, PLAYER_R + 8)) { wp = { x: wx, y: wy }; break; }
        }
        b.wander = wp || { x: storm.cx + rand(-storm.r * 0.4, storm.r * 0.4), y: storm.cy + rand(-storm.r * 0.4, storm.r * 0.4) };
      }
      botSteer(b, b.wander.x, b.wander.y, 0.72, dt);
      b.sprinting = false;
    }

    // ---- stuck check
    if (dist2(b.x, b.y, b.lastX, b.lastY) < 400 && b.moveSpeed > 0.4) {
      b.stuckT += 0.18;
      if (b.stuckT > 0.7) {
        b.moveAngle += rand(1.3, 2.6);
        b.wander = null;
        b.stuckT = 0;
      }
    } else {
      b.stuckT = 0;
    }
    b.lastX = b.x; b.lastY = b.y;

    // ---- pickups nearby
    for (const it of MAP.loot) {
      if (it.taken) continue;
      if (dist2(b.x, b.y, it.x, it.y) > 44 * 44) continue;
      if (it.type === 'weapon') {
        if (!b.weapon || weaponValue(it.weapon) > weaponValue(b.weapon) + 0.3) pickupWeapon(b, it);
      } else tryPickup(b, it);
    }
  }

  // ---- aiming & shooting every frame
  if (b.target && b.target.alive) {
    const t = b.target;
    if (w) {
      const d = dist(b.x, b.y, t.x, t.y);
      const lead = d / w.speed;
      const leadQ = 0.35 + 0.55 * (b.effSkill || b.skill);
      const predX = t.x + t.vx * lead * leadQ;
      const predY = t.y + t.vy * lead * leadQ;
      const aimA = Math.atan2(predY - b.y, predX - b.x);
      const err = (1 - (b.effSkill || b.skill)) * 0.18;
      const wobble = Math.sin(G.time * 2.4 + b.bobT) * err * 0.6;
      b.angle = angLerp(b.angle, aimA + wobble, 1 - Math.exp(-dt * 7));
      b.react -= dt;
      b.burstT -= dt;
      const effRange = w.range * (0.55 + 0.3 * (b.effSkill || b.skill));
      if (b.react <= 0 && b.burstT <= 0 && d < effRange && Math.abs(angleDiff(b.angle, aimA)) < 0.2) {
        if (tryFire(b, b.angle)) {
          b.burstAmmo--;
          if (b.burstAmmo <= 0) { b.burstT = rand(0.35, 1.15); b.burstAmmo = randInt(3, 7); }
        }
      }
    }
  } else if (b.moveSpeed > 0.2) {
    b.angle = angLerp(b.angle, b.moveAngle, 1 - Math.exp(-dt * 4));
  }

  // ---- velocity
  const baseSpeed = 200 + (b.effSkill || b.skill) * 40;
  const sp = b.moveSpeed * baseSpeed * (b.sprinting ? 1.35 : 1);
  b.vx = Math.cos(b.moveAngle) * sp;
  b.vy = Math.sin(b.moveAngle) * sp;
}

/* ---------- cooldowns ---------- */
function updateTimers(p, dt) {
  p.fireCd = Math.max(0, p.fireCd - dt);
  p.kick = Math.max(0, p.kick - dt * 14);
  p.hitFlash = Math.max(0, p.hitFlash - dt * 4);
  if (p.reloading > 0) {
    p.reloading -= dt;
    if (p.reloading <= 0) { p.reloading = 0; finishReload(p); }
  }
}

/* ---------- storm damage ---------- */
function applyStormDamage(dt) {
  const s = G.storm;
  if (!s) return;
  for (const p of G.players) {
    if (!p.alive) continue;
    if (dist(p.x, p.y, s.cx, s.cy) > s.r) {
      const dmg = s.dps * dt * (p.isBot ? 1.15 : 1);
      p.shield = Math.max(0, p.shield - dmg);
      p.hp -= Math.max(0, dmg - 0.0001);
      if (p === G.player) {
        G.hitFlash = Math.min(G.hitFlash + dt * 1.5, 0.35);
        if (Math.random() < dt * 2) addPart(p.x + rand(-14, 14), p.y + rand(-14, 14), 0, -20, 0.5, 5, '#b06bff', true);
      }
      if (p.hp <= 0) killPlayer(p, null);
    }
  }
  // friendly reminder for the HUD
}
