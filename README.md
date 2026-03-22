# Aligned

**A real-time multiplayer guessing game inspired by [Wavelengths](https://boardgamegeek.com/boardgame/262543/wavelength).** Players take turns giving one-word clues to help their team pinpoint a hidden target on a spectrum between two opposing concepts — like *Hot ↔ Cold* or *Overrated ↔ Underrated*.

**[Play it live →](https://aligned-pi.vercel.app)**

## How It Works

1. **Host or join** a game with a 4-letter code — no accounts needed
2. Each round, one player sees a target position on a spectrum (e.g. *Boring ↔ Exciting*)
3. They give a **one-word clue** to hint where the target is
4. Everyone else drags their guess on the dial
5. Points are awarded based on how close each guess lands to the hidden target

Supports **2–16 players** across any device. Games are fully real-time — everyone sees guesses, scores, and reveals as they happen.

## Features

- **Real-time multiplayer** — reactive state syncing via Convex, no polling
- **Interactive spectrum dial** — custom SVG component with drag-to-guess, animated reveals, and scoring wedge overlays
- **Animated lava-lamp background** — fluid WebGL-style blobs with per-player color theming
- **Sound effects** — synthesized audio cues (Web Audio API) with mute toggle
- **Touch-optimized** — pointer capture for reliable mobile drag, haptic feedback, cursor trails
- **Host resilience** — any player can claim host if the original disconnects; auto-lock timers keep the game moving even if the host goes AFK
- **In-game chat** — floating chat panel for banter between rounds
- **Confetti & celebrations** — game-over animations with individual + team score leaderboards
- **200+ spectrum pairs** across categories (classic, food, culture, philosophy, etc.)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | **Next.js 15** (App Router) + **React 19** |
| Styling | **Tailwind CSS 4** + glassmorphism design system |
| Animation | **Framer Motion** + custom SVG animations |
| Backend | **Convex** (real-time database + serverless functions) |
| Deployment | **Vercel** |

## Architecture

```
Landing Page  →  Lobby  →  Clue Phase  →  Guessing  →  Reveal  →  Game Over
     /            /game/[code]         ←— rounds loop —→
```

- **No auth required** — sessions use `crypto.randomUUID()` stored in `localStorage`
- **Server-authoritative scoring** — target positions are hidden from guessers at the query level, not just the UI
- **Scheduled functions** — auto-lock timers ensure rounds progress even without host interaction
- **Idempotent mutations** — concurrent actions (host click + timer fire) are safely handled

## Running Locally

```bash
# Install dependencies
npm install

# Start Convex backend (requires one-time login)
npx convex dev

# Start Next.js dev server
npm run dev
```

The app runs at `http://localhost:3000`. You'll need the Convex CLI authenticated — `npx convex dev` walks you through it on first run.

## Project Structure

```
convex/
  schema.ts          # Database schema (games, players, rounds, guesses)
  games.ts           # All mutations + queries
  timers.ts          # Scheduled auto-lock functions
  spectrums.ts       # 200+ spectrum pairs

src/
  app/
    page.tsx          # Landing page (host/join)
    game/[code]/      # Game page (all phases)
  components/
    SpectrumDial.tsx   # Core game dial (SVG + pointer events)
    FluidBackground.tsx # Animated lava-lamp blobs
    Timer.tsx          # Countdown timer
    PlayerBar.tsx      # Player avatars
    Confetti.tsx       # Celebration effects
    phases/            # One component per game phase
  lib/
    session.ts         # Session management
    scoring.ts         # Score calculation
    sounds.ts          # Synthesized sound effects
```

## License

MIT
