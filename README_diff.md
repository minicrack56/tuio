--- README.md (原始)


+++ README.md (修改后)
# DEAD RECKONING

**A zombie shooter where your trigger finger and your mental math fight the same war.**

The horde shambles out of a moonlit graveyard toward your palisade. Every click spends one round — headshots deal double damage and pay 1.5× points. The only resupply is your head: solve the arithmetic on the **Supply Uplink** console to load fresh rounds. Miss the answer and the magazine **drains by the exact difference** between your answer and the truth.

Built with React + TypeScript on a hand-rolled canvas engine. No asset files — every sprite, particle, and sound is procedural.

---

## How it plays

| Input | Action |
|---|---|
| `Mouse` / tap | Aim and fire (one round per shot) |
| `0–9` + `Enter` | Type and lock in the supply answer |
| `Backspace` | Delete a digit |
| `P` / `Esc` | Pause |
| `M` | Sound on/off |

On phones: tap to aim & fire, drag to track, tap supply crates to grab them.

### The economy

- **Correct answer** → +4 to +6 rounds depending on difficulty, +2 bonus every 3-answer streak
- **Wrong answer** → lose `|your answer − real answer|` rounds
- **Supply crates** drop from kills (click to grab): ammo, +14 palisade repair, or **Incendiary Rounds** (double damage for 8s)
- **Gilded Crawler** — a rare fleeing jackpot zombie worth +500 and +5 rounds
- **Combos** — double kill +150, triple kill +400; quick solves +25; flawless waves +500

### The horde

Walkers shamble, runners sprint, brutes tank body shots (two headshots crack them). Waves scale forever; each cleared wave pays a supply drop (+3 rounds, +10 repair, wave bonus). Palisade at zero and the night is over.

Three difficulties: **Rookie** (slow horde, simple sums), **Veteran** (×÷ drills), **Nightmare** (relentless, mixed-order arithmetic, fewer rounds per answer).

---

## Run it locally

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build in dist/
```

## Deploy (GitHub Pages, one click per push)

A workflow at `.github/workflows/pages.yml` builds with a relative asset base and publishes `dist/` to Pages on every push to `main`.

1. Push this repo to GitHub (commands below).
2. **Settings → Pages → Source: GitHub Actions** (one-time).
3. Your game goes live at `https://<username>.github.io/<repo>/` — open it on Android and **Add to Home screen**: it's a full offline PWA.

## Ship it to the Play Store

Capacitor is already configured (`capacitor.config.ts`, app id `com.deadreckoning.game`):

```bash
npm run build
npx cap add android   # first time only
npx cap sync          # after every rebuild
npx cap open android  # Android Studio → Build → Generate Signed APK/AAB
```

Full details in [ANDROID.md](./ANDROID.md).

---

## Under the hood

- **Canvas engine** — entity pool, raycast hit detection with pierce, particles (blood, casings, sparks), screen shake, floating combat text
- **Procedural audio** — WebAudio synth kit: gunshots, moans, chimes, buzzes; zero audio files
- **Context-aware hint radio** — tactical tips rotate every ~12s, with warnings that jump the queue (low ammo, brutes inbound, palisade failing)
- **PWA** — manifest, offline service worker, wake-lock, immersive fullscreen, safe-area insets
- Type: Creepster + Chakra Petch

## License

MIT — see [LICENSE](./LICENSE).
