'use strict';

/* ==========================================================================
   STORM ROYALE — configurations
   ========================================================================== */

const WORLD_SIZE = 4400;
const TAU = Math.PI * 2;
const PLAYER_R = 15;
const TOTAL_PLAYERS = 50;
const BULLET_CAP = 900;

/* ---------- math helpers ---------- */
function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function rand(a, b) { return a + Math.random() * (b - a); }
function randInt(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }
function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function dist(x1, y1, x2, y2) { const dx = x2 - x1, dy = y2 - y1; return Math.sqrt(dx * dx + dy * dy); }
function dist2(x1, y1, x2, y2) { const dx = x2 - x1, dy = y2 - y1; return dx * dx + dy * dy; }
function lerp(a, b, t) { return a + (b - a) * t; }
function angleDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
function angLerp(a, b, t) { return a + angleDiff(a, b) * t; }

/* ---------- weapons ---------- */
const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'ΠΙΣΤΟΛΙ', dmg: 21, rpm: 330, mag: 14, spread: 0.028, speed: 1350,
    range: 1000, reload: 1.05, pellets: 1, auto: false, tier: 'common', kick: 1.6, len: 15,
    sound: 'pistol', recoil: 0.02
  },
  smg: {
    id: 'smg', name: 'SMG', dmg: 12, rpm: 980, mag: 32, spread: 0.062, speed: 1250,
    range: 820, reload: 1.5, pellets: 1, auto: true, tier: 'rare', kick: 1.1, len: 17,
    sound: 'smg', recoil: 0.016
  },
  ar: {
    id: 'ar', name: 'ΤΟΥΦΕΚΙ ΕΦΟΔΟΥ', dmg: 25, rpm: 620, mag: 30, spread: 0.034, speed: 1650,
    range: 1250, reload: 1.9, pellets: 1, auto: true, tier: 'rare', kick: 2.2, len: 22,
    sound: 'ar', recoil: 0.022
  },
  shotgun: {
    id: 'shotgun', name: 'ΚΑΡΑΜΠΙΝΑ', dmg: 12, rpm: 78, mag: 6, spread: 0.16, speed: 1150,
    range: 560, reload: 2.1, pellets: 9, auto: false, tier: 'epic', kick: 5, len: 20,
    sound: 'shotgun', recoil: 0.06
  },
  sniper: {
    id: 'sniper', name: 'ΕΛΕΥΦΑΝΤΙΣΤΗΣ', dmg: 82, rpm: 46, mag: 5, spread: 0.006, speed: 2800,
    range: 2600, reload: 2.5, pellets: 1, auto: false, tier: 'epic', kick: 4.5, len: 27,
    sound: 'sniper', recoil: 0.05
  }
};
const WEAPON_IDS = ['pistol', 'smg', 'ar', 'shotgun', 'sniper'];
const TIER_COLOR = { common: '#8fa3b8', rare: '#48a7ff', epic: '#b46bff' };

/* ---------- storm phases: [wait, shrink, radiusFactor(0-1 of half world), dps] ---------- */
const PHASES = [
  { wait: 24, shrink: 26, r: 0.62, dps: 1 },
  { wait: 20, shrink: 22, r: 0.42, dps: 2 },
  { wait: 17, shrink: 18, r: 0.28, dps: 4 },
  { wait: 14, shrink: 15, r: 0.185, dps: 6 },
  { wait: 12, shrink: 13, r: 0.115, dps: 9 },
  { wait: 10, shrink: 12, r: 0.062, dps: 13 },
  { wait: 9, shrink: 14, r: 0.022, dps: 18 },
  { wait: 8, shrink: 18, r: 0.008, dps: 26 }
];

/* ---------- bots ---------- */
const BOT_NAMES = [
  'SniperWolf', 'KostasGG', 'Blaze', 'Mpampis', 'Nikk', 'GhostPepper', 'RoulaTheSlayer',
  'Takos', 'ZeroPing', 'FotisPro', 'Souvlaki', 'NightOwl', 'GiannisX', 'Aris', 'Katerina',
  'SteelNerve', 'Moutsos', 'Vasilis', 'Eleni', 'Panos', 'Toxotis', 'Zhang', 'LuckyBamboo',
  'Mavros', 'Vortex', 'Kwstas', 'Iris', 'Delta', 'NoScopeNik', 'Thanos', 'Pixel', 'Babis',
  'Sparta', 'Lykos', 'Kriti', 'FireAnt', 'Mavro Provato', 'Nyx', 'Slayer', 'Pepe',
  'Ghost', 'Rafael', 'Kosmas', 'Illias', 'Tornado', 'Skia', 'BlueStorm', 'Alpha', 'Omega',
  'Salsa', 'Drakos', 'Simos'
];
