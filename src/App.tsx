import { useCallback, useEffect, useRef, useState } from 'react';
import { Game, TIP_POOL, type HintMsg } from './game/engine';
import type { HudSnapshot, GameStats } from './game/engine';
import type { Difficulty } from './game/math';
import { initAudio, setMuted } from './game/audio';

type Screen = 'menu' | 'playing' | 'over';

const DEFAULT_HUD: HudSnapshot = {
  mode: 'menu', paused: false, ammo: 12, score: 0, best: 0,
  wave: 1, waveKills: 0, waveTarget: 6, hp: 100, streak: 0,
  problem: { text: '7 + 5', answer: 12 }, input: '', feedback: null,
  banner: null, intermission: false, hint: null, buffT: 0,
};

const DIFF_META: Record<Difficulty, { name: string; sub: string }> = {
  easy: { name: 'ROOKIE', sub: 'slow horde · simple sums · +6 rounds' },
  normal: { name: 'VETERAN', sub: 'runners & brutes · ×÷ drills · +5 rounds' },
  hard: { name: 'NIGHTMARE', sub: 'relentless wave · heavy arithmetic · +4 rounds' },
};

/* ---------------------------------------------------------------- icons */
function BulletIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 10 24" className={className} aria-hidden>
      <path d="M5 0C7.6 2.2 8.6 4.8 8.6 7.4V11H1.4V7.4C1.4 4.8 2.4 2.2 5 0Z" fill="#e8b45a" />
      <rect x="1.4" y="11" width="7.2" height="11" fill="#a06a2e" />
      <rect x="1.4" y="19.5" width="7.2" height="2.5" fill="#c98f45" />
    </svg>
  );
}
function BrainIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M9.5 3.5a3 3 0 0 0-3 3c-2 .6-3 2-3 3.8 0 1.2.5 2.2 1.3 2.9A3.4 3.4 0 0 0 6 19.6c.5 1 1.7 1.6 3 1.4 1.2 1 3 1 4-.2V4.6a3 3 0 0 0-3.5-1.1Z" />
      <path d="M14.5 3.5a3 3 0 0 1 3 3c2 .6 3 2 3 3.8 0 1.2-.5 2.2-1.3 2.9a3.4 3.4 0 0 1-1.2 6.4c-.5 1-1.7 1.6-3 1.4-1.2 1-3 1-4-.2" />
      <path d="M8 9h3M13 13h4M9 16h3" strokeLinecap="round" />
    </svg>
  );
}
function SkullIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 2C7 2 3.5 5.6 3.5 10.2c0 2.8 1.4 5 3.5 6.4V20a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-3.4c2.1-1.4 3.5-3.6 3.5-6.4C20.5 5.6 17 2 12 2Zm-3.6 11.4a2.2 2.2 0 1 1 0-4.4 2.2 2.2 0 0 1 0 4.4Zm7.2 0a2.2 2.2 0 1 1 0-4.4 2.2 2.2 0 0 1 0 4.4ZM12 17l-1.6-2.6h3.2L12 17Z" />
    </svg>
  );
}
function CrosshairIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" strokeLinecap="round" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}
function PauseIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <rect x="5" y="4" width="5" height="16" /><rect x="14" y="4" width="5" height="16" />
    </svg>
  );
}
function PlayIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M7 4l13 8-13 8V4Z" />
    </svg>
  );
}
function SoundIcon({ muted, className = 'w-4 h-4' }: { muted: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 9v6h4l6 5V4L8 9H4Z" fill="currentColor" stroke="none" />
      {muted
        ? <path d="M17 9l5 6M22 9l-5 6" strokeLinecap="round" />
        : <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a9 9 0 0 1 0 12" strokeLinecap="round" />}
    </svg>
  );
}

/* ---------------------------------------------------------------- HUD bits */
function AmmoPips({ ammo }: { ammo: number }) {
  const shown = Math.min(ammo, 14);
  return (
    <div className="flex items-end gap-[3px] h-6">
      {Array.from({ length: 14 }).map((_, i) => (
        <span key={i} className={`transition-all duration-150 ${i < shown ? 'opacity-100 translate-y-0' : 'opacity-15 translate-y-[3px] grayscale'}`}>
          <BulletIcon className="w-[9px] h-[22px]" />
        </span>
      ))}
      {ammo > 14 && <span className="ml-1 text-[11px] font-bold text-toxic tabular">+{ammo - 14}</span>}
    </div>
  );
}

function StatCell({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="panel-notch-sm bg-black/40 border border-toxic/20 px-3 py-2">
      <div className="text-[10px] tracking-[0.22em] text-bone/50 uppercase">{label}</div>
      <div className={`text-xl font-bold tabular ${accent ?? 'text-bone'}`}>{value}</div>
    </div>
  );
}

/* ---------------------------------------------------------------- app */
export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const screenRef = useRef<Screen>('menu');

  const [screen, setScreenState] = useState<Screen>('menu');
  const [hud, setHud] = useState<HudSnapshot>(DEFAULT_HUD);
  const [stats, setStats] = useState<GameStats | null>(null);
  const [diff, setDiff] = useState<Difficulty>('normal');
  const [muted, setMutedState] = useState(false);
  const [tipIdx, setTipIdx] = useState(0);

  useEffect(() => {
    const iv = window.setInterval(() => setTipIdx((i) => (i + 1) % TIP_POOL.length), 4200);
    return () => window.clearInterval(iv);
  }, []);

  const setScreen = useCallback((s: Screen) => {
    screenRef.current = s;
    setScreenState(s);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new Game(canvas, {
      onHud: (h) => setHud(h),
      onGameOver: (s) => { setStats(s); setScreen('over'); },
    });
    gameRef.current = game;
    return () => { game.destroy(); gameRef.current = null; };
  }, [setScreen]);

  const startGame = useCallback((d: Difficulty) => {
    initAudio();
    setStats(null);
    gameRef.current?.start(d);
    setScreen('playing');
  }, [setScreen]);

  const toggleMute = useCallback(() => {
    initAudio();
    setMutedState((m) => { const nm = !m; setMuted(nm); return nm; });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const g = gameRef.current;
      if (!g) return;
      const s = screenRef.current;
      if (e.key >= '0' && e.key <= '9') { g.pressDigit(e.key); return; }
      if (e.key === 'Backspace') { e.preventDefault(); g.pressBack(); return; }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (s === 'playing') g.submitAnswer();
        else if (s === 'menu') startGame(diff);
        else if (s === 'over') startGame(g.difficulty);
        return;
      }
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        if (s === 'playing') g.togglePause();
        return;
      }
      if (e.key === 'm' || e.key === 'M') toggleMute();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [diff, startGame, toggleMute]);

  const playing = screen === 'playing';
  const hideCursor = playing && !hud.paused;

  return (
    <div className={`relative h-full w-full overflow-hidden no-select ${hideCursor ? 'cursor-none' : ''}`}>
      <canvas ref={canvasRef} className="absolute inset-0 block" />

      {/* ================================ MENU ================================ */}
      {screen === 'menu' && (
        <div className="absolute inset-0 flex flex-col justify-end md:justify-center pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-r from-pit/95 via-pit/60 to-pit/20" />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-pit to-transparent" />

          <div className="relative pointer-events-auto w-full max-w-6xl mx-auto px-6 md:px-12 py-8 grid md:grid-cols-[1.15fr_0.85fr] gap-8 items-end md:items-center">
            {/* left — identity + launch */}
            <div>
              <div className="anim-rise flex items-center gap-3 text-toxic/90 text-[11px] tracking-[0.34em] font-semibold">
                <span className="inline-block w-8 h-px bg-toxic/70" />
                NIGHT SHIFT · SURVIVAL ARITHMETIC
              </div>

              <h1 className="anim-rise anim-rise-1 font-display leading-[0.86] mt-4 text-bone"
                  style={{ fontSize: 'clamp(4.2rem, 11vw, 8.5rem)', textShadow: '0 0 34px rgba(141,255,60,0.28), 5px 6px 0 rgba(179,18,38,0.85)' }}>
                DEAD<br />
                <span className="text-toxic anim-flicker inline-block">RECKONING</span>
              </h1>

              <p className="anim-rise anim-rise-2 mt-4 max-w-md text-bone/80 text-sm md:text-base leading-relaxed">
                The horde shambles toward your palisade and every trigger pull spends a round.
                The only resupply is your head — <span className="text-toxic font-semibold">solve the problem, get ammo.</span>{' '}
                <span className="text-blood font-semibold">Miss the answer, lose the difference.</span>
              </p>

              {/* difficulty */}
              <div className="anim-rise anim-rise-3 mt-6">
                <div className="text-[10px] tracking-[0.3em] text-bone/50 mb-2">CHOOSE YOUR NIGHT</div>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(DIFF_META) as Difficulty[]).map((d) => (
                    <button
                      key={d}
                      onClick={() => { initAudio(); setDiff(d); }}
                      className={`panel-notch-sm px-4 py-2 text-left transition-all duration-150 border ${
                        diff === d
                          ? 'bg-moss border-toxic text-toxic shadow-[0_0_18px_rgba(141,255,60,0.25)]'
                          : 'bg-black/40 border-toxic/25 text-bone/70 hover:border-toxic/60 hover:text-bone'
                      }`}
                    >
                      <div className="font-bold text-sm tracking-widest">{DIFF_META[d].name}</div>
                      <div className="text-[10px] opacity-75">{DIFF_META[d].sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="anim-rise anim-rise-4 mt-6 flex items-center gap-4 flex-wrap">
                <button
                  onClick={() => startGame(diff)}
                  className="panel-notch-sm group relative bg-gore hover:bg-blood text-bone font-bold tracking-[0.22em] text-lg px-9 py-4 border border-blood/60 transition-all duration-150 hover:shadow-[0_0_34px_rgba(255,36,56,0.5)] hover:-translate-y-0.5 active:translate-y-0 flex items-center gap-3"
                >
                  <CrosshairIcon className="w-5 h-5" />
                  HOLD THE LINE
                  <span className="text-[10px] opacity-70 tracking-normal">[ENTER]</span>
                </button>
                {hud.best > 0 && (
                  <div className="text-bone/70 text-sm">
                    BEST <span className="text-ember font-bold tabular text-lg ml-1">{hud.best.toLocaleString()}</span>
                  </div>
                )}
              </div>

              <div key={tipIdx} className="anim-fade anim-rise-4 mt-5 flex items-start gap-2.5 max-w-md text-[10px] leading-relaxed tracking-[0.12em] text-fog/85">
                <span className="text-toxic font-bold shrink-0 tracking-[0.2em]">FIELD&nbsp;NOTE</span>
                <span className="uppercase">{TIP_POOL[tipIdx]}</span>
              </div>
            </div>

            {/* right — field manual */}
            <div className="anim-rise anim-rise-3 panel p-5 md:p-6">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[11px] tracking-[0.3em] text-toxic font-semibold">FIELD MANUAL</span>
                <SkullIcon className="w-5 h-5 text-blood" />
              </div>
              <ul className="space-y-4 text-[13px] leading-snug text-bone/85">
                <li className="flex gap-3">
                  <span className="shrink-0 mt-0.5"><BulletIcon className="w-4 h-8" /></span>
                  <span><b className="text-bone">Aim with the mouse, click to fire.</b> One round per shot — headshots deal double damage and pay 1.5× points.</span>
                </li>
                <li className="flex gap-3">
                  <span className="shrink-0 text-toxic mt-0.5"><BrainIcon className="w-6 h-6" /></span>
                  <span><b className="text-toxic">Solve the supply problem</b> with number keys + Enter. A correct answer loads fresh rounds; a wrong one <b className="text-blood">drains ammo by the difference</b> between your answer and the truth.</span>
                </li>
                <li className="flex gap-3">
                  <span className="shrink-0 text-blood mt-0.5"><SkullIcon className="w-6 h-6" /></span>
                  <span><b className="text-bone">Corpses that reach the palisade chew through it</b> — zero means the night is over. Downed foes drop <b className="text-toxic">supply crates: click to grab</b> ammo, repairs, or incendiary rounds. A <b className="text-ember">gilded crawler</b> sometimes sprints past: it pays +500 and +5 rounds.</span>
                </li>
              </ul>
              <div className="mt-5 pt-4 border-t border-toxic/15 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-bone/60 items-center">
                <span className="flex items-center gap-1.5"><span className="keycap">LMB</span> fire</span>
                <span className="flex items-center gap-1.5"><span className="keycap">0–9</span> answer</span>
                <span className="flex items-center gap-1.5"><span className="keycap">⌫</span> delete</span>
                <span className="flex items-center gap-1.5"><span className="keycap">↵</span> lock in</span>
                <span className="flex items-center gap-1.5"><span className="keycap">P</span> pause</span>
                <span className="flex items-center gap-1.5"><span className="keycap">M</span> sound</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================ HUD ================================ */}
      {playing && (
        <>
          {/* top row */}
          <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-3 pointer-events-none">
            {/* ammo */}
            <div className={`panel px-4 py-2.5 ${hud.ammo === 0 ? 'anim-danger' : ''}`}>
              <div className="flex items-baseline gap-2">
                <span className="text-[10px] tracking-[0.3em] text-toxic/80 font-semibold">AMMO</span>
                {hud.ammo === 0 && <span className="text-[10px] tracking-widest text-blood font-bold animate-pulse">SOLVE TO REARM</span>}
              </div>
              <div className={`font-bold tabular leading-none text-4xl ${hud.ammo === 0 ? 'text-blood' : hud.ammo <= 3 ? 'text-ember' : 'text-bone'}`}>
                {hud.ammo}
              </div>
              <div className="mt-1.5"><AmmoPips ammo={hud.ammo} /></div>
            </div>

            {/* wave */}
            <div className="panel hidden sm:block px-5 py-2.5 text-center">
              <div className="flex items-center justify-center gap-2">
                <SkullIcon className="w-4 h-4 text-blood" />
                <span className="font-display text-2xl text-toxic tracking-wider leading-none">WAVE {hud.wave}</span>
              </div>
              <div className="mt-2 w-44 h-2 bg-black/60 border border-toxic/25">
                <div
                  className="h-full bg-gradient-to-r from-toxicdim to-toxic transition-all duration-300"
                  style={{ width: `${(hud.waveKills / hud.waveTarget) * 100}%` }}
                />
              </div>
              <div className="mt-1 text-[10px] tracking-[0.2em] text-bone/60 tabular">
                {hud.intermission ? 'SUPPLY DROP INBOUND' : `${hud.waveKills} / ${hud.waveTarget} CLEARED`}
              </div>
            </div>

            {/* score */}
            <div className="panel px-4 py-2.5 text-right">
              <div className="text-[10px] tracking-[0.3em] text-toxic/80 font-semibold">SCORE</div>
              <div className="font-bold tabular leading-none text-3xl text-bone">{hud.score.toLocaleString()}</div>
              <div className="mt-1 flex items-center justify-end gap-3 text-[11px] tabular">
                <span className="text-bone/55">BEST {hud.best.toLocaleString()}</span>
                {hud.streak > 1 && (
                  <span className="text-ember font-bold tracking-wider">STREAK ×{hud.streak}</span>
                )}
              </div>
            </div>
          </div>

          {/* wave banner */}
          {hud.banner && (
            <div key={hud.banner.id} className="absolute inset-x-0 top-[26%] flex flex-col items-center pointer-events-none anim-banner">
              <div className="font-display text-toxic leading-none"
                   style={{ fontSize: 'clamp(3rem, 8vw, 6rem)', textShadow: '0 0 40px rgba(141,255,60,0.4), 4px 5px 0 rgba(179,18,38,0.8)' }}>
                {hud.banner.title}
              </div>
              <div className="mt-1 text-bone/80 tracking-[0.5em] text-sm font-semibold">{hud.banner.sub}</div>
            </div>
          )}

          {/* incendiary buff */}
          {hud.buffT > 0 && (
            <div className="absolute top-[104px] left-1/2 -translate-x-1/2 pointer-events-none">
              <div className="panel-notch-sm border border-ember/70 bg-[#1a0f04]/90 px-4 py-1.5 text-center shadow-[0_0_20px_rgba(255,176,58,0.25)]">
                <div className="text-[10px] font-bold tracking-[0.3em] text-ember tabular">INCENDIARY ROUNDS · {hud.buffT}s</div>
                <div className="mt-1 h-1.5 w-40 bg-black/60 border border-ember/40">
                  <div
                    className="h-full bg-gradient-to-r from-ember to-blood transition-all duration-300"
                    style={{ width: `${Math.min(100, (hud.buffT / 8) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* radio hints */}
          {hud.hint && (
            <div className="absolute bottom-24 left-1/2 z-10 -translate-x-1/2 pointer-events-none w-max max-w-[86vw]">
              <div
                key={hud.hint.id}
                className={`anim-hint flex items-center gap-2.5 px-4 py-2 panel-notch-sm border ${
                  hud.hint.kind === 'warn' ? 'border-blood/70 text-[#ffd7da]' : 'border-toxic/50 text-fog'
                } bg-[#08130a]/92 text-[11px] sm:text-xs font-bold tracking-[0.14em] uppercase shadow-[0_0_24px_rgba(0,0,0,0.6)]`}
              >
                <svg
                  viewBox="0 0 24 24"
                  className={`w-4 h-4 shrink-0 ${hud.hint.kind === 'warn' ? 'text-blood' : 'text-toxic'}`}
                  fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M4.9 19.1a10 10 0 0 1 0-14.2" />
                  <path d="M7.8 16.2a6 6 0 0 1 0-8.4" />
                  <circle cx="12" cy="12" r="2" />
                  <path d="M16.2 7.8a6 6 0 0 1 0 8.4" />
                  <path d="M19.1 4.9a10 10 0 0 1 0 14.2" />
                </svg>
                <span>{hud.hint.text}</span>
              </div>
            </div>
          )}

          {/* bottom-left: controls + buttons */}
          <div className="absolute bottom-3 left-3 flex items-center gap-2 pointer-events-none">
            <button
              onClick={() => gameRef.current?.togglePause()}
              className="panel-notch-sm pointer-events-auto w-10 h-10 grid place-items-center text-toxic hover:bg-moss transition-colors"
              title="Pause [P]"
            >
              {hud.paused ? <PlayIcon /> : <PauseIcon />}
            </button>
            <button
              onClick={toggleMute}
              className="panel-notch-sm pointer-events-auto w-10 h-10 grid place-items-center text-toxic hover:bg-moss transition-colors"
              title="Sound [M]"
            >
              <SoundIcon muted={muted} />
            </button>
            <div className="hidden lg:flex items-center gap-3 text-[11px] text-bone/55 ml-2">
              <span className="flex items-center gap-1.5"><span className="keycap">LMB</span> fire</span>
              <span className="flex items-center gap-1.5"><span className="keycap">0–9</span>+<span className="keycap">↵</span> answer</span>
              <span className="flex items-center gap-1.5"><span className="keycap">P</span> pause</span>
            </div>
          </div>

          {/* math console */}
          <div className="absolute bottom-3 right-3 w-[300px] md:w-[330px]">
            <div className={`panel p-3.5 ${hud.ammo === 0 ? 'anim-danger' : ''}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] tracking-[0.3em] text-toxic font-semibold flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 ${hud.ammo === 0 ? 'bg-blood' : 'bg-toxic'} animate-pulse`} />
                  SUPPLY UPLINK
                </span>
                <span className="text-[10px] text-bone/50 tracking-widest">REWARD +{diff === 'easy' ? 6 : diff === 'normal' ? 5 : 4}</span>
              </div>

              <div className="flex items-baseline justify-between gap-2 bg-black/50 border border-toxic/20 px-3 py-2">
                <span className="text-2xl font-bold text-bone tabular tracking-wide">{hud.problem.text} =</span>
                <span className="flex items-baseline gap-0.5 text-2xl font-bold text-toxic tabular min-w-[3ch] justify-end">
                  {hud.input || <span className="text-toxic/30">_</span>}
                  <span className="anim-caret inline-block w-[2px] h-6 bg-toxic align-baseline" />
                </span>
              </div>

              {/* feedback line */}
              <div className="h-6 mt-1.5 flex items-center">
                {hud.feedback && (
                  <div
                    key={hud.feedback.id}
                    className={`w-full text-[11px] font-bold tracking-wider px-2 py-0.5 ${
                      hud.feedback.kind === 'good' ? 'text-toxic anim-good'
                      : hud.feedback.kind === 'bad' ? 'text-blood anim-bad'
                      : 'text-ember anim-good'
                    }`}
                  >
                    {hud.feedback.text}
                  </div>
                )}
              </div>

              {/* keypad */}
              <div className="grid grid-cols-3 gap-1.5 mt-1">
                {['1','2','3','4','5','6','7','8','9'].map((d) => (
                  <button
                    key={d}
                    onPointerDown={(e) => { e.preventDefault(); gameRef.current?.pressDigit(d); }}
                    className="panel-notch-sm bg-black/45 hover:bg-moss text-bone font-bold text-lg py-1.5 border border-toxic/20 hover:border-toxic/60 transition-colors active:translate-y-px tabular"
                  >
                    {d}
                  </button>
                ))}
                <button
                  onPointerDown={(e) => { e.preventDefault(); gameRef.current?.pressBack(); }}
                  className="panel-notch-sm bg-black/45 hover:bg-moss text-bone/80 font-bold text-xs py-1.5 border border-blood/30 hover:border-blood/70 transition-colors active:translate-y-px tracking-widest"
                >
                  DEL
                </button>
                <button
                  onPointerDown={(e) => { e.preventDefault(); gameRef.current?.pressDigit('0'); }}
                  className="panel-notch-sm bg-black/45 hover:bg-moss text-bone font-bold text-lg py-1.5 border border-toxic/20 hover:border-toxic/60 transition-colors active:translate-y-px tabular"
                >
                  0
                </button>
                <button
                  onPointerDown={(e) => { e.preventDefault(); gameRef.current?.submitAnswer(); }}
                  className="panel-notch-sm bg-gore hover:bg-blood text-bone font-bold text-xs py-1.5 border border-blood/60 transition-colors active:translate-y-px tracking-widest"
                >
                  LOCK
                </button>
              </div>
            </div>
          </div>

          {/* pause overlay */}
          {hud.paused && (
            <div className="absolute inset-0 bg-pit/80 backdrop-blur-[2px] grid place-items-center pointer-events-auto">
              <div className="panel p-8 max-w-md w-full mx-4 text-center anim-rise">
                <div className="font-display text-5xl text-toxic" style={{ textShadow: '3px 4px 0 rgba(179,18,38,0.8)' }}>
                  NIGHT PAUSED
                </div>
                <p className="mt-3 text-sm text-bone/70">The horde holds its breath. Your ammo won't.</p>
                <div className="mt-6 flex gap-3 justify-center">
                  <button
                    onClick={() => gameRef.current?.togglePause()}
                    className="panel-notch-sm bg-gore hover:bg-blood px-6 py-3 font-bold tracking-[0.2em] text-sm border border-blood/60 flex items-center gap-2 transition-colors"
                  >
                    <PlayIcon /> RESUME
                  </button>
                  <button
                    onClick={() => { gameRef.current?.quitToMenu(); setScreen('menu'); }}
                    className="panel-notch-sm bg-black/50 hover:bg-moss px-6 py-3 font-bold tracking-[0.2em] text-sm border border-toxic/30 text-bone/80 transition-colors"
                  >
                    ABANDON
                  </button>
                </div>
                <div className="mt-5 text-[11px] text-bone/50 flex justify-center gap-4">
                  <span className="flex items-center gap-1.5"><span className="keycap">P</span> resume</span>
                  <span className="flex items-center gap-1.5"><span className="keycap">M</span> sound</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ================================ GAME OVER ================================ */}
      {screen === 'over' && stats && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-b from-blood/15 via-pit/70 to-pit/90" />
          <div className="relative pointer-events-auto max-w-2xl w-full mx-4 anim-rise">
            <div className="text-center">
              <div className="text-[11px] tracking-[0.4em] text-blood font-semibold">THE PALISADE HAS FALLEN</div>
              <div className="font-display leading-none mt-2 text-blood"
                   style={{ fontSize: 'clamp(3.6rem, 9vw, 7rem)', textShadow: '0 0 40px rgba(255,36,56,0.45), 4px 5px 0 rgba(0,0,0,0.7)' }}>
                OVERRUN
              </div>
              {stats.newBest && (
                <div className="mt-2 inline-block panel-notch-sm bg-ember/15 border border-ember/60 text-ember px-4 py-1 text-xs font-bold tracking-[0.3em]">
                  NEW BEST SCORE
                </div>
              )}
            </div>

            <div className="panel panel-blood mt-5 p-5">
              <div className="flex items-baseline justify-between mb-4">
                <span className="text-[10px] tracking-[0.3em] text-bone/50">AFTER-ACTION REPORT</span>
                <span className="font-bold tabular text-3xl text-bone">{stats.score.toLocaleString()} <span className="text-xs text-bone/50">PTS</span></span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <StatCell label="Wave" value={String(stats.wave)} accent="text-toxic" />
                <StatCell label="Kills" value={String(stats.kills)} />
                <StatCell label="Headshots" value={String(stats.headshots)} accent="text-ember" />
                <StatCell label="Crates grabbed" value={String(stats.pickups)} accent="text-toxic" />
                <StatCell label="Accuracy" value={`${stats.shots ? Math.round((stats.hits / stats.shots) * 100) : 0}%`} />
                <StatCell label="Math correct" value={`${stats.correct}`} accent="text-toxic" />
                <StatCell label="Math missed" value={`${stats.wrong}`} accent="text-blood" />
                <StatCell label="Best streak" value={`×${stats.bestStreak}`} accent="text-ember" />
                <StatCell label="Survived" value={`${Math.floor(stats.timeSec / 60)}:${String(Math.floor(stats.timeSec % 60)).padStart(2, '0')}`} />
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3 justify-center">
              <button
                onClick={() => startGame(gameRef.current?.difficulty ?? 'normal')}
                className="panel-notch-sm bg-gore hover:bg-blood px-8 py-3.5 font-bold tracking-[0.22em] border border-blood/60 flex items-center gap-3 transition-all hover:shadow-[0_0_28px_rgba(255,36,56,0.45)]"
              >
                <CrosshairIcon className="w-5 h-5" /> RE-ARM <span className="text-[10px] opacity-70">[ENTER]</span>
              </button>
              <button
                onClick={() => { gameRef.current?.quitToMenu(); setScreen('menu'); }}
                className="panel-notch-sm bg-black/50 hover:bg-moss px-8 py-3.5 font-bold tracking-[0.22em] border border-toxic/30 text-bone/85 transition-colors"
              >
                MAIN MENU
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


+++ src/App.tsx (修改后)
import { useCallback, useEffect, useRef, useState } from 'react';
import { Game, TIP_POOL, type HintMsg } from './game/engine';
import type { HudSnapshot, GameStats } from './game/engine';
import type { Difficulty } from './game/math';
import { initAudio, setMuted } from './game/audio';

type Screen = 'menu' | 'playing' | 'over';

const DEFAULT_HUD: HudSnapshot = {
  mode: 'menu', paused: false, ammo: 12, score: 0, best: 0,
  wave: 1, waveKills: 0, waveTarget: 6, hp: 100, streak: 0,
  problem: { text: '7 + 5', answer: 12 }, input: '', feedback: null,
  banner: null, intermission: false, hint: null, buffT: 0,
};

const DIFF_META: Record<Difficulty, { name: string; sub: string }> = {
  easy: { name: 'ROOKIE', sub: 'slow horde · simple sums · +6 rounds' },
  normal: { name: 'VETERAN', sub: 'runners & brutes · ×÷ drills · +5 rounds' },
  hard: { name: 'NIGHTMARE', sub: 'relentless wave · heavy arithmetic · +4 rounds' },
};

/* ---------------------------------------------------------------- icons */
function BulletIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 10 24" className={className} aria-hidden>
      <path d="M5 0C7.6 2.2 8.6 4.8 8.6 7.4V11H1.4V7.4C1.4 4.8 2.4 2.2 5 0Z" fill="#e8b45a" />
      <rect x="1.4" y="11" width="7.2" height="11" fill="#a06a2e" />
      <rect x="1.4" y="19.5" width="7.2" height="2.5" fill="#c98f45" />
    </svg>
  );
}
function BrainIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M9.5 3.5a3 3 0 0 0-3 3c-2 .6-3 2-3 3.8 0 1.2.5 2.2 1.3 2.9A3.4 3.4 0 0 0 6 19.6c.5 1 1.7 1.6 3 1.4 1.2 1 3 1 4-.2V4.6a3 3 0 0 0-3.5-1.1Z" />
      <path d="M14.5 3.5a3 3 0 0 1 3 3c2 .6 3 2 3 3.8 0 1.2-.5 2.2-1.3 2.9a3.4 3.4 0 0 1-1.2 6.4c-.5 1-1.7 1.6-3 1.4-1.2 1-3 1-4-.2" />
      <path d="M8 9h3M13 13h4M9 16h3" strokeLinecap="round" />
    </svg>
  );
}
function SkullIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 2C7 2 3.5 5.6 3.5 10.2c0 2.8 1.4 5 3.5 6.4V20a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-3.4c2.1-1.4 3.5-3.6 3.5-6.4C20.5 5.6 17 2 12 2Zm-3.6 11.4a2.2 2.2 0 1 1 0-4.4 2.2 2.2 0 0 1 0 4.4Zm7.2 0a2.2 2.2 0 1 1 0-4.4 2.2 2.2 0 0 1 0 4.4ZM12 17l-1.6-2.6h3.2L12 17Z" />
    </svg>
  );
}
function CrosshairIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" strokeLinecap="round" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}
function PauseIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <rect x="5" y="4" width="5" height="16" /><rect x="14" y="4" width="5" height="16" />
    </svg>
  );
}
function PlayIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M7 4l13 8-13 8V4Z" />
    </svg>
  );
}
function SoundIcon({ muted, className = 'w-4 h-4' }: { muted: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 9v6h4l6 5V4L8 9H4Z" fill="currentColor" stroke="none" />
      {muted
        ? <path d="M17 9l5 6M22 9l-5 6" strokeLinecap="round" />
        : <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a9 9 0 0 1 0 12" strokeLinecap="round" />}
    </svg>
  );
}

/* ---------------------------------------------------------------- HUD bits */
function AmmoPips({ ammo }: { ammo: number }) {
  const shown = Math.min(ammo, 14);
  return (
    <div className="flex items-end gap-[3px] h-6">
      {Array.from({ length: 14 }).map((_, i) => (
        <span key={i} className={`transition-all duration-150 ${i < shown ? 'opacity-100 translate-y-0' : 'opacity-15 translate-y-[3px] grayscale'}`}>
          <BulletIcon className="w-[9px] h-[22px]" />
        </span>
      ))}
      {ammo > 14 && <span className="ml-1 text-[11px] font-bold text-toxic tabular">+{ammo - 14}</span>}
    </div>
  );
}

function StatCell({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="panel-notch-sm bg-black/40 border border-toxic/20 px-3 py-2">
      <div className="text-[10px] tracking-[0.22em] text-bone/50 uppercase">{label}</div>
      <div className={`text-xl font-bold tabular ${accent ?? 'text-bone'}`}>{value}</div>
    </div>
  );
}

/* ---------------------------------------------------------------- app */
export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);
  const screenRef = useRef<Screen>('menu');

  const [screen, setScreenState] = useState<Screen>('menu');
  const [hud, setHud] = useState<HudSnapshot>(DEFAULT_HUD);
  const [stats, setStats] = useState<GameStats | null>(null);
  const [diff, setDiff] = useState<Difficulty>('normal');
  const [muted, setMutedState] = useState(false);
  const [tipIdx, setTipIdx] = useState(0);

  useEffect(() => {
    const iv = window.setInterval(() => setTipIdx((i) => (i + 1) % TIP_POOL.length), 4200);
    return () => window.clearInterval(iv);
  }, []);

  const setScreen = useCallback((s: Screen) => {
    screenRef.current = s;
    setScreenState(s);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new Game(canvas, {
      onHud: (h) => setHud(h),
      onGameOver: (s) => { setStats(s); setScreen('over'); },
    });
    gameRef.current = game;
    return () => { game.destroy(); gameRef.current = null; };
  }, [setScreen]);

  const startGame = useCallback((d: Difficulty) => {
    initAudio();
    setStats(null);
    gameRef.current?.start(d);
    setScreen('playing');
    // phone niceties: immersive fullscreen + keep the screen awake
    try {
      if (!document.fullscreenElement) {
        void document.documentElement.requestFullscreen?.().catch(() => {});
      }
    } catch { /* not critical */ }
    type WakeLockNav = Navigator & { wakeLock?: { request: (t: 'screen') => Promise<unknown> } };
    void (navigator as WakeLockNav).wakeLock?.request('screen').catch(() => {});
  }, [setScreen]);

  const toggleMute = useCallback(() => {
    initAudio();
    setMutedState((m) => { const nm = !m; setMuted(nm); return nm; });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const g = gameRef.current;
      if (!g) return;
      const s = screenRef.current;
      if (e.key >= '0' && e.key <= '9') { g.pressDigit(e.key); return; }
      if (e.key === 'Backspace') { e.preventDefault(); g.pressBack(); return; }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (s === 'playing') g.submitAnswer();
        else if (s === 'menu') startGame(diff);
        else if (s === 'over') startGame(g.difficulty);
        return;
      }
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        if (s === 'playing') g.togglePause();
        return;
      }
      if (e.key === 'm' || e.key === 'M') toggleMute();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [diff, startGame, toggleMute]);

  const playing = screen === 'playing';
  const hideCursor = playing && !hud.paused;

  return (
    <div className={`relative h-full w-full overflow-hidden no-select ${hideCursor ? 'cursor-none' : ''}`}>
      <canvas ref={canvasRef} className="absolute inset-0 block" />

      {/* ================================ MENU ================================ */}
      {screen === 'menu' && (
        <div className="absolute inset-0 flex flex-col justify-end md:justify-center pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-r from-pit/95 via-pit/60 to-pit/20" />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-pit to-transparent" />

          <div className="relative pointer-events-auto w-full max-w-6xl mx-auto px-6 md:px-12 py-8 grid md:grid-cols-[1.15fr_0.85fr] gap-8 items-end md:items-center">
            {/* left — identity + launch */}
            <div>
              <div className="anim-rise flex items-center gap-3 text-toxic/90 text-[11px] tracking-[0.34em] font-semibold">
                <span className="inline-block w-8 h-px bg-toxic/70" />
                NIGHT SHIFT · SURVIVAL ARITHMETIC
              </div>

              <h1 className="anim-rise anim-rise-1 font-display leading-[0.86] mt-4 text-bone"
                  style={{ fontSize: 'clamp(4.2rem, 11vw, 8.5rem)', textShadow: '0 0 34px rgba(141,255,60,0.28), 5px 6px 0 rgba(179,18,38,0.85)' }}>
                DEAD<br />
                <span className="text-toxic anim-flicker inline-block">RECKONING</span>
              </h1>

              <p className="anim-rise anim-rise-2 mt-4 max-w-md text-bone/80 text-sm md:text-base leading-relaxed">
                The horde shambles toward your palisade and every trigger pull spends a round.
                The only resupply is your head — <span className="text-toxic font-semibold">solve the problem, get ammo.</span>{' '}
                <span className="text-blood font-semibold">Miss the answer, lose the difference.</span>
              </p>

              {/* difficulty */}
              <div className="anim-rise anim-rise-3 mt-6">
                <div className="text-[10px] tracking-[0.3em] text-bone/50 mb-2">CHOOSE YOUR NIGHT</div>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(DIFF_META) as Difficulty[]).map((d) => (
                    <button
                      key={d}
                      onClick={() => { initAudio(); setDiff(d); }}
                      className={`panel-notch-sm px-4 py-2 text-left transition-all duration-150 border ${
                        diff === d
                          ? 'bg-moss border-toxic text-toxic shadow-[0_0_18px_rgba(141,255,60,0.25)]'
                          : 'bg-black/40 border-toxic/25 text-bone/70 hover:border-toxic/60 hover:text-bone'
                      }`}
                    >
                      <div className="font-bold text-sm tracking-widest">{DIFF_META[d].name}</div>
                      <div className="text-[10px] opacity-75">{DIFF_META[d].sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="anim-rise anim-rise-4 mt-6 flex items-center gap-4 flex-wrap">
                <button
                  onClick={() => startGame(diff)}
                  className="panel-notch-sm group relative bg-gore hover:bg-blood text-bone font-bold tracking-[0.22em] text-lg px-9 py-4 border border-blood/60 transition-all duration-150 hover:shadow-[0_0_34px_rgba(255,36,56,0.5)] hover:-translate-y-0.5 active:translate-y-0 flex items-center gap-3"
                >
                  <CrosshairIcon className="w-5 h-5" />
                  HOLD THE LINE
                  <span className="text-[10px] opacity-70 tracking-normal">[ENTER]</span>
                </button>
                {hud.best > 0 && (
                  <div className="text-bone/70 text-sm">
                    BEST <span className="text-ember font-bold tabular text-lg ml-1">{hud.best.toLocaleString()}</span>
                  </div>
                )}
              </div>

              <div className="landscape:hidden mt-4 flex items-center gap-2.5 text-[10px] tracking-[0.18em] text-ember/90 font-bold">
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="7" y="2.5" width="10" height="19" rx="2" transform="rotate(90 12 12)" />
                  <path d="M10.5 12h3" />
                  <path d="M4 8.5V6a2 2 0 0 1 2-2h2.5M20 15.5V18a2 2 0 0 1-2 2h-2.5" />
                </svg>
                ROTATE YOUR PHONE — WIDER KILL ZONE
              </div>

              <div key={tipIdx} className="anim-fade anim-rise-4 mt-5 flex items-start gap-2.5 max-w-md text-[10px] leading-relaxed tracking-[0.12em] text-fog/85">
                <span className="text-toxic font-bold shrink-0 tracking-[0.2em]">FIELD&nbsp;NOTE</span>
                <span className="uppercase">{TIP_POOL[tipIdx]}</span>
              </div>
            </div>

            {/* right — field manual */}
            <div className="anim-rise anim-rise-3 panel p-5 md:p-6">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[11px] tracking-[0.3em] text-toxic font-semibold">FIELD MANUAL</span>
                <SkullIcon className="w-5 h-5 text-blood" />
              </div>
              <ul className="space-y-4 text-[13px] leading-snug text-bone/85">
                <li className="flex gap-3">
                  <span className="shrink-0 mt-0.5"><BulletIcon className="w-4 h-8" /></span>
                  <span><b className="text-bone">Aim with the mouse, click to fire.</b> One round per shot — headshots deal double damage and pay 1.5× points.</span>
                </li>
                <li className="flex gap-3">
                  <span className="shrink-0 text-toxic mt-0.5"><BrainIcon className="w-6 h-6" /></span>
                  <span><b className="text-toxic">Solve the supply problem</b> with number keys + Enter. A correct answer loads fresh rounds; a wrong one <b className="text-blood">drains ammo by the difference</b> between your answer and the truth.</span>
                </li>
                <li className="flex gap-3">
                  <span className="shrink-0 text-blood mt-0.5"><SkullIcon className="w-6 h-6" /></span>
                  <span><b className="text-bone">Corpses that reach the palisade chew through it</b> — zero means the night is over. Downed foes drop <b className="text-toxic">supply crates: click to grab</b> ammo, repairs, or incendiary rounds. A <b className="text-ember">gilded crawler</b> sometimes sprints past: it pays +500 and +5 rounds.</span>
                </li>
              </ul>
              <div className="mt-3 text-[11px] text-bone/55">
                <b className="text-fog">On phones:</b> tap to aim & fire, drag to track. Crates are tapped to grab. Install it — it runs fullscreen, offline, in landscape or portrait.
              </div>
              <div className="mt-5 pt-4 border-t border-toxic/15 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-bone/60 items-center">
                <span className="flex items-center gap-1.5"><span className="keycap">LMB</span> fire</span>
                <span className="flex items-center gap-1.5"><span className="keycap">0–9</span> answer</span>
                <span className="flex items-center gap-1.5"><span className="keycap">⌫</span> delete</span>
                <span className="flex items-center gap-1.5"><span className="keycap">↵</span> lock in</span>
                <span className="flex items-center gap-1.5"><span className="keycap">P</span> pause</span>
                <span className="flex items-center gap-1.5"><span className="keycap">M</span> sound</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================ HUD ================================ */}
      {playing && (
        <>
          {/* top row */}
          <div className="absolute top-3 inset-x-0 safe-x flex items-start justify-between gap-3 pointer-events-none">
            {/* ammo */}
            <div className={`panel px-4 py-2.5 ${hud.ammo === 0 ? 'anim-danger' : ''}`}>
              <div className="flex items-baseline gap-2">
                <span className="text-[10px] tracking-[0.3em] text-toxic/80 font-semibold">AMMO</span>
                {hud.ammo === 0 && <span className="text-[10px] tracking-widest text-blood font-bold animate-pulse">SOLVE TO REARM</span>}
              </div>
              <div className={`font-bold tabular leading-none text-4xl ${hud.ammo === 0 ? 'text-blood' : hud.ammo <= 3 ? 'text-ember' : 'text-bone'}`}>
                {hud.ammo}
              </div>
              <div className="mt-1.5"><AmmoPips ammo={hud.ammo} /></div>
            </div>

            {/* wave */}
            <div className="panel hidden sm:block px-5 py-2.5 text-center">
              <div className="flex items-center justify-center gap-2">
                <SkullIcon className="w-4 h-4 text-blood" />
                <span className="font-display text-2xl text-toxic tracking-wider leading-none">WAVE {hud.wave}</span>
              </div>
              <div className="mt-2 w-44 h-2 bg-black/60 border border-toxic/25">
                <div
                  className="h-full bg-gradient-to-r from-toxicdim to-toxic transition-all duration-300"
                  style={{ width: `${(hud.waveKills / hud.waveTarget) * 100}%` }}
                />
              </div>
              <div className="mt-1 text-[10px] tracking-[0.2em] text-bone/60 tabular">
                {hud.intermission ? 'SUPPLY DROP INBOUND' : `${hud.waveKills} / ${hud.waveTarget} CLEARED`}
              </div>
            </div>

            {/* score */}
            <div className="panel px-4 py-2.5 text-right">
              <div className="text-[10px] tracking-[0.3em] text-toxic/80 font-semibold">SCORE</div>
              <div className="font-bold tabular leading-none text-3xl text-bone">{hud.score.toLocaleString()}</div>
              <div className="mt-1 flex items-center justify-end gap-3 text-[11px] tabular">
                <span className="text-bone/55">BEST {hud.best.toLocaleString()}</span>
                {hud.streak > 1 && (
                  <span className="text-ember font-bold tracking-wider">STREAK ×{hud.streak}</span>
                )}
              </div>
            </div>
          </div>

          {/* wave banner */}
          {hud.banner && (
            <div key={hud.banner.id} className="absolute inset-x-0 top-[26%] flex flex-col items-center pointer-events-none anim-banner">
              <div className="font-display text-toxic leading-none"
                   style={{ fontSize: 'clamp(3rem, 8vw, 6rem)', textShadow: '0 0 40px rgba(141,255,60,0.4), 4px 5px 0 rgba(179,18,38,0.8)' }}>
                {hud.banner.title}
              </div>
              <div className="mt-1 text-bone/80 tracking-[0.5em] text-sm font-semibold">{hud.banner.sub}</div>
            </div>
          )}

          {/* incendiary buff */}
          {hud.buffT > 0 && (
            <div className="absolute top-[104px] left-1/2 -translate-x-1/2 pointer-events-none">
              <div className="panel-notch-sm border border-ember/70 bg-[#1a0f04]/90 px-4 py-1.5 text-center shadow-[0_0_20px_rgba(255,176,58,0.25)]">
                <div className="text-[10px] font-bold tracking-[0.3em] text-ember tabular">INCENDIARY ROUNDS · {hud.buffT}s</div>
                <div className="mt-1 h-1.5 w-40 bg-black/60 border border-ember/40">
                  <div
                    className="h-full bg-gradient-to-r from-ember to-blood transition-all duration-300"
                    style={{ width: `${Math.min(100, (hud.buffT / 8) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* radio hints */}
          {hud.hint && (
            <div className="absolute bottom-24 left-1/2 z-10 -translate-x-1/2 pointer-events-none w-max max-w-[86vw]">
              <div
                key={hud.hint.id}
                className={`anim-hint flex items-center gap-2.5 px-4 py-2 panel-notch-sm border ${
                  hud.hint.kind === 'warn' ? 'border-blood/70 text-[#ffd7da]' : 'border-toxic/50 text-fog'
                } bg-[#08130a]/92 text-[11px] sm:text-xs font-bold tracking-[0.14em] uppercase shadow-[0_0_24px_rgba(0,0,0,0.6)]`}
              >
                <svg
                  viewBox="0 0 24 24"
                  className={`w-4 h-4 shrink-0 ${hud.hint.kind === 'warn' ? 'text-blood' : 'text-toxic'}`}
                  fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M4.9 19.1a10 10 0 0 1 0-14.2" />
                  <path d="M7.8 16.2a6 6 0 0 1 0-8.4" />
                  <circle cx="12" cy="12" r="2" />
                  <path d="M16.2 7.8a6 6 0 0 1 0 8.4" />
                  <path d="M19.1 4.9a10 10 0 0 1 0 14.2" />
                </svg>
                <span>{hud.hint.text}</span>
              </div>
            </div>
          )}

          {/* bottom-left: controls + buttons */}
          <div className="absolute bottom-3 left-0 safe-x safe-bottom flex items-center gap-2 pointer-events-none">
            <button
              onClick={() => gameRef.current?.togglePause()}
              className="panel-notch-sm pointer-events-auto w-10 h-10 grid place-items-center text-toxic hover:bg-moss transition-colors"
              title="Pause [P]"
            >
              {hud.paused ? <PlayIcon /> : <PauseIcon />}
            </button>
            <button
              onClick={toggleMute}
              className="panel-notch-sm pointer-events-auto w-10 h-10 grid place-items-center text-toxic hover:bg-moss transition-colors"
              title="Sound [M]"
            >
              <SoundIcon muted={muted} />
            </button>
            <div className="hidden lg:flex items-center gap-3 text-[11px] text-bone/55 ml-2">
              <span className="flex items-center gap-1.5"><span className="keycap">LMB</span> fire</span>
              <span className="flex items-center gap-1.5"><span className="keycap">0–9</span>+<span className="keycap">↵</span> answer</span>
              <span className="flex items-center gap-1.5"><span className="keycap">P</span> pause</span>
            </div>
          </div>

          {/* math console */}
          <div className="absolute bottom-3 right-0 safe-x safe-bottom">
            <div className={`panel p-3.5 w-[300px] md:w-[330px] ${hud.ammo === 0 ? 'anim-danger' : ''}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] tracking-[0.3em] text-toxic font-semibold flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 ${hud.ammo === 0 ? 'bg-blood' : 'bg-toxic'} animate-pulse`} />
                  SUPPLY UPLINK
                </span>
                <span className="text-[10px] text-bone/50 tracking-widest">REWARD +{diff === 'easy' ? 6 : diff === 'normal' ? 5 : 4}</span>
              </div>

              <div className="flex items-baseline justify-between gap-2 bg-black/50 border border-toxic/20 px-3 py-2">
                <span className="text-2xl font-bold text-bone tabular tracking-wide">{hud.problem.text} =</span>
                <span className="flex items-baseline gap-0.5 text-2xl font-bold text-toxic tabular min-w-[3ch] justify-end">
                  {hud.input || <span className="text-toxic/30">_</span>}
                  <span className="anim-caret inline-block w-[2px] h-6 bg-toxic align-baseline" />
                </span>
              </div>

              {/* feedback line */}
              <div className="h-6 mt-1.5 flex items-center">
                {hud.feedback && (
                  <div
                    key={hud.feedback.id}
                    className={`w-full text-[11px] font-bold tracking-wider px-2 py-0.5 ${
                      hud.feedback.kind === 'good' ? 'text-toxic anim-good'
                      : hud.feedback.kind === 'bad' ? 'text-blood anim-bad'
                      : 'text-ember anim-good'
                    }`}
                  >
                    {hud.feedback.text}
                  </div>
                )}
              </div>

              {/* keypad */}
              <div className="grid grid-cols-3 gap-1.5 mt-1">
                {['1','2','3','4','5','6','7','8','9'].map((d) => (
                  <button
                    key={d}
                    onPointerDown={(e) => { e.preventDefault(); gameRef.current?.pressDigit(d); }}
                    className="panel-notch-sm bg-black/45 hover:bg-moss text-bone font-bold text-lg py-1.5 border border-toxic/20 hover:border-toxic/60 transition-colors active:translate-y-px tabular"
                  >
                    {d}
                  </button>
                ))}
                <button
                  onPointerDown={(e) => { e.preventDefault(); gameRef.current?.pressBack(); }}
                  className="panel-notch-sm bg-black/45 hover:bg-moss text-bone/80 font-bold text-xs py-1.5 border border-blood/30 hover:border-blood/70 transition-colors active:translate-y-px tracking-widest"
                >
                  DEL
                </button>
                <button
                  onPointerDown={(e) => { e.preventDefault(); gameRef.current?.pressDigit('0'); }}
                  className="panel-notch-sm bg-black/45 hover:bg-moss text-bone font-bold text-lg py-1.5 border border-toxic/20 hover:border-toxic/60 transition-colors active:translate-y-px tabular"
                >
                  0
                </button>
                <button
                  onPointerDown={(e) => { e.preventDefault(); gameRef.current?.submitAnswer(); }}
                  className="panel-notch-sm bg-gore hover:bg-blood text-bone font-bold text-xs py-1.5 border border-blood/60 transition-colors active:translate-y-px tracking-widest"
                >
                  LOCK
                </button>
              </div>
            </div>
          </div>

          {/* pause overlay */}
          {hud.paused && (
            <div className="absolute inset-0 bg-pit/80 backdrop-blur-[2px] grid place-items-center pointer-events-auto">
              <div className="panel p-8 max-w-md w-full mx-4 text-center anim-rise">
                <div className="font-display text-5xl text-toxic" style={{ textShadow: '3px 4px 0 rgba(179,18,38,0.8)' }}>
                  NIGHT PAUSED
                </div>
                <p className="mt-3 text-sm text-bone/70">The horde holds its breath. Your ammo won't.</p>
                <div className="mt-6 flex gap-3 justify-center">
                  <button
                    onClick={() => gameRef.current?.togglePause()}
                    className="panel-notch-sm bg-gore hover:bg-blood px-6 py-3 font-bold tracking-[0.2em] text-sm border border-blood/60 flex items-center gap-2 transition-colors"
                  >
                    <PlayIcon /> RESUME
                  </button>
                  <button
                    onClick={() => { gameRef.current?.quitToMenu(); setScreen('menu'); }}
                    className="panel-notch-sm bg-black/50 hover:bg-moss px-6 py-3 font-bold tracking-[0.2em] text-sm border border-toxic/30 text-bone/80 transition-colors"
                  >
                    ABANDON
                  </button>
                </div>
                <div className="mt-5 text-[11px] text-bone/50 flex justify-center gap-4">
                  <span className="flex items-center gap-1.5"><span className="keycap">P</span> resume</span>
                  <span className="flex items-center gap-1.5"><span className="keycap">M</span> sound</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ================================ GAME OVER ================================ */}
      {screen === 'over' && stats && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-b from-blood/15 via-pit/70 to-pit/90" />
          <div className="relative pointer-events-auto max-w-2xl w-full mx-4 anim-rise">
            <div className="text-center">
              <div className="text-[11px] tracking-[0.4em] text-blood font-semibold">THE PALISADE HAS FALLEN</div>
              <div className="font-display leading-none mt-2 text-blood"
                   style={{ fontSize: 'clamp(3.6rem, 9vw, 7rem)', textShadow: '0 0 40px rgba(255,36,56,0.45), 4px 5px 0 rgba(0,0,0,0.7)' }}>
                OVERRUN
              </div>
              {stats.newBest && (
                <div className="mt-2 inline-block panel-notch-sm bg-ember/15 border border-ember/60 text-ember px-4 py-1 text-xs font-bold tracking-[0.3em]">
                  NEW BEST SCORE
                </div>
              )}
            </div>

            <div className="panel panel-blood mt-5 p-5">
              <div className="flex items-baseline justify-between mb-4">
                <span className="text-[10px] tracking-[0.3em] text-bone/50">AFTER-ACTION REPORT</span>
                <span className="font-bold tabular text-3xl text-bone">{stats.score.toLocaleString()} <span className="text-xs text-bone/50">PTS</span></span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <StatCell label="Wave" value={String(stats.wave)} accent="text-toxic" />
                <StatCell label="Kills" value={String(stats.kills)} />
                <StatCell label="Headshots" value={String(stats.headshots)} accent="text-ember" />
                <StatCell label="Crates grabbed" value={String(stats.pickups)} accent="text-toxic" />
                <StatCell label="Accuracy" value={`${stats.shots ? Math.round((stats.hits / stats.shots) * 100) : 0}%`} />
                <StatCell label="Math correct" value={`${stats.correct}`} accent="text-toxic" />
                <StatCell label="Math missed" value={`${stats.wrong}`} accent="text-blood" />
                <StatCell label="Best streak" value={`×${stats.bestStreak}`} accent="text-ember" />
                <StatCell label="Survived" value={`${Math.floor(stats.timeSec / 60)}:${String(Math.floor(stats.timeSec % 60)).padStart(2, '0')}`} />
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3 justify-center">
              <button
                onClick={() => startGame(gameRef.current?.difficulty ?? 'normal')}
                className="panel-notch-sm bg-gore hover:bg-blood px-8 py-3.5 font-bold tracking-[0.22em] border border-blood/60 flex items-center gap-3 transition-all hover:shadow-[0_0_28px_rgba(255,36,56,0.45)]"
              >
                <CrosshairIcon className="w-5 h-5" /> RE-ARM <span className="text-[10px] opacity-70">[ENTER]</span>
              </button>
              <button
                onClick={() => { gameRef.current?.quitToMenu(); setScreen('menu'); }}
                className="panel-notch-sm bg-black/50 hover:bg-moss px-8 py-3.5 font-bold tracking-[0.22em] border border-toxic/30 text-bone/85 transition-colors"
              >
                MAIN MENU
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
