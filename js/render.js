'use strict';

/* ==========================================================================
   RENDER
   ========================================================================== */

const cam = { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2, zoom: 1, shakeX: 0, shakeY: 0 };

let grassPattern = null;
let minimapBase = null;

function makeGrassPattern(ctx) {
  const tile = document.createElement('canvas');
  tile.width = 160; tile.height = 160;
  const c = tile.getContext('2d');
  c.fillStyle = '#39532f';
  c.fillRect(0, 0, 160, 160);
  for (let i = 0; i < 900; i++) {
    const shades = ['#33502b', '#3f5c33', '#2f4826', '#456437'];
    c.fillStyle = shades[(Math.random() * shades.length) | 0];
    const s = Math.random() < 0.85 ? 2 : 4;
    c.fillRect(Math.random() * 160, Math.random() * 160, s, s);
  }
  // small tufts
  for (let i = 0; i < 40; i++) {
    c.strokeStyle = 'rgba(120,160,90,0.25)';
    c.lineWidth = 1;
    const x = Math.random() * 160, y = Math.random() * 160;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + 2, y - 4); c.stroke();
  }
  return ctx.createPattern(tile, 'repeat');
}

function buildMinimapBase() {
  const size = 220;
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  const c = cv.getContext('2d');
  c.fillStyle = '#2b4224';
  c.fillRect(0, 0, size, size);
  const k = size / WORLD_SIZE;
  // roads
  c.fillStyle = '#4a4a3a';
  for (const r of MAP.roads) c.fillRect(r.x * k, r.y * k, Math.max(1.5, r.w * k), Math.max(1.5, r.h * k));
  // buildings
  c.fillStyle = '#8d99a8';
  for (const b of MAP.buildings) c.fillRect(b.x * k, b.y * k, Math.max(1.5, b.w * k), Math.max(1.5, b.h * k));
  // trees as darker specks
  c.fillStyle = 'rgba(30,60,30,0.55)';
  for (const t of MAP.trees) c.fillRect(t.x * k - 0.5, t.y * k - 0.5, 1.6, 1.6);
  minimapBase = cv;
}

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  VIEW.w = window.innerWidth;
  VIEW.h = window.innerHeight;
  VIEW.dpr = dpr;
  // keep a roughly constant amount of world on screen
  const base = Math.min(VIEW.w, VIEW.h);
  cam.zoom = clamp(base / 760, 0.72, 1.55);
}

const VIEW = { w: window.innerWidth, h: window.innerHeight, dpr: 1 };

/* ---------- main render ---------- */
function render() {
  const st = G.storm;
  const px = G.player ? G.player.x : cam.x;
  const py = G.player ? G.player.y : cam.y;

  // camera follow
  const zoom = cam.zoom;
  cam.x = lerp(cam.x, px, 0.18);
  cam.y = lerp(cam.y, py, 0.18);
  const shake = G.shake;
  cam.shakeX = (Math.random() - 0.5) * shake;
  cam.shakeY = (Math.random() - 0.5) * shake;
  G.shake *= 0.9;
  if (G.shake < 0.2) G.shake = 0;

  ctx.save();
  ctx.clearRect(0, 0, VIEW.w, VIEW.h);
  ctx.translate(VIEW.w / 2 + cam.shakeX, VIEW.h / 2 + cam.shakeY);
  ctx.scale(zoom, zoom);
  ctx.translate(-cam.x, -cam.y);

  const halfW = VIEW.w / 2 / zoom + 80;
  const halfH = VIEW.h / 2 / zoom + 80;
  const vx0 = cam.x - halfW, vx1 = cam.x + halfW;
  const vy0 = cam.y - halfH, vy1 = cam.y + halfH;

  drawGround(vx0, vy0, vx1, vy1);
  drawLoot(vx0, vy0, vx1, vy1);
  drawObstacles(vx0, vy0, vx1, vy1);
  drawBullets(vx0, vy0, vx1, vy1);
  drawPlayers(vx0, vy0, vx1, vy1);
  drawTreeCanopies(vx0, vy0, vx1, vy1);
  drawParticles();
  drawTexts();
  drawStorm(st, vx0, vy0, vx1, vy1);

  ctx.restore();

  drawScreenFx();
  drawMinimap();
  drawCrosshair();
}

function drawGround(x0, y0, x1, y1) {
  if (!grassPattern) grassPattern = makeGrassPattern(ctx);
  ctx.fillStyle = grassPattern;
  const gx = Math.floor(x0), gy = Math.floor(y0);
  ctx.save();
  ctx.translate(gx, gy);
  ctx.fillRect(0, 0, x1 - gx, y1 - gy);
  ctx.restore();

  // darker patches
  for (const p of MAP.patches) {
    if (p.x + p.r < x0 || p.x - p.r > x1 || p.y + p.r < y0 || p.y - p.r > y1) continue;
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = p.c;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // roads
  ctx.fillStyle = 'rgba(122,110,84,0.55)';
  for (const r of MAP.roads) {
    if (r.x + r.w < x0 || r.x > x1 || r.y + r.h < y0 || r.y > y1) continue;
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }

  // building floors
  for (const b of MAP.buildings) {
    if (b.x + b.w < x0 || b.x > x1 || b.y + b.h < y0 || b.y > y1) continue;
    ctx.fillStyle = '#4a4f42';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 2;
    for (let gx2 = b.x + 60; gx2 < b.x + b.w; gx2 += 60) {
      ctx.beginPath(); ctx.moveTo(gx2, b.y); ctx.lineTo(gx2, b.y + b.h); ctx.stroke();
    }
    for (let gy2 = b.y + 60; gy2 < b.y + b.h; gy2 += 60) {
      ctx.beginPath(); ctx.moveTo(b.x, gy2); ctx.lineTo(b.x + b.w, gy2); ctx.stroke();
    }
  }
}

function drawObstacles(x0, y0, x1, y1) {
  // rocks
  for (const o of MAP.rocks) {
    if (o.x + o.r < x0 || o.x - o.r > x1 || o.y + o.r < y0 || o.y - o.r > y1) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(o.x + 5, o.y + 7, o.r, o.r * 0.75, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#6b7078';
    ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#868c95';
    ctx.beginPath(); ctx.arc(o.x - o.r * 0.2, o.y - o.r * 0.25, o.r * 0.62, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.beginPath(); ctx.arc(o.x - o.r * 0.3, o.y - o.r * 0.4, o.r * 0.3, 0, TAU); ctx.fill();
  }
  // walls & crates
  for (const o of MAP.obstacles) {
    if (o.x + o.w < x0 || o.x > x1 || o.y + o.h < y0 || o.y > y1) continue;
    if (o.type === 'crate') {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(o.x + 4, o.y + 6, o.w, o.h);
      ctx.fillStyle = '#8a6136';
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.strokeStyle = '#b5844c';
      ctx.lineWidth = 3;
      ctx.strokeRect(o.x + 2, o.y + 2, o.w - 4, o.h - 4);
      ctx.beginPath();
      ctx.moveTo(o.x + 4, o.y + 4); ctx.lineTo(o.x + o.w - 4, o.y + o.h - 4);
      ctx.moveTo(o.x + o.w - 4, o.y + 4); ctx.lineTo(o.x + 4, o.y + o.h - 4);
      ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 2; ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(o.x + 6, o.y + 8, o.w, o.h);
      ctx.fillStyle = '#3b4149';
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.fillStyle = '#4a515b';
      ctx.fillRect(o.x, o.y, o.w, Math.min(6, o.h));
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 2;
      ctx.strokeRect(o.x + 1, o.y + 1, o.w - 2, o.h - 2);
    }
  }
}

function drawTreeCanopies(x0, y0, x1, y1) {
  for (const t of MAP.trees) {
    if (t.x + t.r < x0 || t.x - t.r > x1 || t.y + t.r < y0 || t.y - t.r > y1) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(t.x + 10, t.y + 14, t.r * 1.05, t.r * 0.8, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2b5227';
    ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#356630';
    ctx.beginPath(); ctx.arc(t.x - t.r * 0.22, t.y - t.r * 0.24, t.r * 0.68, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(150,220,120,0.18)';
    ctx.beginPath(); ctx.arc(t.x - t.r * 0.3, t.y - t.r * 0.35, t.r * 0.32, 0, TAU); ctx.fill();
  }
}

function drawLoot(x0, y0, x1, y1) {
  for (const it of MAP.loot) {
    if (it.taken) continue;
    if (it.x < x0 || it.x > x1 || it.y < y0 || it.y > y1) continue;
    const bob = Math.sin(G.time * 3 + it.bob) * 2.5;
    const y = it.y + bob;
    ctx.save();
    ctx.translate(it.x, y);
    // glow base
    let col = '#ffe08a', label = 'A';
    if (it.type === 'weapon' && WEAPONS[it.weapon]) { col = TIER_COLOR[WEAPONS[it.weapon].tier]; label = 'W'; }
    else if (it.type === 'medkit') { col = '#7dffb0'; label = '+'; }
    else if (it.type === 'shield') { col = '#8fd0ff'; label = 'S'; }
    ctx.shadowColor = col;
    ctx.shadowBlur = 14;
    ctx.fillStyle = 'rgba(10,16,24,0.75)';
    ctx.beginPath();
    ctx.roundRect(-11, -11, 22, 22, 5);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = col;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 1);
    ctx.restore();
  }
}

function drawPlayers(x0, y0, x1, y1) {
  const t = G.time;
  for (const p of G.players) {
    if (!p.alive) continue;
    if (p.x < x0 - 40 || p.x > x1 + 40 || p.y < y0 - 40 || p.y > y1 + 40) continue;
    const isMe = p === G.player;
    const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    const bob = Math.sin(t * 12 + p.walkPhase) * (speed > 30 ? 1.8 : 0);

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath();
    ctx.ellipse(p.x + 3, p.y + 8, PLAYER_R * 0.95, PLAYER_R * 0.6, 0, 0, TAU);
    ctx.fill();

    // body
    const bodyCol = isMe ? '#39d3ff' : '#e0554f';
    const bodyDark = isMe ? '#147a99' : '#8c2b28';
    ctx.save();
    ctx.translate(p.x, p.y + bob);
    ctx.rotate(p.angle);

    // gun
    if (p.weapon) {
      const w = WEAPONS[p.weapon];
      const gl = PLAYER_R + w.len - p.kick * 2;
      ctx.fillStyle = '#20262e';
      ctx.fillRect(PLAYER_R * 0.2, -3.2, gl, 6.4);
      ctx.fillStyle = '#39424e';
      ctx.fillRect(PLAYER_R * 0.2, -3.2, gl * 0.55, 2.4);
      // muzzle flash
      if (t - p.lastShot < 0.06) {
        ctx.fillStyle = 'rgba(255,214,120,0.95)';
        ctx.beginPath();
        ctx.arc(gl + 4, 0, 7 + Math.random() * 4, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.beginPath(); ctx.arc(gl + 4, 0, 3, 0, TAU); ctx.fill();
      }
    }

    // torso
    ctx.beginPath();
    ctx.arc(0, 0, PLAYER_R, 0, TAU);
    ctx.fillStyle = bodyCol;
    ctx.fill();
    ctx.lineWidth = isMe ? 3 : 2.4;
    ctx.strokeStyle = isMe ? '#ffffff' : bodyDark;
    ctx.stroke();
    // vest highlight
    ctx.beginPath();
    ctx.arc(-2, -2, PLAYER_R * 0.55, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fill();
    // facing marker (shoulders)
    ctx.fillStyle = isMe ? '#0a3a48' : '#5a1a18';
    ctx.beginPath();
    ctx.arc(PLAYER_R * 0.55, 0, PLAYER_R * 0.42, 0, TAU);
    ctx.fill();
    ctx.restore();

    // reload ring
    if (p.reloading > 0 && p.weapon) {
      const total = WEAPONS[p.weapon].reload;
      const k = 1 - p.reloading / total;
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y - PLAYER_R - 12, 9, -Math.PI / 2, -Math.PI / 2 + k * TAU);
      ctx.stroke();
    }

    // health / shield bar over other players
    if (!isMe) {
      const pct = clamp(p.hp / 100, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(p.x - 22, p.y - PLAYER_R - 16, 44, 5);
      ctx.fillStyle = pct > 0.5 ? '#5ee08a' : pct > 0.25 ? '#ffd166' : '#ff5d5d';
      ctx.fillRect(p.x - 22, p.y - PLAYER_R - 16, 44 * pct, 5);
      if (p.shield > 0) {
        ctx.fillStyle = '#8fd0ff';
        ctx.fillRect(p.x - 22, p.y - PLAYER_R - 21, 44 * clamp(p.shield / 100, 0, 1), 3.5);
      }
      // name
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillText(p.name, p.x, p.y - PLAYER_R - 26);
    }
  }
}

function drawBullets(x0, y0, x1, y1) {
  ctx.lineCap = 'round';
  for (const b of G.bullets) {
    if (b.x < x0 || b.x > x1 || b.y < y0 || b.y > y1) continue;
    const tx = b.x - b.vx * 0.012, ty = b.y - b.vy * 0.012;
    ctx.strokeStyle = b.color;
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = b.width;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawParticles() {
  for (const p of G.parts) {
    const a = clamp(p.life / p.max, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    if (p.glow) { ctx.shadowColor = p.color; ctx.shadowBlur = 10; }
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * a + 0.5, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
}

function drawTexts() {
  ctx.textAlign = 'center';
  for (const t of G.texts) {
    const a = clamp(t.life / (t.big ? 1.4 : 0.85), 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.font = (t.big ? 'bold 22px' : 'bold 16px') + ' system-ui, sans-serif';
    ctx.fillText(t.text, t.x + 2, t.y + 2);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
}

function drawStorm(s, x0, y0, x1, y1) {
  if (!s) return;
  const t = G.time;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0 - 200, y0 - 200, (x1 - x0) + 400, (y1 - y0) + 400);
  ctx.arc(s.cx, s.cy, s.r, 0, TAU, true);
  const grad = ctx.createRadialGradient(s.cx, s.cy, s.r * 0.9, s.cx, s.cy, s.r * 1.25 + 400);
  grad.addColorStop(0, 'rgba(150,60,220,0.42)');
  grad.addColorStop(0.4, 'rgba(96,30,160,0.5)');
  grad.addColorStop(1, 'rgba(60,10,110,0.62)');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();

  // storm edge
  ctx.save();
  ctx.strokeStyle = 'rgba(206,140,255,0.85)';
  ctx.lineWidth = 6;
  ctx.shadowColor = '#b06bff';
  ctx.shadowBlur = 26;
  ctx.beginPath();
  ctx.arc(s.cx, s.cy, s.r, 0, TAU);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 2;
  ctx.setLineDash([18, 22]);
  ctx.lineDashOffset = -t * 60;
  ctx.beginPath();
  ctx.arc(s.cx, s.cy, s.r - 5, 0, TAU);
  ctx.stroke();
  ctx.restore();

  // next circle preview
  if ((s.state === 'wait' || s.state === 'shrink') && s.nextR) {
    ctx.save();
    ctx.setLineDash([12, 14]);
    ctx.lineDashOffset = t * 30;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(s.nextX, s.nextY, s.nextR, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}

/* ---------- screen space fx ---------- */
function drawScreenFx() {
  // vignette
  const g = ctx.createRadialGradient(VIEW.w / 2, VIEW.h / 2, Math.min(VIEW.w, VIEW.h) * 0.35,
    VIEW.w / 2, VIEW.h / 2, Math.max(VIEW.w, VIEW.h) * 0.78);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, VIEW.w, VIEW.h);

  // damage flash
  if (G.hitFlash > 0) {
    const a = G.hitFlash * 0.4;
    const rg = ctx.createRadialGradient(VIEW.w / 2, VIEW.h / 2, Math.min(VIEW.w, VIEW.h) * 0.2,
      VIEW.w / 2, VIEW.h / 2, Math.max(VIEW.w, VIEW.h) * 0.7);
    rg.addColorStop(0, 'rgba(255,0,40,0)');
    rg.addColorStop(1, 'rgba(255,0,40,' + a.toFixed(3) + ')');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, VIEW.w, VIEW.h);
  }

  // damage direction indicators
  for (const d of G.hitDirs) {
    const a = clamp(d.life, 0, 1);
    ctx.save();
    ctx.translate(VIEW.w / 2, VIEW.h / 2);
    ctx.rotate(d.a);
    ctx.globalAlpha = a * 0.8;
    ctx.fillStyle = '#ff4d6d';
    ctx.beginPath();
    const r = Math.min(VIEW.w, VIEW.h) * 0.28;
    ctx.moveTo(r, 0);
    ctx.lineTo(r - 26, -16);
    ctx.lineTo(r - 26, 16);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawMinimap() {
  const size = Math.round(clamp(Math.min(VIEW.w, VIEW.h) * 0.26, 120, 190));
  const pad = 14;
  const x = VIEW.w - size - pad;
  const y = pad + 46;
  if (!minimapBase) return;
  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = 'rgba(8,12,18,0.75)';
  ctx.beginPath();
  ctx.roundRect(x - 4, y - 4, size + 8, size + 8, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.drawImage(minimapBase, x, y, size, size);
  const k = size / WORLD_SIZE;
  const s = G.storm;
  if (s) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, size, size);
    ctx.clip();
    // storm outside
    ctx.beginPath();
    ctx.rect(x, y, size, size);
    ctx.arc(x + s.cx * k, y + s.cy * k, s.r * k, 0, TAU, true);
    ctx.fillStyle = 'rgba(150,60,220,0.4)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + s.cx * k, y + s.cy * k, s.r * k, 0, TAU);
    ctx.strokeStyle = 'rgba(210,150,255,0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();
    if (s.nextR) {
      ctx.beginPath();
      ctx.arc(x + s.nextX * k, y + s.nextY * k, s.nextR * k, 0, TAU);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }
  // player
  if (G.player && G.player.alive) {
    ctx.save();
    ctx.translate(x + G.player.x * k, y + G.player.y * k);
    ctx.rotate(G.player.angle);
    ctx.fillStyle = '#39d3ff';
    ctx.beginPath();
    ctx.moveTo(6, 0); ctx.lineTo(-4, 4); ctx.lineTo(-4, -4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function drawCrosshair() {
  if (!G.player || !G.player.alive || G.running === false) return;
  const mx = G.player.isBot ? 0 : (input.mx || VIEW.w / 2);
  const my = G.player.isBot ? 0 : (input.my || VIEW.h / 2);
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  const gap = 5, len = 8;
  ctx.beginPath();
  ctx.moveTo(mx - gap - len, my); ctx.lineTo(mx - gap, my);
  ctx.moveTo(mx + gap, my); ctx.lineTo(mx + gap + len, my);
  ctx.moveTo(mx, my - gap - len); ctx.lineTo(mx, my - gap);
  ctx.moveTo(mx, my + gap); ctx.lineTo(mx, my + gap + len);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath(); ctx.arc(mx, my, 1.6, 0, TAU); ctx.fill();
  ctx.restore();
}
