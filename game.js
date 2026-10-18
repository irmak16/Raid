/* Raid! — v0.3
   Saf Canvas + JS. Build adımı yok, GitHub Pages'te statik çalışır.
   Görseller assets/ klasöründen yüklenir (tools/prepare_assets.py ile hazırlanır).
   Bir görsel yoksa yerine kodla çizilen bir yedek kullanılır. */
(() => {
'use strict';

// ---------------------------------------------------------------------------
// Sahne ve halı geometrisi
// ---------------------------------------------------------------------------
const W = 1600, H = 900;
const COLS = 9, ROWS = 5;
const BG_OY = -7;                       // arka plan 1600x914, dikeyde ortalanır
const RUG = { top: 232, bottom: 792, tl: 304, tr: 1280, bl: 168, br: 1446 };
const ROW_H = (RUG.bottom - RUG.top) / ROWS;
const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rowTop = r => RUG.top + r * ROW_H;
const rowMidY = r => rowTop(r) + ROW_H / 2;
const rowFoot = r => rowTop(r) + ROW_H * 0.86;
const edgeAt = y => { const k = (y - RUG.top) / (RUG.bottom - RUG.top); return [lerp(RUG.tl, RUG.bl, k), lerp(RUG.tr, RUG.br, k)]; };
const rowLeft = r => edgeAt(rowMidY(r))[0];
const rowRight = r => edgeAt(rowMidY(r))[1];
const cellW = r => (rowRight(r) - rowLeft(r)) / COLS;
const uToX = (u, r) => rowLeft(r) + u * cellW(r);          // u: şerit içi konum, hücre biriminde (0..9)
const depth = r => 0.84 + 0.16 * (cellW(r) / cellW(ROWS - 1)); // üst şeritler biraz küçük
const spawnU = r => (W + 70 - rowLeft(r)) / cellW(r);       // ekranın sağ dışı
const visibleU = r => (W - 40 - rowLeft(r)) / cellW(r);     // ekranda görünür olduğu an
const APPROACH_PX = 78;                                     // halıya gelene kadar zeminde yürüme hızı (px/sn)
const START_VIDA = 100;
const SKY_MIN = 8, SKY_MAX = 11;
const BELT_MAX = 7;

// ---------------------------------------------------------------------------
// Tanımlar (hızlar hücre/saniye)
// ---------------------------------------------------------------------------
const UNITS = {
  toolbox:   { name: 'Alet Çantası',    cost: 50,  hp: 300,  cd: 7.5, asset: 'unit_toolbox',       h: 96,
               desc: 'Düzenli olarak 25 vida üretir. Ekonominin temeli.', up: 'Vidaları %10 daha sık üretir' },
  pistol:    { name: 'Su Tabancası',    cost: 100, hp: 300,  cd: 7.5, asset: 'unit_water_pistol',  h: 108, fire: 1.35, dmg: 20, shot: 'proj_water', muzzle: 0.62,
               desc: 'Sırasındaki böceklere su fışkırtır.', up: 'Hasar +%15' },
  barricade: { name: 'Koli Barikatı',   cost: 50,  hp: 4000, cd: 30,  asset: 'unit_box_barricade', h: 106,
               desc: 'Böcekleri uzun süre oyalar.', up: 'Dayanıklılık +%25' },
  freeze:    { name: 'Dondurucu Sprey', cost: 150, hp: 300,  cd: 7.5, asset: 'unit_freeze_spray',  h: 104, fire: 1.4, dmg: 20, slow: 4, shot: 'proj_frost', muzzle: 0.8,
               desc: 'Vurduğu böceği yarı hıza düşürür.', up: 'Hasar +%15, yavaşlatma +1 sn' },
  trap:      { name: 'Fare Kapanı',     cost: 25,  hp: 300,  cd: 30,  asset: 'unit_mouse_trap',    h: 66, maxW: 112, arm: 14,
               desc: 'Kurulunca üstüne basan ilk böceği tek seferde yakalar.', up: 'Kurulma süresi -2,5 sn' },
  bomb:      { name: 'Böcek Bombası',   cost: 125, hp: 9999, cd: 45,  asset: 'unit_bug_bomb',      h: 84, fuse: 0.75,
               desc: 'Çevresindeki 3x3 alanı tek seferde temizler.', up: 'Bekleme süresi -6 sn' },
};
const UNIT_ORDER = Object.keys(UNITS);
const UP_COST = [80, 200, 400];
const BUGS = {
  ant:    { name: 'İşçi Karınca',       hp: 200, armor: 0,   speed: 0.132, asset: 'bug_worker_ant',   h: 150,
            tip: 'İşçi karıncalar tek başına zayıf ama hiç durmazlar. Su Tabancası iki üç atışta halleder.' },
  helmet: { name: 'Kasklı Karınca',     hp: 200, armor: 300, speed: 0.132, asset: 'bug_helmet_ant',   h: 150,
            tip: 'Şişe kapağından kask! Önce kask düşer, sonra karınca. Önüne barikat koy, arkadan ıslat.' },
  runner: { name: 'Koşucu Hamamböceği', hp: 220, armor: 0,   speed: 0.22,  asset: 'bug_runner_roach', h: 92, maxW: 150,
            tip: 'Hamamböcekleri çok hızlı! Fare Kapanını yollarına erkenden kur.' },
  weevil: { name: 'Tahıl Biti Sürüsü',  hp: 520, armor: 0,   speed: 0.147, asset: 'bug_weevil_swarm', h: 84, maxW: 150,
            tip: 'Tahıl biti sürüsü birlikte çok dayanıklı. Dondurucu Sprey sürüyü yavaşlatır.' },
  shield: { name: 'Kalkanlı Karınca',   hp: 200, armor: 450, speed: 0.096, asset: 'bug_shield_ant',   h: 150, shield: true,
            tip: 'Kurabiye kalkanı suyu da buzu da tutar. Bomba ya da barikat işe yarar.' },
  queen:  { name: 'Kraliçe Karınca',    hp: 5000, armor: 0,  speed: 0.05,  asset: 'bug_queen_ant', fallback: 'bug_worker_ant', h: 380, maxW: 480, boss: true,
            tip: 'MegaBüyü-9\'un en büyük kurbanı! Üç şeridi birden kaplar, asker çağırır ve önündekileri ezer.' },
};
const BOOK_BUGS = ['ant', 'helmet', 'runner', 'weevil', 'shield', 'queen'];
const BITE_DPS = 100;
const SHOT_SPEED = 4.6;

const ROOM = 'Çocuk Odası';
// Dalga listesi: [saniye, [böcekler], büyükDalga?]. "ant@2" = 2. şeritten gelir.
const LEVELS = [
  { name: 'Yatağın Altı', unlock: 'barricade', thumb: 'unit_toolbox',
    intro: 'Ege\'nin yatağının altından karıncalar çıkıyor! Defne sana adım adım gösterecek.',
    goals: [{ t: 'lost', v: 0 }, { t: 'build', v: 15 }],
    waves: [[22,['ant@2']],[40,['ant']],[56,['ant']],[70,['ant','ant']],[86,['ant']],[98,['ant','ant']],[118,['ant','ant','ant','ant','ant'],true]] },
  { name: 'Oyuncak Rafı', vida: 125, unlock: 'trap', thumb: 'bug_helmet_ant',
    intro: 'Bazı karıncalar şişe kapağından kask takmış. Koli Barikatı onları uzun süre oyalar, sen de arkadan ıslatırsın.',
    tip: 'Barikatı tabancaların önüne, sağ tarafa koy.',
    goals: [{ t: 'lost', v: 0 }, { t: 'bank', v: 200 }],
    waves: [[20,['ant']],[36,['ant']],[50,['helmet']],[64,['ant','ant']],[78,['helmet','ant']],[92,['ant','ant']],[104,['helmet']],[122,['ant','ant','helmet','ant','helmet','ant'],true]] },
  { name: 'Halı Ortası', vida: 150, unlock: 'freeze', thumb: 'bug_runner_roach',
    intro: 'Koşucu hamamböcekleri çok hızlı. Fare Kapanı ucuzdur ama kurulması zaman alır; erken yerleştir!',
    tip: 'Fare Kapanını böcek gelmeden önce kur: kurulması 14 saniye sürer.',
    goals: [{ t: 'lost', v: 1 }, { t: 'build', v: 16 }],
    waves: [[20,['ant']],[42,['runner']],[54,['ant','ant']],[68,['runner','ant']],[74,['helmet']],[86,['runner','runner']],[100,['ant','helmet']],[120,['ant','runner','ant','helmet','runner','ant','ant'],true]] },
  { name: 'Lego Şehri', vida: 175, unlock: 'bomb', thumb: 'bug_weevil_swarm',
    intro: 'Tahıl biti sürüsü geliyor: tek tek zayıflar ama birlikte dayanıklılar. Dondurucu Sprey her şeyi yavaşlatır.',
    tip: 'Dondurucu Spreyi kalabalık şeritlere koy.',
    goals: [{ t: 'lost', v: 0 }, { t: 'bank', v: 250 }],
    waves: [[18,['ant']],[32,['weevil']],[46,['ant','runner']],[60,['weevil','ant']],[74,['helmet','runner']],[92,['ant','ant','weevil','helmet','ant'],true],[110,['runner','weevil']],[124,['helmet','ant']],[146,['weevil','helmet','ant','runner','weevil','ant','helmet','ant'],true]] },
  { name: 'Oyuncak Treni', type: 'belt', unlock: null, thumb: 'unit_freeze_spray', tag: 'Tren',
    intro: 'Defne oyuncak trenini bir taşıma bandına çevirdi! Kartlar raydan kendiliğinden gelir, vida gerekmez. Kartları biriktirme, hemen kullan.',
    tip: 'Kartlar banttan geliyor. Bant dolarsa yeni kart gelmez!',
    pool: ['pistol','pistol','pistol','freeze','freeze','barricade','trap','bomb'],
    goals: [{ t: 'lost', v: 2 }, { t: 'shovel' }],
    waves: [[16,['ant']],[30,['helmet','ant']],[44,['runner']],[56,['weevil','ant']],[70,['helmet','helmet']],[88,['ant','runner','helmet','ant','weevil'],true],[104,['runner','ant']],[118,['weevil','helmet']],[140,['ant','helmet','runner','weevil','ant','helmet','runner','ant'],true]] },
  { name: 'Kapı Önü', vida: 225, slots: 5, unlock: null, thumb: 'bug_shield_ant',
    intro: 'Kalkanlı karıncalar kurabiyelerini önlerinde taşıyor. Bu sefer yanına sadece 5 plan alabilirsin, iyi seç!',
    tip: 'Kalkanlı karıncaya Böcek Bombası çok iyi gelir.',
    goals: [{ t: 'lost', v: 0 }, { t: 'build', v: 18 }],
    waves: [[18,['ant']],[30,['shield']],[44,['ant','runner']],[58,['weevil','ant']],[72,['shield','helmet']],[92,['ant','ant','shield','weevil','runner','ant'],true],[110,['helmet','runner']],[124,['shield','ant']],[138,['ant','helmet','runner']],[160,['shield','weevil','helmet','ant','runner','ant','helmet','ant'],true]] },
  { name: 'Elektrik Kesildi', type: 'dark', vida: 225, slots: 6, unlock: null, thumb: 'bug_worker_ant', thumbCls: 'dark', tag: 'Karanlık',
    intro: 'Böcekler sigortayı kemirdi, oda karanlık! Böceklerin sadece parlayan gözlerini görebilirsin. Birimlerin ve atışların çevresini aydınlatır.',
    tip: 'Karanlıkta gözlere dikkat et. Yeşil gözler hangi şeritteyse oraya savunma kur.',
    goals: [{ t: 'lost', v: 1 }, { t: 'bank', v: 200 }],
    waves: [[18,['ant']],[30,['runner']],[44,['helmet','ant']],[58,['shield']],[72,['weevil','runner']],[92,['ant','helmet','shield','ant','runner'],true],[110,['weevil','ant']],[124,['shield','runner']],[138,['helmet','ant']],[160,['shield','weevil','helmet','runner','ant','ant','runner','ant'],true]] },
  { name: 'Pamuk\'u Koru', type: 'cat', vida: 225, slots: 6, unlock: null, thumb: 'char_family_group', tag: 'Pamuk', cat: [2, 2],
    intro: 'Pamuk halının ortasında mahsur kaldı ve korkudan yerinden kıpırdamıyor! Böcekler ona ulaşırsa Pamuk kaçar ve bölümü kaybedersin.',
    tip: 'Pamuk\'un sağına barikat koy, onu korumaya al!',
    goals: [{ t: 'cathp' }, { t: 'lost', v: 2 }],
    waves: [[18,['ant@2']],[32,['helmet']],[46,['runner@2','ant']],[60,['weevil','shield']],[74,['helmet@2','runner']],[94,['ant','ant@2','shield','weevil','runner'],true],[112,['runner@2','weevil']],[126,['shield','helmet']],[140,['ant','runner@2']],[162,['shield','weevil@2','helmet','ant','runner','ant','helmet','ant@2'],true]] },
  { name: 'Son Hazırlık', vida: 250, slots: 6, unlock: null, thumb: 'unit_bug_bomb',
    intro: 'Kraliçe\'nin odasına giden yol tıklım tıklım. Üç büyük dalga var; ekonomini erken kur.',
    tip: 'Üç büyük dalga geliyor. Bombayı son dalgaya sakla!',
    goals: [{ t: 'lost', v: 0 }, { t: 'bank', v: 300 }],
    waves: [[16,['ant']],[28,['helmet','ant']],[40,['runner','runner']],[54,['weevil','shield']],[70,['ant','helmet','runner','ant'],true],[88,['shield','weevil']],[100,['runner','helmet','ant']],[114,['shield','helmet','weevil','runner','ant','ant'],true],[132,['weevil','runner']],[146,['helmet','ant','runner']],[170,['shield','weevil','helmet','runner','ant','shield','helmet','runner','ant','ant'],true]] },
  { name: 'Kraliçe\'nin Yuvası', type: 'boss', vida: 275, slots: 6, unlock: null, thumb: 'bug_worker_ant', thumbCls: 'queen', tag: 'Boss', bossAt: 58,
    intro: 'Kraliçe Karınca dolabın arkasından çıkıyor! Üç şeridi birden kaplıyor ve asker çağırıyor. Onu durdurursan Çocuk Odası temizlenir.',
    tip: 'Kraliçe ortadaki üç şeridi kaplar. Oralara bolca tabanca kur!',
    goals: [{ t: 'lost', v: 2 }, { t: 'build', v: 22 }],
    waves: [[18,['ant']],[30,['helmet','ant']],[44,['runner','weevil']],[56,['shield','ant']],[80,['ant','helmet','runner'],true],[100,['weevil','shield']],[118,['helmet','runner','ant']],[136,['ant','shield','weevil','helmet','runner'],true]] },
];

// Günün görevi değiştiricileri
const DAILY_MODS = [
  { name: 'Telaşlı Böcekler', desc: 'Bütün böcekler %25 daha hızlı.', mods: { speed: 1.25 } },
  { name: 'Kapalı Tavan', desc: 'Gökten vida düşmez, ama 150 fazla vidayla başlarsın.', mods: { noSky: true, bonus: 150 } },
  { name: 'Kumbara Günü', desc: 'Alet Çantası yok; 550 vidayla başlarsın.', mods: { ban: ['toolbox'], bonus: 400 } },
  { name: 'Kask Modası', desc: 'İşçi karıncaların hepsi kask takmış.', mods: { armor: true } },
  { name: 'Az Plan', desc: 'Yanına sadece 4 plan alabilirsin.', mods: { slots: 4 } },
];

// ---------------------------------------------------------------------------
// Kayıt ve ayarlar
// ---------------------------------------------------------------------------
const SAVE_KEY = 'raid_save';
const save = { unlocked: 1, stars: {}, coins: 0, up: {}, seen: {}, loadout: null, best: 0, daily: {}, music: 0.5, sfx: 0.8, vib: true, auto: false };
try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) {}
if (save.sound === false) { save.sfx = 0; save.music = 0; }
delete save.sound;
save.unlocked = clamp(save.unlocked | 0, 1, LEVELS.length);
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }
function availUnits() {
  const list = ['toolbox', 'pistol'];
  for (let i = 0; i < save.unlocked - 1; i++) if (LEVELS[i].unlock) list.push(LEVELS[i].unlock);
  return list;
}
const uLv = k => (save.up[k] || 0);
function stat(k) {
  const d = UNITS[k], lv = uLv(k);
  return {
    hp: k === 'barricade' ? Math.round(d.hp * (1 + 0.25 * lv)) : d.hp,
    dmg: d.dmg ? d.dmg * (1 + 0.15 * lv) : 0,
    slow: d.slow ? d.slow + lv : 0,
    prod: 24 * (1 - 0.1 * lv),
    arm: d.arm ? d.arm - 2.5 * lv : 0,
    cd: k === 'bomb' ? d.cd - 6 * lv : d.cd,
  };
}
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const hashStr = s => { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

// ---------------------------------------------------------------------------
// Görseller
// ---------------------------------------------------------------------------
const IMG = {};
const ASSETS = [
  ...Object.values(UNITS).map(u => u.asset), ...Object.values(BUGS).map(b => b.asset),
  'char_ege', 'char_defne', 'char_pamuk', 'proj_water', 'proj_frost', 'item_screw', 'item_coin', 'ui_card_frame', 'ui_wave_bar',
  'icon_pause', 'icon_fast', 'icon_shovel', 'item_star_gold',
];
function loadImage(name, src) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => { IMG[name] = img; res(); };
    img.onerror = () => res();
    img.src = src;
  });
}
const assetsReady = Promise.all([
  ...ASSETS.map(n => loadImage(n, 'assets/' + n + '.png')),
  loadImage('bg_01_kids_room', 'assets/bg_01_kids_room.jpg'),
]);

// ---------------------------------------------------------------------------
// Canvas ve ölçekleme
// ---------------------------------------------------------------------------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const stage = document.getElementById('stage');
const wrap = document.getElementById('stage-wrap');
let pixelK = 1;
let ignoreRotate = false;
function resize() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const s = Math.min(vw / W, vh / H);
  stage.style.transform = `scale(${s})`;
  wrap.style.width = W * s + 'px';
  wrap.style.height = H * s + 'px';
  pixelK = Math.min(2.5, Math.max(0.75, s * (window.devicePixelRatio || 1)));
  canvas.width = Math.round(W * pixelK);
  canvas.height = Math.round(H * pixelK);
  const portrait = vh > vw * 1.1 && Math.min(vw, vh) < 820;
  document.getElementById('rotate').hidden = !(portrait && !ignoreRotate);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
document.getElementById('btn-rotate-ignore').onclick = () => { ignoreRotate = true; resize(); };
resize();

// ---------------------------------------------------------------------------
// Ses: efektler + kodla üretilen müzik
// ---------------------------------------------------------------------------
let ac = null, master = null, sfxG = null, musG = null, noiseBuf = null;
function audio() {
  if (!ac) {
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.connect(ac.destination);
      sfxG = ac.createGain(); musG = ac.createGain(); sfxG.connect(master); musG.connect(master);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      applyVolumes();
    } catch (e) { ac = null; return null; }
  }
  if (ac.state === 'suspended' && !document.hidden) ac.resume();
  return ac;
}
function applyVolumes() {
  if (!ac) return;
  sfxG.gain.value = save.sfx;
  musG.gain.setTargetAtTime(save.music * 0.55 * (mode === 'pause' ? 0.35 : 1), ac.currentTime, 0.1);
}
function tone(freq, dur, type = 'sine', vol = 0.15, slide = 0) {
  const a = audio(); if (!a || !save.sfx) return;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, a.currentTime);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), a.currentTime + dur);
  g.gain.setValueAtTime(vol, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
  o.connect(g); g.connect(sfxG); o.start(); o.stop(a.currentTime + dur);
}
function noise(dur, vol = 0.2, hp = 400, out) {
  const a = audio(); if (!a || (!out && !save.sfx)) return;
  const s = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter();
  f.type = 'highpass'; f.frequency.value = hp;
  s.buffer = noiseBuf; g.gain.setValueAtTime(vol, a.currentTime); g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
  s.connect(f); f.connect(g); g.connect(out || sfxG); s.start(); s.stop(a.currentTime + dur);
}
const sfx = {
  place: () => { tone(420, 0.12, 'triangle', 0.18, 260); noise(0.1, 0.06, 900); },
  shoot: () => tone(900, 0.06, 'sine', 0.05, -500),
  splash: () => noise(0.08, 0.08, 1800),
  coin: () => { tone(988, 0.08, 'square', 0.06); setTimeout(() => tone(1319, 0.12, 'square', 0.06), 70); },
  gold: () => { tone(1568, 0.08, 'triangle', 0.08); setTimeout(() => tone(2093, 0.14, 'triangle', 0.08), 60); },
  crunch: () => { noise(0.18, 0.18, 600); tone(240, 0.12, 'square', 0.04, -150); },
  pop: () => tone(520, 0.08, 'sine', 0.1, 400),
  boom: () => { noise(0.6, 0.4, 100); tone(90, 0.45, 'sawtooth', 0.14, -50); },
  snap: () => { noise(0.06, 0.3, 2000); tone(200, 0.1, 'square', 0.1, -120); },
  bite: () => tone(160, 0.05, 'square', 0.04),
  wave: () => { tone(330, 0.25, 'sawtooth', 0.08); setTimeout(() => tone(440, 0.35, 'sawtooth', 0.08), 220); },
  roar: () => { tone(110, 0.7, 'sawtooth', 0.14, -40); noise(0.5, 0.15, 300); },
  stomp: () => { tone(60, 0.35, 'sine', 0.35, -20); noise(0.3, 0.2, 80); },
  meow: () => { tone(700, 0.25, 'triangle', 0.08, 300); setTimeout(() => tone(900, 0.2, 'triangle', 0.07, -400), 180); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'triangle', 0.15), i * 130)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => setTimeout(() => tone(f, 0.3, 'triangle', 0.15), i * 170)),
  no: () => tone(140, 0.12, 'square', 0.06),
  click: () => tone(700, 0.05, 'triangle', 0.08),
  ready: () => tone(1180, 0.07, 'sine', 0.04),
  tick: () => tone(1500, 0.03, 'square', 0.03),
};
function vib(p) { if (save.vib && navigator.vibrate) { try { navigator.vibrate(p); } catch (e) {} } }

// Müzik: 4 ölçülük döngüler, 16'lık adımlar
const LEAD_BATTLE = [
  72,0,0,76, 0,0,79,0, 81,0,79,0, 76,0,0,0,
  76,0,0,72, 0,0,76,0, 74,0,72,0, 69,0,0,0,
  77,0,0,76, 0,0,77,0, 81,0,79,0, 77,0,76,0,
  74,0,76,0, 79,0,0,0, 74,0,71,0, 74,0,0,0];
const LEAD_BOSS = [
  69,0,72,0, 76,0,72,0, 69,0,72,0, 76,0,77,76,
  77,0,0,76, 74,0,72,0, 74,0,0,0, 72,0,74,0,
  74,0,77,0, 81,0,77,0, 74,0,77,0, 81,0,82,81,
  80,0,0,0, 76,0,80,0, 83,0,80,0, 76,0,0,0];
const LEAD_MENU = [
  0,0,0,0, 0,0,0,0, 79,0,0,0, 76,0,0,0,
  0,0,0,0, 0,0,0,0, 76,0,0,0, 72,0,0,0,
  0,0,0,0, 0,0,0,0, 77,0,0,0, 81,0,0,0,
  0,0,0,0, 79,0,0,0, 0,0,0,0, 0,0,0,0];
const C_MAJOR = [[48, 52, 55], [45, 48, 52], [41, 45, 48], [43, 47, 50]];
const MUSIC = {
  menu:   { bpm: 96,  chords: C_MAJOR, kick: [0, 8], snare: [], hat: [4, 12], hatVol: 0.025, bass: [0, 8], arp: true, lead: LEAD_MENU, leadVol: 0.03 },
  battle: { bpm: 124, chords: C_MAJOR, kick: [0, 6, 8], snare: [4, 12], hat: [2, 6, 10, 14], hatVol: 0.04, bass: [0, 3, 6, 8, 11, 14], pad: true, lead: LEAD_BATTLE, leadVol: 0.035 },
  boss:   { bpm: 138, chords: [[45, 48, 52], [41, 45, 48], [38, 41, 45], [40, 44, 47]], kick: [0, 4, 8, 10, 12], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], hatVol: 0.035, bass: [0, 2, 4, 6, 8, 10, 12, 14], pad: true, lead: LEAD_BOSS, leadVol: 0.035 },
};
const mus = { track: null, step: 0, next: 0, timer: null };
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
function musNote(type, m, t, dur, vol, cutoff = 3000) {
  const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
  o.type = type; o.frequency.value = mtof(m); f.type = 'lowpass'; f.frequency.value = cutoff;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f); f.connect(g); g.connect(musG); o.start(t); o.stop(t + dur + 0.05);
}
function musDrum(kind, t, vol) {
  if (kind === 'kick') {
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g); g.connect(musG); o.start(t); o.stop(t + 0.2);
  } else {
    const s = ac.createBufferSource(), g = ac.createGain(), f = ac.createBiquadFilter();
    f.type = kind === 'hat' ? 'highpass' : 'bandpass'; f.frequency.value = kind === 'hat' ? 7000 : 1800;
    const dur = kind === 'hat' ? 0.04 : 0.13;
    s.buffer = noiseBuf; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(musG); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
}
function playStep(T, step, t, sd) {
  const bar = Math.floor(step / 16), s = step % 16, ch = T.chords[bar];
  if (T.kick.includes(s)) musDrum('kick', t, 0.45);
  if (T.snare.includes(s)) musDrum('snare', t, 0.12);
  if (T.hat.includes(s)) musDrum('hat', t, T.hatVol);
  const bi = T.bass.indexOf(s);
  if (bi >= 0) musNote('triangle', ch[0] - 12 + (bi % 2 && T.bass.length > 2 ? 12 : 0), t, sd * 1.8, 0.2, 900);
  if (T.arp && s % 2 === 0) musNote('triangle', ch[(s / 2) % 3] + 12, t, sd * 1.5, 0.05, 2600);
  if (T.pad && s === 0) ch.forEach(m => musNote('triangle', m + 12, t, sd * 15, 0.022, 1600));
  const m = T.lead && T.lead[step];
  if (m) { musNote('square', m, t, sd * 1.7, T.leadVol, 2400); musNote('triangle', m + 12, t, sd * 1.2, T.leadVol * 0.5, 4000); }
}
function scheduleMusic() {
  if (!ac || !mus.track) return;
  const T = MUSIC[mus.track], sd = 60 / T.bpm / 4;
  if (mus.next < ac.currentTime - 0.3) mus.next = ac.currentTime + 0.05;
  while (mus.next < ac.currentTime + 0.25) { playStep(T, mus.step, mus.next, sd); mus.next += sd; mus.step = (mus.step + 1) % 64; }
}
function setMusic(name) {
  if (mus.track === name) return;
  mus.track = name;
  const a = audio(); if (!a) return;
  mus.step = 0; mus.next = a.currentTime + 0.08;
  if (!mus.timer) mus.timer = setInterval(scheduleMusic, 40);
}

// ---------------------------------------------------------------------------
// Oyun durumu
// ---------------------------------------------------------------------------
let G = null;
let mode = 'menu';     // menu | play | pause | end
let speed = 1;
let pointer = { x: -1, y: -1, inside: false };

function parseBug(s) { const [k, r] = s.split('@'); return { k, r: r == null ? null : +r }; }

function newGame(L, cards, li) {
  const mods = L.mods || {};
  G = {
    li, L, t: 0, wt: 0, vida: (L.vida || START_VIDA) + (mods.bonus || 0), mods,
    grid: Array.from({ length: ROWS }, () => Array(COLS).fill(null)),
    units: [], bugs: [], shots: [], pickups: [], parts: [], floats: [], queue: [], warns: [], lights: [],
    cards: (cards || []).map(k => ({ k, cd: 0, shine: 0 })),
    selected: null, shovel: false,
    waveIdx: 0, skyT: 6, banner: { text: 'Hazır... Kur... Savun!', t: 2.2 },
    lastSpawnT: L.waves ? Math.max(...L.waves.map(w => w[0]), L.bossAt || 0) : 1,
    over: false, stats: { lost: 0, built: 0, shovel: 0 }, lastRow: -1,
    shake: 0, hitStop: 0, slowmo: 0, flash: 0, alarm: 0, vidaBump: 0, coins: 0, coinBump: 0,
    tip: null, tipQ: [], tut: (li === 0 && !L.endless && !L.daily) ? { forced: false } : null,
    endless: !!L.endless, wave: 0, nextWaveT: 20, belt: L.type === 'belt', beltT: 1.2, beltOff: 0,
    cat: null, boss: null, bossSpawned: L.type !== 'boss',
  };
  if (L.type === 'cat') {
    const [c, r] = L.cat;
    G.cat = { k: 'cat', c, r, x: uToX(c + 0.5, r), y: rowFoot(r), hp: 400, max: 400, t: 0, flash: 0, kick: 0, born: 1, armed: true };
    G.units.push(G.cat); G.grid[r][c] = G.cat;
  }
  if (G.belt) { G.cards = []; for (let i = 0; i < 3; i++) addBeltCard(HUD.cardX + i * (HUD.cardW + HUD.gap) + 300); }
  if (L.tip) G.tipQ.push({ text: L.tip, t: 6, delay: 2.4 });
}
function addBeltCard(x) {
  const pool = G.L.pool;
  G.cards.push({ k: pool[Math.floor(Math.random() * pool.length)], cd: 0, shine: 0, belt: true, x: x == null ? HUD.cardX + BELT_MAX * (HUD.cardW + HUD.gap) : x });
}

function placeUnit(k, c, r) {
  const d = UNITS[k], st = stat(k);
  const u = { k, c, r, x: uToX(c + 0.5, r), y: rowFoot(r), hp: st.hp, max: st.hp, t: 0, fireT: 0.6 + Math.random() * 0.4,
    prodT: 5 + Math.random() * 1.5, armed: k !== 'trap', armT: st.arm, fuse: d.fuse || 0, flash: 0, kick: 0, born: 0 };
  G.units.push(u); G.grid[r][c] = u;
  burst(u.x, u.y - 10, '#f3d9a8', 10, 140);
  puff(u.x, u.y - 6, 'rgba(255,240,215,1)', 5, 26);
  ring(u.x, u.y - 4, 20, 70 * depth(r), 'rgba(255,255,255,.8)', 0.35, 5);
  sfx.place();
  return u;
}
function removeUnit(u) { u.dead = true; if (G.grid[u.r][u.c] === u) G.grid[u.r][u.c] = null; }
function pickRow() {
  let r;
  do { r = Math.floor(Math.random() * ROWS); } while (r === G.lastRow && Math.random() < 0.6);
  G.lastRow = r; return r;
}
function spawnBug(k, r) {
  if (G.mods.armor && k === 'ant') k = 'helmet';
  const d = BUGS[k];
  if (r == null) r = pickRow();
  const scale = G.endless && G.wave > 10 ? 1 + 0.07 * (G.wave - 10) : 1;
  const b = { k, r, u: spawnU(r) + Math.random() * 0.3, hp: d.hp * scale, armor: d.armor * scale, maxArmor: d.armor * scale,
    max: (d.hp + d.armor) * scale, slowT: 0, eating: null, flash: 0, hit: 0, t: Math.random() * 10, dying: 0, flipDir: Math.random() < 0.5 ? -1 : 1 };
  G.bugs.push(b);
  if (!save.seen[k]) { save.seen[k] = 1; persist(); if (d.tip) G.tipQ.push({ text: 'Yeni böcek: ' + d.name + '! ' + d.tip, t: 6.5, delay: 0.5 }); }
  return b;
}
function spawnBoss() {
  G.bossSpawned = true;
  const b = spawnBug('queen', 2);
  b.u = spawnU(2) + 1; b.summonT = 9; b.stompT = 14; b.roar = 0;
  G.boss = b;
  G.banner = { text: 'Kraliçe geliyor!', t: 3, big: true }; G.alarm = 3; sfx.roar(); vib([60, 40, 60]); G.shake = 0.5;
  setMusic('boss');
}
function queueWave(list, big) {
  const rows = [];
  list.forEach((s, i) => {
    const { k, r } = parseBug(s);
    const row = r == null ? pickRow() : r;
    rows.push(row);
    G.queue.push({ at: G.wt + i * (big ? 0.65 : 0.9), k, r: row });
  });
  [...new Set(rows)].forEach(r => G.warns.push({ r, t: big ? 3 : 1.8 }));
  if (big) { G.alarm = 2.6; vib(40); }
}
function dropScrew(x, y, targetY, value = 25, fromSky = true) {
  G.pickups.push({ x, y, ty: targetY, vy: fromSky ? 70 : -340, value, life: 9, collecting: 0, fromSky, vx: fromSky ? 0 : (Math.random() * 120 - 60), kind: 'screw' });
}
function dropCoin(x, y, targetY) {
  G.pickups.push({ x, y, ty: targetY, vy: -380, value: 5, life: 8, collecting: 0, fromSky: false, vx: Math.random() * 160 - 80, kind: 'coin' });
}
// --- efektler
function burst(x, y, color, n = 8, sp = 200, size = 6) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = sp * (0.4 + Math.random() * 0.6);
    G.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - sp * 0.3, life: 0.5 + Math.random() * 0.4, max: 0.9, color, size: size * (0.6 + Math.random() * 0.6) });
  }
}
function puff(x, y, color, n = 6, r = 22) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = 40 + Math.random() * 70;
    G.parts.push({ puff: true, x: x + Math.cos(a) * 10, y: y + Math.sin(a) * 6, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.5 - 30, r: r * (0.6 + Math.random() * 0.6), life: 0.55 + Math.random() * 0.3, max: 0.85, color });
  }
}
function ring(x, y, r0, r1, color, life = 0.4, lw = 6) { G.parts.push({ ring: true, x, y, r0, r1, color, life, max: life, lw, vx: 0, vy: 0 }); }
function confetti(n = 120) {
  const cols = ['#ffd23a', '#ff6a2a', '#2f8cff', '#7dff5a', '#ff4fa3', '#ffffff'];
  for (let i = 0; i < n; i++) G.parts.push({ conf: true, x: Math.random() * W, y: -20 - Math.random() * 300, vx: Math.random() * 80 - 40, vy: 120 + Math.random() * 160,
    rot: Math.random() * 6, vr: Math.random() * 10 - 5, life: 3 + Math.random() * 1.5, max: 4.5, color: cols[i % cols.length], size: 8 + Math.random() * 8 });
}
function floatText(x, y, text, color = '#fff', size = 34) { G.floats.push({ x, y, text, color, t: 0, size }); }
function light(x, y, r, life = 0.5) { G.lights.push({ x, y, r, life, max: life }); }
const bugX = b => uToX(b.u, b.r);
const bugRows = b => b.k === 'queen' ? [b.r - 1, b.r, b.r + 1] : [b.r];
const elasticOut = t => t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * 2 * Math.PI / 3) + 1;

// ---------------------------------------------------------------------------
// Sonsuz mod ve günlük görev dalgaları
// ---------------------------------------------------------------------------
const BUG_COST = [['ant', 1], ['helmet', 2], ['runner', 2], ['weevil', 3], ['shield', 3]];
function genWave(n, rand = Math.random) {
  const pool = BUG_COST.slice(0, Math.min(BUG_COST.length, 1 + Math.floor(n / 2)));
  let budget = 2 + n * 1.2; if (n % 5 === 0) budget *= 1.7;
  const list = [];
  while (budget >= 1) { const opts = pool.filter(p => p[1] <= budget); const p = opts[Math.floor(rand() * opts.length)]; list.push(p[0]); budget -= p[1]; }
  return list;
}
function dailyLevel() {
  const key = todayKey(), rand = rng(hashStr('raid' + key));
  const mod = DAILY_MODS[Math.floor(rand() * DAILY_MODS.length)];
  const waves = [];
  for (let i = 0; i < 10; i++) { const big = i === 4 || i === 9; waves.push([18 + i * 15 + (big ? 6 : 0), genWave(i + 2 + (big ? 3 : 0), rand), big]); }
  return { name: 'Günün Görevi', daily: true, key, vida: 150, slots: mod.mods.slots || 6, mods: mod.mods, modName: mod.name, modDesc: mod.desc, waves };
}
const ENDLESS = { name: 'Sonsuz Baskın', endless: true, vida: 200, slots: 6 };

// ---------------------------------------------------------------------------
// Güncelleme
// ---------------------------------------------------------------------------
function update(dt) {
  if (!G || G.over) { updateFx(dt); return; }
  if (G.hitStop > 0) { G.hitStop -= dt; updateFx(dt * 0.25); return; }
  if (G.slowmo > 0) { G.slowmo -= dt; dt *= 0.35; }
  G.t += dt;
  const L = G.L;
  tutorialUpdate();
  if (!G.tut || G.tut.done) G.wt += dt;

  // dalgalar
  if (G.endless) {
    if (G.wt >= G.nextWaveT) {
      G.wave++;
      const big = G.wave % 5 === 0;
      queueWave(genWave(G.wave), big);
      G.banner = { text: big ? `Dalga ${G.wave} — büyük!` : `Dalga ${G.wave}`, t: 2, big }; if (big) sfx.wave();
      G.nextWaveT = G.wt + (big ? 26 : 18);
    }
  } else if (G.waveIdx < L.waves.length) {
    const next = L.waves[G.waveIdx];
    if (G.bugs.length === 0 && G.queue.length === 0 && G.wt > 12 && next[0] - G.wt > 5) G.wt = next[0] - 5;
    if (G.wt >= next[0]) {
      if (next[2]) { G.banner = { text: G.waveIdx === L.waves.length - 1 && L.type !== 'boss' ? 'Son dalga!' : 'Büyük dalga geliyor!', t: 2.6, big: true }; sfx.wave(); }
      queueWave(next[1], next[2]);
      G.waveIdx++;
    }
  }
  for (const q of G.queue) if (G.wt >= q.at) { spawnBug(q.k, q.r); q.done = true; }
  G.queue = G.queue.filter(q => !q.done);
  if (!G.bossSpawned && G.wt >= L.bossAt) spawnBoss();

  // gökten vida
  if (!G.mods.noSky && !G.belt) {
    G.skyT -= dt;
    if (G.skyT <= 0) {
      G.skyT = SKY_MIN + Math.random() * (SKY_MAX - SKY_MIN);
      const r = Math.floor(Math.random() * ROWS);
      dropScrew(uToX(0.6 + Math.random() * (COLS - 1.2), r), -30, rowMidY(r));
    }
  }
  // taşıma bandı
  if (G.belt) {
    G.beltOff = (G.beltOff + dt * 60) % 40;
    G.beltT -= dt;
    if (G.beltT <= 0 && G.cards.length < BELT_MAX) { addBeltCard(); G.beltT = 3.4 + Math.random() * 1.4; }
    G.cards.forEach((c, i) => { const tx = HUD.cardX + i * (HUD.cardW + HUD.gap); c.x = Math.max(tx, c.x - 320 * dt); });
  }
  for (const c of G.cards) {
    const was = c.cd; c.cd = Math.max(0, c.cd - dt);
    if (was > 0 && c.cd === 0) { c.shine = 1; sfx.ready(); }
    c.shine = Math.max(0, c.shine - dt * 1.6);
  }

  // birimler
  for (const u of G.units) {
    if (u.dead) continue;
    u.t += dt; u.born += dt; u.flash = Math.max(0, u.flash - dt); u.kick = Math.max(0, u.kick - dt * 4);
    if (u.k === 'cat') continue;
    const d = UNITS[u.k];
    if (u.k === 'toolbox') {
      u.prodT -= dt;
      if (u.prodT <= 0) { u.prodT = stat('toolbox').prod; u.kick = 1; dropScrew(u.x, u.y - 60, u.y - 20, 25, false); sfx.pop(); }
    } else if (d.fire) {
      u.fireT -= dt;
      const target = G.bugs.some(b => !b.dying && bugRows(b).includes(u.r) && b.u > u.c + 0.3 && b.u < visibleU(b.r));
      if (target && u.fireT <= 0) {
        const st = stat(u.k);
        u.fireT = d.fire; u.kick = 1;
        G.shots.push({ u: u.c + 0.85, r: u.r, yOff: d.h * depth(u.r) * d.muzzle, dmg: st.dmg, slow: st.slow, k: u.k, img: d.shot, spin: 0 });
        burst(uToX(u.c + 0.85, u.r), u.y - d.h * depth(u.r) * d.muzzle, u.k === 'freeze' ? '#e6f8ff' : '#9ad6ff', 3, 90, 3);
        sfx.shoot();
      }
    } else if (u.k === 'trap' && !u.armed) {
      u.armT -= dt;
      if (u.armT <= 0) { u.armed = true; u.kick = 1; burst(u.x, u.y - 10, '#ffe08a', 10, 120, 4); sfx.snap(); }
    } else if (u.k === 'bomb') {
      u.fuse -= dt;
      if (u.fuse <= 0) explode(u);
    }
  }

  // mermiler
  for (const s of G.shots) {
    s.u += SHOT_SPEED * dt; s.spin += dt * 8;
    if (uToX(s.u, s.r) > W + 40) { s.dead = true; continue; }
    let hit = null;
    for (const b of G.bugs) {
      if (b.dying || !bugRows(b).includes(s.r)) continue;
      const back = b.k === 'queen' ? 1.6 : 0.22, front = b.k === 'queen' ? 0.5 : 0.28;
      if (s.u >= b.u - front && s.u <= b.u + back && (!hit || b.u < hit.u)) hit = b;
    }
    if (hit) {
      s.dead = true;
      damageBug(hit, s.dmg, s.slow);
      const x = uToX(s.u, s.r), y = rowFoot(s.r) - s.yOff;
      burst(x, y, s.k === 'freeze' ? '#d8f3ff' : '#6ec3ff', 7, 170, 4);
      ring(x, y, 4, 26, s.k === 'freeze' ? 'rgba(220,245,255,.9)' : 'rgba(150,215,255,.9)', 0.22, 4);
      light(x, y, 120, 0.25);
      sfx.splash();
    }
  }

  // böcekler
  for (const b of G.bugs) {
    b.t += dt; b.flash = Math.max(0, b.flash - dt); b.hit = Math.max(0, b.hit - dt * 6);
    if (b.dying) { b.dying += dt; continue; }
    b.slowT = Math.max(0, b.slowT - dt);
    const slowMul = b.slowT > 0 ? 0.5 : 1;
    const d = BUGS[b.k];
    if (b.k === 'queen') bossLogic(b, dt);
    let blocker = null;
    for (const u of G.units) {
      if (u.dead || u.r !== b.r || u.k === 'bomb') continue;
      const du = (b.u - 0.28) - (u.c + 0.5);
      if (du < 0.22 && du > -0.34) { blocker = u; break; }
    }
    if (blocker && blocker.k === 'trap' && blocker.armed) {
      removeUnit(blocker);
      const x = bugX(b), y = rowFoot(b.r);
      burst(x, y - 30, '#2a2a2a', 14, 260, 6); burst(blocker.x, blocker.y - 10, '#c99a5b', 10, 200, 5);
      G.shake = Math.max(G.shake, 0.15); sfx.snap();
      if (b.k === 'queen') damageBug(b, 600); else killBug(b, true);
      continue;
    }
    if (blocker) {
      b.eating = blocker;
      blocker.hp -= BITE_DPS * slowMul * (b.k === 'queen' ? 3 : 1) * dt;
      blocker.flash = 0.08;
      if (Math.random() < dt * 3) { sfx.bite(); if (blocker.k === 'cat' && Math.random() < 0.3) sfx.meow(); }
      if (blocker.hp <= 0) {
        if (blocker.k === 'cat') { removeUnit(blocker); lose('cat'); return; }
        removeUnit(blocker); G.stats.lost++; burst(blocker.x, blocker.y - 40, '#f3d9a8', 12, 220); puff(blocker.x, blocker.y - 20, 'rgba(230,210,180,1)', 6, 24);
        sfx.crunch(); vib(25); b.eating = null;
      }
    } else {
      b.eating = null;
      const sp = d.speed * (G.mods.speed || 1) * slowMul * (b.k === 'queen' && b.hp < b.max / 2 ? 1.35 : 1);
      if (b.u > COLS) b.u -= Math.max(sp * cellW(b.r), APPROACH_PX * slowMul) / cellW(b.r) * dt;
      else b.u -= sp * dt;
    }
    if (b.u < -0.35) { lose('reach'); return; }
  }

  // vidalar ve altınlar
  for (const p of G.pickups) {
    if (p.collecting) {
      p.collecting += dt * 2.2;
      const k = Math.min(1, p.collecting), tgt = p.kind === 'coin' ? HUD.coin : HUD.screw;
      p.x = p.cx + (tgt.x - p.cx) * k * k; p.y = p.cy + (tgt.y - p.cy) * k * k - Math.sin(k * Math.PI) * 80;
      if (k >= 1) {
        p.dead = true;
        if (p.kind === 'coin') { G.coins += p.value; G.coinBump = 1; }
        else { G.vida += p.value; G.vidaBump = 1; floatText(HUD.screw.x + 40, HUD.screw.y + 40, '+' + p.value, '#ffe08a'); }
      }
      continue;
    }
    if (p.fromSky) { if (p.y < p.ty) p.y = Math.min(p.ty, p.y + p.vy * dt); }
    else {
      p.vy += 900 * dt; p.y += p.vy * dt; p.x += p.vx * dt;
      if (p.y >= p.ty && p.vy > 0) { p.y = p.ty; p.vy = p.kind === 'coin' && !p.bounced ? -180 : 0; p.bounced = true; if (!p.vy) p.vx = 0; }
    }
    p.life -= dt;
    if ((save.auto && p.life < 8.2) || (p.kind === 'coin' && p.life < 6.5)) collect(p);
    if (p.life <= 0) p.dead = true;
  }

  updateFx(dt);
  G.units = G.units.filter(u => !u.dead);
  G.shots = G.shots.filter(s => !s.dead);
  G.bugs = G.bugs.filter(b => !(b.dying && b.dying > 0.8));
  G.pickups = G.pickups.filter(p => !p.dead);

  if (!G.endless && G.bossSpawned && G.waveIdx >= L.waves.length && G.queue.length === 0 && G.bugs.length === 0) win();
}
function updateFx(dt) {
  if (!G) return;
  for (const p of G.parts) {
    p.life -= dt;
    if (p.conf) { p.x += p.vx * dt + Math.sin(p.life * 3 + p.rot) * 30 * dt; p.y += p.vy * dt; p.rot += p.vr * dt; continue; }
    if (p.puff) { p.vx *= 1 - dt * 3; p.vy *= 1 - dt * 3; p.x += p.vx * dt; p.y += p.vy * dt; continue; }
    p.vy += 700 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
  }
  G.parts = G.parts.filter(p => p.life > 0);
  if (G.parts.length > 700) G.parts.splice(0, G.parts.length - 700);
  for (const f of G.floats) f.t += dt;
  G.floats = G.floats.filter(f => f.t < 1.1);
  for (const l of G.lights) l.life -= dt;
  G.lights = G.lights.filter(l => l.life > 0);
  for (const w of G.warns) w.t -= dt;
  G.warns = G.warns.filter(w => w.t > 0);
  if (G.banner) { G.banner.t -= dt; if (G.banner.t <= 0) G.banner = null; }
  G.alarm = Math.max(0, G.alarm - dt); G.flash = Math.max(0, G.flash - dt * 2.5);
  G.vidaBump = Math.max(0, G.vidaBump - dt * 4); G.coinBump = Math.max(0, G.coinBump - dt * 4);
  // Defne ipuçları
  if (G.tut && !G.tut.done) { /* öğretici konuşurken ipuçları bekler */ }
  else if (G.tip) { G.tip.t -= dt; if (G.tip.t <= 0) G.tip = null; }
  else if (G.tipQ.length) { const q = G.tipQ[0]; q.delay = (q.delay || 0) - dt; if (q.delay <= 0) { G.tip = G.tipQ.shift(); G.tip.max = G.tip.t; } }
}
function bossLogic(b, dt) {
  b.roar = Math.max(0, b.roar - dt * 2);
  if (b.u > COLS - 0.5) return;
  b.summonT -= dt;
  if (b.summonT <= 0) {
    b.summonT = b.hp < b.max / 2 ? 10 : 13;
    const n = b.hp < b.max / 2 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const r = clamp(b.r + [-2, 2, 0, -1, 1][i], 0, ROWS - 1);
      const m = spawnBug(['ant', 'ant', 'helmet', 'runner'][Math.floor(Math.random() * 4)], r);
      m.u = Math.min(spawnU(r), Math.max(b.u + 1.5, 7.2) + Math.random());
      puff(bugX(m), rowFoot(r) - 30, 'rgba(160,255,120,1)', 5, 22);
    }
    b.roar = 1; sfx.roar(); G.shake = Math.max(G.shake, 0.25);
    G.tipQ.push({ text: 'Kraliçe asker çağırdı!', t: 2.2 });
  }
  b.stompT -= dt;
  if (b.stompT <= 0) {
    b.stompT = 15;
    let hitAny = false;
    for (const u of G.units) {
      if (u.dead || u.k === 'cat' || Math.abs(u.r - b.r) > 1) continue;
      if (u.c + 0.5 >= b.u - 1.6 && u.c + 0.5 <= b.u + 0.2) { u.hp -= 200; u.flash = 0.3; hitAny = true; if (u.hp <= 0) { removeUnit(u); G.stats.lost++; burst(u.x, u.y - 40, '#f3d9a8', 12, 220); } }
    }
    const x = bugX(b) - cellW(b.r) * 0.6, y = rowFoot(b.r);
    ring(x, y, 20, 260, 'rgba(255,235,190,.9)', 0.5, 10); puff(x, y, 'rgba(220,200,170,1)', 10, 34);
    G.shake = Math.max(G.shake, 0.45); sfx.stomp(); vib(50);
    if (hitAny) G.tipQ.push({ text: 'Kraliçe yeri sarstı! Önündeki birimler hasar aldı.', t: 2.4 });
  }
}
function damageBug(b, dmg, slow) {
  b.flash = 0.1; b.hit = 1;
  if (b.armor > 0) {
    b.armor -= dmg;
    if (b.armor <= 0) {
      burst(bugX(b), rowFoot(b.r) - 90, BUGS[b.k].shield ? '#b5793a' : '#c8ced6', 12, 240, 6);
      floatText(bugX(b), rowFoot(b.r) - 120, BUGS[b.k].shield ? 'Kalkan kırıldı!' : 'Kask düştü!', '#fff6e2', 26);
      sfx.snap(); b.hp += b.armor; b.armor = 0;
    }
    if (!BUGS[b.k].shield && slow) b.slowT = slow;
  } else {
    b.hp -= dmg;
    if (slow && b.k !== 'queen') b.slowT = slow;
  }
  if (b.hp <= 0) killBug(b);
}
function killBug(b, silent) {
  if (b.dying) return;
  b.dying = 0.0001;
  const x = bugX(b), y = rowFoot(b.r);
  burst(x, y - 50, '#7dff5a', 10, 200, 5);
  burst(x, y - 40, '#2a2a2a', 8, 180, 5);
  puff(x, y - 30, 'rgba(190,255,160,1)', 6, 26);
  light(x, y - 40, 160, 0.4);
  if (!silent) sfx.crunch();
  if (b.k === 'queen') {
    G.boss = null; G.slowmo = 1.6; G.flash = 1; G.shake = 0.8; sfx.boom(); vib([80, 50, 120]);
    for (let i = 0; i < 6; i++) setTimeout(() => G && burst(x + Math.random() * 200 - 100, y - Math.random() * 200, ['#ffcf3a', '#7dff5a', '#ff6a2a'][i % 3], 20, 380, 8), i * 140);
    for (const o of G.bugs) if (o !== b && !o.dying) killBug(o, true);
    G.queue = []; G.waveIdx = G.L.waves.length;
    G.banner = { text: 'Kraliçe yenildi!', t: 3, big: true };
    for (let i = 0; i < 8; i++) dropCoin(x + Math.random() * 120 - 60, y - 100, y - 10 + Math.random() * 30);
    return;
  }
  if (Math.random() < (G.endless ? 0.05 : 0.08)) dropCoin(x, y - 60, y - 10);
  const remaining = G.bugs.filter(o => !o.dying).length;
  if (!G.endless && remaining === 0 && G.queue.length === 0 && G.waveIdx >= G.L.waves.length && G.bossSpawned) G.slowmo = 1.1;
}
function explode(u) {
  removeUnit(u);
  for (const b of G.bugs) {
    if (b.dying) continue;
    const rows = bugRows(b);
    if (rows.some(r => Math.abs(r - u.r) <= 1) && Math.abs(b.u - (u.c + 0.5)) <= 1.5 + (b.k === 'queen' ? 1 : 0)) {
      if (b.k === 'queen') damageBug(b, 700); else { b.armor = 0; damageBug(b, 1800); }
    }
  }
  burst(u.x, u.y - 40, '#ffcf3a', 30, 420, 9); burst(u.x, u.y - 40, '#ff6a2a', 24, 360, 8); burst(u.x, u.y - 40, '#555', 16, 300, 10);
  puff(u.x, u.y - 30, 'rgba(120,110,100,1)', 12, 46);
  ring(u.x, u.y - 30, 30, 330, 'rgba(255,220,120,.95)', 0.45, 12);
  light(u.x, u.y - 40, 420, 0.9);
  G.shake = 0.45; G.hitStop = 0.07; G.flash = 0.7; sfx.boom(); vib(60);
}
function collect(p) { if (p.collecting) return; p.collecting = 0.001; p.cx = p.x; p.cy = p.y; p.kind === 'coin' ? sfx.gold() : sfx.coin(); }

// ---------------------------------------------------------------------------
// Öğretici (1. bölüm). Duruma göre adım seçer; böcekler öğretici bitene kadar gelmez.
// ---------------------------------------------------------------------------
function tutorialUpdate() {
  const T = G.tut; if (!T || T.done) return;
  const tb = G.units.find(u => u.k === 'toolbox');
  const pistolPlaced = G.units.some(u => u.k === 'pistol');
  if (pistolPlaced) {
    T.done = true; T.target = null; T.text = null;
    G.tipQ.push({ text: 'Harika! İşte geliyorlar. Her sıraya bir Su Tabancası koy, Alet Çantalarıyla vida biriktir.', t: 6.5, delay: 0.3 });
    return;
  }
  if (tb && !T.forced) { T.forced = true; tb.prodT = 1.6; G.skyT = 4; }
  if (!tb) {
    if (G.selected === 0) { T.text = 'Şimdi halıda parlayan kareye dokun.'; T.target = { cell: [0, 2] }; }
    else { T.text = 'Böcekler gelmeden hazırlan! Önce Alet Çantası kartına dokun.'; T.target = { card: 0 }; }
  } else if (G.vida < UNITS.pistol.cost) {
    const p = G.pickups.find(p => !p.collecting && p.kind === 'screw');
    T.text = 'Alet Çantası vida üretir. Vidalara dokunup topla!';
    T.target = p ? { pt: [p.x, p.y] } : null;
  } else if (G.selected === 1) {
    T.text = 'Karıncalar bu sıradan gelecek. Su Tabancasını buraya koy.'; T.target = { cell: [1, 2] };
  } else {
    T.text = 'Yeterli vidan var. Su Tabancası kartını seç.'; T.target = { card: 1 };
  }
}

// ---------------------------------------------------------------------------
// Bitiş
// ---------------------------------------------------------------------------
function goalText(g) {
  switch (g.t) {
    case 'lost': return g.v === 0 ? 'Hiç birim kaybetme' : `En fazla ${g.v} birim kaybet`;
    case 'build': return `En fazla ${g.v} birim kur`;
    case 'bank': return `Bölümü ${g.v} vidayla bitir`;
    case 'shovel': return 'Kürek kullanma';
    case 'cathp': return 'Pamuk hiç ısırılmasın';
  }
  return '';
}
function goalMet(g) {
  switch (g.t) {
    case 'lost': return G.stats.lost <= g.v;
    case 'build': return G.stats.built <= g.v;
    case 'bank': return G.vida >= g.v;
    case 'shovel': return G.stats.shovel === 0;
    case 'cathp': return !!G.cat && G.cat.hp >= G.cat.max;
  }
  return false;
}
function win() {
  G.over = true; mode = 'end'; sfx.win(); setMusic(null); confetti(140); vib([30, 40, 30]);
  const L = G.L;
  let stars = 3, reward = 0, unlockHTML = '', goalsHTML = '';
  if (L.daily) {
    const first = !save.daily[L.key];
    save.daily[L.key] = 1;
    reward = G.coins + (first ? 100 : 15);
    $('win-title').textContent = 'Görev tamam!';
    $('win-text').textContent = first ? 'Bugünün görevini bitirdin. Yarın yeni bir görev seni bekliyor!' : 'Bugünkü görevi yine bitirdin.';
  } else {
    const met = (L.goals || []).map(goalMet);
    stars = 1 + met.filter(Boolean).length;
    const key = 'L' + G.li, prev = save.stars[key] || 0;
    reward = G.coins + 20 + 10 * stars + (prev === 0 ? 30 : 0);
    save.stars[key] = Math.max(prev, stars);
    save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, G.li + 2));
    goalsHTML = `<ul class="goals done"><li class="ok">Bölümü bitir</li>${(L.goals || []).map((g, i) => `<li class="${met[i] ? 'ok' : 'no'}">${goalText(g)}</li>`).join('')}</ul>`;
    $('win-title').textContent = G.li === LEVELS.length - 1 ? 'Çocuk Odası temizlendi!' : 'Oda temizlendi!';
    $('win-text').textContent = '';
    const unlock = L.unlock;
    if (unlock && prev === 0) unlockHTML = `<div class="unlock"><img src="assets/${UNITS[unlock].asset}.png" alt=""><span>Yeni plan açıldı:<b>${UNITS[unlock].name}</b></span></div>`;
    else if (G.li === LEVELS.length - 1) unlockHTML = `<div class="unlock"><span>${ROOM} tamamen senin!<b>Mutfak çok yakında.</b></span></div>`;
    else if (G.li === 1 && prev === 0) unlockHTML = `<div class="unlock"><img src="assets/icon_wrench.png" alt=""><span>Yeni:<b>Atölye açıldı</b></span></div>`;
    else if (G.li === 3 && prev === 0) unlockHTML = `<div class="unlock"><img src="assets/icon_map.png" alt=""><span>Yeni:<b>Günün Görevi açıldı</b></span></div>`;
    else if (G.li === 5 && prev === 0) unlockHTML = `<div class="unlock"><img src="assets/icon_trophy.png" alt=""><span>Yeni:<b>Sonsuz Baskın açıldı</b></span></div>`;
  }
  save.coins += reward;
  persist();
  $('win-stars').innerHTML = L.daily ? '' : starsHTML(stars, 'big');
  $('win-goals').innerHTML = goalsHTML;
  $('win-coins').innerHTML = `<img src="assets/item_coin.png" alt=""> +${reward}`;
  $('win-unlock').innerHTML = unlockHTML;
  $('btn-next').hidden = !!L.daily || G.li >= LEVELS.length - 1;
  setTimeout(() => show('scr-win'), 1300);
}
function lose(reason) {
  G.over = true; mode = 'end'; sfx.lose(); G.shake = 0.4; vib([80, 60, 120]); setMusic(null);
  let title = 'Böcekler Ege\'ye ulaştı!', text = 'Ege yorganın altına saklandı. Bir daha deneyelim mi?', hero = 'char_ege', reward = G.coins;
  if (reason === 'cat') { title = 'Pamuk korkup kaçtı!'; text = 'Böcekler Pamuk\'a ulaştı ve Pamuk dolabın üstüne kaçtı. Onu bir daha koruyalım mı?'; sfx.meow(); }
  if (G.endless) {
    const waves = Math.max(0, G.wave - 1);
    const best = waves > save.best;
    save.best = Math.max(save.best, waves);
    reward += waves * 5;
    title = `${waves} dalga dayandın!`;
    text = best ? 'Yeni rekor! Ailen seninle gurur duyuyor.' : `En iyi rekorun: ${save.best} dalga.`;
    hero = 'char_defne';
  }
  save.coins += reward; persist();
  $('lose-title').textContent = title; $('lose-text').textContent = text; $('lose-hero').src = `assets/${hero}.png`;
  $('lose-coins').innerHTML = reward ? `<img src="assets/item_coin.png" alt=""> +${reward}` : '';
  setTimeout(() => show('scr-lose'), 1000);
}

// ---------------------------------------------------------------------------
// HUD yerleşimi
// ---------------------------------------------------------------------------
const HUD = { x: 14, y: 10, cardX: 186, cardY: 16, cardW: 100, cardH: 150, gap: 10, screw: { x: 92, y: 66 }, coin: { x: W - 330, y: 70 } };
function cardRect(i) {
  const c = G.cards[i];
  return { x: c && c.belt ? c.x : HUD.cardX + i * (HUD.cardW + HUD.gap), y: HUD.cardY, w: HUD.cardW, h: HUD.cardH };
}
function shovelRect() { const n = G.belt ? BELT_MAX : G.cards.length; return { x: HUD.cardX + n * (HUD.cardW + HUD.gap) + 6, y: HUD.cardY + 24, w: 100, h: 100 }; }
const pauseRect = { x: W - 120, y: 22, w: 96, h: 96 };
const speedRect = { x: W - 228, y: 22, w: 96, h: 96 };
const inRect = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

// ---------------------------------------------------------------------------
// Girdi
// ---------------------------------------------------------------------------
function toLogical(e) {
  const rect = canvas.getBoundingClientRect();
  return { x: (e.clientX - rect.left) / rect.width * W, y: (e.clientY - rect.top) / rect.height * H };
}
function cellAt(x, y) {
  const r = Math.floor((y - RUG.top) / ROW_H);
  if (r < 0 || r >= ROWS) return null;
  const c = Math.floor((x - rowLeft(r)) / cellW(r));
  if (c < 0 || c >= COLS) return null;
  return { c, r };
}
canvas.addEventListener('pointerdown', e => {
  audio();
  if (mode !== 'play' || !G || G.over) return;
  const { x, y } = toLogical(e);
  pointer = { x, y, inside: true };
  if (inRect(x, y, pauseRect)) { pause(); return; }
  if (inRect(x, y, speedRect)) { speed = speed === 1 ? 2 : 1; sfx.click(); return; }
  for (let i = 0; i < G.cards.length; i++) {
    if (inRect(x, y, cardRect(i))) {
      const c = G.cards[i], d = UNITS[c.k];
      if (!c.belt && (c.cd > 0 || G.vida < d.cost)) { sfx.no(); return; }
      G.selected = G.selected === i ? null : i; G.shovel = false; sfx.click(); return;
    }
  }
  if (inRect(x, y, shovelRect())) { G.shovel = !G.shovel; G.selected = null; sfx.click(); return; }
  for (const p of G.pickups) {
    if (!p.collecting && Math.hypot(p.x - x, p.y - y) < 60) { collect(p); return; }
  }
  const cell = cellAt(x, y);
  if (!cell) { G.selected = null; G.shovel = false; return; }
  const { c, r } = cell;
  if (G.shovel) {
    const u = G.grid[r][c];
    if (u && u.k !== 'bomb' && u.k !== 'cat') { removeUnit(u); G.stats.shovel++; burst(u.x, u.y - 30, '#c99a5b', 8, 160); puff(u.x, u.y - 10, 'rgba(200,170,130,1)', 4, 20); tone(300, 0.1, 'triangle', 0.1, -150); }
    G.shovel = false; return;
  }
  if (G.selected != null) {
    const card = G.cards[G.selected], d = UNITS[card.k];
    if (G.grid[r][c]) { sfx.no(); return; }
    if (card.belt) {
      G.cards.splice(G.selected, 1);
    } else {
      if (G.vida < d.cost || card.cd > 0) { sfx.no(); G.selected = null; return; }
      G.vida -= d.cost; card.cd = stat(card.k).cd;
    }
    placeUnit(card.k, c, r); G.stats.built++;
    G.selected = null;
  }
});
canvas.addEventListener('pointermove', e => { const p = toLogical(e); pointer = { x: p.x, y: p.y, inside: true }; });
canvas.addEventListener('pointerleave', () => { pointer.inside = false; });
window.addEventListener('keydown', e => {
  if (mode === 'play' && (e.key === 'Escape' || e.key === 'p')) pause();
  else if (mode === 'pause' && (e.key === 'Escape' || e.key === 'p')) resume();
  if (mode === 'play' && G && /^[1-9]$/.test(e.key)) {
    const i = +e.key - 1; if (i < G.cards.length) { G.selected = G.selected === i ? null : i; G.shovel = false; }
  }
});

// ---------------------------------------------------------------------------
// Çizim yardımcıları
// ---------------------------------------------------------------------------
const INK = '#3a2414';
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
function fillStroke(fill, lw = 4, stroke = INK) { ctx.fillStyle = fill; ctx.fill(); if (lw) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); } }
function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }
function ellipse(x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); }
function font(size, weight = 700) { ctx.font = `${weight} ${size}px Fredoka, "Trebuchet MS", sans-serif`; }
function text(s, x, y, size, color = '#fff', align = 'center', stroke = INK, weight = 700) {
  font(size, weight);
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (stroke) { ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, size * 0.18); ctx.strokeStyle = stroke; ctx.strokeText(s, x, y); }
  ctx.fillStyle = color; ctx.fillText(s, x, y);
}
function wrapLines(s, maxW, size) {
  font(size, 600);
  const words = s.split(' '), lines = []; let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line);
  return lines;
}
const spriteKey = d => IMG[d.asset] ? d.asset : (d.fallback || d.asset);
function spriteSize(name, h, maxW) {
  const img = IMG[name]; if (!img) return [h * 0.7, h];
  let dh = h, dw = img.width * h / img.height;
  if (dw > maxW) { dh *= maxW / dw; dw = maxW; }
  return [dw, dh];
}
// Görseli ayak noktasına (x,y) göre, verilen yükseklikte çiz.
function drawSprite(name, x, y, h, opts = {}) {
  const img = IMG[name];
  ctx.save();
  ctx.translate(x, y);
  const sq = opts.squash || 0;
  ctx.scale((opts.flip ? -1 : 1) * (1 + sq * 0.12), 1 - sq * 0.12);
  if (opts.rot) ctx.rotate(opts.rot);
  if (opts.alpha != null) ctx.globalAlpha *= opts.alpha;
  if (img) {
    const [dw, dh] = spriteSize(name, h, opts.maxW || h * 1.6);
    ctx.drawImage(img, -dw / 2, -dh, dw, dh);
    if (opts.tint) { ctx.globalAlpha *= opts.tintA || 0.4; ctx.drawImage(tinted(name, opts.tint), -dw / 2, -dh, dw, dh); }
    if (opts.flash) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(0.55, opts.flash * 6); ctx.drawImage(img, -dw / 2, -dh, dw, dh); }
  } else {
    rr(-h * 0.35, -h, h * 0.7, h, 18); fillStroke(opts.placeholder || '#c99a5b', 4);
    if (opts.label) text(opts.label, 0, -h / 2, 16, '#fff');
  }
  ctx.restore();
}
const tintCache = {};
function tinted(name, color) {
  const key = name + color;
  if (tintCache[key]) return tintCache[key];
  const img = IMG[name]; if (!img) return null;
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'source-atop'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  return (tintCache[key] = c);
}
function arrow(x, y, dir = 1, s = 1, color = '#ffd23a') {
  // dir 1: aşağı bakar, -1: yukarı bakar
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s * dir);
  ctx.beginPath(); ctx.moveTo(-14, -50); ctx.lineTo(14, -50); ctx.lineTo(14, -22); ctx.lineTo(30, -22); ctx.lineTo(0, 6); ctx.lineTo(-30, -22); ctx.lineTo(-14, -22); ctx.closePath();
  ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Arka plan
// ---------------------------------------------------------------------------
let gridCache = null;
function drawBackground() {
  const bg = IMG.bg_01_kids_room;
  if (bg) ctx.drawImage(bg, 0, BG_OY, W, W * bg.height / bg.width);
  else { ctx.fillStyle = '#1d2a44'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#167d86'; ctx.fillRect(RUG.bl, RUG.top, RUG.br - RUG.bl, RUG.bottom - RUG.top); }
  if (!gridCache) {
    gridCache = document.createElement('canvas'); gridCache.width = W; gridCache.height = H;
    const g = gridCache.getContext('2d');
    for (let r = 0; r < ROWS; r++) {
      const y0 = rowTop(r), y1 = y0 + ROW_H;
      const [l0, r0] = edgeAt(y0), [l1, r1] = edgeAt(y1);
      for (let c = 0; c < COLS; c++) {
        if ((r + c) % 2) continue;
        const a = c / COLS, b = (c + 1) / COLS;
        g.beginPath();
        g.moveTo(lerp(l0, r0, a), y0); g.lineTo(lerp(l0, r0, b), y0);
        g.lineTo(lerp(l1, r1, b), y1); g.lineTo(lerp(l1, r1, a), y1); g.closePath();
        g.fillStyle = 'rgba(255,255,255,0.055)'; g.fill();
      }
    }
  }
  ctx.drawImage(gridCache, 0, 0);
}
function cellPath(c, r, inset = 4) {
  const y0 = rowTop(r) + inset, y1 = rowTop(r) + ROW_H - inset;
  const [l0, r0] = edgeAt(y0), [l1, r1] = edgeAt(y1);
  const a = c / COLS, b = (c + 1) / COLS;
  ctx.beginPath();
  ctx.moveTo(lerp(l0, r0, a) + inset, y0); ctx.lineTo(lerp(l0, r0, b) - inset, y0);
  ctx.lineTo(lerp(l1, r1, b) - inset, y1); ctx.lineTo(lerp(l1, r1, a) + inset, y1); ctx.closePath();
}

// ---------------------------------------------------------------------------
// Ana çizim
// ---------------------------------------------------------------------------
function render() {
  ctx.setTransform(pixelK, 0, 0, pixelK, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  if (G && G.shake > 0) { const s = G.shake * 18; ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s); }
  drawBackground();
  if (!G) { ctx.restore(); return; }

  // Ege — halının sol ucunda (böcek yaklaşınca titrer)
  const near = G.bugs.some(b => !b.dying && b.u < 1.5);
  drawSprite('char_ege', 92 + (near ? Math.sin(G.t * 40) * 2 : 0), 640, 200, { maxW: 120, placeholder: '#7ccf6a' });

  // seçim önizleme
  if (mode === 'play' && pointer.inside && (G.selected != null || G.shovel)) {
    const cell = cellAt(pointer.x, pointer.y);
    if (cell) {
      const { c, r } = cell;
      const u = G.grid[r][c];
      const ok = G.shovel ? !!u && u.k !== 'cat' && u.k !== 'bomb' : !u;
      cellPath(c, r, 5);
      ctx.fillStyle = ok ? 'rgba(255,255,255,.24)' : 'rgba(232,69,44,.30)'; ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = ok ? 'rgba(255,255,255,.6)' : 'rgba(232,69,44,.7)'; ctx.stroke();
      if (!G.shovel && ok && G.cards[G.selected]) {
        const d = UNITS[G.cards[G.selected].k];
        drawSprite(d.asset, uToX(c + 0.5, r), rowFoot(r), d.h * depth(r), { alpha: 0.5, maxW: d.maxW });
      }
    }
  }
  // öğretici kare vurgusu
  if (G.tut && !G.tut.done && G.tut.target && G.tut.target.cell) {
    const [c, r] = G.tut.target.cell;
    cellPath(c, r, 5); ctx.fillStyle = `rgba(255,214,60,${0.25 + 0.2 * Math.sin(G.t * 6)})`; ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = '#ffd23a'; ctx.stroke();
  }

  // şerit şerit: önce birimler sonra böcekler (alttaki şerit öndedir). Kraliçe orta şeritle çizilir.
  for (let r = 0; r < ROWS; r++) {
    for (const u of G.units) if (u.r === r) drawUnit(u);
    const rowBugs = G.bugs.filter(b => (b.k === 'queen' ? b.r + 1 : b.r) === r).sort((a, b) => b.u - a.u);
    for (const b of rowBugs) drawBug(b);
    for (const s of G.shots) if (s.r === r) drawShot(s);
  }

  // parçacıklar
  for (const p of G.parts) {
    const k = Math.max(0, p.life / p.max);
    if (p.ring) { ctx.globalAlpha = k; ctx.lineWidth = p.lw * k + 1; ctx.strokeStyle = p.color; circle(p.x, p.y, lerp(p.r0, p.r1, 1 - k * k)); ctx.stroke(); continue; }
    if (p.puff) { ctx.globalAlpha = k * 0.55; ctx.fillStyle = p.color; circle(p.x, p.y, p.r * (1.4 - k * 0.6)); ctx.fill(); continue; }
    if (p.conf) { ctx.globalAlpha = Math.min(1, p.life); ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color; ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); ctx.restore(); continue; }
    ctx.globalAlpha = k; ctx.fillStyle = p.color; circle(p.x, p.y, p.size); ctx.fill();
  }
  ctx.globalAlpha = 1;

  if (G.L.type === 'dark') drawDark();

  // yaklaşma uyarıları (şeridin sağ ucunda)
  for (const w of G.warns) {
    const a = Math.min(1, w.t * 2) * (0.6 + 0.4 * Math.sin(G.t * 12));
    ctx.save(); ctx.globalAlpha = a;
    const x = W - 46, y = rowMidY(w.r);
    ctx.translate(x + Math.sin(G.t * 10) * 6, y); ctx.rotate(Math.PI / 2);
    arrow(0, 22, 1, 0.8, '#ff5a3a');
    ctx.restore();
  }

  // vidalar ve altınlar
  for (const p of G.pickups) {
    const fade = p.life < 2 && !p.collecting ? (Math.sin(p.life * 20) > 0 ? 1 : 0.45) : 1;
    ctx.globalAlpha = fade;
    const pulse = 1 + Math.sin(G.t * 6 + p.x) * 0.05;
    const coin = p.kind === 'coin';
    const g = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, coin ? 34 : 46);
    g.addColorStop(0, 'rgba(255,226,120,.75)'); g.addColorStop(1, 'rgba(255,226,120,0)');
    ctx.fillStyle = g; circle(p.x, p.y, coin ? 34 : 46); ctx.fill();
    if (coin) drawSprite('item_coin', p.x, p.y + 22, 44 * pulse, { placeholder: '#ffcf3a' });
    else drawSprite('item_screw', p.x, p.y + 30 * pulse, 62 * pulse, { rot: -0.5, placeholder: '#e0a400' });
    ctx.globalAlpha = 1;
  }
  // öğretici işaretçisi (halı ve vidalar üstünde)
  if (G.tut && !G.tut.done && G.tut.target) drawTutPointer(G.tut.target);
  ctx.restore();

  // büyük dalga alarmı: kırmızı kenar
  if (G.alarm > 0) {
    const a = Math.min(1, G.alarm) * (0.35 + 0.25 * Math.sin(G.t * 10));
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.62);
    g.addColorStop(0, 'rgba(232,40,20,0)'); g.addColorStop(1, `rgba(232,40,20,${a})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  if (G.flash > 0) { ctx.fillStyle = `rgba(255,245,220,${G.flash * 0.55})`; ctx.fillRect(0, 0, W, H); }

  if (mode === 'menu') return;
  drawHUD();
  if (G.tut && !G.tut.done && G.tut.target && G.tut.target.card != null) drawTutPointer(G.tut.target);
  for (const f of G.floats) { ctx.globalAlpha = 1 - f.t / 1.1; text(f.text, f.x, f.y - f.t * 50, f.size, f.color); }
  ctx.globalAlpha = 1;
  if (G.tut && !G.tut.done && G.tut.text) drawTip(G.tut.text, 1);
  else if (G.tip) drawTip(G.tip.text, Math.min(1, G.tip.t * 3, (G.tip.max - G.tip.t) * 4));
  if (G.banner) {
    const k = G.banner.t;
    const s = 1 + Math.max(0, (k - (G.banner.big ? 2.3 : 1.9))) * 2;
    ctx.globalAlpha = Math.min(1, k * 2);
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(s, s);
    text(G.banner.text, 0, 0, G.banner.big ? 88 : 76, G.banner.big ? '#ff8a1f' : '#fff');
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}

function drawDark() {
  if (!drawDark.c) { drawDark.c = document.createElement('canvas'); drawDark.c.width = W / 2; drawDark.c.height = H / 2; }
  const m = drawDark.c, g = m.getContext('2d');
  g.setTransform(0.5, 0, 0, 0.5, 0, 0);
  g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, W, H);
  const grad = g.createLinearGradient(640, 0, 980, 0);
  grad.addColorStop(0, 'rgba(4,6,20,0)'); grad.addColorStop(1, 'rgba(4,6,20,0.95)');
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'destination-out';
  const hole = (x, y, r, a = 1) => { const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, `rgba(0,0,0,${a})`); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2); };
  for (const u of G.units) hole(u.x, u.y - 40, 120);
  for (const s of G.shots) hole(uToX(s.u, s.r), rowFoot(s.r) - s.yOff, 85, 0.9);
  for (const l of G.lights) hole(l.x, l.y, l.r, l.life / l.max);
  for (const b of G.bugs) if (b.flash > 0) hole(bugX(b), rowFoot(b.r) - 60, 90, 0.7);
  ctx.drawImage(m, 0, 0, W, H);
  // parlayan yeşil gözler
  for (const b of G.bugs) {
    if (b.dying) continue;
    const d = BUGS[b.k], k = depth(b.r);
    const [dw, dh] = spriteSize(spriteKey(d), d.h * k, (d.maxW || d.h * 1.4) * k);
    const x = bugX(b) - dw * 0.3, y = rowFoot(b.r) - dh * 0.62;
    const blink = Math.sin(b.t * 1.3) > 0.97 ? 0.15 : 1;
    ctx.save(); ctx.shadowColor = '#7dff5a'; ctx.shadowBlur = 16; ctx.fillStyle = `rgba(170,255,120,${0.9 * blink})`;
    ellipse(x, y, 6 * k, 4 * blink * k); ctx.fill(); ellipse(x + 16 * k, y - 2, 6 * k, 4 * blink * k); ctx.fill();
    ctx.restore();
  }
}

function drawCat(u) {
  const k = depth(u.r), x = u.x + (u.flash > 0 ? Math.sin(G.t * 60) * 3 : 0), y = u.y;
  ctx.fillStyle = 'rgba(10,20,30,.28)'; ellipse(x, y + 2, 44 * k, 10 * k); ctx.fill();
  if (IMG.char_pamuk) { drawSprite('char_pamuk', x, y, 100 * k, { flash: u.flash, maxW: 130 * k }); return; }
  // Yedek çizim: Pamuk (beyaz, tombul kedi)
  ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
  const breathe = 1 + Math.sin(G.t * 3) * 0.02;
  ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.lineJoin = 'round';
  // kuyruk
  ctx.beginPath(); ctx.moveTo(30, -18); ctx.quadraticCurveTo(70, -20 + Math.sin(G.t * 4) * 6, 58, -64); ctx.lineWidth = 14; ctx.stroke(); ctx.lineWidth = 8; ctx.strokeStyle = '#fbf6ee'; ctx.stroke();
  ctx.strokeStyle = INK; ctx.lineWidth = 5;
  // gövde
  ctx.save(); ctx.scale(breathe, 1 / breathe); ellipse(6, -30, 44, 32); ctx.restore(); fillStroke('#fbf6ee', 5);
  // kafa
  circle(-26, -68, 30); fillStroke('#fbf6ee', 5);
  // kulaklar
  for (const sx of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(-26 + sx * 8, -92); ctx.lineTo(-26 + sx * 26, -112); ctx.lineTo(-26 + sx * 26, -80); ctx.closePath(); fillStroke('#fbf6ee', 5);
    ctx.beginPath(); ctx.moveTo(-26 + sx * 13, -92); ctx.lineTo(-26 + sx * 22, -103); ctx.lineTo(-26 + sx * 22, -86); ctx.closePath(); ctx.fillStyle = '#ffb3c4'; ctx.fill();
  }
  // gözler (korkmuş, kocaman)
  const scared = G.bugs.some(b => !b.dying && b.r === u.r && b.u - u.c < 2.2 && b.u > u.c);
  for (const ex of [-38, -14]) { circle(ex, -70, scared ? 8 : 6); fillStroke('#fff', 3); circle(ex + 1, -69, scared ? 4 : 4); ctx.fillStyle = '#2a8a3a'; ctx.fill(); }
  ellipse(-26, -56, 4, 3); ctx.fillStyle = '#ff8fa8'; ctx.fill();
  ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-50, -58); ctx.lineTo(-66, -60); ctx.moveTo(-50, -54); ctx.lineTo(-66, -52); ctx.moveTo(-2, -58); ctx.lineTo(14, -60); ctx.moveTo(-2, -54); ctx.lineTo(14, -52); ctx.stroke();
  // pati
  ellipse(-24, -4, 12, 7); fillStroke('#fbf6ee', 4); ellipse(4, -4, 12, 7); fillStroke('#fbf6ee', 4);
  if (u.flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,120,120,.3)'; circle(-10, -50, 60); ctx.fill(); }
  ctx.restore();
  if (scared && Math.sin(G.t * 5) > 0) text('!', x - 26 * k, y - 130 * k, 40, '#ff6a2a');
}

function drawUnit(u) {
  if (u.k === 'cat') { drawCat(u); if (u.hp < u.max) healthBar(u.x, u.y + 8, u.hp / u.max, '#ff8fa8'); return; }
  const d = UNITS[u.k];
  const k = depth(u.r);
  const bob = u.k === 'trap' || u.k === 'bomb' ? 0 : Math.sin(u.t * 3 + u.c) * 0.035;
  const grow = elasticOut(Math.min(1, u.born * 2.6));
  const jx = u.flash > 0 ? Math.sin(u.t * 70) * 2.5 : 0;
  ctx.save(); ctx.translate(u.x + jx, u.y);
  ctx.fillStyle = 'rgba(10,20,30,.28)'; ellipse(0, 2, 46 * k, 11 * k); ctx.fill();
  ctx.scale(grow, grow);
  let alpha = 1;
  if (u.k === 'trap' && !u.armed) alpha = 0.55 + 0.25 * Math.sin(u.t * 6);
  if (u.k === 'bomb') { ctx.rotate(Math.sin(u.t * 40) * 0.06); const s = 1 + (1 - u.fuse / UNITS.bomb.fuse) * 0.25; ctx.scale(s, s); }
  drawSprite(d.asset, 0, 0, d.h * k, { squash: u.kick * 0.8 + bob, flash: u.flash + (u.k === 'bomb' && Math.sin(u.t * 30) > 0 ? 0.05 : 0), alpha, maxW: (d.maxW || d.h * 1.6) * k, label: d.name });
  ctx.restore();
  if (u.hp < u.max && u.k !== 'trap') healthBar(u.x, u.y + 8, u.hp / u.max, '#7dd35a');
  if (u.k === 'trap' && !u.armed) {
    const p = 1 - u.armT / stat('trap').arm;
    ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.arc(u.x, u.y - 78, 15, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#ffe08a'; ctx.beginPath(); ctx.arc(u.x, u.y - 78, 15, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2); ctx.stroke();
  }
}
function drawCrown(x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.rotate(-0.15);
  ctx.beginPath(); ctx.moveTo(-34, 0); ctx.lineTo(-38, -34); ctx.lineTo(-18, -16); ctx.lineTo(0, -44); ctx.lineTo(18, -16); ctx.lineTo(38, -34); ctx.lineTo(34, 0); ctx.closePath();
  ctx.fillStyle = '#ffcf3a'; ctx.fill(); ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.stroke();
  for (const [gx, gy, c] of [[0, -10, '#ff4fa3'], [-20, -6, '#2f8cff'], [20, -6, '#7dff5a']]) { circle(gx, gy, 5); fillStroke(c, 2); }
  ctx.restore();
}
function drawBug(b) {
  const d = BUGS[b.k];
  const k = depth(b.r) * (b.k === 'queen' ? depth(b.r + 1) / depth(b.r) : 1);
  const x = bugX(b) + b.hit * 7, y = b.k === 'queen' ? rowFoot(b.r + 1) - ROW_H * 0.55 : rowFoot(b.r);
  const key = spriteKey(d);
  const [dw, dh] = spriteSize(key, d.h * k, (d.maxW || d.h * 1.4) * k);
  const step = b.eating ? Math.abs(Math.sin(b.t * 14)) * 0.07 : Math.abs(Math.sin(b.t * (b.k === 'queen' ? 3 : 7))) * 0.05;
  const lean = b.eating ? Math.sin(b.t * 14) * 0.06 : Math.sin(b.t * 7) * 0.04;
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = 'rgba(10,20,30,.28)'; ellipse(4, 2, dw * 0.42, 10 * k * (b.k === 'queen' ? 2 : 1)); ctx.fill();
  if (b.dying) {
    // takla atıp sırt üstü düşer, sonra kaybolur
    const t = b.dying / 0.8;
    const hop = Math.sin(Math.min(1, t * 1.7) * Math.PI) * 46;
    ctx.globalAlpha = 1 - clamp((t - 0.55) / 0.45, 0, 1);
    ctx.translate(0, -hop - dh / 2); ctx.rotate(Math.min(1, t * 2.4) * Math.PI * b.flipDir); ctx.translate(0, dh / 2);
  } else ctx.rotate(lean);
  const sq = step + b.hit * 0.25 + (b.roar || 0) * 0.15;
  if (b.k === 'queen' && !IMG[d.asset]) {
    drawSprite(key, 0, -step * 30, d.h * k, { squash: sq, flash: b.flash, maxW: (d.maxW || d.h * 1.4) * k, tint: '#7b3fb8', tintA: 0.42 });
    drawCrown(-dw * 0.06, -dh * 0.84 - step * 30, k * 1.3);
  } else {
    drawSprite(key, 0, -step * 30, d.h * k, { squash: sq, flash: b.flash, maxW: (d.maxW || d.h * 1.4) * k, label: d.name, placeholder: '#333',
      tint: b.slowT > 0 ? '#9fe0ff' : null, tintA: 0.32 });
  }
  ctx.restore();
  if (!b.dying && b.k !== 'queen' && (b.hp + b.armor) < b.max) healthBar(x, y + 8, (b.hp + b.armor) / b.max, '#e8452c');
}
function drawShot(s) {
  const x = uToX(s.u, s.r), y = rowFoot(s.r) - s.yOff;
  ctx.save(); ctx.translate(x, y);
  if (s.k === 'freeze') ctx.rotate(s.spin);
  else ctx.rotate(-Math.PI / 2);
  if (IMG[s.img]) { const h = s.k === 'freeze' ? 34 : 30; const w = IMG[s.img].width * h / IMG[s.img].height; ctx.drawImage(IMG[s.img], -w / 2, -h / 2, w, h); }
  else { ellipse(0, 0, 12, 9); fillStroke('#4fb2ff', 3, '#1b5fae'); }
  ctx.restore();
}
function healthBar(x, y, k, color) {
  rr(x - 30, y, 60, 9, 4); fillStroke('rgba(0,0,0,.5)', 2);
  if (k > 0) { rr(x - 29, y + 1, 58 * Math.max(0, k), 7, 3); ctx.fillStyle = color; ctx.fill(); }
}
function drawTip(str, alpha) {
  if (alpha <= 0) return;
  const x0 = 470, w = 740, lines = wrapLines(str, w - 130, 23);
  const h = Math.max(84, 26 + lines.length * 28), y0 = H - h - 10;
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.translate(0, (1 - alpha) * 20);
  rr(x0, y0, w, h, 24); fillStroke('rgba(255,246,226,.97)', 4);
  // Defne portresi
  ctx.save(); circle(x0 + 52, y0 + h / 2, 40); fillStroke('#ffd23a', 4); circle(x0 + 52, y0 + h / 2, 37); ctx.clip();
  if (IMG.char_defne) { const img = IMG.char_defne, dwp = 170, dhp = img.height * dwp / img.width; ctx.drawImage(img, x0 + 52 - dwp * 0.5, y0 + h / 2 - dhp * 0.15 + 4, dwp, dhp); }
  ctx.restore();
  lines.forEach((l, i) => text(l, x0 + 108, y0 + h / 2 + (i - (lines.length - 1) / 2) * 28, 23, INK, 'left', null, 600));
  ctx.restore();
}
function drawTutPointer(t) {
  const bob = Math.sin(G.t * 7) * 10;
  if (t.card != null) {
    const r = cardRect(t.card);
    ctx.save(); ctx.shadowColor = '#ffd23a'; ctx.shadowBlur = 30; ctx.lineWidth = 6; ctx.strokeStyle = '#ffd23a';
    rr(r.x - 4, r.y - 4, r.w + 8, r.h + 8, 16); ctx.stroke(); ctx.restore();
    arrow(r.x + r.w / 2, r.y + r.h + 70 + bob, -1, 1);
  } else if (t.cell) {
    const [c, r] = t.cell;
    arrow(uToX(c + 0.5, r), rowTop(r) - 4 + bob, 1, 1);
  } else if (t.pt) {
    const [x, y] = t.pt;
    ctx.lineWidth = 5; ctx.strokeStyle = `rgba(255,214,60,${0.6 + 0.4 * Math.sin(G.t * 8)})`; circle(x, y, 52 + Math.sin(G.t * 8) * 6); ctx.stroke();
    arrow(x, y - 62 + bob, 1, 0.9);
  }
}

function drawHUD() {
  const n = G.belt ? BELT_MAX : G.cards.length;
  const panelW = HUD.cardX - HUD.x + n * (HUD.cardW + HUD.gap) + 120;
  rr(HUD.x, HUD.y, panelW, 166, 24); fillStroke('rgba(40,26,18,.78)', 0);
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,230,180,.25)'; ctx.stroke();
  // vida sayacı
  rr(28, 22, 144, 140, 20); fillStroke('rgba(255,246,226,.95)', 4);
  if (G.belt) {
    text('TREN', 100, 92, 34, '#3a2414', 'center', null);
    text('vida yok', 100, 128, 20, '#7a5a3a', 'center', null, 600);
  } else {
    drawSprite('item_screw', HUD.screw.x, HUD.screw.y + 34, 66 * (1 + G.vidaBump * 0.2), { rot: -0.4, placeholder: '#e0a400' });
    ctx.save(); ctx.translate(100, 132); ctx.scale(1 + G.vidaBump * 0.25, 1 + G.vidaBump * 0.25);
    text(String(G.vida), 0, 0, 40, G.vidaBump > 0.3 ? '#c98a00' : '#3a2414', 'center', null);
    ctx.restore();
  }
  // taşıma bandı
  if (G.belt) {
    const bx = HUD.cardX - 6, bw = BELT_MAX * (HUD.cardW + HUD.gap) + 2;
    ctx.save(); rr(bx, HUD.cardY + 112, bw, 42, 10); ctx.clip();
    ctx.fillStyle = '#4a4f5a'; ctx.fillRect(bx, HUD.cardY + 112, bw, 42);
    ctx.fillStyle = '#2f333b';
    for (let x = bx - 40 + (40 - G.beltOff); x < bx + bw; x += 40) ctx.fillRect(x, HUD.cardY + 112, 16, 42);
    ctx.restore();
  }
  // kartlar
  G.cards.forEach((c, i) => {
    const r = cardRect(i), d = UNITS[c.k];
    const can = c.belt || (G.vida >= d.cost && c.cd <= 0);
    const sel = G.selected === i;
    ctx.save();
    if (sel) ctx.translate(0, -8);
    if (IMG.ui_card_frame) ctx.drawImage(IMG.ui_card_frame, r.x, r.y, r.w, r.h);
    else { rr(r.x, r.y, r.w, r.h, 14); fillStroke('#2f6fb3', 4); }
    ctx.save(); rr(r.x + 8, r.y + 8, r.w - 16, r.h - 40, 8); ctx.clip();
    drawSprite(d.asset, r.x + r.w / 2, r.y + r.h - 42, 84, { maxW: 80 });
    ctx.restore();
    if (!c.belt) text(String(d.cost), r.x + r.w / 2, r.y + r.h - 19, 22, can || c.cd > 0 ? '#ffe08a' : '#ff8a7a', 'center', '#10243b', 700);
    else text('ÜCRETSİZ', r.x + r.w / 2, r.y + r.h - 19, 15, '#bfffa0', 'center', '#10243b', 700);
    if (!can) {
      ctx.fillStyle = 'rgba(20,14,30,.42)'; rr(r.x + 3, r.y + 3, r.w - 6, r.h - 6, 10); ctx.fill();
      if (c.cd > 0) { const k = c.cd / stat(c.k).cd; ctx.fillStyle = 'rgba(10,8,20,.45)'; ctx.fillRect(r.x + 5, r.y + 5, r.w - 10, (r.h - 10) * k); }
    }
    if (c.shine > 0) {
      ctx.save(); rr(r.x + 4, r.y + 4, r.w - 8, r.h - 8, 10); ctx.clip();
      const sx = lerp(r.x - 60, r.x + r.w + 60, 1 - c.shine);
      const g = ctx.createLinearGradient(sx - 30, r.y, sx + 30, r.y + 40);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,.65)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.restore();
    }
    if (sel) { ctx.lineWidth = 5; ctx.strokeStyle = '#ffd23a'; rr(r.x - 2, r.y - 2, r.w + 4, r.h + 4, 14); ctx.stroke(); }
    ctx.restore();
  });
  // kürek
  const s = shovelRect();
  rr(s.x, s.y, s.w, s.h, 22); fillStroke(G.shovel ? 'rgba(255,210,58,.95)' : 'rgba(255,246,226,.92)', 4);
  if (IMG.icon_shovel) { const h = 80, w = IMG.icon_shovel.width * h / IMG.icon_shovel.height; ctx.drawImage(IMG.icon_shovel, s.x + s.w / 2 - w / 2, s.y + 10, w, h); }

  // altın sayacı
  const cx = W - 420;
  rr(cx, 40, 170, 60, 30); fillStroke('rgba(40,26,18,.78)', 3, 'rgba(255,230,180,.35)');
  drawSprite('item_coin', cx + 32, 96, 52 * (1 + G.coinBump * 0.25), { placeholder: '#ffcf3a' });
  text(String(save.coins + G.coins), cx + 106, 71, 30, '#ffe08a');

  iconButton(speedRect, 'icon_fast', speed === 2);
  iconButton(pauseRect, 'icon_pause', false);
  if (speed === 2) text('2×', speedRect.x + speedRect.w - 6, speedRect.y + speedRect.h - 6, 26, '#fff');

  // alt: bölüm adı + dalga çubuğu / kraliçe can çubuğu
  const L = G.L;
  const label = L.endless ? `Sonsuz Baskın · Dalga ${G.wave}` : L.daily ? `Günün Görevi · ${L.modName}` : `${ROOM} ${G.li + 1} · ${L.name}`;
  text(label, 30, H - 34, 28, '#fff6e2', 'left');
  if (L.endless) { text(`Rekor: ${save.best}`, W - 30, H - 34, 28, '#ffe08a', 'right'); return; }
  if (G.boss) {
    const b = G.boss, bw = 520, bx = W - bw - 30, by = H - 58;
    text('Kraliçe Karınca', bx + bw / 2, by - 18, 24, '#e9c8ff');
    rr(bx, by, bw, 30, 15); fillStroke('rgba(20,10,30,.8)', 4);
    rr(bx + 4, by + 4, (bw - 8) * Math.max(0, b.hp / b.max), 22, 11); ctx.fillStyle = '#a24dff'; ctx.fill();
    return;
  }
  const bw = 340, bh = bw * (IMG.ui_wave_bar ? IMG.ui_wave_bar.height / IMG.ui_wave_bar.width : 0.22);
  const bx = W - bw - 20, by = H - bh - 2;
  const prog = Math.min(1, G.wt / G.lastSpawnT);
  const ix0 = bx + bw * 0.045, ix1 = bx + bw * 0.905, iy0 = by + bh * 0.33, iy1 = by + bh * 0.66;
  if (IMG.ui_wave_bar) ctx.drawImage(IMG.ui_wave_bar, bx, by, bw, bh);
  else { rr(bx, by, bw, bh, 12); fillStroke('#c8ced6', 4); }
  ctx.fillStyle = 'rgba(20,14,30,.55)'; ctx.fillRect(lerp(ix0, ix1, prog), iy0, ix1 - lerp(ix0, ix1, prog), iy1 - iy0);
  L.waves.forEach(w => {
    if (!w[2]) return;
    const fx = lerp(ix0, ix1, w[0] / G.lastSpawnT);
    ctx.fillStyle = '#3a2414'; ctx.fillRect(fx - 2, iy0 - 30, 4, 34);
    ctx.fillStyle = '#e8452c'; ctx.beginPath(); ctx.moveTo(fx + 2, iy0 - 30); ctx.lineTo(fx + 24, iy0 - 22); ctx.lineTo(fx + 2, iy0 - 14); ctx.fill();
  });
  if (L.bossAt) { const fx = lerp(ix0, ix1, L.bossAt / G.lastSpawnT); drawCrown(fx, iy0 - 6, 0.45); }
  drawSprite('bug_worker_ant', lerp(ix0, ix1, prog), iy1 + 4, 48, { maxW: 34 });
}
function iconButton(r, icon, active) {
  if (IMG[icon]) {
    ctx.save();
    if (active) { ctx.shadowColor = 'rgba(255,210,58,.9)'; ctx.shadowBlur = 24; }
    ctx.drawImage(IMG[icon], r.x, r.y, r.w, r.h);
    ctx.restore();
  } else { circle(r.x + r.w / 2, r.y + r.h / 2, r.w / 2); fillStroke('#2f8cff', 5); }
}

// ---------------------------------------------------------------------------
// Döngü
// ---------------------------------------------------------------------------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (G && G.shake > 0) G.shake = Math.max(0, G.shake - dt);
  if (mode === 'play' || mode === 'end') {
    const steps = mode === 'play' ? speed : 1;
    for (let i = 0; i < steps; i++) update(dt);
  } else if (mode === 'menu' && G) {
    G.t += dt;
    for (const u of G.units) u.t += dt;
    for (const b of G.bugs) { b.t += dt; b.u -= BUGS[b.k].speed * dt * 0.6; if (b.u < 3.5) b.u = COLS + 0.6; }
  }
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------------------------------------------------------------------------
// Ekranlar (HTML katmanları)
// ---------------------------------------------------------------------------
const screens = ['scr-title', 'scr-levels', 'scr-intro', 'scr-pause', 'scr-win', 'scr-lose', 'scr-settings', 'scr-shop', 'scr-book'];
const $ = id => document.getElementById(id);
let current = 'scr-title';
function show(id) {
  screens.forEach(s => $(s).hidden = s !== id); current = id;
  if (['scr-title', 'scr-levels', 'scr-shop', 'scr-book', 'scr-intro', 'scr-win', 'scr-lose'].includes(id) && mode !== 'end') setMusic('menu');
  if (id === 'scr-win' || id === 'scr-lose') setTimeout(() => { if (current === id) setMusic('menu'); }, 2500);
  updateCoinPills();
}
function hideAll() { screens.forEach(s => $(s).hidden = true); current = null; }
function starsHTML(n, cls = '') {
  let h = '';
  for (let i = 0; i < 3; i++) h += `<img class="star ${cls} ${i < n ? 'on' : 'off'}" src="assets/item_star_gold.png" alt="">`;
  return `<span class="stars" aria-label="${n} yıldız">${h}</span>`;
}
function updateCoinPills() { document.querySelectorAll('.coin-pill b').forEach(b => b.textContent = save.coins); }

function buildTitle() {
  const u = save.unlocked;
  const set = (id, need, label) => {
    const b = $(id), locked = u < need;
    b.classList.toggle('locked', locked);
    b.querySelector('small').textContent = locked ? label : b.dataset.label;
  };
  set('btn-shop', 3, '2. bölümü bitir');
  set('btn-daily', 5, '4. bölümü bitir');
  set('btn-endless', 7, '6. bölümü bitir');
  $('btn-daily').classList.toggle('badge', u >= 5 && !save.daily[todayKey()]);
}
function buildLevels() {
  const grid = $('level-grid'); grid.innerHTML = '';
  LEVELS.forEach((L, i) => {
    const locked = i + 1 > save.unlocked;
    const st = save.stars['L' + i] || 0;
    const b = document.createElement('button');
    b.className = 'lvl' + (locked ? ' locked' : '') + (L.tag ? ' special' : '');
    b.id = 'lvl-' + i;
    b.innerHTML = locked
      ? `<span class="n">${i + 1}</span><img class="lock" src="assets/icon_lock.png" alt="Kilitli"><span class="name">${L.name}</span>`
      : `<span class="n">${i + 1}</span>${L.tag ? `<span class="tag">${L.tag}</span>` : ''}<img class="thumb ${L.thumbCls || ''}" src="assets/${L.thumb}.png" alt=""><span class="name">${L.name}</span>${starsHTML(st)}`;
    b.onclick = () => { if (locked) { sfx.no(); return; } sfx.click(); openIntro({ kind: 'level', li: i }); };
    grid.appendChild(b);
  });
  const total = Object.values(save.stars).reduce((a, b) => a + b, 0);
  $('levels-stars').textContent = `${total} / ${LEVELS.length * 3}`;
}

// --- bölüm tanıtımı + plan seçimi
let pending = null, picked = [];
function levelDef(p) { return p.kind === 'endless' ? ENDLESS : p.kind === 'daily' ? dailyLevel() : LEVELS[p.li]; }
function openIntro(p) {
  const L = levelDef(p);
  pending = { ...p, L };
  $('intro-title').textContent = p.kind === 'level' ? `${ROOM} ${p.li + 1}: ${L.name}` : L.name;
  let story = L.intro || '';
  if (p.kind === 'endless') story = `Böcekler hiç durmadan geliyor. Kaç dalga dayanabilirsin? Rekorun: ${save.best} dalga. Her dalga 5 altın kazandırır.`;
  if (p.kind === 'daily') story = save.daily[L.key] ? 'Bugünkü görevi bitirdin! Yine oynayabilirsin, ama büyük ödül yarın.' : 'Her gün yeni bir görev! İlk bitirişinde 100 altın kazanırsın.';
  $('intro-text').textContent = story;
  $('intro-mod').hidden = !L.daily;
  if (L.daily) $('intro-mod').innerHTML = `<b>${L.modName}</b>${L.modDesc}`;
  const nu = p.kind === 'level' && p.li > 0 ? UNITS[LEVELS[p.li - 1].unlock] : null;
  $('intro-new').innerHTML = nu ? `<img src="assets/${nu.asset}.png" alt=""><span>Yeni:<b>${nu.name}</b></span>` : '';
  $('intro-new').hidden = !nu;
  $('intro-goals').innerHTML = p.kind === 'level' && L.goals ? `<li class="ok">Bölümü bitir</li>` + L.goals.map(g => `<li>${goalText(g)}</li>`).join('') : '';
  $('intro-goals').hidden = !(p.kind === 'level' && L.goals);
  // plan seçimi
  const ban = (L.mods && L.mods.ban) || [];
  const avail = availUnits().filter(k => !ban.includes(k));
  const slots = (L.mods && L.mods.slots) || L.slots || 6;
  pending.slots = slots;
  if (L.type === 'belt') { picked = []; $('picker').hidden = true; }
  else if (avail.length <= slots) { picked = avail; $('picker').hidden = true; }
  else {
    const prev = (save.loadout || []).filter(k => avail.includes(k));
    picked = prev.slice(0, slots);
    for (const k of avail) if (picked.length < slots && !picked.includes(k)) picked.push(k);
    $('picker').hidden = false;
    buildPicker(avail);
  }
  show('scr-intro');
}
function buildPicker(avail) {
  const box = $('picker-grid'); box.innerHTML = '';
  avail.forEach(k => {
    const d = UNITS[k], b = document.createElement('button');
    b.className = 'pick' + (picked.includes(k) ? ' on' : '');
    b.innerHTML = `<img src="assets/${d.asset}.png" alt=""><span>${d.cost}</span>`;
    b.title = d.name; b.setAttribute('aria-label', d.name); b.setAttribute('aria-pressed', picked.includes(k));
    b.onclick = () => {
      if (picked.includes(k)) picked = picked.filter(x => x !== k);
      else if (picked.length < pending.slots) picked.push(k);
      else { sfx.no(); return; }
      sfx.click(); buildPicker(avail);
    };
    box.appendChild(b);
  });
  $('picker-count').textContent = `Yanına alacağın planları seç: ${picked.length}/${pending.slots}`;
  $('btn-start').disabled = picked.length === 0;
}
function startPending() {
  if (!pending) return;
  if (!$('picker').hidden) { save.loadout = picked.slice(); persist(); }
  const order = UNIT_ORDER.filter(k => picked.includes(k));
  newGame(pending.L, order, pending.kind === 'level' ? pending.li : -1);
  G.pending = pending;
  speed = 1; mode = 'play'; hideAll();
  setMusic('battle');
}
function startLevel(i) { openIntro({ kind: 'level', li: i }); startPending(); }
function restart() { if (G && G.pending) { const p = G.pending; openIntro(p); startPending(); } }
function pause() { if (mode !== 'play') return; mode = 'pause'; applyVolumes(); show('scr-pause'); }
function resume() { mode = 'play'; hideAll(); last = performance.now(); applyVolumes(); }
function toMenu() { mode = 'menu'; demoScene(); buildLevels(); show('scr-levels'); }

// --- Atölye
function buildShop() {
  const grid = $('shop-grid'); grid.innerHTML = '';
  const avail = availUnits();
  UNIT_ORDER.forEach(k => {
    const d = UNITS[k], lv = uLv(k), have = avail.includes(k);
    const cost = UP_COST[lv];
    const el = document.createElement('div');
    el.className = 'shop-item' + (have ? '' : ' locked');
    const pips = [0, 1, 2].map(i => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
    el.innerHTML = `<img src="assets/${d.asset}.png" alt=""><h3>${have ? d.name : '???'}</h3><div class="pips">${pips}</div>
      <p>${have ? (lv < 3 ? d.up : 'En üst seviye!') : 'Bölümlerde açılır'}</p>`;
    if (have && lv < 3) {
      const b = document.createElement('button');
      b.className = 'btn small'; b.innerHTML = `<img src="assets/item_coin.png" alt=""> ${cost}`;
      b.disabled = save.coins < cost;
      b.onclick = () => { if (save.coins < cost) return; save.coins -= cost; save.up[k] = lv + 1; persist(); sfx.win(); buildShop(); updateCoinPills(); };
      el.appendChild(b);
    }
    grid.appendChild(el);
  });
}

// --- Böcek Kitabı
let bookTab = 'bugs', bookSel = 'ant';
function buildBook() {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.tab === bookTab));
  const grid = $('book-grid'); grid.innerHTML = '';
  const list = bookTab === 'bugs' ? BOOK_BUGS : UNIT_ORDER;
  const avail = availUnits();
  const known = k => bookTab === 'bugs' ? !!save.seen[k] : avail.includes(k);
  if (!list.includes(bookSel)) bookSel = list[0];
  list.forEach(k => {
    const d = bookTab === 'bugs' ? BUGS[k] : UNITS[k];
    const b = document.createElement('button');
    b.className = 'book-tile' + (known(k) ? '' : ' unknown') + (bookSel === k ? ' on' : '');
    b.innerHTML = `<img src="assets/${IMG[d.asset] ? d.asset : (d.fallback || d.asset)}.png" alt="" class="${k === 'queen' ? 'queen' : ''}">`;
    b.setAttribute('aria-label', known(k) ? d.name : 'Bilinmiyor');
    b.onclick = () => { bookSel = k; sfx.click(); buildBook(); };
    grid.appendChild(b);
  });
  const k = bookSel, d = bookTab === 'bugs' ? BUGS[k] : UNITS[k], kn = known(k);
  const det = $('book-detail');
  if (!kn) { det.innerHTML = `<h3>???</h3><p class="note">${bookTab === 'bugs' ? 'Bu böcekle henüz karşılaşmadın.' : 'Bu plan ilerleyen bölümlerde açılır.'}</p>`; return; }
  if (bookTab === 'bugs') {
    const spd = d.speed >= 0.2 ? 'Çok hızlı' : d.speed >= 0.13 ? 'Normal' : 'Yavaş';
    det.innerHTML = `<h3>${d.name}</h3><dl><dt>Can</dt><dd>${d.hp}</dd>${d.armor ? `<dt>${d.shield ? 'Kalkan' : 'Kask'}</dt><dd>${d.armor}</dd>` : ''}<dt>Hız</dt><dd>${spd}</dd></dl><p class="note"><b>Defne'nin notu:</b> ${d.tip}</p>`;
  } else {
    const lv = uLv(k);
    det.innerHTML = `<h3>${d.name}</h3><dl><dt>Bedel</dt><dd>${d.cost} vida</dd><dt>Seviye</dt><dd>${lv} / 3</dd>${d.dmg ? `<dt>Hasar</dt><dd>${Math.round(stat(k).dmg)}</dd>` : ''}</dl><p class="note">${d.desc}</p>`;
  }
}

// --- Ayarlar
let settingsBack = 'scr-title', resetArmed = false;
function openSettings(back) {
  settingsBack = back; resetArmed = false;
  $('set-music').value = Math.round(save.music * 100); $('set-sfx').value = Math.round(save.sfx * 100);
  $('set-vib').checked = save.vib; $('set-auto').checked = save.auto;
  $('btn-reset').textContent = 'İlerlemeyi sıfırla';
  show('scr-settings');
}
$('set-music').oninput = e => { save.music = e.target.value / 100; audio(); applyVolumes(); persist(); };
$('set-sfx').oninput = e => { save.sfx = e.target.value / 100; audio(); applyVolumes(); persist(); };
$('set-sfx').onchange = () => sfx.coin();
$('set-vib').onchange = e => { save.vib = e.target.checked; persist(); vib(30); };
$('set-auto').onchange = e => { save.auto = e.target.checked; persist(); };
$('btn-reset').onclick = () => {
  if (!resetArmed) { resetArmed = true; $('btn-reset').textContent = 'Emin misin? Tekrar dokun'; sfx.no(); return; }
  Object.assign(save, { unlocked: 1, stars: {}, coins: 0, up: {}, seen: {}, loadout: null, best: 0, daily: {} }); persist();
  resetArmed = false; $('btn-reset').textContent = 'Sıfırlandı'; buildTitle();
};
$('btn-settings-back').onclick = () => { sfx.click(); if (settingsBack === 'scr-pause') show('scr-pause'); else { buildTitle(); show(settingsBack); } };

// --- düğmeler
const go = (id, fn) => { $(id).onclick = () => { audio(); sfx.click(); fn(); }; };
go('btn-play', () => { buildLevels(); show('scr-levels'); });
go('btn-levels-back', () => { buildTitle(); show('scr-title'); });
$('btn-start').onclick = () => { audio(); sfx.click(); startPending(); };
go('btn-intro-back', () => { if (pending && pending.kind === 'level') { buildLevels(); show('scr-levels'); } else { buildTitle(); show('scr-title'); } });
go('btn-resume', resume);
go('btn-restart', restart);
go('btn-pause-levels', () => G && G.pending && G.pending.kind !== 'level' ? (mode = 'menu', demoScene(), buildTitle(), show('scr-title')) : toMenu());
go('btn-pause-settings', () => openSettings('scr-pause'));
go('btn-next', () => openIntro({ kind: 'level', li: Math.min(LEVELS.length - 1, G.li + 1) }));
go('btn-win-levels', () => G.L.daily ? (mode = 'menu', demoScene(), buildTitle(), show('scr-title')) : toMenu());
go('btn-retry', restart);
go('btn-lose-levels', () => G.pending && G.pending.kind !== 'level' ? (mode = 'menu', demoScene(), buildTitle(), show('scr-title')) : toMenu());
go('btn-settings', () => openSettings('scr-title'));
go('btn-shop', () => { if (save.unlocked < 3) { sfx.no(); return; } buildShop(); show('scr-shop'); });
go('btn-book', () => { buildBook(); show('scr-book'); });
go('btn-daily', () => { if (save.unlocked < 5) { sfx.no(); return; } openIntro({ kind: 'daily' }); });
go('btn-endless', () => { if (save.unlocked < 7) { sfx.no(); return; } openIntro({ kind: 'endless' }); });
go('btn-shop-back', () => { buildTitle(); show('scr-title'); });
go('btn-book-back', () => { buildTitle(); show('scr-title'); });
document.querySelectorAll('.tab').forEach(t => t.onclick = () => { sfx.click(); bookTab = t.dataset.tab; buildBook(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (mode === 'play') pause(); if (ac) ac.suspend(); }
  else if (ac) ac.resume();
});
// ilk dokunuşta müziği başlat (tarayıcılar sesi kullanıcı etkileşimi olmadan açmaz)
window.addEventListener('pointerdown', function first() { audio(); if (!mus.track && mode === 'menu') setMusic('menu'); else if (mus.track) { const t = mus.track; mus.track = null; setMusic(t); } window.removeEventListener('pointerdown', first); }, { once: true });

// Menü arkasında canlı sahne
function demoScene() {
  newGame(LEVELS[2], ['toolbox'], -1); G.banner = null; G.tut = null; G.tipQ = []; mode = 'menu';
  [[1, 1, 'pistol'], [0, 2, 'toolbox'], [2, 3, 'barricade'], [1, 3, 'freeze'], [0, 0, 'toolbox']].forEach(([c, r, k]) => {
    const d = UNITS[k]; const u = { k, c, r, x: uToX(c + 0.5, r), y: rowFoot(r), hp: d.hp, max: d.hp, t: Math.random() * 3, armed: true, kick: 0, flash: 0, born: 1 };
    G.units.push(u); G.grid[r][c] = u;
  });
  const seen = save.seen; save.seen = { ant: 1, helmet: 1, runner: 1, shield: 1, weevil: 1 };
  ['ant', 'helmet', 'runner', 'shield', 'weevil'].forEach((k, i) => { const b = spawnBug(k, [1, 3, 4, 0, 2][i]); b.u = 5 + i * 0.8; });
  save.seen = seen;
}
demoScene();
buildTitle(); updateCoinPills();
assetsReady.then(() => { document.body.classList.add('ready'); });

// geliştirme kolaylığı
window.RAID = { LEVELS, UNITS, BUGS, save, get G() { return G; }, startLevel, openIntro, startPending, persist,
  place: (k, c, r) => placeUnit(k, c, r), sim(sec) { for (let i = 0; i < sec * 30 && !G.over; i++) update(1 / 30); } };
})();
