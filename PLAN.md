# Aligned — Implementation Plan

## Vision

**Aligned** is an online multiplayer version of the Wavelengths board game — a collaborative guessing game where players try to read each other's minds across a spectrum. It's built for remote family game nights: someone hosts, shares a code, and everyone joins from their phone or laptop.

### Design Ethos

1. **Beauty first.** Every component should feel crafted. Warm colors, smooth animations, satisfying interactions. This should feel like opening a beautifully designed board game, not using a web app.
2. **Buttery smooth multiplayer.** Real-time sync should be invisible — you just see other players' arrows gliding into place. No loading spinners, no "waiting for server", no jank.
3. **Zero friction.** No sign-up. No download. Open a link, type your name, you're in. The game should be playable within 10 seconds of someone sharing the code.

---

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| **Frontend** | Next.js 15 (App Router) | Fast, great DX, deploys to Vercel |
| **Real-time Backend** | Convex | Purpose-built for reactive multiplayer. Every query auto-syncs. Atomic mutations. Built-in scheduling for timers. |
| **Styling** | Tailwind CSS 4 + custom CSS | Utility-first with custom design tokens for the warm palette |
| **Animation** | Framer Motion | Smooth, physics-based animations for the dial, arrows, reveals |
| **Icons** | Lucide React | Clean, consistent iconography |
| **Deployment** | Vercel (frontend) + Convex Cloud (backend) | Both have generous free tiers, zero-config deployment |
| **Language** | TypeScript throughout | End-to-end type safety with Convex |

### Why Convex over Supabase

For this game specifically, Convex wins on:
- **Reactive queries**: Every `useQuery` hook auto-updates when data changes. No subscription setup.
- **Optimistic updates**: UI feels instant even before server confirms.
- **Built-in scheduling**: Perfect for game timers (countdown runs server-side, no drift).
- **Atomic mutations**: Game state transitions are transactional — no race conditions when multiple players lock in simultaneously.
- **TypeScript end-to-end**: Schema → functions → hooks, all type-safe.

---

## Game Rules (as implemented)

- **Players**: 4-8 per game
- **Rounds**: Equal to player count (each player gives exactly one clue)
- **Collaborative**: All points go to a shared team score
- **Spectrum**: A semicircular dial with two opposing concepts at each end
- **Target**: A random position on the spectrum, shown only to the clue-giver
- **Scoring wedge**: Centered on the target — bullseye (4 pts), close (3 pts), near (2 pts)

### Flow

```
LOBBY → CLUE PHASE → [GUESS ROUND → REVEAL → SCORE] × N → GAME OVER
```

1. **Lobby**: Host creates game, gets a 4-letter code. Players join with code + name. Host starts when ready.
2. **Clue Phase** (2 minutes): Every player simultaneously sees their assigned spectrum + target position. They type a one-word (or short phrase) clue. Timer counts down. Auto-locks at 0.
3. **Guess Rounds** (one per clue, sequential):
   - The clue-giver's clue is shown along with their spectrum labels
   - The spectrum dial is shown but the target/scoring zone is HIDDEN
   - All OTHER players drag a pointer on the dial to where they think the target is (90 sec)
   - Players see each other's colored arrows moving in real-time
   - Players lock in their guess (or auto-lock at 0)
   - **Reveal**: Target position and scoring wedge slide into view with a satisfying animation
   - Points are tallied and added to team score
   - Host clicks "Next" to advance
4. **Game Over**: Final team score displayed with celebration animation. Option to play again.

---

## Data Model (Convex Schema)

```typescript
// convex/schema.ts

games: defineTable({
  code: v.string(),           // 4-letter join code (e.g., "WAVE")
  hostId: v.string(),         // session ID of host
  status: v.union(
    v.literal("lobby"),
    v.literal("clue_phase"),
    v.literal("guessing"),
    v.literal("revealing"),
    v.literal("game_over")
  ),
  currentRound: v.number(),   // 0-indexed, which clue we're on
  teamScore: v.number(),
  settings: v.object({
    clueTimerSeconds: v.number(),    // default 120
    guessTimerSeconds: v.number(),   // default 90
  }),
  timerEndsAt: v.optional(v.number()), // Unix ms — server-authoritative timer
})
  .index("by_code", ["code"])
  .index("by_status", ["status"]),

players: defineTable({
  gameId: v.id("games"),
  sessionId: v.string(),      // browser session ID (stored in localStorage)
  name: v.string(),
  color: v.string(),          // hex color assigned on join
  order: v.number(),          // determines which round they give clue
  isConnected: v.boolean(),
})
  .index("by_game", ["gameId"])
  .index("by_session", ["sessionId"]),

rounds: defineTable({
  gameId: v.id("games"),
  roundIndex: v.number(),
  clueGiverId: v.id("players"),
  spectrumLeft: v.string(),   // e.g., "Underrated"
  spectrumRight: v.string(),  // e.g., "Overrated"
  targetPosition: v.number(), // 0-180 degrees on the semicircle
  clue: v.optional(v.string()),
  status: v.union(
    v.literal("pending"),       // waiting for clue phase
    v.literal("clue_given"),    // clue submitted
    v.literal("guessing"),      // players are guessing
    v.literal("revealing"),     // showing the answer
    v.literal("scored")         // points tallied
  ),
})
  .index("by_game", ["gameId"])
  .index("by_game_round", ["gameId", "roundIndex"]),

guesses: defineTable({
  roundId: v.id("rounds"),
  playerId: v.id("players"),
  position: v.number(),       // 0-180 degrees
  lockedIn: v.boolean(),
})
  .index("by_round", ["roundId"])
  .index("by_round_player", ["roundId", "playerId"]),
```

---

## Convex Functions

### Mutations
- `createGame(hostName)` → creates game + host player, returns { gameId, code }
- `joinGame(code, playerName)` → adds player to game, assigns color
- `startGame(gameId, sessionId)` → host-only. Assigns spectrums, shuffles player order, sets status to clue_phase, schedules timer
- `submitClue(roundId, sessionId, clue)` → saves the clue for the player's round
- `submitGuess(roundId, sessionId, position)` → upserts guess position (live updates as player drags)
- `lockGuess(roundId, sessionId)` → marks guess as locked
- `revealRound(gameId, sessionId)` → host-only. After all locked, reveal target
- `scoreRound(gameId, sessionId)` → calculate and add points to team score
- `nextRound(gameId, sessionId)` → host-only. Advance to next round or game_over
- `playAgain(gameId, sessionId)` → host-only. Reset game state for same players

### Queries
- `getGame(code)` → full game state
- `getPlayers(gameId)` → all players with connection status
- `getCurrentRound(gameId)` → current round data
- `getGuesses(roundId)` → all guesses for current round (real-time!)
- `getScoreboard(gameId)` → team score + per-round breakdown

### Scheduled Functions
- `autoLockClues(gameId)` → runs when clue timer expires, auto-locks any unsubmitted clues
- `autoLockGuesses(roundId)` → runs when guess timer expires, auto-locks remaining guesses

---

## UI Architecture

### Pages

```
/                    → Landing page (create or join)
/game/[code]         → Main game view (all phases rendered here)
```

That's it. Two pages. The game page reactively renders the correct phase based on game status.

### Component Tree

```
App
├── LandingPage
│   ├── Logo + Title (animated)
│   ├── CreateGameForm (just a name input + "Host Game" button)
│   └── JoinGameForm (code input + name input + "Join" button)
│
└── GamePage
    ├── GameHeader
    │   ├── GameCode (copyable, always visible)
    │   ├── TeamScore (animated counter)
    │   └── RoundIndicator (dots showing progress)
    │
    ├── PlayerBar
    │   └── PlayerAvatar[] (colored circles with initials, glow when active)
    │
    ├── PhaseRenderer (switches based on game.status)
    │   ├── LobbyPhase
    │   │   ├── PlayerList (who's joined)
    │   │   ├── ShareCode (big, prominent, copy button)
    │   │   └── StartButton (host only, enabled when 4+ players)
    │   │
    │   ├── CluePhase
    │   │   ├── Timer (countdown, prominent)
    │   │   ├── SpectrumDial (shows YOUR spectrum + target)
    │   │   ├── ClueInput (text input + submit button)
    │   │   └── PlayerStatus[] (who has submitted, checkmarks)
    │   │
    │   ├── GuessingPhase
    │   │   ├── Timer (countdown)
    │   │   ├── ClueDisplay (the clue, big and centered)
    │   │   ├── SpectrumDial (shows spectrum labels, target HIDDEN)
    │   │   │   ├── GuessDial (interactive drag handle for YOUR guess)
    │   │   │   └── PlayerArrow[] (other players' positions, colored)
    │   │   ├── LockInButton
    │   │   └── PlayerStatus[] (who has locked in)
    │   │
    │   ├── RevealPhase
    │   │   ├── SpectrumDial (target + scoring wedge revealed with animation)
    │   │   │   └── PlayerArrow[] (final positions shown)
    │   │   ├── ScoringBreakdown (who scored what)
    │   │   ├── TeamScoreUpdate (animated addition)
    │   │   └── NextButton (host only)
    │   │
    │   └── GameOverPhase
    │       ├── FinalScore (big, celebratory)
    │       ├── RoundRecap (quick summary of all rounds)
    │       └── PlayAgainButton
    │
    └── Footer (minimal, "Aligned" branding)
```

### The Spectrum Dial — Key Component

This is the hero component. It must be beautiful and satisfying.

```
Design: A semicircle (180°) rendered as an SVG/Canvas element.

Visual elements:
- Outer arc: thick, warm gradient stroke
- Spectrum labels: positioned at each end of the semicircle
- Degree markings: subtle tick marks around the arc (like a speedometer)
- Target zone (when revealed): a colored wedge overlay
  - 4pt zone: small slice, bright gold
  - 3pt zone: medium slice, warm orange (on each side of 4pt)
  - 2pt zone: larger slice, soft coral (on each side of 3pt)
- Guess pointer: a "watch hand" / needle that rotates from the center
  - Draggable by touch/mouse
  - Smooth rotation with slight momentum
  - Snaps to position with a subtle bounce
- Other players' arrows: smaller, colored indicators around the arc
  - Animate smoothly to new positions in real-time
  - Show player initial/color

Reveal animation sequence:
1. All arrows settle into final positions
2. Brief suspense pause (0.5s)
3. Scoring wedge fades in from the center outward
4. Target line appears with a "ping" animation
5. Arrows that scored light up / pulse
6. Points float up from scored arrows
```

### Color Palette

```
Background:      #FFF8F0 (warm cream)
Surface:         #FFFFFF with warm shadow
Primary:         #E8553A (warm red-orange)
Secondary:       #F4A261 (amber)
Accent:          #2A9D8F (teal, for contrast)
Text:            #2D2D2D (near-black, warm)
Text Secondary:  #6B6B6B
Success:         #4CAF50
4pt Gold:        #FFD700
3pt Orange:      #FF9800
2pt Coral:       #FF7043

Player Colors (assigned in order):
#E8553A (red-orange)
#2A9D8F (teal)
#7C3AED (purple)
#F59E0B (amber)
#EC4899 (pink)
#06B6D4 (cyan)
#84CC16 (lime)
#F97316 (orange)
```

### Typography

- **Headings**: Inter or similar geometric sans-serif, bold
- **Body**: Inter, regular weight
- **Clue display**: Large, slightly playful weight (semi-bold, larger size)
- **Score numbers**: Tabular figures, bold

### Responsive Design

- Mobile-first design (most players will be on phones)
- Spectrum dial scales to fit viewport width (max 500px)
- Touch-optimized: large tap targets, swipe-friendly dial
- Landscape mode on phones: dial takes full width
- Desktop: centered card layout, max-width container

---

## Implementation Steps

### Phase 1: Project Scaffolding & Infrastructure

**Step 1.1: Initialize project**
- Create Next.js app with TypeScript, Tailwind CSS, App Router
- Initialize Convex (`npx convex dev`)
- Set up the Convex schema (all tables as defined above)
- Set up git repo, configure for `thomasjmiller12` account
- Create private GitHub repo, push initial commit
- Configure Tailwind with custom color palette and design tokens
- Install Framer Motion, Lucide React

**Step 1.2: Deploy infrastructure**
- Deploy Convex project (production)
- Deploy to Vercel, connect to GitHub repo
- Set up environment variables (Convex URL)
- Verify end-to-end: page loads, Convex connected

### Phase 2: Core Game Engine (Convex Backend)

**Step 2.1: Game lifecycle mutations**
- `createGame` — generate unique 4-letter code, create game + host player
- `joinGame` — validate code, add player with assigned color, enforce 4-8 limit
- `startGame` — validate host, assign spectrums from curated list, shuffle player order, transition to clue_phase
- Session management: generate session IDs client-side, store in localStorage

**Step 2.2: Clue phase logic**
- `submitClue` — save clue for the round, mark as submitted
- Timer: use Convex scheduled functions to auto-advance when clue timer expires
- `autoLockClues` — for players who didn't submit, mark as "no clue" and skip their round

**Step 2.3: Guessing phase logic**
- `submitGuess` — upsert guess position (called on every drag, debounced)
- `lockGuess` — mark guess as final
- `autoLockGuesses` — scheduled function for timer expiry
- `revealRound` — transition to revealing state
- `scoreRound` — calculate points based on position relative to target + wedge

**Step 2.4: Game progression**
- `nextRound` — advance currentRound, transition to next guessing phase
- `endGame` — transition to game_over when all rounds complete
- `playAgain` — reset game for same players with new spectrums

**Step 2.5: Queries**
- All reactive queries as defined above
- Include computed fields (e.g., "is it my turn to give clue", "has everyone locked in")

**Step 2.6: Spectrum data**
- Create a `spectrums.ts` file with 200+ curated spectrum pairs
- Categorize them (classic, opinion, food, culture, quirky, etc.)
- Random selection without repeats within a game

### Phase 3: Landing Page & Lobby

**Step 3.1: Landing page**
- Warm, inviting design with the "Aligned" logo/wordmark
- Subtle animated background (soft gradient shift or floating shapes)
- Two clear CTAs: "Host a Game" and "Join a Game"
- Host flow: enter your name → get a game code
- Join flow: enter game code + your name → join lobby
- Mobile-optimized layout

**Step 3.2: Lobby**
- Display game code LARGE and prominent with a copy/share button
- Show connected players with their assigned colors
- Player avatars: colored circles with initials
- Host has a "Start Game" button (enabled at 4+ players)
- Real-time: see new players join instantly
- Subtle waiting animation

### Phase 4: The Spectrum Dial (Hero Component)

**Step 4.1: Base dial SVG**
- Semicircular arc rendered in SVG
- Tick marks around the arc (like a gauge/speedometer)
- Spectrum labels at each end
- Responsive sizing (scales with container)
- Clean, polished visual with warm color scheme

**Step 4.2: Interactive guess pointer**
- Draggable "watch hand" / needle from center of semicircle
- Touch + mouse support
- Smooth rotation following finger/cursor position
- Subtle haptic feel: slight spring animation on release
- Visual feedback: pointer glows/highlights while dragging

**Step 4.3: Multiplayer arrows**
- Other players' guess positions shown as colored arrow indicators
- Animate smoothly to new positions as guesses update in real-time
- Show player color + initial
- Locked-in arrows get a subtle "settled" visual treatment

**Step 4.4: Scoring wedge & reveal**
- Hidden by default during guessing
- Reveal animation: wedge slides in, target line appears
- 4pt/3pt/2pt zones with distinct colors (gold/orange/coral)
- Arrows that land in scoring zones pulse/glow
- Points float up from scored positions

### Phase 5: Game Phases UI

**Step 5.1: Clue phase screen**
- Your spectrum displayed with the dial showing your target position
- Large text input for typing your clue
- Prominent countdown timer
- Submit button with confirmation
- Status indicators showing who has submitted
- The clue-giver sees the full dial with target; this is THEIR private view

**Step 5.2: Guessing phase screen**
- Clue displayed prominently at top
- Spectrum labels visible on the dial
- Interactive dial for placing your guess
- Other players' arrows visible and updating live
- "Lock In" button (prominent, satisfying click)
- Timer countdown
- Clue-giver watches (can't guess on their own clue)
- Status showing who has locked in

**Step 5.3: Reveal phase screen**
- Scoring wedge reveal animation
- Individual scores shown per player for this round
- Team score updates with animated counter
- "Next" button for host
- Brief moment to celebrate/react before moving on

**Step 5.4: Game over screen**
- Big final team score with celebration animation
- Round-by-round recap (spectrum, clue, scores)
- "Play Again" button (reshuffles spectrums, same players)
- Option to return to lobby / share results

### Phase 6: Polish & Details

**Step 6.1: Animations & transitions**
- Page/phase transitions with Framer Motion (crossfade/slide)
- Score counter animations (counting up)
- Player join/leave animations in lobby
- Confetti or particle effect on game over
- Micro-interactions: button hover/press states, input focus

**Step 6.2: Timer component**
- Circular countdown timer (matches the dial aesthetic)
- Color transitions as time runs low (calm → urgent)
- Subtle pulse when under 10 seconds
- Audio cue option (gentle tick in last 5 seconds — off by default)

**Step 6.3: Responsive polish**
- Test and refine on iPhone, Android, tablet, desktop
- Ensure touch interactions are smooth on mobile
- Landscape orientation handling
- Safe area insets for notched phones
- Prevent pull-to-refresh interfering with dial drag

**Step 6.4: Edge cases & robustness**
- Handle player disconnect/reconnect gracefully
- Handle host disconnect (transfer host?)
- Handle browser refresh (rejoin via sessionId)
- Handle slow connections (optimistic UI)
- Prevent double-submissions
- Handle all timer edge cases

**Step 6.5: Sound design (optional, stretch)**
- Subtle sound effects: join game, submit clue, lock in, reveal, score
- Can be toggled off
- Use Web Audio API for low-latency

### Phase 7: Deployment & Testing

**Step 7.1: Production deployment**
- Convex production deployment
- Vercel production deployment
- Custom domain (if desired)
- Environment variable configuration

**Step 7.2: End-to-end testing**
- Open multiple browser tabs to simulate multiplayer
- Test full game flow: create → join → clue → guess → reveal → game over
- Test edge cases: timer expiry, disconnect, refresh
- Test on real phones
- Performance check: smooth animations at 60fps

---

## Spectrum Data

The game ships with 200+ curated spectrum pairs sourced from the official game and community contributions. Categories include:

- **Classic**: Hot ↔ Cold, Soft ↔ Hard, Boring ↔ Exciting
- **Opinion**: Underrated ↔ Overrated, Villain ↔ Hero, Trashy ↔ Classy
- **Best/Worst**: Bad movie ↔ Good movie, Worst chore ↔ Best chore
- **Food**: Mild ↔ Spicy, Snack ↔ Meal, Unhealthy ↔ Healthy
- **Culture**: Fantasy ↔ Sci-Fi, Star Wars ↔ Star Trek, For kids ↔ For adults
- **Quirky**: Round animal ↔ Pointy animal, Dog name ↔ Cat name, Normal ↔ Weird

Full list will be embedded in `convex/spectrums.ts`.

---

## Scoring Details

The scoring wedge is centered on the target position and spans a total of ~36° of the 180° semicircle:

| Zone | Width | Points |
|------|-------|--------|
| Bullseye | 4° | 4 pts |
| Close (×2 sides) | 4° each | 3 pts |
| Near (×2 sides) | 6° each | 2 pts |

Total wedge width: 4 + 8 + 12 = 24° (this can be tuned for difficulty)

The target position will be generated between 20° and 160° to avoid the extreme edges.

---

## Key Design Principles for Implementation

1. **Animations are not optional.** Every state transition should animate. The reveal moment is the climax of each round — make it feel magical.

2. **Real-time should feel alive.** Seeing other arrows move as people drag their pointers is what makes this feel like you're in the same room. Prioritize the smoothness of this.

3. **Mobile is the primary platform.** Most family members will play on their phones. Every interaction must feel native-app smooth on mobile.

4. **Warmth over coldness.** The color palette, rounded corners, soft shadows, and gentle animations should make this feel like a cozy game night, not a tech product.

5. **The dial is everything.** The spectrum dial is the centerpiece of the game. Spend disproportionate time making it beautiful, responsive, and satisfying to interact with. It should feel like turning a real dial.

6. **Collaborative joy.** When the team scores, celebrate together. The scoring animation should make everyone feel good. When someone's clue leads to perfect scores, highlight that moment.
