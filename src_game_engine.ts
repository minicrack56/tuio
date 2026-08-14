--- src/game/engine.ts (原始)
import { sfx } from './audio';
import { genProblem, AMMO_REWARD } from './math';
import type { Difficulty, Problem } from './math';
import { render } from './render';

export type Mode = 'menu' | 'playing' | 'over';
export type ZombieKind = 'walker' | 'runner' | 'brute' | 'goldling';

export type PickupKind = 'ammo' | 'repair' | 'fire';
export interface Pickup {
  id: number;
  kind: PickupKind;
  x: number; y: number;
  t: number; life: number;
  amt: number;
}

export interface Zombie {
  id: number;
  kind: ZombieKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  scale: number;
  phase: number;
  hitT: number;
  dead: boolean;
  deathT: number;
  attacking: boolean;
  lungeT: number;
  biteT: number;
  shirt: number;
}

export interface Particle {
  kind: 'blood' | 'spark' | 'casing' | 'puff' | 'chunk';
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  size: number;
  rot: number; vr: number;
  color: string;
}

export interface FloatText {
  x: number; y: number;
  text: string;
  color: string;
  t: number;
  life: number;
  size: number;
}

export interface Feedback { id: number; kind: 'good' | 'bad' | 'info'; text: string; }
export interface Banner { id: number; title: string; sub: string; }

export interface HudSnapshot {
  mode: Mode;
  paused: boolean;
  ammo: number;
  score: number;
  best: number;
  wave: number;
  waveKills: number;
  waveTarget: number;
  hp: number;
  streak: number;
  problem: Problem;
  input: string;
  feedback: Feedback | null;
  banner: Banner | null;
  intermission: boolean;
  hint: HintMsg | null;
  buffT: number;
}

export interface GameStats {
  score: number;
  best: number;
  newBest: boolean;
  wave: number;
  kills: number;
  shots: number;
  hits: number;
  headshots: number;
  correct: number;
  wrong: number;
  bestStreak: number;
  timeSec: number;
  pickups: number;
}

export interface HintMsg {
  id: number;
  kind: 'tip' | 'warn';
  text: string;
}

export const TIP_POOL: string[] = [
  'Headshots deal 2x damage and pay 1.5x points.',
  'Wrong answers drain rounds by the difference. Wild guesses are expensive.',
  'Every 3 correct answers in a row banks +2 bonus rounds.',
  'Runners sprint — drop them before they reach the palisade.',
  'Brutes shrug off body shots. Put two in the skull.',
  'One round, one corpse — make every trigger pull count.',
  'Survive the wave for a supply drop: +3 rounds and +10 palisade repair.',
  'Harder difficulty loads fewer rounds per answer. Solve faster.',
  'Solve between shots. Never let both crises stack at once.',
  'The keypad takes 0-9, Backspace and Enter. Keep your left hand on the keys.',
  'A clear mind reloads — P pauses the horde.',
  'The uplink never runs dry. Only you do.',
  'Downed foes sometimes drop crates — click them before they blink out.',
  'Incendiary crates double your shot damage for 8 seconds. Spend them fast.',
  'A gilded crawler may sprint across the field — +500 and +5 rounds if you drop it.',
  'Answer within 5 seconds and the uplink pays a +25 quick-solve bonus.',
  'No math misses and no bites all wave? Flawless clear pays +500.',
  'Chain kills inside 1.6 seconds for double and triple kill bonuses.',
];

interface Callbacks {
  onHud: (h: HudSnapshot) => void;
  onGameOver: (s: GameStats) => void;
}

const BEST_KEY = 'dead-reckoning-best';

const DIFF_CONF = {
  easy:   { startAmmo: 14, target0: 5, targetInc: 2, spawn0: 2.5, spawnMin: 1.0,  cap: 9,  runnerWave: 2, bruteWave: 3 },
  normal: { startAmmo: 12, target0: 6, targetInc: 2, spawn0: 2.05, spawnMin: 0.85, cap: 12, runnerWave: 1, bruteWave: 2 },
  hard:   { startAmmo: 10, target0: 7, targetInc: 3, spawn0: 1.65, spawnMin: 0.65, cap: 14, runnerWave: 1, bruteWave: 2 },
} as const;

const KIND_STATS: Record<ZombieKind, { hp: number; dps: number; score: number; baseH: number }> = {
  walker: { hp: 2, dps: 7,  score: 100, baseH: 108 },
  runner: { hp: 1, dps: 5,  score: 150, baseH: 92 },
  brute:  { hp: 6, dps: 14, score: 400, baseH: 148 },
  goldling: { hp: 1, dps: 0, score: 500, baseH: 78 },
};

let zid = 1;

export class Game {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  cb: Callbacks;

  W = 0; H = 0; dpr = 1;
  mode: Mode = 'menu';
  paused = false;
  difficulty: Difficulty = 'normal';

  t = 0;
  aim = { x: 0, y: 0 };
  aimOnZombie = false;
  recoil = 0;
  flashT = 0;
  hitmarkerT = 0;
  shake = 0;
  dmgFlash = 0;

  ammo = 12;
  score = 0;
  best = 0;
  wave = 1;
  waveKills = 0;
  waveTarget = 6;
  hp = 100;
  streak = 0;
  bestStreak = 0;
  intermission = false;
  private interT = 0;

  problem: Problem = { text: '7 + 5', answer: 12 };
  input = '';
  feedback: Feedback | null = null;
  banner: Banner | null = null;
  private fid = 0;

  hint: HintMsg | null = null;
  private hintLife = 0;
  private hintTimer = 6.5;
  private hintSeen: Record<string, number> = {};
  private lastTip = '';

  zombies: Zombie[] = [];
  particles: Particle[] = [];
  texts: FloatText[] = [];
  pickups: Pickup[] = [];
  fireT = 0;
  private goldT = 18;
  private killTimes: number[] = [];
  private problemT = -99;
  private waveWrong = 0;
  private waveHurt = false;
  private pickupsGot = 0;

  stars: { x: number; y: number; r: number; p: number }[] = [];
  graves: { x: number; y: number; w: number; h: number; type: number; tilt: number }[] = [];
  tufts: { x: number; y: number }[] = [];
  vignette: CanvasGradient | null = null;

  private spawnT = 1.2;
  private spawnInterval = 2.2;
  private lastShot = -1;
  private moanT = 3;
  private raf = 0;
  private last = 0;
  private startTime = 0;
  private lastHudJson = '';

  // run stats
  private shots = 0; private hits = 0; private headshots = 0;
  private correct = 0; private wrong = 0; private kills = 0;

  constructor(canvas: HTMLCanvasElement, cb: Callbacks) {
    this.canvas = canvas;
    this.cb = cb;
    const c = canvas.getContext('2d');
    if (!c) throw new Error('no 2d context');
    this.ctx = c;
    this.best = Number(localStorage.getItem(BEST_KEY) ?? 0) || 0;

    this.onResize = this.onResize.bind(this);
    this.onMove = this.onMove.bind(this);
    this.onDown = this.onDown.bind(this);
    this.loop = this.loop.bind(this);

    window.addEventListener('resize', this.onResize);
    canvas.addEventListener('mousemove', this.onMove);
    canvas.addEventListener('mousedown', this.onDown);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.onResize();
    this.aim = { x: this.W * 0.6, y: this.H * 0.55 };
    this.setMode('menu');
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.canvas.removeEventListener('mousemove', this.onMove);
    this.canvas.removeEventListener('mousedown', this.onDown);
  }

  // ---------------------------------------------------------------- geometry
  get barricadeX(): number {
    return Math.max(86, Math.min(170, this.W * 0.105));
  }
  get horizonY(): number { return this.H * 0.52; }
  groundScale(y: number): number {
    const a = (y - this.horizonY) / (this.H * 0.96 - this.horizonY);
    return 0.58 + Math.max(0, Math.min(1, a)) * 0.6;
  }
  playerHead(): { x: number; y: number } {
    return { x: this.barricadeX + 30, y: this.H * 0.565 };
  }
  muzzlePoint(): { x: number; y: number } {
    const p = this.playerHead();
    const dx = this.aim.x - p.x, dy = this.aim.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / len) * 52, y: p.y + 6 + (dy / len) * 52 };
  }

  // ---------------------------------------------------------------- lifecycle
  setMode(m: Mode): void {
    this.mode = m;
    this.zombies = [];
    this.particles = [];
    this.texts = [];
    this.pickups = [];
    this.paused = false;
    if (m === 'menu') {
      this.spawnT = 0.4;
      this.hp = 100;
    }
    this.syncHud(true);
  }

  start(d: Difficulty): void {
    const conf = DIFF_CONF[d];
    this.difficulty = d;
    this.mode = 'playing';
    this.paused = false;
    this.zombies = [];
    this.particles = [];
    this.texts = [];
    this.pickups = [];
    this.ammo = conf.startAmmo;
    this.score = 0;
    this.wave = 1;
    this.waveKills = 0;
    this.waveTarget = conf.target0;
    this.hp = 100;
    this.streak = 0;
    this.bestStreak = 0;
    this.intermission = false;
    this.interT = 0;
    this.spawnInterval = conf.spawn0;
    this.spawnT = 2.2;
    this.shake = 0;
    this.dmgFlash = 0;
    this.recoil = 0;
    this.flashT = 0;
    this.hitmarkerT = 0;
    this.lastShot = -1;
    this.shots = 0; this.hits = 0; this.headshots = 0;
    this.correct = 0; this.wrong = 0; this.kills = 0;
    this.startTime = this.t;
    this.problem = genProblem(d);
    this.input = '';
    this.feedback = null;
    this.hint = null;
    this.hintLife = 0;
    this.hintTimer = 6.5;
    this.hintSeen = {};
    this.lastTip = '';
    this.fireT = 0;
    this.goldT = 18;
    this.killTimes = [];
    this.waveWrong = 0;
    this.waveHurt = false;
    this.pickupsGot = 0;
    this.problemT = this.t;
    this.banner = { id: ++this.fid, title: 'WAVE 1', sub: 'HOLD THE PALISADE' };
    sfx.wave();
    this.syncHud(true);
  }

  togglePause(): void {
    if (this.mode !== 'playing') return;
    this.paused = !this.paused;
    sfx.click();
    this.syncHud(true);
  }

  quitToMenu(): void {
    this.setMode('menu');
  }

  private gameOver(): void {
    this.mode = 'over';
    sfx.breach();
    const newBest = this.score > this.best;
    if (newBest) {
      this.best = this.score;
      localStorage.setItem(BEST_KEY, String(this.best));
    }
    this.syncHud(true);
    this.cb.onGameOver({
      score: this.score,
      best: this.best,
      newBest,
      wave: this.wave,
      kills: this.kills,
      shots: this.shots,
      hits: this.hits,
      headshots: this.headshots,
      correct: this.correct,
      wrong: this.wrong,
      bestStreak: this.bestStreak,
      timeSec: Math.max(0, this.t - this.startTime),
      pickups: this.pickupsGot,
    });
  }

  // ---------------------------------------------------------------- input
  private onResize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.canvas.width = Math.floor(this.W * this.dpr);
    this.canvas.height = Math.floor(this.H * this.dpr);
    this.canvas.style.width = `${this.W}px`;
    this.canvas.style.height = `${this.H}px`;

    this.stars = [];
    const nStars = Math.floor((this.W * this.H) / 9000);
    for (let i = 0; i < nStars; i++) {
      this.stars.push({ x: Math.random() * this.W, y: Math.random() * this.horizonY * 0.9, r: Math.random() * 1.3 + 0.3, p: Math.random() * 7 });
    }
    this.graves = [];
    const nG = Math.max(5, Math.floor(this.W / 190));
    for (let i = 0; i < nG; i++) {
      this.graves.push({
        x: this.W * 0.18 + Math.random() * this.W * 0.8,
        y: this.horizonY + 8 + Math.random() * this.H * 0.12,
        w: 22 + Math.random() * 16,
        h: 30 + Math.random() * 22,
        type: Math.floor(Math.random() * 3),
        tilt: (Math.random() - 0.5) * 0.24,
      });
    }
    this.tufts = [];
    const nT = Math.floor(this.W / 46);
    for (let i = 0; i < nT; i++) {
      this.tufts.push({ x: Math.random() * this.W, y: this.horizonY + Math.random() * (this.H - this.horizonY) });
    }
    const v = this.ctx.createRadialGradient(
      this.W / 2, this.H * 0.46, Math.min(this.W, this.H) * 0.36,
      this.W / 2, this.H * 0.52, Math.max(this.W, this.H) * 0.74,
    );
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.55)');
    this.vignette = v;
  }

  private onMove(e: MouseEvent): void {
    this.aim.x = e.clientX;
    this.aim.y = e.clientY;
  }

  private onDown(e: MouseEvent): void {
    if (e.button !== 0) return;
    this.shoot(e.clientX, e.clientY);
  }

  pressDigit(d: string): void {
    if (this.mode !== 'playing' || this.paused) return;
    if (this.input.length >= 3) return;
    this.input += d;
    this.syncHud();
  }

  pressBack(): void {
    if (this.mode !== 'playing' || this.paused) return;
    this.input = this.input.slice(0, -1);
    this.syncHud();
  }

  submitAnswer(): void {
    if (this.mode !== 'playing' || this.paused || this.input === '') return;
    const val = parseInt(this.input, 10);
    const answer = this.problem.answer;
    this.input = '';

    if (val === answer) {
      const base = AMMO_REWARD[this.difficulty];
      let gain = base;
      this.streak += 1;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
      this.correct += 1;
      this.score += 50 + 10 * (this.streak - 1);
      const fast = this.t - this.problemT <= 5;
      if (fast) this.score += 25;
      const fastTag = fast ? '  ·  FAST +25' : '';
      let msg = `CORRECT  +${gain} ROUNDS${fastTag}`;
      if (this.streak > 0 && this.streak % 3 === 0) {
        gain += 2;
        msg = `STREAK ×${this.streak}  +${gain} ROUNDS${fastTag}`;
        sfx.streak();
      } else {
        sfx.correct();
      }
      this.ammo = Math.min(99, this.ammo + gain);
      this.setFeedback('good', msg);
      this.spawnText(this.playerHead().x + 40, this.playerHead().y - 30, `+${gain} AMMO`, '#8dff3c', 17);
    } else {
      const diff = Math.abs(answer - val);
      const loss = Math.min(this.ammo, diff);
      this.ammo -= loss;
      this.streak = 0;
      this.wrong += 1;
      this.waveWrong += 1;
      this.shake = Math.max(this.shake, 7);
      this.dmgFlash = Math.max(this.dmgFlash, 0.5);
      sfx.wrong();
      this.setFeedback('bad', `WRONG — ANSWER ${answer}, LOST ${loss} ROUND${loss === 1 ? '' : 'S'}`);
      this.spawnText(this.playerHead().x + 40, this.playerHead().y - 30, `−${loss} AMMO`, '#ff2438', 17);
      if (this.wrong === 1) {
        this.setHint('That miss cost you rounds — count twice, submit once.', 'warn', 'firstWrong');
      }
      if (this.ammo === 0) {
        this.setHint('The math drained your last round. Solve to rearm.', 'warn', 'dry0');
      }
    }
    this.problem = genProblem(this.difficulty);
    this.problemT = this.t;
    this.syncHud(true);
  }

  private setFeedback(kind: Feedback['kind'], text: string): void {
    this.feedback = { id: ++this.fid, kind, text };
  }

  // ---------------------------------------------------------------- shooting
  shoot(x: number, y: number): void {
    if (this.mode !== 'playing' || this.paused) return;
    if (this.t - this.lastShot < 0.09) return;

    // supply crates — click to grab, no round spent
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const c = this.pickups[i];
      if (Math.hypot(x - c.x, y - (c.y - 20)) < 34) {
        this.collectPickup(i);
        this.syncHud(true);
        return;
      }
    }

    if (this.ammo <= 0) {
      this.lastShot = this.t;
      sfx.dry();
      this.setFeedback('bad', 'CHAMBER EMPTY — SOLVE TO REARM');
      this.setHint('Chamber empty — solve the uplink to rearm.', 'warn', 'dry');
      this.syncHud(true);
      return;
    }

    this.lastShot = this.t;
    this.ammo -= 1;
    this.shots += 1;
    if (this.ammo === 0) {
      this.setHint('Last round spent — the uplink is your only reload now.', 'warn', 'dry0');
    }
    this.recoil = 1;
    this.flashT = 0.06;
    this.shake = Math.max(this.shake, 4);
    sfx.shot();

    const m = this.muzzlePoint();
    this.particles.push({
      kind: 'casing', x: m.x, y: m.y, vx: 120 + Math.random() * 80, vy: -160 - Math.random() * 80,
      life: 0, maxLife: 0.9, size: 3.4, rot: Math.random() * 6, vr: 14, color: '#d8a84a',
    });

    // hit test — front (lowest / closest) zombies first
    const sorted = [...this.zombies].filter((z) => !z.dead).sort((a, b) => b.y - a.y);
    let struck = false;
    for (const z of sorted) {
      const s = z.scale;
      const h = KIND_STATS[z.kind].baseH * s;
      const w = h * (z.kind === 'brute' ? 0.42 : 0.3);
      const top = z.y - h * 1.04;
      const headBottom = top + h * 0.3;
      const inX = x >= z.x - w * 0.75 && x <= z.x + w * 0.75;
      const inY = y >= top - 6 && y <= z.y + 4;
      if (!inX || !inY) continue;
      struck = true;
      const head = y <= headBottom;
      const dmg = (head ? 2 : 1) + (this.fireT > 0 ? 1 : 0);
      z.hp -= dmg;
      z.hitT = 0.14;
      z.x += 7;
      this.hits += 1;
      if (head) this.headshots += 1;
      this.hitmarkerT = 0.13;
      this.bloodBurst(x, y, head ? 16 : 9);
      sfx.hit();

      if (z.hp <= 0) {
        z.dead = true;
        z.deathT = 0;
        this.kills += 1;
        this.waveKills += 1;
        if (this.kills === 1) {
          this.setHint('First kill. Headshots deal 2x damage and pay 1.5x points.', 'tip', 'firstKill');
        }
        // kill combo
        this.killTimes.push(this.t);
        this.killTimes = this.killTimes.filter((kt) => this.t - kt <= 1.6);
        if (this.killTimes.length === 2) {
          this.score += 150;
          this.spawnText(z.x, top - 36, 'DOUBLE KILL +150', '#ffb03a', 15);
        } else if (this.killTimes.length === 3) {
          this.score += 400;
          this.spawnText(z.x, top - 36, 'TRIPLE KILL +400', '#ffb03a', 17);
          sfx.streak();
        }
        const pts = Math.round(KIND_STATS[z.kind].score * (head ? 1.5 : 1));
        this.score += pts;
        this.bloodBurst(z.x, z.y - h * 0.5, z.kind === 'goldling' ? 14 : 26);
        this.spawnText(z.x, top - 14, head ? `HEADSHOT +${pts}` : `+${pts}`, head ? '#ffb03a' : '#e8e2cf', head ? 18 : 15);
        // loot drop
        const dropChance = z.kind === 'goldling' ? 1 : z.kind === 'brute' ? 0.3 : 0.12;
        if (Math.random() < dropChance) {
          this.dropPickup(z.x, z.y, z.kind === 'goldling' ? 'ammo' : undefined, z.kind === 'goldling' ? 5 : 3);
        }
        sfx.splat();
        sfx.zombieDie();
        this.checkWaveClear();
      } else if (head) {
        this.spawnText(x, top - 8, 'CRIT', '#ffb03a', 13);
      }
      break;
    }

    if (!struck) {
      if (y > this.horizonY) {
        for (let i = 0; i < 6; i++) {
          this.particles.push({
            kind: 'puff', x, y: Math.min(y, this.H - 8), vx: (Math.random() - 0.5) * 90, vy: -40 - Math.random() * 70,
            life: 0, maxLife: 0.4 + Math.random() * 0.2, size: 3 + Math.random() * 4, rot: 0, vr: 0, color: '#4a4234',
          });
        }
      }
    }
    this.syncHud();
  }

  private bloodBurst(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 220;
      this.particles.push({
        kind: Math.random() < 0.25 ? 'chunk' : 'blood',
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 60,
        life: 0,
        maxLife: 0.5 + Math.random() * 0.5,
        size: 2 + Math.random() * 4,
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 10,
        color: Math.random() < 0.5 ? '#c2162b' : '#8f0f20',
      });
    }
  }

  private spawnText(x: number, y: number, text: string, color: string, size: number): void {
    this.texts.push({ x, y, text, color, t: 0, life: 1.1, size });
  }

  // ---------------------------------------------------------------- pickups
  private dropPickup(x: number, y: number, forceKind?: PickupKind, amt = 3): void {
    if (this.pickups.length >= 6) return; // keep the field readable
    const r = Math.random();
    const kind: PickupKind = forceKind ?? (r < 0.55 ? 'ammo' : r < 0.8 ? 'repair' : 'fire');
    const px = Math.max(this.barricadeX + 70, Math.min(this.W - 40, x));
    this.pickups.push({ id: ++this.fid, kind, x: px, y, t: 0, life: 8, amt });
  }

  private collectPickup(i: number): void {
    const c = this.pickups[i];
    this.pickups.splice(i, 1);
    this.pickupsGot += 1;
    for (let k = 0; k < 8; k++) {
      const a = Math.random() * Math.PI * 2;
      this.particles.push({
        kind: 'spark', x: c.x, y: c.y - 20,
        vx: Math.cos(a) * 120, vy: Math.sin(a) * 120 - 60,
        life: 0, maxLife: 0.4, size: 2, rot: 0, vr: 0,
        color: c.kind === 'ammo' ? '#8dff3c' : c.kind === 'repair' ? '#e8e2cf' : '#ffb03a',
      });
    }
    if (c.kind === 'ammo') {
      this.ammo = Math.min(99, this.ammo + c.amt);
      this.spawnText(c.x, c.y - 44, `+${c.amt} AMMO`, '#8dff3c', 15);
      sfx.pickup();
    } else if (c.kind === 'repair') {
      this.hp = Math.min(100, this.hp + 14);
      this.spawnText(c.x, c.y - 44, '+14 PALISADE', '#e8e2cf', 15);
      sfx.pickup();
    } else {
      this.fireT = Math.min(12, this.fireT + 8);
      this.spawnText(c.x, c.y - 44, 'INCENDIARY ROUNDS 8s', '#ffb03a', 15);
      sfx.buff();
    }
  }

  private checkWaveClear(): void {
    if (this.waveKills >= this.waveTarget && !this.intermission) {
      this.intermission = true;
      this.interT = 2.4;
      this.score += 200 * this.wave;
      if (this.waveWrong === 0 && !this.waveHurt) {
        this.score += 500;
        this.spawnText(this.playerHead().x + 60, this.playerHead().y - 92, 'FLAWLESS WAVE +500', '#ffb03a', 17);
      }
      this.waveWrong = 0;
      this.waveHurt = false;
      this.ammo = Math.min(99, this.ammo + 3);
      this.hp = Math.min(100, this.hp + 10);
      this.setFeedback('info', `WAVE ${this.wave} CLEARED  +200×${this.wave} PTS  +3 ROUNDS`);
      this.spawnText(this.playerHead().x + 60, this.playerHead().y - 60, 'SUPPLY DROP +3', '#8dff3c', 16);
      sfx.streak();
      this.syncHud(true);
    }
  }

  // ---------------------------------------------------------------- spawning
  private pickKind(): ZombieKind {
    const conf = DIFF_CONF[this.difficulty];
    const w = this.wave;
    let pRunner = w >= conf.runnerWave ? 0.22 + Math.min(0.2, w * 0.02) : 0;
    let pBrute = w >= conf.bruteWave ? 0.1 + Math.min(0.18, w * 0.02) : 0;
    if (this.difficulty === 'hard') { pRunner += 0.05; pBrute += 0.04; }
    const r = Math.random();
    if (r < pBrute) return 'brute';
    if (r < pBrute + pRunner) return 'runner';
    return 'walker';
  }

  private spawnZombie(ambient: boolean, forceKind?: ZombieKind): void {
    const kind = forceKind ?? (ambient ? (Math.random() < 0.8 ? 'walker' : 'runner') : this.pickKind());
    const sf = Math.max(0.6, Math.min(1.5, this.W / 1280));
    const w = this.wave;
    const spdBoost = ambient ? 1 : Math.min(1.6, 1 + 0.04 * (w - 1));
    let speed = 0, hpv = 0;
    if (kind === 'walker') { speed = (26 + Math.random() * 14) * sf * spdBoost; hpv = 2 + Math.floor((w - 1) / 3); }
    if (kind === 'runner') { speed = (56 + Math.random() * 20) * sf * spdBoost; hpv = 1 + Math.floor((w - 1) / 4); }
    if (kind === 'brute')  { speed = (18 + Math.random() * 8) * sf * spdBoost;  hpv = 6 + Math.floor((w - 1) / 2); }
    if (kind === 'goldling') { speed = (72 + Math.random() * 20) * sf * Math.min(1.3, 1 + 0.02 * (w - 1)); hpv = 1; }
    if (ambient) speed *= 0.6;

    const y = this.horizonY + this.H * 0.12 + Math.random() * (this.H * 0.94 - (this.horizonY + this.H * 0.12));
    this.zombies.push({
      id: zid++,
      kind,
      x: this.W + 60 + Math.random() * 80,
      y,
      hp: hpv,
      maxHp: hpv,
      speed,
      scale: this.groundScale(y) * (kind === 'goldling' ? 0.85 : 1),
      phase: Math.random() * 10,
      hitT: 0,
      dead: false,
      deathT: 0,
      attacking: false,
      lungeT: 0,
      biteT: 0,
      shirt: Math.floor(Math.random() * 4),
    });
  }

  // ---------------------------------------------------------------- update
  private update(dt: number): void {
    this.t += dt;

    // ambient spawners for menu / game-over backdrops
    if (this.mode !== 'playing') {
      this.spawnT -= dt;
      if (this.spawnT <= 0 && this.zombies.length < 7) {
        this.spawnZombie(true);
        this.spawnT = 1.6 + Math.random() * 1.8;
      }
    } else if (!this.intermission) {
      const conf = DIFF_CONF[this.difficulty];
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        if (this.zombies.filter((z) => !z.dead).length < conf.cap) this.spawnZombie(false);
        const ramp = Math.max(conf.spawnMin, this.spawnInterval * Math.pow(0.93, this.wave - 1));
        this.spawnT = ramp * (0.7 + Math.random() * 0.6);
      }
    } else {
      this.interT -= dt;
      if (this.interT <= 0) {
        this.intermission = false;
        const conf = DIFF_CONF[this.difficulty];
        this.wave += 1;
        this.waveKills = 0;
        this.waveWrong = 0;
        this.waveHurt = false;
        this.waveTarget = conf.target0 + conf.targetInc * (this.wave - 1);
        this.banner = { id: ++this.fid, title: `WAVE ${this.wave}`, sub: this.wave % 2 === 0 ? 'THEY MUTATE' : 'THEY MULTIPLY' };
        sfx.wave();
        this.syncHud(true);
      }
    }

    // hint rotation — timed pool tips plus context-aware warnings
    if (this.mode === 'playing') {
      if (this.hint) {
        this.hintLife -= dt;
        if (this.hintLife <= 0) {
          this.hint = null;
          this.syncHud(true);
        }
      }
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) {
        this.hintTimer = 11 + Math.random() * 5;
        this.pickHint();
      }
    }

    // gilded crawler — rare jackpot target that flees instead of biting
    if (this.mode === 'playing' && this.wave >= 2) {
      this.goldT -= dt;
      if (this.goldT <= 0) {
        if (!this.zombies.some((z) => !z.dead && z.kind === 'goldling')) {
          this.spawnZombie(false, 'goldling');
          this.setHint('Gilded crawler spotted — drop it for +500 and +5 rounds.', 'tip', 'gold');
          sfx.gold();
        }
        this.goldT = 24 + Math.random() * 14;
      }
    }

    // zombies
    const stopX = this.barricadeX + 30;
    for (const z of this.zombies) {
      if (z.dead) { z.deathT += dt; continue; }
      z.hitT = Math.max(0, z.hitT - dt);
      const h = KIND_STATS[z.kind].baseH * z.scale;
      const halfW = h * (z.kind === 'brute' ? 0.42 : 0.3) * 0.6;
      if (z.kind === 'goldling') {
        // never bites — turns and sprints away at the fence line
        if (z.x - halfW <= stopX + 46) z.x += z.speed * 1.55 * dt;
        else z.x -= z.speed * dt;
        z.phase += dt * 5;
        continue;
      }
      if (z.x - halfW <= stopX) {
        if (this.mode === 'playing') {
          z.attacking = true;
          z.lungeT += dt;
          z.biteT -= dt;
          this.hp -= KIND_STATS[z.kind].dps * dt;
          this.waveHurt = true;
          if (z.biteT <= 0) {
            z.biteT = 0.9;
            this.shake = Math.max(this.shake, 5);
            this.dmgFlash = Math.max(this.dmgFlash, 0.4);
            sfx.thud();
          }
        } else {
          // ambient: recycle offscreen
          z.x = this.W + 80;
          z.y = this.horizonY + this.H * 0.12 + Math.random() * (this.H * 0.3);
          z.scale = this.groundScale(z.y);
        }
      } else {
        z.x -= z.speed * dt;
        z.attacking = false;
      }
      z.phase += dt * (2.2 + z.speed * 0.06);
    }
    this.zombies = this.zombies.filter(
      (z) => (!z.dead || z.deathT < 1.3) && (z.kind !== 'goldling' || z.dead || z.x < this.W + 90),
    );

    // supply crates age out
    for (const c of this.pickups) c.t += dt;
    this.pickups = this.pickups.filter((c) => c.t < c.life);

    if (this.mode === 'playing' && this.hp <= 0) {
      this.hp = 0;
      this.bloodBurst(this.barricadeX, this.H * 0.7, 40);
      this.gameOver();
      return;
    }

    // ambient moans
    this.moanT -= dt;
    if (this.moanT <= 0 && this.zombies.length > 0) {
      sfx.moan();
      this.moanT = 3.5 + Math.random() * 4;
    }

    // particles
    for (const p of this.particles) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'blood' || p.kind === 'chunk' || p.kind === 'casing') p.vy += 620 * dt;
      if (p.kind === 'puff') { p.vy -= 30 * dt; p.vx *= 0.92; }
      p.rot += p.vr * dt;
    }
    this.particles = this.particles.filter((p) => p.life < p.maxLife);
    if (this.particles.length > 450) this.particles.splice(0, this.particles.length - 450);

    // float texts
    for (const ft of this.texts) {
      ft.t += dt;
      ft.y -= 34 * dt;
    }
    this.texts = this.texts.filter((ft) => ft.t < ft.life);

    // decay fx
    if (this.fireT > 0) this.fireT = Math.max(0, this.fireT - dt);
    this.shake = Math.max(0, this.shake - dt * 26);
    this.recoil = Math.max(0, this.recoil - dt * 7);
    this.flashT = Math.max(0, this.flashT - dt);
    this.hitmarkerT = Math.max(0, this.hitmarkerT - dt);
    this.dmgFlash = Math.max(0, this.dmgFlash - dt * 1.6);

    // aim hover
    this.aimOnZombie = false;
    for (const z of this.zombies) {
      if (z.dead) continue;
      const h = KIND_STATS[z.kind].baseH * z.scale;
      const w = h * (z.kind === 'brute' ? 0.42 : 0.3);
      if (this.aim.x >= z.x - w * 0.75 && this.aim.x <= z.x + w * 0.75 &&
          this.aim.y >= z.y - h * 1.08 && this.aim.y <= z.y + 4) {
        this.aimOnZombie = true;
        break;
      }
    }

    this.syncHud();
  }

  // ---------------------------------------------------------------- hints
  private setHint(text: string, kind: HintMsg['kind'], key?: string): void {
    this.hint = { id: ++this.fid, kind, text };
    this.hintLife = 4.7;
    if (key) this.hintSeen[key] = this.t;
    this.syncHud(true);
  }

  private pickHint(): void {
    const alive = this.zombies.filter((z) => !z.dead);
    const checks: { key: string; cond: boolean; text: string; kind: HintMsg['kind'] }[] = [
      { key: 'dry', cond: this.ammo === 0, text: 'Chamber empty — solve the uplink to rearm.', kind: 'warn' },
      { key: 'low', cond: this.ammo > 0 && this.ammo <= 3, text: 'Ammo critical. Queue your next answer while you shoot.', kind: 'warn' },
      { key: 'fence', cond: this.hp <= 35, text: 'Palisade failing — clear the wave for +10 repair.', kind: 'warn' },
      { key: 'brute', cond: alive.some((z) => z.kind === 'brute'), text: 'Brute inbound — thick hide. Two headshots crack it.', kind: 'warn' },
      { key: 'runners', cond: alive.filter((z) => z.kind === 'runner').length >= 3, text: 'Runner pack closing — drop the sprinters first.', kind: 'warn' },
      { key: 'streak', cond: this.streak === 2, text: 'One more correct answer banks a streak bonus: +2 rounds.', kind: 'tip' },
    ];
    for (const c of checks) {
      if (c.cond && this.t - (this.hintSeen[c.key] ?? -999) > 32) {
        this.setHint(c.text, c.kind, c.key);
        return;
      }
    }
    const pool = TIP_POOL.filter((tip) => tip !== this.lastTip);
    this.lastTip = pool[Math.floor(Math.random() * pool.length)];
    this.setHint(this.lastTip, 'tip');
  }

  // ---------------------------------------------------------------- hud sync
  private syncHud(force = false): void {
    const snap: HudSnapshot = {
      mode: this.mode,
      paused: this.paused,
      ammo: this.ammo,
      score: this.score,
      best: this.best,
      wave: this.wave,
      waveKills: Math.min(this.waveKills, this.waveTarget),
      waveTarget: this.waveTarget,
      hp: Math.max(0, Math.round(this.hp)),
      streak: this.streak,
      problem: this.problem,
      input: this.input,
      feedback: this.feedback,
      banner: this.banner,
      intermission: this.intermission,
      hint: this.hint,
      buffT: Math.ceil(this.fireT),
    };
    const j = JSON.stringify(snap);
    if (force || j !== this.lastHudJson) {
      this.lastHudJson = j;
      this.cb.onHud(snap);
    }
  }

  // ---------------------------------------------------------------- loop
  private loop(now: number): void {
    const dt = Math.min(0.05, (now - this.last) / 1000 || 0.016);
    this.last = now;
    if (!this.paused) this.update(dt);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    render(this.ctx, this);
    this.raf = requestAnimationFrame(this.loop);
  }
}


+++ src/game/engine.ts (修改后)
import { sfx } from './audio';
import { genProblem, AMMO_REWARD } from './math';
import type { Difficulty, Problem } from './math';
import { render } from './render';

export type Mode = 'menu' | 'playing' | 'over';
export type ZombieKind = 'walker' | 'runner' | 'brute' | 'goldling';

export type PickupKind = 'ammo' | 'repair' | 'fire';
export interface Pickup {
  id: number;
  kind: PickupKind;
  x: number; y: number;
  t: number; life: number;
  amt: number;
}

export interface Zombie {
  id: number;
  kind: ZombieKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  scale: number;
  phase: number;
  hitT: number;
  dead: boolean;
  deathT: number;
  attacking: boolean;
  lungeT: number;
  biteT: number;
  shirt: number;
}

export interface Particle {
  kind: 'blood' | 'spark' | 'casing' | 'puff' | 'chunk';
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  size: number;
  rot: number; vr: number;
  color: string;
}

export interface FloatText {
  x: number; y: number;
  text: string;
  color: string;
  t: number;
  life: number;
  size: number;
}

export interface Feedback { id: number; kind: 'good' | 'bad' | 'info'; text: string; }
export interface Banner { id: number; title: string; sub: string; }

export interface HudSnapshot {
  mode: Mode;
  paused: boolean;
  ammo: number;
  score: number;
  best: number;
  wave: number;
  waveKills: number;
  waveTarget: number;
  hp: number;
  streak: number;
  problem: Problem;
  input: string;
  feedback: Feedback | null;
  banner: Banner | null;
  intermission: boolean;
  hint: HintMsg | null;
  buffT: number;
}

export interface GameStats {
  score: number;
  best: number;
  newBest: boolean;
  wave: number;
  kills: number;
  shots: number;
  hits: number;
  headshots: number;
  correct: number;
  wrong: number;
  bestStreak: number;
  timeSec: number;
  pickups: number;
}

export interface HintMsg {
  id: number;
  kind: 'tip' | 'warn';
  text: string;
}

export const TIP_POOL: string[] = [
  'Headshots deal 2x damage and pay 1.5x points.',
  'Wrong answers drain rounds by the difference. Wild guesses are expensive.',
  'Every 3 correct answers in a row banks +2 bonus rounds.',
  'Runners sprint — drop them before they reach the palisade.',
  'Brutes shrug off body shots. Put two in the skull.',
  'One round, one corpse — make every trigger pull count.',
  'Survive the wave for a supply drop: +3 rounds and +10 palisade repair.',
  'Harder difficulty loads fewer rounds per answer. Solve faster.',
  'Solve between shots. Never let both crises stack at once.',
  'The keypad takes 0-9, Backspace and Enter. Keep your left hand on the keys.',
  'A clear mind reloads — P pauses the horde.',
  'The uplink never runs dry. Only you do.',
  'Downed foes sometimes drop crates — click them before they blink out.',
  'Incendiary crates double your shot damage for 8 seconds. Spend them fast.',
  'A gilded crawler may sprint across the field — +500 and +5 rounds if you drop it.',
  'Answer within 5 seconds and the uplink pays a +25 quick-solve bonus.',
  'No math misses and no bites all wave? Flawless clear pays +500.',
  'Chain kills inside 1.6 seconds for double and triple kill bonuses.',
];

interface Callbacks {
  onHud: (h: HudSnapshot) => void;
  onGameOver: (s: GameStats) => void;
}

const BEST_KEY = 'dead-reckoning-best';

const DIFF_CONF = {
  easy:   { startAmmo: 14, target0: 5, targetInc: 2, spawn0: 2.5, spawnMin: 1.0,  cap: 9,  runnerWave: 2, bruteWave: 3 },
  normal: { startAmmo: 12, target0: 6, targetInc: 2, spawn0: 2.05, spawnMin: 0.85, cap: 12, runnerWave: 1, bruteWave: 2 },
  hard:   { startAmmo: 10, target0: 7, targetInc: 3, spawn0: 1.65, spawnMin: 0.65, cap: 14, runnerWave: 1, bruteWave: 2 },
} as const;

const KIND_STATS: Record<ZombieKind, { hp: number; dps: number; score: number; baseH: number }> = {
  walker: { hp: 2, dps: 7,  score: 100, baseH: 108 },
  runner: { hp: 1, dps: 5,  score: 150, baseH: 92 },
  brute:  { hp: 6, dps: 14, score: 400, baseH: 148 },
  goldling: { hp: 1, dps: 0, score: 500, baseH: 78 },
};

let zid = 1;

export class Game {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  cb: Callbacks;

  W = 0; H = 0; dpr = 1;
  mode: Mode = 'menu';
  paused = false;
  difficulty: Difficulty = 'normal';

  t = 0;
  aim = { x: 0, y: 0 };
  aimOnZombie = false;
  recoil = 0;
  flashT = 0;
  hitmarkerT = 0;
  shake = 0;
  dmgFlash = 0;

  ammo = 12;
  score = 0;
  best = 0;
  wave = 1;
  waveKills = 0;
  waveTarget = 6;
  hp = 100;
  streak = 0;
  bestStreak = 0;
  intermission = false;
  private interT = 0;

  problem: Problem = { text: '7 + 5', answer: 12 };
  input = '';
  feedback: Feedback | null = null;
  banner: Banner | null = null;
  private fid = 0;

  hint: HintMsg | null = null;
  private hintLife = 0;
  private hintTimer = 6.5;
  private hintSeen: Record<string, number> = {};
  private lastTip = '';

  zombies: Zombie[] = [];
  particles: Particle[] = [];
  texts: FloatText[] = [];
  pickups: Pickup[] = [];
  fireT = 0;
  private goldT = 18;
  private killTimes: number[] = [];
  private problemT = -99;
  private waveWrong = 0;
  private waveHurt = false;
  private pickupsGot = 0;

  stars: { x: number; y: number; r: number; p: number }[] = [];
  graves: { x: number; y: number; w: number; h: number; type: number; tilt: number }[] = [];
  tufts: { x: number; y: number }[] = [];
  vignette: CanvasGradient | null = null;

  private spawnT = 1.2;
  private spawnInterval = 2.2;
  private lastShot = -1;
  private moanT = 3;
  private raf = 0;
  private last = 0;
  private startTime = 0;
  private lastHudJson = '';

  // run stats
  private shots = 0; private hits = 0; private headshots = 0;
  private correct = 0; private wrong = 0; private kills = 0;

  constructor(canvas: HTMLCanvasElement, cb: Callbacks) {
    this.canvas = canvas;
    this.cb = cb;
    const c = canvas.getContext('2d');
    if (!c) throw new Error('no 2d context');
    this.ctx = c;
    this.best = Number(localStorage.getItem(BEST_KEY) ?? 0) || 0;

    this.onResize = this.onResize.bind(this);
    this.onMove = this.onMove.bind(this);
    this.onDown = this.onDown.bind(this);
    this.onTouchStart = this.onTouchStart.bind(this);
    this.onTouchMove = this.onTouchMove.bind(this);
    this.loop = this.loop.bind(this);

    window.addEventListener('resize', this.onResize);
    canvas.addEventListener('mousemove', this.onMove);
    canvas.addEventListener('mousedown', this.onDown);
    canvas.addEventListener('touchstart', this.onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', this.onTouchMove, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.onResize();
    this.aim = { x: this.W * 0.6, y: this.H * 0.55 };
    this.setMode('menu');
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.canvas.removeEventListener('mousemove', this.onMove);
    this.canvas.removeEventListener('mousedown', this.onDown);
    this.canvas.removeEventListener('touchstart', this.onTouchStart);
    this.canvas.removeEventListener('touchmove', this.onTouchMove);
  }

  // ---------------------------------------------------------------- geometry
  get barricadeX(): number {
    return Math.max(86, Math.min(170, this.W * 0.105));
  }
  get horizonY(): number { return this.H * 0.52; }
  groundScale(y: number): number {
    const a = (y - this.horizonY) / (this.H * 0.96 - this.horizonY);
    return 0.58 + Math.max(0, Math.min(1, a)) * 0.6;
  }
  playerHead(): { x: number; y: number } {
    return { x: this.barricadeX + 30, y: this.H * 0.565 };
  }
  muzzlePoint(): { x: number; y: number } {
    const p = this.playerHead();
    const dx = this.aim.x - p.x, dy = this.aim.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / len) * 52, y: p.y + 6 + (dy / len) * 52 };
  }

  // ---------------------------------------------------------------- lifecycle
  setMode(m: Mode): void {
    this.mode = m;
    this.zombies = [];
    this.particles = [];
    this.texts = [];
    this.pickups = [];
    this.paused = false;
    if (m === 'menu') {
      this.spawnT = 0.4;
      this.hp = 100;
    }
    this.syncHud(true);
  }

  start(d: Difficulty): void {
    const conf = DIFF_CONF[d];
    this.difficulty = d;
    this.mode = 'playing';
    this.paused = false;
    this.zombies = [];
    this.particles = [];
    this.texts = [];
    this.pickups = [];
    this.ammo = conf.startAmmo;
    this.score = 0;
    this.wave = 1;
    this.waveKills = 0;
    this.waveTarget = conf.target0;
    this.hp = 100;
    this.streak = 0;
    this.bestStreak = 0;
    this.intermission = false;
    this.interT = 0;
    this.spawnInterval = conf.spawn0;
    this.spawnT = 2.2;
    this.shake = 0;
    this.dmgFlash = 0;
    this.recoil = 0;
    this.flashT = 0;
    this.hitmarkerT = 0;
    this.lastShot = -1;
    this.shots = 0; this.hits = 0; this.headshots = 0;
    this.correct = 0; this.wrong = 0; this.kills = 0;
    this.startTime = this.t;
    this.problem = genProblem(d);
    this.input = '';
    this.feedback = null;
    this.hint = null;
    this.hintLife = 0;
    this.hintTimer = 6.5;
    this.hintSeen = {};
    this.lastTip = '';
    this.fireT = 0;
    this.goldT = 18;
    this.killTimes = [];
    this.waveWrong = 0;
    this.waveHurt = false;
    this.pickupsGot = 0;
    this.problemT = this.t;
    this.banner = { id: ++this.fid, title: 'WAVE 1', sub: 'HOLD THE PALISADE' };
    sfx.wave();
    this.syncHud(true);
  }

  togglePause(): void {
    if (this.mode !== 'playing') return;
    this.paused = !this.paused;
    sfx.click();
    this.syncHud(true);
  }

  quitToMenu(): void {
    this.setMode('menu');
  }

  private gameOver(): void {
    this.mode = 'over';
    sfx.breach();
    const newBest = this.score > this.best;
    if (newBest) {
      this.best = this.score;
      localStorage.setItem(BEST_KEY, String(this.best));
    }
    this.syncHud(true);
    this.cb.onGameOver({
      score: this.score,
      best: this.best,
      newBest,
      wave: this.wave,
      kills: this.kills,
      shots: this.shots,
      hits: this.hits,
      headshots: this.headshots,
      correct: this.correct,
      wrong: this.wrong,
      bestStreak: this.bestStreak,
      timeSec: Math.max(0, this.t - this.startTime),
      pickups: this.pickupsGot,
    });
  }

  // ---------------------------------------------------------------- input
  private onResize(): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.canvas.width = Math.floor(this.W * this.dpr);
    this.canvas.height = Math.floor(this.H * this.dpr);
    this.canvas.style.width = `${this.W}px`;
    this.canvas.style.height = `${this.H}px`;

    this.stars = [];
    const nStars = Math.floor((this.W * this.H) / 9000);
    for (let i = 0; i < nStars; i++) {
      this.stars.push({ x: Math.random() * this.W, y: Math.random() * this.horizonY * 0.9, r: Math.random() * 1.3 + 0.3, p: Math.random() * 7 });
    }
    this.graves = [];
    const nG = Math.max(5, Math.floor(this.W / 190));
    for (let i = 0; i < nG; i++) {
      this.graves.push({
        x: this.W * 0.18 + Math.random() * this.W * 0.8,
        y: this.horizonY + 8 + Math.random() * this.H * 0.12,
        w: 22 + Math.random() * 16,
        h: 30 + Math.random() * 22,
        type: Math.floor(Math.random() * 3),
        tilt: (Math.random() - 0.5) * 0.24,
      });
    }
    this.tufts = [];
    const nT = Math.floor(this.W / 46);
    for (let i = 0; i < nT; i++) {
      this.tufts.push({ x: Math.random() * this.W, y: this.horizonY + Math.random() * (this.H - this.horizonY) });
    }
    const v = this.ctx.createRadialGradient(
      this.W / 2, this.H * 0.46, Math.min(this.W, this.H) * 0.36,
      this.W / 2, this.H * 0.52, Math.max(this.W, this.H) * 0.74,
    );
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.55)');
    this.vignette = v;
  }

  private onMove(e: MouseEvent): void {
    this.aim.x = e.clientX;
    this.aim.y = e.clientY;
  }

  private onDown(e: MouseEvent): void {
    if (e.button !== 0) return;
    this.shoot(e.clientX, e.clientY);
  }

  private onTouchStart(e: TouchEvent): void {
    e.preventDefault(); // also suppresses emulated mouse events → no double-fire
    const t = e.changedTouches[0];
    if (!t) return;
    this.aim.x = t.clientX;
    this.aim.y = t.clientY;
    this.shoot(t.clientX, t.clientY);
  }

  private onTouchMove(e: TouchEvent): void {
    e.preventDefault();
    const t = e.changedTouches[0];
    if (!t) return;
    this.aim.x = t.clientX;
    this.aim.y = t.clientY;
  }

  pressDigit(d: string): void {
    if (this.mode !== 'playing' || this.paused) return;
    if (this.input.length >= 3) return;
    this.input += d;
    this.syncHud();
  }

  pressBack(): void {
    if (this.mode !== 'playing' || this.paused) return;
    this.input = this.input.slice(0, -1);
    this.syncHud();
  }

  submitAnswer(): void {
    if (this.mode !== 'playing' || this.paused || this.input === '') return;
    const val = parseInt(this.input, 10);
    const answer = this.problem.answer;
    this.input = '';

    if (val === answer) {
      const base = AMMO_REWARD[this.difficulty];
      let gain = base;
      this.streak += 1;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
      this.correct += 1;
      this.score += 50 + 10 * (this.streak - 1);
      const fast = this.t - this.problemT <= 5;
      if (fast) this.score += 25;
      const fastTag = fast ? '  ·  FAST +25' : '';
      let msg = `CORRECT  +${gain} ROUNDS${fastTag}`;
      if (this.streak > 0 && this.streak % 3 === 0) {
        gain += 2;
        msg = `STREAK ×${this.streak}  +${gain} ROUNDS${fastTag}`;
        sfx.streak();
      } else {
        sfx.correct();
      }
      this.ammo = Math.min(99, this.ammo + gain);
      this.setFeedback('good', msg);
      this.spawnText(this.playerHead().x + 40, this.playerHead().y - 30, `+${gain} AMMO`, '#8dff3c', 17);
    } else {
      const diff = Math.abs(answer - val);
      const loss = Math.min(this.ammo, diff);
      this.ammo -= loss;
      this.streak = 0;
      this.wrong += 1;
      this.waveWrong += 1;
      this.shake = Math.max(this.shake, 7);
      this.dmgFlash = Math.max(this.dmgFlash, 0.5);
      sfx.wrong();
      this.setFeedback('bad', `WRONG — ANSWER ${answer}, LOST ${loss} ROUND${loss === 1 ? '' : 'S'}`);
      this.spawnText(this.playerHead().x + 40, this.playerHead().y - 30, `−${loss} AMMO`, '#ff2438', 17);
      if (this.wrong === 1) {
        this.setHint('That miss cost you rounds — count twice, submit once.', 'warn', 'firstWrong');
      }
      if (this.ammo === 0) {
        this.setHint('The math drained your last round. Solve to rearm.', 'warn', 'dry0');
      }
    }
    this.problem = genProblem(this.difficulty);
    this.problemT = this.t;
    this.syncHud(true);
  }

  private setFeedback(kind: Feedback['kind'], text: string): void {
    this.feedback = { id: ++this.fid, kind, text };
  }

  // ---------------------------------------------------------------- shooting
  shoot(x: number, y: number): void {
    if (this.mode !== 'playing' || this.paused) return;
    if (this.t - this.lastShot < 0.09) return;

    // supply crates — click to grab, no round spent
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const c = this.pickups[i];
      if (Math.hypot(x - c.x, y - (c.y - 20)) < 34) {
        this.collectPickup(i);
        this.syncHud(true);
        return;
      }
    }

    if (this.ammo <= 0) {
      this.lastShot = this.t;
      sfx.dry();
      this.setFeedback('bad', 'CHAMBER EMPTY — SOLVE TO REARM');
      this.setHint('Chamber empty — solve the uplink to rearm.', 'warn', 'dry');
      this.syncHud(true);
      return;
    }

    this.lastShot = this.t;
    this.ammo -= 1;
    this.shots += 1;
    if (this.ammo === 0) {
      this.setHint('Last round spent — the uplink is your only reload now.', 'warn', 'dry0');
    }
    this.recoil = 1;
    this.flashT = 0.06;
    this.shake = Math.max(this.shake, 4);
    sfx.shot();

    const m = this.muzzlePoint();
    this.particles.push({
      kind: 'casing', x: m.x, y: m.y, vx: 120 + Math.random() * 80, vy: -160 - Math.random() * 80,
      life: 0, maxLife: 0.9, size: 3.4, rot: Math.random() * 6, vr: 14, color: '#d8a84a',
    });

    // hit test — front (lowest / closest) zombies first
    const sorted = [...this.zombies].filter((z) => !z.dead).sort((a, b) => b.y - a.y);
    let struck = false;
    for (const z of sorted) {
      const s = z.scale;
      const h = KIND_STATS[z.kind].baseH * s;
      const w = h * (z.kind === 'brute' ? 0.42 : 0.3);
      const top = z.y - h * 1.04;
      const headBottom = top + h * 0.3;
      const padX = Math.min(18, (640 / this.W) * 18); // fatter targets on small screens
      const inX = x >= z.x - w * 0.75 - padX && x <= z.x + w * 0.75 + padX;
      const inY = y >= top - 6 && y <= z.y + 4;
      if (!inX || !inY) continue;
      struck = true;
      const head = y <= headBottom;
      const dmg = (head ? 2 : 1) + (this.fireT > 0 ? 1 : 0);
      z.hp -= dmg;
      z.hitT = 0.14;
      z.x += 7;
      this.hits += 1;
      if (head) this.headshots += 1;
      this.hitmarkerT = 0.13;
      this.bloodBurst(x, y, head ? 16 : 9);
      sfx.hit();

      if (z.hp <= 0) {
        z.dead = true;
        z.deathT = 0;
        this.kills += 1;
        this.waveKills += 1;
        if (this.kills === 1) {
          this.setHint('First kill. Headshots deal 2x damage and pay 1.5x points.', 'tip', 'firstKill');
        }
        // kill combo
        this.killTimes.push(this.t);
        this.killTimes = this.killTimes.filter((kt) => this.t - kt <= 1.6);
        if (this.killTimes.length === 2) {
          this.score += 150;
          this.spawnText(z.x, top - 36, 'DOUBLE KILL +150', '#ffb03a', 15);
        } else if (this.killTimes.length === 3) {
          this.score += 400;
          this.spawnText(z.x, top - 36, 'TRIPLE KILL +400', '#ffb03a', 17);
          sfx.streak();
        }
        const pts = Math.round(KIND_STATS[z.kind].score * (head ? 1.5 : 1));
        this.score += pts;
        this.bloodBurst(z.x, z.y - h * 0.5, z.kind === 'goldling' ? 14 : 26);
        this.spawnText(z.x, top - 14, head ? `HEADSHOT +${pts}` : `+${pts}`, head ? '#ffb03a' : '#e8e2cf', head ? 18 : 15);
        // loot drop
        const dropChance = z.kind === 'goldling' ? 1 : z.kind === 'brute' ? 0.3 : 0.12;
        if (Math.random() < dropChance) {
          this.dropPickup(z.x, z.y, z.kind === 'goldling' ? 'ammo' : undefined, z.kind === 'goldling' ? 5 : 3);
        }
        sfx.splat();
        sfx.zombieDie();
        this.checkWaveClear();
      } else if (head) {
        this.spawnText(x, top - 8, 'CRIT', '#ffb03a', 13);
      }
      break;
    }

    if (!struck) {
      if (y > this.horizonY) {
        for (let i = 0; i < 6; i++) {
          this.particles.push({
            kind: 'puff', x, y: Math.min(y, this.H - 8), vx: (Math.random() - 0.5) * 90, vy: -40 - Math.random() * 70,
            life: 0, maxLife: 0.4 + Math.random() * 0.2, size: 3 + Math.random() * 4, rot: 0, vr: 0, color: '#4a4234',
          });
        }
      }
    }
    this.syncHud();
  }

  private bloodBurst(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 220;
      this.particles.push({
        kind: Math.random() < 0.25 ? 'chunk' : 'blood',
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 60,
        life: 0,
        maxLife: 0.5 + Math.random() * 0.5,
        size: 2 + Math.random() * 4,
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 10,
        color: Math.random() < 0.5 ? '#c2162b' : '#8f0f20',
      });
    }
  }

  private spawnText(x: number, y: number, text: string, color: string, size: number): void {
    this.texts.push({ x, y, text, color, t: 0, life: 1.1, size });
  }

  // ---------------------------------------------------------------- pickups
  private dropPickup(x: number, y: number, forceKind?: PickupKind, amt = 3): void {
    if (this.pickups.length >= 6) return; // keep the field readable
    const r = Math.random();
    const kind: PickupKind = forceKind ?? (r < 0.55 ? 'ammo' : r < 0.8 ? 'repair' : 'fire');
    const px = Math.max(this.barricadeX + 70, Math.min(this.W - 40, x));
    this.pickups.push({ id: ++this.fid, kind, x: px, y, t: 0, life: 8, amt });
  }

  private collectPickup(i: number): void {
    const c = this.pickups[i];
    this.pickups.splice(i, 1);
    this.pickupsGot += 1;
    for (let k = 0; k < 8; k++) {
      const a = Math.random() * Math.PI * 2;
      this.particles.push({
        kind: 'spark', x: c.x, y: c.y - 20,
        vx: Math.cos(a) * 120, vy: Math.sin(a) * 120 - 60,
        life: 0, maxLife: 0.4, size: 2, rot: 0, vr: 0,
        color: c.kind === 'ammo' ? '#8dff3c' : c.kind === 'repair' ? '#e8e2cf' : '#ffb03a',
      });
    }
    if (c.kind === 'ammo') {
      this.ammo = Math.min(99, this.ammo + c.amt);
      this.spawnText(c.x, c.y - 44, `+${c.amt} AMMO`, '#8dff3c', 15);
      sfx.pickup();
    } else if (c.kind === 'repair') {
      this.hp = Math.min(100, this.hp + 14);
      this.spawnText(c.x, c.y - 44, '+14 PALISADE', '#e8e2cf', 15);
      sfx.pickup();
    } else {
      this.fireT = Math.min(12, this.fireT + 8);
      this.spawnText(c.x, c.y - 44, 'INCENDIARY ROUNDS 8s', '#ffb03a', 15);
      sfx.buff();
    }
  }

  private checkWaveClear(): void {
    if (this.waveKills >= this.waveTarget && !this.intermission) {
      this.intermission = true;
      this.interT = 2.4;
      this.score += 200 * this.wave;
      if (this.waveWrong === 0 && !this.waveHurt) {
        this.score += 500;
        this.spawnText(this.playerHead().x + 60, this.playerHead().y - 92, 'FLAWLESS WAVE +500', '#ffb03a', 17);
      }
      this.waveWrong = 0;
      this.waveHurt = false;
      this.ammo = Math.min(99, this.ammo + 3);
      this.hp = Math.min(100, this.hp + 10);
      this.setFeedback('info', `WAVE ${this.wave} CLEARED  +200×${this.wave} PTS  +3 ROUNDS`);
      this.spawnText(this.playerHead().x + 60, this.playerHead().y - 60, 'SUPPLY DROP +3', '#8dff3c', 16);
      sfx.streak();
      this.syncHud(true);
    }
  }

  // ---------------------------------------------------------------- spawning
  private pickKind(): ZombieKind {
    const conf = DIFF_CONF[this.difficulty];
    const w = this.wave;
    let pRunner = w >= conf.runnerWave ? 0.22 + Math.min(0.2, w * 0.02) : 0;
    let pBrute = w >= conf.bruteWave ? 0.1 + Math.min(0.18, w * 0.02) : 0;
    if (this.difficulty === 'hard') { pRunner += 0.05; pBrute += 0.04; }
    const r = Math.random();
    if (r < pBrute) return 'brute';
    if (r < pBrute + pRunner) return 'runner';
    return 'walker';
  }

  private spawnZombie(ambient: boolean, forceKind?: ZombieKind): void {
    const kind = forceKind ?? (ambient ? (Math.random() < 0.8 ? 'walker' : 'runner') : this.pickKind());
    const sf = Math.max(0.6, Math.min(1.5, this.W / 1280));
    const w = this.wave;
    const spdBoost = ambient ? 1 : Math.min(1.6, 1 + 0.04 * (w - 1));
    let speed = 0, hpv = 0;
    if (kind === 'walker') { speed = (26 + Math.random() * 14) * sf * spdBoost; hpv = 2 + Math.floor((w - 1) / 3); }
    if (kind === 'runner') { speed = (56 + Math.random() * 20) * sf * spdBoost; hpv = 1 + Math.floor((w - 1) / 4); }
    if (kind === 'brute')  { speed = (18 + Math.random() * 8) * sf * spdBoost;  hpv = 6 + Math.floor((w - 1) / 2); }
    if (kind === 'goldling') { speed = (72 + Math.random() * 20) * sf * Math.min(1.3, 1 + 0.02 * (w - 1)); hpv = 1; }
    if (ambient) speed *= 0.6;

    const y = this.horizonY + this.H * 0.12 + Math.random() * (this.H * 0.94 - (this.horizonY + this.H * 0.12));
    this.zombies.push({
      id: zid++,
      kind,
      x: this.W + 60 + Math.random() * 80,
      y,
      hp: hpv,
      maxHp: hpv,
      speed,
      scale: this.groundScale(y) * (kind === 'goldling' ? 0.85 : 1),
      phase: Math.random() * 10,
      hitT: 0,
      dead: false,
      deathT: 0,
      attacking: false,
      lungeT: 0,
      biteT: 0,
      shirt: Math.floor(Math.random() * 4),
    });
  }

  // ---------------------------------------------------------------- update
  private update(dt: number): void {
    this.t += dt;

    // ambient spawners for menu / game-over backdrops
    if (this.mode !== 'playing') {
      this.spawnT -= dt;
      if (this.spawnT <= 0 && this.zombies.length < 7) {
        this.spawnZombie(true);
        this.spawnT = 1.6 + Math.random() * 1.8;
      }
    } else if (!this.intermission) {
      const conf = DIFF_CONF[this.difficulty];
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        if (this.zombies.filter((z) => !z.dead).length < conf.cap) this.spawnZombie(false);
        const ramp = Math.max(conf.spawnMin, this.spawnInterval * Math.pow(0.93, this.wave - 1));
        this.spawnT = ramp * (0.7 + Math.random() * 0.6);
      }
    } else {
      this.interT -= dt;
      if (this.interT <= 0) {
        this.intermission = false;
        const conf = DIFF_CONF[this.difficulty];
        this.wave += 1;
        this.waveKills = 0;
        this.waveWrong = 0;
        this.waveHurt = false;
        this.waveTarget = conf.target0 + conf.targetInc * (this.wave - 1);
        this.banner = { id: ++this.fid, title: `WAVE ${this.wave}`, sub: this.wave % 2 === 0 ? 'THEY MUTATE' : 'THEY MULTIPLY' };
        sfx.wave();
        this.syncHud(true);
      }
    }

    // hint rotation — timed pool tips plus context-aware warnings
    if (this.mode === 'playing') {
      if (this.hint) {
        this.hintLife -= dt;
        if (this.hintLife <= 0) {
          this.hint = null;
          this.syncHud(true);
        }
      }
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) {
        this.hintTimer = 11 + Math.random() * 5;
        this.pickHint();
      }
    }

    // gilded crawler — rare jackpot target that flees instead of biting
    if (this.mode === 'playing' && this.wave >= 2) {
      this.goldT -= dt;
      if (this.goldT <= 0) {
        if (!this.zombies.some((z) => !z.dead && z.kind === 'goldling')) {
          this.spawnZombie(false, 'goldling');
          this.setHint('Gilded crawler spotted — drop it for +500 and +5 rounds.', 'tip', 'gold');
          sfx.gold();
        }
        this.goldT = 24 + Math.random() * 14;
      }
    }

    // zombies
    const stopX = this.barricadeX + 30;
    for (const z of this.zombies) {
      if (z.dead) { z.deathT += dt; continue; }
      z.hitT = Math.max(0, z.hitT - dt);
      const h = KIND_STATS[z.kind].baseH * z.scale;
      const halfW = h * (z.kind === 'brute' ? 0.42 : 0.3) * 0.6;
      if (z.kind === 'goldling') {
        // never bites — turns and sprints away at the fence line
        if (z.x - halfW <= stopX + 46) z.x += z.speed * 1.55 * dt;
        else z.x -= z.speed * dt;
        z.phase += dt * 5;
        continue;
      }
      if (z.x - halfW <= stopX) {
        if (this.mode === 'playing') {
          z.attacking = true;
          z.lungeT += dt;
          z.biteT -= dt;
          this.hp -= KIND_STATS[z.kind].dps * dt;
          this.waveHurt = true;
          if (z.biteT <= 0) {
            z.biteT = 0.9;
            this.shake = Math.max(this.shake, 5);
            this.dmgFlash = Math.max(this.dmgFlash, 0.4);
            sfx.thud();
          }
        } else {
          // ambient: recycle offscreen
          z.x = this.W + 80;
          z.y = this.horizonY + this.H * 0.12 + Math.random() * (this.H * 0.3);
          z.scale = this.groundScale(z.y);
        }
      } else {
        z.x -= z.speed * dt;
        z.attacking = false;
      }
      z.phase += dt * (2.2 + z.speed * 0.06);
    }
    this.zombies = this.zombies.filter(
      (z) => (!z.dead || z.deathT < 1.3) && (z.kind !== 'goldling' || z.dead || z.x < this.W + 90),
    );

    // supply crates age out
    for (const c of this.pickups) c.t += dt;
    this.pickups = this.pickups.filter((c) => c.t < c.life);

    if (this.mode === 'playing' && this.hp <= 0) {
      this.hp = 0;
      this.bloodBurst(this.barricadeX, this.H * 0.7, 40);
      this.gameOver();
      return;
    }

    // ambient moans
    this.moanT -= dt;
    if (this.moanT <= 0 && this.zombies.length > 0) {
      sfx.moan();
      this.moanT = 3.5 + Math.random() * 4;
    }

    // particles
    for (const p of this.particles) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'blood' || p.kind === 'chunk' || p.kind === 'casing') p.vy += 620 * dt;
      if (p.kind === 'puff') { p.vy -= 30 * dt; p.vx *= 0.92; }
      p.rot += p.vr * dt;
    }
    this.particles = this.particles.filter((p) => p.life < p.maxLife);
    if (this.particles.length > 450) this.particles.splice(0, this.particles.length - 450);

    // float texts
    for (const ft of this.texts) {
      ft.t += dt;
      ft.y -= 34 * dt;
    }
    this.texts = this.texts.filter((ft) => ft.t < ft.life);

    // decay fx
    if (this.fireT > 0) this.fireT = Math.max(0, this.fireT - dt);
    this.shake = Math.max(0, this.shake - dt * 26);
    this.recoil = Math.max(0, this.recoil - dt * 7);
    this.flashT = Math.max(0, this.flashT - dt);
    this.hitmarkerT = Math.max(0, this.hitmarkerT - dt);
    this.dmgFlash = Math.max(0, this.dmgFlash - dt * 1.6);

    // aim hover
    this.aimOnZombie = false;
    for (const z of this.zombies) {
      if (z.dead) continue;
      const h = KIND_STATS[z.kind].baseH * z.scale;
      const w = h * (z.kind === 'brute' ? 0.42 : 0.3);
      if (this.aim.x >= z.x - w * 0.75 && this.aim.x <= z.x + w * 0.75 &&
          this.aim.y >= z.y - h * 1.08 && this.aim.y <= z.y + 4) {
        this.aimOnZombie = true;
        break;
      }
    }

    this.syncHud();
  }

  // ---------------------------------------------------------------- hints
  private setHint(text: string, kind: HintMsg['kind'], key?: string): void {
    this.hint = { id: ++this.fid, kind, text };
    this.hintLife = 4.7;
    if (key) this.hintSeen[key] = this.t;
    this.syncHud(true);
  }

  private pickHint(): void {
    const alive = this.zombies.filter((z) => !z.dead);
    const checks: { key: string; cond: boolean; text: string; kind: HintMsg['kind'] }[] = [
      { key: 'dry', cond: this.ammo === 0, text: 'Chamber empty — solve the uplink to rearm.', kind: 'warn' },
      { key: 'low', cond: this.ammo > 0 && this.ammo <= 3, text: 'Ammo critical. Queue your next answer while you shoot.', kind: 'warn' },
      { key: 'fence', cond: this.hp <= 35, text: 'Palisade failing — clear the wave for +10 repair.', kind: 'warn' },
      { key: 'brute', cond: alive.some((z) => z.kind === 'brute'), text: 'Brute inbound — thick hide. Two headshots crack it.', kind: 'warn' },
      { key: 'runners', cond: alive.filter((z) => z.kind === 'runner').length >= 3, text: 'Runner pack closing — drop the sprinters first.', kind: 'warn' },
      { key: 'streak', cond: this.streak === 2, text: 'One more correct answer banks a streak bonus: +2 rounds.', kind: 'tip' },
    ];
    for (const c of checks) {
      if (c.cond && this.t - (this.hintSeen[c.key] ?? -999) > 32) {
        this.setHint(c.text, c.kind, c.key);
        return;
      }
    }
    const pool = TIP_POOL.filter((tip) => tip !== this.lastTip);
    this.lastTip = pool[Math.floor(Math.random() * pool.length)];
    this.setHint(this.lastTip, 'tip');
  }

  // ---------------------------------------------------------------- hud sync
  private syncHud(force = false): void {
    const snap: HudSnapshot = {
      mode: this.mode,
      paused: this.paused,
      ammo: this.ammo,
      score: this.score,
      best: this.best,
      wave: this.wave,
      waveKills: Math.min(this.waveKills, this.waveTarget),
      waveTarget: this.waveTarget,
      hp: Math.max(0, Math.round(this.hp)),
      streak: this.streak,
      problem: this.problem,
      input: this.input,
      feedback: this.feedback,
      banner: this.banner,
      intermission: this.intermission,
      hint: this.hint,
      buffT: Math.ceil(this.fireT),
    };
    const j = JSON.stringify(snap);
    if (force || j !== this.lastHudJson) {
      this.lastHudJson = j;
      this.cb.onHud(snap);
    }
  }

  // ---------------------------------------------------------------- loop
  private loop(now: number): void {
    const dt = Math.min(0.05, (now - this.last) / 1000 || 0.016);
    this.last = now;
    if (!this.paused) this.update(dt);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    render(this.ctx, this);
    this.raf = requestAnimationFrame(this.loop);
  }
}
