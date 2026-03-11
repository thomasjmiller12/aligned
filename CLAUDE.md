# Aligned — Online Wavelengths Board Game

## Architecture

- **Frontend**: Next.js 15 (App Router) + Tailwind CSS 4 + Framer Motion
- **Backend**: Convex (reactive real-time database + scheduled functions)
- **Two pages**: `/` (landing) and `/game/[code]` (all game phases)

## Key Patterns

### Session Management
- Sessions use `crypto.randomUUID()` stored in `localStorage` (no auth required)
- `getSessionId()` in `src/lib/session.ts` creates or retrieves the session
- Host identity is tracked via `game.hostId === sessionId`

### Game Flow
```
LOBBY → CLUE_PHASE → [GUESSING → REVEALING] × N rounds → GAME_OVER
```
- Each player is assigned a round where they give a clue
- During clue phase, ALL players write clues simultaneously
- Then rounds play sequentially: show clue → everyone guesses → reveal scores
- Rounds without clues are auto-skipped

### Convex Functions
- **Mutations**: `convex/games.ts` — all game state mutations (createGame, joinGame, startGame, submitClue, submitGuess, lockGuess, advanceToGuessing, revealRound, nextRound, claimHost, playAgain)
- **Timers**: `convex/timers.ts` — `autoLockClues` and `autoLockGuesses` (internal mutations, scheduled via `ctx.scheduler`)
- **Queries**: Also in `convex/games.ts` — all reactive queries
- Timer scheduling: when timer fires, it calls an internal mutation. The `autoLockClues` also schedules `autoLockGuesses` for the first round.

### Host Transfer & Resilience
- Any player can claim host via `claimHost` mutation if the original host disconnects
- A subtle "Waiting on {host}? Become host" link appears for non-host players during active game
- `autoLockGuesses` also auto-reveals (calculates scores, transitions to "revealing") so the game progresses even if the host is AFK
- `revealRound` is idempotent (`if (game.status !== "guessing") return`) so concurrent host-click + timer-fire is safe
- Double-submit prevention on all action buttons (Lock In, Reveal, Next Round, Start Guessing, Play Again)

### Security: Target Position
- `getCurrentRound` and `getRounds` queries accept `sessionId` and **hide `targetPosition`** (return `-1`) from non-clue-giver players during guessing
- Target is only revealed to: the clue-giver (always), and all players when round status is `revealing` or `scored`
- The SpectrumDial guards rendering with `hasTarget` (checks `>= 0 && <= 180`)

### Spectrum Dial (`src/components/SpectrumDial.tsx`)
- SVG semicircle (180°), pointer events for drag interaction
- Uses `setPointerCapture` for reliable touch/mouse tracking
- Player arrows animate via Framer Motion `animate` prop on SVG elements
- Scoring wedge reveals with staggered opacity animations
- `posOnArc(deg, radius)` converts degree (0=left, 180=right) to SVG coordinates

### Scoring
- Target at 20°–160° range (avoids edges)
- Bullseye (±2°): 4pts, Close (±6°): 3pts, Near (±12°): 2pts
- Calculated both server-side (in `revealRound`) and client-side (in `RevealPhase` for display)

## File Structure
```
convex/
  schema.ts         — Database schema (games, players, rounds, guesses)
  games.ts          — All mutations + queries
  timers.ts         — Scheduled auto-lock functions
  spectrums.ts      — 200+ spectrum pairs + random selection
src/
  app/
    page.tsx        — Landing page (host/join)
    game/[code]/    — Game page (all phases)
  components/
    SpectrumDial.tsx — Hero component (SVG dial)
    Timer.tsx        — Countdown timer
    GameHeader.tsx   — Code + score + round dots
    PlayerBar.tsx    — Player avatars
    Confetti.tsx     — Game over celebration
    phases/          — One component per game phase
  lib/
    session.ts      — Session ID management
    scoring.ts      — Score calculation utilities
```

## Development

### Setup
1. `npm install`
2. `npx convex dev` (requires interactive Convex login — creates `.env.local` with Convex URL)
3. `npm run dev`

### Convex
- `convex/_generated/` files are checked in for build compatibility
- Run `npx convex dev` to regenerate after schema/function changes
- The `.convex/` directory (local cache) is gitignored

## Design Tokens
- Background: `#FFF8F0` (warm cream) — Tailwind: `bg-cream`
- Primary: `#E8553A` (warm red-orange) — `text-primary`, `bg-primary`
- Accent: `#2A9D8F` (teal) — `text-accent`, `bg-accent`
- Player colors: 8 distinct colors assigned in join order
