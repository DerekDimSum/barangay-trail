# Barangay Trail: Road to Fiesta 🛺🎉

A tiny Filipino-inspired, Oregon Trail–lite survival game. You leave at **6 AM**, ten barangays from the fiesta, juggling four resources — **Coins 🪙, Food 🍚, Fuel ⛽, and Goodwill 💛**. Generous choices burn daylight, and after dark the world only stays kind to people it loves. If any resource hits 0, you're stranded — that's the only way to lose. Arrive early and you catch the fireworks; arrive late and you help wash the dishes.

This is a **concept prototype** built to be judged from a phone screen: mobile-native 9:16, one screen, playable in under 2 minutes. Vanilla HTML/CSS/JS, zero dependencies, zero build step, zero external assets.

## How it works

- **You are bringing someone to the fiesta.** Every run starts at the passenger pick — the group chat gives you 2 of 5 possible passengers (Tita Baby, Kuya Jun, Lola Cora, Bunso Nico, Cousin Jessa); choose one, no backsies. Your passenger rides in the HUD and in your share card. (Identity only for now — passenger passives come later.)
- A run is **10 legs**. Each leg: sometimes the road just *happens to you* (an **interlude** — no choice, carabao crossings, flat tires, free pandesal; it can strand you near death but never kill you), then an event fires with **two choices** — occasionally a **third** your stats unlocked (💛 8+ gets you the suki lane; 🪙 9+ buys ice for the whole street).
- **The Daylight system**: every button shows the TOTAL hours that stop will take (🕐 1 hr green / 2 hrs amber / 3 hrs red), and the HUD keeps the exchange rate visible at all times: "☀️ 8 hrs of daylight · 9 stops to go." One extra hour = one more stop in the dark. The generous options are usually the slow ones. The HUD clock and the whole sky shift umaga → hapon → gabi, and **at night (5 PM+) the world closes**: every bonus is trimmed by 1 — *unless goodwill is 8+*, because the people you helped leave their lights on for you. Night also unlocks hostile interludes (askals, wrong turns) and, for the beloved, blessings (a tanod escort, a porch dinner). Arrival time sets **win quality**, never failure: before 8 PM = fireworks (+150 score), before 11 PM = last dance (+75), later = hugasan duty (+0, gently roasted).
- **Two fixed landmarks** anchor every run: **Ang Lumang Tulay** at stop 5 (cross the grumpy old bridge, pay for Mang Islaw's bangka, or ride the kapitan's barge if you're beloved) and **Ang Huling Kanto** at stop 10 (cruise in, cut through the cemetery, or full birit down the highway). Landmarks hold the game's **only gambles** — 🎲 50/50 rolls with the time range shown on the button (`🎲 +0–2 hrs`). Dice only where it's dramatic; transparency everywhere else.
- **The road remembers**: some choices plant flags (utang sa listahan, lending the kapitbahay money, the liga buzzer-beater) that trigger payoff interludes later in the same run. Low resources also pull relevant events into the draw (low fuel makes the gas station more likely), high or low goodwill draws blessing or cold-shoulder moments.
- **Goodwill is special**: some events let you pay in goodwill instead of coins (utang na loob), goodwill is only earned by *giving away* another resource, below 3 the cold shoulder trims every bonus (stacking with the night trim), and 8+ is your night insurance. Utang na loob, literally.
- Balance is verified by a built-in Monte Carlo simulation (see below). A thoughtful player wins ~44–48% of runs; button-mashing wins ~3–5%. About 1 in 8 winners makes the fireworks.
- **Fiesta Score**: every run ends with a comparable number — 100 per leg survived, +700 for reaching the fiesta (any win outscores any loss), +10 per remaining resource point, +10 extra per goodwill point, plus the arrival bonus (+150 fireworks / +75 last dance). The end screen shows your score, a title tier, and "beat ~X% of travelers" (percentile vs a 9,000-run simulated population of mixed skill), plus a **Copy score** button. Regenerate the percentile table after any balance change with `node game.js --dist` (paste into `SCORE_PERCENTILES` in `game.js`).

## Run locally

Open `index.html` in a browser. That's it.

## Tests

`node test.mjs` runs the invariant suite: deck/content rules (no dominant choices, goodwill economy, effect ranges), engine guarantees (clamps, interlude floors, preview/commit honesty, landmark placement, night/cold stacking), passenger-pair invariants and seed determinism, and score ordering across 50k simulated runs.

## Balance simulation

The self-test never runs during normal play. To run it:

- **Browser:** open `index.html?sim` and check the console.
- **Terminal:** `node game.js`

It simulates 1,000 runs of random play and 1,000 runs of a greedy strategy (always protect the lowest resource) and prints both win rates plus which resource caused each loss.

## Deploy on Vercel

1. Push this folder to a GitHub repo (this folder = repo root).
2. In Vercel: **Add New Project** → import the repo.
3. Settings:
   - **Framework Preset:** Other
   - **Build Command:** *(leave empty)*
   - **Output Directory:** *(leave empty — repo root)*
   - **Install Command:** *(leave empty)*
4. Deploy. `vercel.json` only sets `cleanUrls`; there is no build step and no `package.json` needed.

## Manual QA checklist (~5 minutes)

1. **Title screen** — title, subtitle, hook, and Start button visible; footer "Made by Dim Sum Games" not clipped by the home indicator.
2. **Passenger pick** — Start always leads to "Sino ang ihahatid mo?" with exactly 2 of the 5 passengers; tapping a card starts the run; replays show a fresh pair; your pick appears in the HUD (top right) and in the copied share text ("Kasama: ...").
2b. **Start a run** — the first run of a visit opens with the "🎆 Ang Pista" framing card (6 AM departure, fireworks at 8 PM, night warning); replays skip it. All four bars at 10/12; "Stop 1/10 · 6:00 AM ☀️"; trike 🛺 on the trail, 🎆 at the end.
3. **Choice buttons** — resource effects on the left (gains that cannot land — bar full, or trimmed to zero by night/cold — are dimmed and struck through), total-time badge on the right (🕐 1 hr green / 2 hrs amber / 3 hrs red / 🎲 1–3 hrs purple on landmark gambles); after tapping, buttons disable instantly and a result line + a countdown chip ("☀️ 9:00 AM — dark in 8 hrs, 8 stops to go") + Continue appear.
3b. **Daylight budget** — the line under the trail ("☀️ 8 hrs of daylight · 9 stops to go") updates every leg and shifts color as the margin tightens.
4. **The sky changes** — burn time with slow choices: the whole background shifts from morning purple to sunset orange to deep night blue as the clock passes 12 PM and 5 PM.
5. **Night rules** — after 5 PM with 💛 below 8, the indigo "🌙 Gabi na — sarado na ang mga tindahan" banner shows and bonuses shrink by 1; with 💛 8+, it turns gold ("may nag-iwan ng ilaw para sa'yo") and there's no penalty. At night, watch for night-only interludes: askals and wrong turns for everyone, a tanod escort or porch dinner if you're loved.
6. **Landmarks** — the gold ⭐ bridge card always appears at Stop 5 and the finale at Stop 10; take Mang Islaw's bangka a few times and confirm both gamble results occur.
7. **Interludes** — a dark "🛣️ Sa Daan..." card appears with no choices; its pill chips (e.g. `🍚 +2`, `⏳ +1 hr`) are a *preview* — bars and clock only change when you tap Tuloy (watch them pulse as the next card arrives). No bar ever drops below 1 from an interlude.
8. **Third choice** — with 💛 ≥ 8, the lechon or roadwork events show a golden third button with an "unlocked" chip; below the threshold it's absent.
9. **Cold shoulder** — drive 💛 below 3: the 🥶 banner appears and bonuses shrink by another 1 (stacks with night).
10. **Endings** — stranded losses name the dead resource; wins read differently by arrival: fireworks (before 8 PM), last dance (before 11 PM), hugasan (later). Replay always restarts at 10/10/10/10, 6:00 AM, fresh order.
11. **Score card** — Fiesta Score counts up with tier + "beat ~X%" chip; a win always outscores any loss; **Copy score** flips to "Copied! ✅"; **Ulit tayo!** restarts instantly (no title screen, no intro), while the small "🏠 Balik sa simula" link returns to the title.
12. **No repeats** — within one run, no event or interlude appears twice.
13. **iPhone check** — portrait 375×667: no scrolling, nothing under the notch/home indicator; desktop (>500px) shows the centered phone frame.
14. **Sim gate** — normal play logs nothing; `index.html?sim` logs the two win rates in the console.

## Known prototype limitations

- One deck of 24 events + 19 interludes; replay value grows by adding content (all plain data arrays in `game.js` — easy to extend or port). Night-variant *events* (not just interludes) would be the natural next content pass.
- Sounds are minimal WebAudio blips; no music, no haptics.
- No persistence (no best-streak, no stats between sessions) — intentional for the prototype.
- The "beat ~X% of travelers" percentile compares against a *simulated* population baked into the code, not real players — a real leaderboard needs the backend we deliberately skipped.
- Random play is brutally punished (~3–5% win rate); a casual/pity mode would be the first balancing pass after concept approval.
- The sky changes at band boundaries (12 PM / 5 PM) as a color snap, not a gradual sunset; a real build would tween it.
- No animations between stops beyond bar/trail transitions; a real build would add travel vignettes.

## Credits

Made by **Dim Sum Games**.
