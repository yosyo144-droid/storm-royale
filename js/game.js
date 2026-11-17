'use strict';

/* ==========================================================================
   GAME — state machine, input, HUD, loop
   ========================================================================== */

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const input = {
  mx: window.innerWidth / 2,
  my: window.innerHeight / 2,
  down: false,
  firePressed: false,
  keys: {},
  isTouch: window.matchMedia('(pointer: coarse)').matches,
  moveJoy: { id: null, ox: 0, oy: 0, dx: 0, dy: 0 },
  aimJoy: { id: null, ox: 0, oy: 0, dx: 0, dy: 0 }
};

let otherSpawnPoints = [];
let lastFrame = 0;
let playerName = 'ΕΣΥ';
let feedHash = '';
let topFlags = { t10: false, t5: false, t3: false };
let endTimeout = null;

/* ---------- HUD refs ---------- */
const UI = {};
function cacheUI() {
  const ids = ['hpFill', 'hpText', 'shieldFill', 'shieldText', 'ammoMag', 'ammoRes', 'weaponName',
    'aliveCount', 'killCount', 'stormText', 'stormSub', 'feed', 'prompt', 'healCount', 'potCount',
    'zoneWarn', 'startScreen', 'endScreen', 'endTitle', 'endStats', 'hud', 'gameName',
    'timerText', 'dropHint', 'btnStart', 'btnRestart', 'touchUI', 'toast'];
  for (const id of ids) UI[id] = document.getElementById(id);
}

/* ---------- match lifecycle ---------- */
function startMatch() {
  initAudio();
  if (actx && actx.state === 'suspended') actx.resume();
  if (endTimeout) { clearTimeout(endTimeout); endTimeout = null; }

  generateMap();
  minimapBase = null;
  buildMinimapBase();

  G.players = [];
  G.bullets = [];
  G.parts = [];
  G.texts = [];
  G.feed = [];
  G.time = 0;
  G.matchTime = 0;
  G.over = false;
  G.running = true;
  G.kills = 0;
  G.shake = 0;
  G.hitFlash = 0;
  G.hitDirs = [];
  G.placement = 0;
  feedHash = '';
  topFlags = { t10: false, t5: false, t3: false };

  initStorm();

  // spawn points spread over the map
  const spawns = [];
  for (let i = 0; i < TOTAL_PLAYERS; i++) {
    let pos = null;
    for (let a = 0; a < 240; a++) {
      const x = rand(240, WORLD_SIZE - 240);
      const y = rand(240, WORLD_SIZE - 240);
      if (blockedAt(x, y, PLAYER_R + 16)) continue;
      let ok = true;
      for (const s of spawns) {
        if (dist2(s.x, s.y, x, y) < 470 * 470) { ok = false; break; }
      }
      if (ok) { pos = { x, y }; break; }
    }
    if (!pos) pos = { x: rand(400, WORLD_SIZE - 400), y: rand(400, WORLD_SIZE - 400) };
    spawns.push(pos);
  }
  otherSpawnPoints = spawns;

  const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5);
  for (let i = 0; i < TOTAL_PLAYERS; i++) {
    const isBot = i > 0;
    const p = makePlayer(spawns[i].x, spawns[i].y, isBot, isBot ? (names[i % names.length] + (i > names.length ? i : '')) : playerName);
    giveWeapon(p, 'pistol', 42);
    G.players.push(p);
    if (!isBot) G.player = p;
  }
  G.alive = TOTAL_PLAYERS;

  cam.x = G.player.x;
  cam.y = G.player.y;

  UI.startScreen.classList.add('hidden');
  UI.endScreen.classList.add('hidden');
  UI.hud.classList.remove('hidden');
  UI.toast.classList.remove('show');
  toast('ΠΡΟΣΟΧΗ ΣΤΗΝ ΚΑΤΑΙΓΙΔΑ', 2.2);
  document.body.classList.add('playing');
}

function toast(text, seconds) {
  if (!UI.toast) return;
  UI.toast.textContent = text;
  UI.toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => UI.toast.classList.remove('show'), (seconds || 2) * 1000);
}

function onPlayerDeath(p, source) {
  if (p !== G.player) return;
  G.placement = G.players.filter(q => q.alive).length + 1;
  G.over = true;
  G.running = false;
  sfx('lose');
  endTimeout = setTimeout(() => showEnd(false, source), 1100);
}

function checkWin() {
  if (G.over) return;
  if (G.player.alive && G.players.filter(p => p.alive).length === 1) {
    G.placement = 1;
    G.over = true;
    G.running = false;
    sfx('win');
    endTimeout = setTimeout(() => showEnd(true), 900);
  }
}

function showEnd(won, killer) {
  UI.endScreen.classList.remove('hidden');
  document.body.classList.remove('playing');
  const mins = Math.floor(G.matchTime / 60);
  const secs = Math.floor(G.matchTime % 60);
  const timeStr = mins + ':' + (secs < 10 ? '0' : '') + secs;
  if (won) {
    UI.endTitle.textContent = '#1 ΝΙΚΗ';
    UI.endTitle.className = 'end-title win';
    UI.endStats.innerHTML =
      '<div class="big-stat">ΕΠΙΒΙΩΣΕΣ ΩΣ Ο ΤΕΛΕΥΤΑΙΟΣ</div>' +
      statRow('Εξουδετερώσεις', G.kills) +
      statRow('Ζημιά', Math.round(G.player.damageDealt || 0)) +
      statRow('Χρόνος', timeStr) +
      statRow('Εχθροί', TOTAL_PLAYERS - 1);
  } else {
    UI.endTitle.textContent = '#' + G.placement;
    UI.endTitle.className = 'end-title lose';
    UI.endStats.innerHTML =
      '<div class="big-stat">' + (G.placement <= 5 ? 'ΤΟΣΟ ΚΟΝΤΑ!' : 'ΕΞΟΥΔΕΤΕΡΩΘΗΚΕΣ') + '</div>' +
      statRow('Θέση', G.placement + ' / ' + TOTAL_PLAYERS) +
      statRow('Εξουδετερώσεις', G.kills) +
      statRow('Ζημιά', Math.round(G.player.damageDealt || 0)) +
      statRow('Χρόνος', timeStr) +
      (killer ? statRow('Από', killer.name) : '');
  }
}
function statRow(label, value) {
  return '<div class="stat-row"><span>' + label + '</span><b>' + value + '</b></div>';
}

/* ---------- input ---------- */
function bindInput() {
  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('keydown', e => {
    input.keys[e.key.toLowerCase()] = true;
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].indexOf(e.key.toLowerCase()) >= 0) e.preventDefault();
    if (e.key.toLowerCase() === 'r') tryReload();
    if (e.key === '1') tryMed();
    if (e.key === '2') tryPot();
    if (e.key.toLowerCase() === 'e') tryPickWeapon();
    if (e.key.toLowerCase() === 'm') { audioMuted = !audioMuted; toast(audioMuted ? 'ΗΧΟΣ OFF' : 'ΗΧΟΣ ON', 1.2); }
    if (e.key.toLowerCase() === 'f') toggleFullscreen();
  });
  window.addEventListener('keyup', e => { input.keys[e.key.toLowerCase()] = false; });

  window.addEventListener('mousemove', e => {
    input.mx = e.clientX;
    input.my = e.clientY;
  });
  canvas.addEventListener('mousedown', e => {
    if (e.button === 0) { input.down = true; input.firePressed = true; }
    if (e.button === 2) tryReload();
  });
  window.addEventListener('mouseup', () => { input.down = false; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('wheel', e => e.preventDefault(), { passive: false });

  // touch
  const R = 74;
  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (!input.moveJoy.id && t.clientX < VIEW.w * 0.45) {
        input.moveJoy = { id: t.identifier, ox: t.clientX, oy: t.clientY, dx: 0, dy: 0, x: t.clientX, y: t.clientY };
      } else if (!input.aimJoy.id) {
        input.aimJoy = { id: t.identifier, ox: t.clientX, oy: t.clientY, dx: 0, dy: 0, x: t.clientX, y: t.clientY };
      }
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      for (const j of [input.moveJoy, input.aimJoy]) {
        if (j.id === t.identifier) {
          let dx = t.clientX - j.ox, dy = t.clientY - j.oy;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > R) { dx = dx / d * R; dy = dy / d * R; j.ox += (t.clientX - j.ox) - dx; j.oy += (t.clientY - j.oy) - dy; }
          j.dx = dx / R; j.dy = dy / R;
          j.x = t.clientX; j.y = t.clientY;
        }
      }
    }
  }, { passive: false });

  const endTouch = e => {
    for (const t of e.changedTouches) {
      for (const j of [input.moveJoy, input.aimJoy]) {
        if (j.id === t.identifier) { j.id = null; j.dx = 0; j.dy = 0; }
      }
    }
  };
  canvas.addEventListener('touchend', endTouch);
  canvas.addEventListener('touchcancel', endTouch);

  const bindBtn = (id, fn) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); fn(); }, { passive: false });
    el.addEventListener('click', e => { e.preventDefault(); fn(); });
  };
  bindBtn('tReload', () => { sfx('click'); tryReload(); });
  bindBtn('tMed', () => { sfx('click'); tryMed(); });
  bindBtn('tPot', () => { sfx('click'); tryPot(); });
  bindBtn('tPick', () => { sfx('click'); tryPickWeapon(); });

  if (input.isTouch) {
    UI.touchUI.classList.remove('hidden');
    const dc = document.getElementById('desktopControls');
    if (dc) dc.classList.add('hidden');
    const tc = document.getElementById('touchControls');
    if (tc) tc.classList.remove('hidden');
  }
}

function tryReload() {
  if (!G.running || !G.player || !G.player.alive) return;
  startReload(G.player);
}
function tryMed() {
  if (!G.running || !G.player || !G.player.alive) return;
  useMedkit(G.player);
}
function tryPot() {
  if (!G.running || !G.player || !G.player.alive) return;
  usePotion(G.player);
}
function tryPickWeapon() {
  if (!G.running || !G.player || !G.player.alive) return;
  const p = G.player;
  let closest = null, cd = 90;
  for (const it of MAP.loot) {
    if (it.taken || it.type !== 'weapon') continue;
    const d = dist(p.x, p.y, it.x, it.y);
    if (d < cd) { closest = it; cd = d; }
  }
  if (closest) pickupWeapon(p, closest);
}
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
  } else if (document.exitFullscreen) document.exitFullscreen();
}

/* ---------- player update ---------- */
function updatePlayer(p, dt) {
  let dx = 0, dy = 0;
  const k = input.keys;
  if (k['w'] || k['arrowup']) dy -= 1;
  if (k['s'] || k['arrowdown']) dy += 1;
  if (k['a'] || k['arrowleft']) dx -= 1;
  if (k['d'] || k['arrowright']) dx += 1;

  if (input.moveJoy.id) {
    dx += input.moveJoy.dx;
    dy += input.moveJoy.dy;
  }
  const mag = Math.sqrt(dx * dx + dy * dy);
  if (mag > 1) { dx /= mag; dy /= mag; }

  const sprint = (k['shift'] || (input.moveJoy.id && mag > 0.92)) && mag > 0.1;
  p.sprinting = !!sprint;
  const speed = 232 * (sprint ? 1.32 : 1) * (p.reloading > 0 ? 0.9 : 1);
  p.vx = dx * speed;
  p.vy = dy * speed;
  if (mag > 0.05) p.walkPhase += dt * 14;

  // aim
  let aimAngle = p.angle;
  const w = p.weapon ? WEAPONS[p.weapon] : null;
  if (input.aimJoy.id && (Math.abs(input.aimJoy.dx) > 0.15 || Math.abs(input.aimJoy.dy) > 0.15)) {
    aimAngle = Math.atan2(input.aimJoy.dy, input.aimJoy.dx);
  } else if (!input.isTouch) {
    const wx = cam.x + (input.mx - VIEW.w / 2) / cam.zoom;
    const wy = cam.y + (input.my - VIEW.h / 2) / cam.zoom;
    aimAngle = Math.atan2(wy - p.y, wx - p.x);
  } else {
    // mobile aim assist toward the nearest visible enemy
    let best = null, bd = 780;
    for (const q of G.players) {
      if (!q.alive || q === p) continue;
      const d = dist(p.x, p.y, q.x, q.y);
      if (d < bd && hasLineOfSight(p.x, p.y, q.x, q.y)) { best = q; bd = d; }
    }
    if (best) aimAngle = Math.atan2(best.y - p.y, best.x - p.x);
    else if (mag > 0.1) aimAngle = Math.atan2(dy, dx);
  }
  p.angle = angLerp(p.angle, aimAngle, 1 - Math.exp(-dt * 22));

  // fire
  const wantFire = input.down || input.firePressed || (input.aimJoy.id && Math.hypot(input.aimJoy.dx, input.aimJoy.dy) > 0.45);
  if (wantFire && w) {
    if (w.auto) {
      tryFire(p, p.angle);
    } else if (input.firePressed || input.aimJoy.id) {
      const before = p.mag;
      tryFire(p, p.angle);
      if (p.mag < before) input.firePressed = false;
    }
  }
  if (!input.down) input.firePressed = false;

  // auto pickups
  for (const it of MAP.loot) {
    if (it.taken || it.type === 'weapon') continue;
    if (dist2(p.x, p.y, it.x, it.y) < 46 * 46) tryPickup(p, it);
  }
}

/* ---------- main update ---------- */
function update(dt) {
  G.time += dt;
  G.matchTime += dt;

  const p = G.player;
  if (p && p.alive) updatePlayer(p, dt);

  for (const q of G.players) {
    if (!q.alive) continue;
    updateTimers(q, dt);
    if (q.isBot) {
      if (q.hitFlash > 0) q.hitFlash -= dt * 4;
      updateBot(q, dt);
    }
    moveEntity(q, dt);
  }

  updateStorm(dt);
  updateBullets(dt);
  applyStormDamage(dt);

  // particles
  for (let i = G.parts.length - 1; i >= 0; i--) {
    const p2 = G.parts[i];
    p2.life -= dt;
    if (p2.life <= 0) { G.parts.splice(i, 1); continue; }
    p2.x += p2.vx * dt;
    p2.y += p2.vy * dt;
    p2.vx *= 0.94;
    p2.vy *= 0.94;
  }
  for (let i = G.texts.length - 1; i >= 0; i--) {
    const t = G.texts[i];
    t.life -= dt;
    t.y += t.vy * dt;
    t.vy *= 0.96;
    if (t.life <= 0) G.texts.splice(i, 1);
  }
  for (let i = G.hitDirs.length - 1; i >= 0; i--) {
    G.hitDirs[i].life -= dt;
    if (G.hitDirs[i].life <= 0) G.hitDirs.splice(i, 1);
  }
  for (const f of G.feed) f.life -= dt;
  while (G.feed.length && G.feed[G.feed.length - 1].life <= 0) G.feed.pop();

  G.hitFlash = Math.max(0, G.hitFlash - dt * 1.6);

  // milestones
  if (!topFlags.t10 && G.alive <= 10) { topFlags.t10 = true; addFeed('ΤΟΠ 10 — συνέχισε!', '#ffd166'); toast('ΤΟΠ 10', 1.8); }
  if (!topFlags.t5 && G.alive <= 5) { topFlags.t5 = true; addFeed('ΤΟΠ 5 — τελικοί!', '#ffd166'); toast('ΤΟΠ 5', 1.8); }
  if (!topFlags.t3 && G.alive <= 3) { topFlags.t3 = true; addFeed('ΤΟΠ 3 — έφτασες στο τέλος', '#ffd166'); toast('ΤΟΠ 3', 1.8); }
}

/* ---------- HUD ---------- */
function updateHud() {
  const p = G.player;
  if (!p) return;
  const hp = clamp(p.hp, 0, 100);
  UI.hpFill.style.width = hp + '%';
  UI.hpText.textContent = Math.max(0, Math.ceil(p.hp));
  UI.hpFill.style.background = hp > 50 ? 'linear-gradient(90deg,#4ade80,#22c55e)' :
    hp > 25 ? 'linear-gradient(90deg,#fbbf24,#f59e0b)' : 'linear-gradient(90deg,#f87171,#dc2626)';
  UI.shieldFill.style.width = clamp(p.shield, 0, 100) + '%';
  UI.shieldText.textContent = Math.ceil(p.shield);
  UI.shieldFill.parentElement.style.opacity = p.shield > 0 ? '1' : '0.35';

  const w = p.weapon ? WEAPONS[p.weapon] : null;
  UI.weaponName.textContent = w ? w.name : 'ΧΩΡΙΣ ΟΠΛΟ';
  UI.weaponName.style.color = w ? TIER_COLOR[w.tier] : '#7d8794';
  UI.ammoMag.textContent = w ? p.mag : 0;
  UI.ammoRes.textContent = '/ ' + p.ammo;
  UI.healCount.textContent = p.medkits;
  UI.potCount.textContent = p.pots;
  UI.aliveCount.textContent = G.players.filter(q => q.alive).length;
  UI.killCount.textContent = G.kills;

  const s = G.storm;
  if (s) {
    const label = s.state === 'wait' ? 'ΚΛΕΙΣΙΜΟ ΣΕ' : s.state === 'shrink' ? 'ΚΛΕΙΝΕΙ' : 'ΤΕΛΟΣ';
    UI.stormText.textContent = label;
    UI.stormSub.textContent = s.state === 'done' ? '—' : Math.max(0, Math.ceil(s.timer)) + 's';
    const outside = s.state !== 'done' && dist(p.x, p.y, s.cx, s.cy) > s.r;
    UI.zoneWarn.style.opacity = outside ? '1' : '0';
  }
  const mins = Math.floor(G.matchTime / 60);
  const secs = Math.floor(G.matchTime % 60);
  UI.timerText.textContent = mins + ':' + (secs < 10 ? '0' : '') + secs;

  // pickup prompt
  let prompt = '';
  if (G.running) {
    let best = null, bd = 92;
    for (const it of MAP.loot) {
      if (it.taken) continue;
      const d = dist(p.x, p.y, it.x, it.y);
      if (d < bd && it.type === 'weapon') { bd = d; best = it; }
    }
    if (best) prompt = (input.isTouch ? 'ΟΠΛΟ: πάτα το «ΟΠΛΟ» για ' : 'E — ') + WEAPONS[best.weapon].name;
  }
  UI.prompt.textContent = prompt;
  UI.prompt.style.opacity = prompt ? '1' : '0';

  // kill feed
  const html = G.feed.map(f => '<div class="feed-item" style="color:' + f.color + '">' + f.text + '</div>').join('');
  if (html !== feedHash) { UI.feed.innerHTML = html; feedHash = html; }
}

/* ---------- touch visuals ---------- */
function drawTouchUI() {
  if (!input.isTouch || !G.running) return;
  ctx.save();
  for (const j of [input.moveJoy, input.aimJoy]) {
    if (!j.id) continue;
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(j.ox, j.oy, 74, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(j.ox + j.dx * 74, j.oy + j.dy * 74, 30, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

/* ---------- loop ---------- */
function frame(ts) {
  if (!lastFrame) lastFrame = ts;
  let dt = (ts - lastFrame) / 1000;
  lastFrame = ts;
  dt = Math.min(dt, 0.05);

  if (G.running && !G.over) update(dt);

  render();
  drawTouchUI();
  updateHud();

  requestAnimationFrame(frame);
}

/* ---------- boot ---------- */
window.addEventListener('load', () => {
  cacheUI();
  resizeCanvas();
  bindInput();
  UI.btnStart.addEventListener('click', () => { sfx('click'); startMatch(); });
  UI.btnRestart.addEventListener('click', () => { sfx('click'); startMatch(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) lastFrame = 0; });
  requestAnimationFrame(frame);
});
