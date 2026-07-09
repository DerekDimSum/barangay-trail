'use strict';
/* =====================================================================
   Barangay Trail: Road to Fiesta
   ---------------------------------------------------------------------
   Structure (kept portable for a future Unity / TikTok Mini Games port):
     1. CONSTANTS + EVENT DECK + INTERLUDES — pure data, no DOM
     2. GAME ENGINE                         — pure functions over run state
     3. MONTE CARLO SELF-TEST               — ?sim / SIM=true / `node game.js`
     4. UI LAYER                            — the only part touching the DOM

   CORE LOOP (one leg × 10):
     maybe an interlude happens TO you (no choice, can't kill you)
     → an event is drawn from a state-aware deck
     → 2 choices, sometimes a 3rd your stats unlocked
     → resolve: resources move, the clock advances
   Win  = survive all 10 stops with every resource above zero.
   Lose = any resource hits 0 (stranded). That's the ONLY fail state.

   THE DAYLIGHT SYSTEM (time is world-state, not a fail state):
   - You leave at 6 AM. Each leg takes 1 hour + the choice's ⏳ cost
     (0–2 hrs). Generous choices are usually the slow ones.
   - Time bands: umaga (<12) → hapon (<18) → gabi (18+). The sky and
     the HUD clock shift with the band.
   - AT NIGHT the world closes: every bonus is trimmed by 1 (sarado na
     ang mga tindahan) — UNLESS goodwill ≥ 7, because the people you
     helped leave their lights on for you. Utang na loob is literally
     night insurance. Night also unlocks hostile interludes (and, with
     high goodwill, blessing ones).
   - Arrival time sets WIN QUALITY, never failure: before 8 PM you
     catch the fireworks (+150 score), before 11 PM the last dance
     (+75), later you help wash the dishes (+0, gently roasted).

   BALANCE NOTES (why these numbers):
   - Resources start at 10, cap 12, lose at 0. Most choice pairs are
     net −2 to −3 across resources: you are always bleeding, and the
     decision is WHICH resource bleeds — and whether you can afford
     the slow, kind option before dark.
   - Interludes add variance an expert cannot optimize away, but can
     never take a resource below 1 — only a CHOICE can kill you.
   - Goodwill: several events accept 💛 instead of 🪙 (utang na loob);
     💛 is only earned by giving something away; below 3 💛 the cold
     shoulder trims bonuses everywhere (stacks with the night trim).
     High 💛 unlocks third choices, blessing interludes, and keeps the
     night friendly.
   - Landmarks (leg 5 bridge, leg 10 finale) are fixed set pieces and
     hold the game's ONLY gambles — 50/50 rolls, marked 🎲 on the
     button. Transparency everywhere, dice only where it's dramatic.
   - Tuned with the Monte Carlo harness: greedy min-protecting play
     wins ~40–50%; random play well under 10%. Run `node game.js` or
     open index.html?sim to reproduce.
   ===================================================================== */

/* ------------------------------------------------------------------ */
/* 1. CONSTANTS + EVENT DECK + INTERLUDES                              */
/* ------------------------------------------------------------------ */

const START_VALUE = 10;
const CAP = 12;
const TOTAL_STOPS = 10;
const COLD_THRESHOLD = 3;    // goodwill below this = cold shoulder
const START_HOUR = 6;        // you leave at 6 AM
const LEG_HOURS = 1;         // base travel time per leg
const NIGHT_HOUR = 17;       // gabi begins; the world starts closing
const NIGHT_GOODWILL = 8;    // goodwill at/above this keeps doors open at night
const FIREWORKS_HOUR = 20;   // universal score bonus cutoff (+150)
const LAST_DANCE_HOUR = 23;  // universal score bonus cutoff (+75)
const PROMISE_GRACE_HOURS = 3; // hours past desiredArrival = "Promise Bent"
const INTERLUDE_CHANCE = 0.7;

const RES_KEYS = ['coins', 'food', 'fuel', 'goodwill'];
const RES_META = {
  coins:    { emoji: '🪙', label: 'Coins' },
  food:     { emoji: '🍚', label: 'Food' },
  fuel:     { emoji: '⛽', label: 'Fuel' },
  goodwill: { emoji: '💛', label: 'Goodwill' },
};

/* The passenger pool: who you promised to bring to the fiesta.
   Each run offers 2 of these 5 (drawn from the run's RNG stream); the
   player picks one. `desiredArrival` is that passenger's PROMISED hour
   (24h) — a soft promise, never a loss condition. Arriving by it earns
   the "Promise Kept" ending; within PROMISE_GRACE_HOURS, "Promise
   Bent"; later, "Promise Very Bent".
   The selection card is triaged for a fast read: `blurb` (one-line
   vibe), `promiseChip` (the arrival goal, shown as a pill and always
   containing its hour), start-modifier ± chips derived from `start`,
   and `passiveShort` (the ongoing effect in one short line). */
const PASSENGERS = [
  {
    id: 'tita-baby', name: 'Tita Baby', emoji: '👒',
    blurb: 'Judges your every choice.',
    start: {},
    desiredArrival: 18,
    promiseChip: 'By 6 PM',
    passiveShort: '💛 can’t hit zero, once per run',
    epilogueWin: 'Tita Baby steps out first, waves like she planned everything, and somehow everyone believes her.',
    epilogueLoss: 'Tita Baby says “Okay lang,” in the tone that means this will be discussed later.',
  },
  {
    id: 'kuya-jun', name: 'Kuya Jun', emoji: '🧢',
    blurb: 'Knows a shortcut. Allegedly.',
    start: {},
    desiredArrival: LAST_DANCE_HOUR,
    promiseChip: 'By 11 PM, chill',
    passiveShort: 'Slow trips take 1 hour less',
    epilogueWin: 'Kuya Jun says the route was obvious. It was not obvious.',
    epilogueLoss: 'Kuya Jun insists the shortcut was correct. The road respectfully disagrees.',
  },
  {
    id: 'lola-cora', name: 'Lola Cora', emoji: '👵',
    blurb: 'Respected. Needs her rest.',
    start: { goodwill: 2, food: -3 },
    desiredArrival: NIGHT_HOUR,
    promiseChip: 'Before dark, 5 PM',
    passiveShort: 'People help her, even at night',
    epilogueWin: 'Lola Cora steps out and the whole plaza softens. Suddenly, you are forgiven for everything.',
    epilogueLoss: 'Lola Cora says, “Okay lang, apo.” Somehow that makes it worse and better.',
  },
  {
    id: 'bunso-nico', name: 'Bunso Nico', emoji: '🧒',
    blurb: 'Tiny. Eats constantly.',
    start: { food: -2, coins: -1 },
    desiredArrival: 19,
    promiseChip: 'By 7 PM',
    passiveShort: '💛 costs 1 less (forgiving)',
    epilogueWin: 'Bunso Nico announces the journey was easy. He was asleep for half of it.',
    epilogueLoss: 'Bunso Nico asks if the failed trip still includes snacks. Priorities remain strong.',
  },
  {
    id: 'cousin-jessa', name: 'Cousin Jessa', emoji: '🤳',
    blurb: 'Posting the whole trip.',
    start: { coins: 1 },
    desiredArrival: FIREWORKS_HOUR,
    promiseChip: 'By 8 PM sharp',
    passiveShort: '+250 score, but 💛 costs more',
    epilogueWin: 'Cousin Jessa posts the arrival before you even park. Caption already has sparkle emojis.',
    epilogueLoss: 'Cousin Jessa says she will not post the failure. She is lying gently.',
  },
];

/* Declarative conditions: { res, atLeast?, atMost? }, { flag }, or
   { time: 'umaga'|'hapon'|'gabi' }. Arrays mean ALL must hold.
   Used by choiceC.requires, event.boostWhen, interlude.requires. */

/* 24 events, one per required topic. Plain data only.
   effects may include `time` (extra hours, shown as ⏳ on the button;
   no time key = quick stop). `sets` plants a memory flag. */
const DECK = [
  {
    id: 'sari-sari',
    title: "Aling Nena's Sari-Sari",
    description: "The sari-sari store has cold drinks, chips, and a listahan with your name on it.",
    boostWhen: { res: 'food', atMost: 5 },
    choiceA: { label: 'Buy snacks, cash', effects: { coins: -4, food: 1 } },
    resultA: 'Chips, sardinas, saging chips. Busog agad!',
    choiceB: { label: '“Charge it, utang muna”', effects: { goodwill: -4, food: 1 }, sets: 'utang' },
    resultB: 'Aling Nena sighs and adds your name to the listahan. Again.',
  },
  {
    id: 'tricycle-fare',
    title: 'Special Trip',
    description: 'The trike driver quotes “special trip” price. He also knows your tita.',
    choiceA: { label: 'Pay the special rate', effects: { coins: -4, fuel: 2 } },
    resultA: 'Smooth ride. Kuya even waits while you buy load.',
    choiceB: { label: '“Pay later, utang na?”', effects: { goodwill: -4, fuel: 1 }, sets: 'utang' },
    resultB: 'Kuya nods slowly. “Sabihin mo kay tita, ha.”',
  },
  {
    id: 'jeepney-queue',
    title: 'Jeepney Rush',
    description: 'The jeepney line snakes around the block. A lola stands behind you, plastic bags everywhere.',
    choiceA: { label: 'Keep your spot', effects: { food: -4, fuel: 1 } },
    resultA: 'Packed jeep, elbows everywhere. But your tank gets a rest.',
    choiceB: { label: 'Lola goes first + baon', effects: { food: -4, goodwill: 1, time: 1 } },
    resultB: 'The whole line smiles at you. Lodi!',
  },
  {
    id: 'palengke',
    title: 'Palengke Day',
    description: 'Suki discounts at the palengke, and your extra bananas could sell fast.',
    boostWhen: { res: 'food', atMost: 5 },
    choiceA: { label: 'Stock up, suki price', effects: { coins: -4, food: 1 } },
    resultA: 'Extra kamatis, libreng kalamansi. Suki perks!',
    choiceB: { label: 'Sell the bananas', effects: { food: -4, coins: 1, time: 1 } },
    resultB: 'Sold out in minutes. Negosyante ka talaga!',
  },
  {
    id: 'sudden-rain',
    title: 'Biglang Ulan',
    description: 'Rain hammers down. A schoolkid shivers under the waiting shed, walang payong.',
    choiceA: { label: 'Share umbrella + snack', effects: { food: -4, goodwill: 1, time: 2 } },
    resultA: "You wait out the worst of it together. The kid's mom waves from across the street.",
    choiceB: { label: 'Gun it through the rain', effects: { fuel: -4 } },
    resultB: 'You make good time. Medyo basa lang ang backpack.',
  },
  {
    id: 'brownout',
    title: 'Brownout Night',
    description: 'Brownout sa buong barangay. Fridges dying, neighbors gathering outside with candles.',
    choiceA: { label: 'Rent genset time', effects: { coins: -4, food: 1 } },
    resultA: 'Fridge saved. The ulam lives another day.',
    choiceB: { label: 'Share ice + chicharon', effects: { food: -4, goodwill: 1, time: 1 } },
    resultB: 'Kwentuhan under the stars. The barangay remembers.',
    choiceC: {
      label: 'Buy ice for the street', effects: { coins: -4, goodwill: 3, time: 1 },
      requires: { res: 'coins', atLeast: 9 }, unlock: '🪙 9+',
    },
    resultC: 'You roll up with a block of ice like a hero in a teleserye. Instant legend.',
  },
  {
    id: 'karaoke',
    title: 'Videoke Showdown',
    description: "Tito's videoke night has a prize pot. “My Way” is queued. Everyone stares at you.",
    boostWhen: { res: 'coins', atMost: 4 },
    choiceA: { label: 'Join the contest', effects: { food: -3, coins: 1, time: 1 } },
    resultA: 'Grabe ang birit! You take the pot. Tito demands a rematch.',
    choiceB: { label: 'Chip in for pulutan', effects: { coins: -4, goodwill: 1 } },
    resultB: 'You pass the mic and feed the table. Instant favorite.',
  },
  {
    id: 'fiesta-prep',
    title: 'Banderitas Brigade',
    description: 'Manong needs gas for the banderitas supply run. The fiesta committee watches hopefully.',
    choiceA: { label: 'Donate fuel', effects: { fuel: -4, goodwill: 1 } },
    resultA: 'Manong salutes. Your name goes on the thank-you tarp!',
    choiceB: { label: 'Give coins instead', effects: { coins: -4, goodwill: 1 } },
    resultB: '“Sige, okay na rin.” Manong pockets it, half-smiling.',
  },
  {
    id: 'tita-advice',
    title: "Tita's Feast",
    description: 'Tita corners you: “Ang payat mo!” A full feast materializes instantly.',
    choiceA: { label: 'Stay, eat everything', effects: { food: 2, fuel: -3, time: 2 } },
    resultA: 'Three servings and two hours of chismis. Busog na busog.',
    choiceB: { label: '“Diet po ako” + dash', effects: { fuel: 1, goodwill: -4 } },
    resultB: "You beat the traffic. Tita's hurt gasp haunts you.",
    choiceC: {
      label: '“Just baon to go, po”', effects: { food: 2, goodwill: -1 },
      requires: { res: 'food', atMost: 4 }, unlock: '🍚 low',
    },
    resultC: 'Tita loads a bag of baon in ninety seconds flat. “Text mo ako pagdating!”',
  },
  {
    id: 'basketball-court',
    title: 'Liga Night',
    description: 'Barangay liga night! The team is one player short and the crowd is hungry.',
    choiceA: { label: 'Sub in and ball', effects: { food: -4, goodwill: 2, time: 2 }, sets: 'liga-hero' },
    resultA: 'Buzzer-beater! The court chants your name.',
    choiceB: { label: 'Sell fishballs courtside', effects: { food: -4, coins: 1 } },
    resultB: 'Sold out by third quarter. MVP of snacks.',
  },
  {
    id: 'barangay-captain',
    title: "Kapitan's Favor",
    description: 'Kapitan flags you down: “Pahatid naman ng mga monoblock sa plaza?”',
    choiceA: { label: 'Haul the chairs', effects: { fuel: -4, goodwill: 1, time: 2 } },
    resultA: 'Kapitan salutes. “Solid ka, iho.”',
    choiceB: { label: '“Sorry, may lakad po”', effects: { goodwill: -4 } },
    resultB: 'Kapitan nods slowly. The tambays take notes.',
  },
  {
    id: 'merienda',
    title: 'Merienda o Hindi',
    description: 'Merienda time. The turon stand calls your name. Your wallet disagrees.',
    choiceA: { label: 'Turon splurge', effects: { coins: -4, food: 1, time: 1 } },
    resultA: 'Crispy, sweet, dripping. Worth every piso.',
    choiceB: { label: 'Skip it, push on', effects: { food: -4 } },
    resultB: 'You drive through the hunger and make good time.',
  },
  {
    id: 'lechon-queue',
    title: 'Lechon Line 47',
    description: 'Lechon pickup day. The line is legendary. Your number: 47.',
    choiceA: { label: 'Wait and buy', effects: { coins: -4, food: 2, time: 2 } },
    resultA: 'The skin crackles when they hand it over. Worth it.',
    choiceB: { label: 'Sell your number', effects: { coins: 1, goodwill: -4 } },
    resultB: 'A desperate tito pays premium. Tita hears about it.',
    choiceC: {
      label: 'Suki lane, please', effects: { food: 2, goodwill: -1 },
      requires: { res: 'goodwill', atLeast: 8 }, unlock: '💛 8+',
    },
    resultC: 'The crowd waves you forward. “Suki privileges,” they say. Nobody minds.',
  },
  {
    id: 'family-group-chat',
    title: 'GC Emergency',
    description: "The family group chat explodes: “WHO'S BRINGING THE ICE?? 😭” You're the nearest.",
    choiceA: { label: 'Volunteer, buy ice', effects: { coins: -4, goodwill: 1, time: 1 } },
    resultA: 'The GC floods with 🙏 and heart reacts. Hero ka.',
    choiceB: { label: 'Seen-zone the GC', effects: { goodwill: -4 } },
    resultB: '“Nakita ka namin online,” someone replies. Yikes.',
  },
  {
    id: 'road-detour',
    title: 'Roadwork Ahead',
    description: "Roadwork blocks the highway. Long detour, or Mang Ben's private shortcut lot.",
    choiceA: { label: 'Take the long way', effects: { fuel: -4, time: 2 } },
    resultA: 'Long but peaceful. Nice carabao views naman.',
    choiceB: { label: 'Sweet-talk Mang Ben', effects: { fuel: -1, goodwill: -3 } },
    resultB: 'He waves you through, mumbling about his gumamelas.',
    choiceC: {
      label: 'Mang Ben insists!', effects: { fuel: 1, goodwill: -1, time: 1 },
      requires: { res: 'goodwill', atLeast: 8 }, unlock: '💛 8+',
    },
    resultC: '“Ikaw pala yun!” He opens the gate, tops your tank, and tells you his life story.',
  },
  {
    id: 'school-crossing',
    title: 'Dismissal Time',
    description: 'School dismissal floods the crossing. The guard looks exhausted.',
    choiceA: { label: 'Wait for every kid', effects: { fuel: -4, goodwill: 1, time: 1 } },
    resultA: 'The guard taps your hood: “Salamat, boss.”',
    choiceB: { label: 'Nudge through the gap', effects: { goodwill: -4 } },
    resultB: 'The whistle follows you for three blocks.',
  },
  {
    id: 'gas-station',
    title: 'Presyo ng Gas',
    description: 'Gas prices went up ulit. The attendant offers a suki promo.',
    boostWhen: { res: 'fuel', atMost: 5 },
    choiceA: { label: 'Full tank', effects: { coins: -4, fuel: 2 } },
    resultA: 'Full tank, walang kaba. Ouch lang sa wallet.',
    choiceB: { label: 'Suki promo top-up', effects: { coins: -3, fuel: 1 } },
    resultB: 'The attendant remembers your name na. Suki status.',
  },
  {
    id: 'neighbor-help',
    title: 'Kapitbahay Crisis',
    description: "Your kapitbahay's trike broke down. He needs gas money, “hanggang sweldo lang, promise.”",
    choiceA: { label: 'Lend the money', effects: { coins: -4, goodwill: 2 }, sets: 'lent-money' },
    resultA: '“Isang tulog na lang, bayad agad!” He means it. Probably.',
    choiceB: { label: '“Broke din ako, pare”', effects: { goodwill: -4 } },
    resultB: 'He understands naman. Pero malamig na ang good morning.',
    choiceC: {
      label: 'Cover it, stay to help', effects: { coins: -4, goodwill: 3, time: 1 }, sets: 'lent-money',
      requires: { res: 'coins', atLeast: 10 }, unlock: '🪙 10+',
    },
    resultC: 'You pay AND hold the flashlight. He names the trike after you. “Si Suki.”',
  },
  {
    id: 'cousin-ride',
    title: 'Pinsan Stranded',
    description: 'Pinsan texts: “Sundo naman ako sa bayan 🥺 stranded ako.”',
    choiceA: { label: 'Sundo mission', effects: { fuel: -4, goodwill: 2, time: 2 } },
    resultA: 'Pinsan swears utang na loob forever. May balato ka daw soon.',
    choiceB: { label: 'Send trike fare', effects: { coins: -3, goodwill: 1 } },
    resultB: 'Half-hero move. Pinsan replies with one (1) thumbs up.',
  },
  {
    id: 'halo-halo-stand',
    title: 'Halo-Halo Mirage',
    description: 'Peak init. The halo-halo stand sa kanto glows like a mirage.',
    choiceA: { label: 'Grande, extra flan', effects: { coins: -4, food: 1, time: 1 } },
    resultA: 'Brain freeze achieved. Sarap sa init!',
    choiceB: { label: 'Tiis lang, push through', effects: { food: -3 } },
    resultB: 'The heat wins a little. You dream of shaved ice.',
  },
  {
    id: 'church-bell',
    title: 'Simbahan Bells',
    description: "Church bells ring. The collection basket approaches. Lola's eyes find yours.",
    choiceA: { label: 'Drop a donation', effects: { coins: -4, goodwill: 1, time: 1 } },
    resultA: '“Blessed ang byahe mo, apo.” Lola beams.',
    choiceB: { label: 'Polite nod lang', effects: { goodwill: -3 } },
    resultB: "Lola's smile dims one notch. Just one. You feel it.",
  },
  {
    id: 'town-plaza',
    title: 'Plaza Breather',
    description: 'The town plaza is shady and calm. A kakanin vendor waves at you.',
    choiceA: { label: 'Buy from the vendor', effects: { coins: -4, food: 1, goodwill: 1 } },
    resultA: 'She throws in extra suman. “Balik ka ha!”',
    choiceB: { label: 'Nap on the bench', effects: { food: 1, time: 1 } },
    resultB: 'Power nap achieved. The plaza breeze is elite.',
  },
  {
    id: 'market-discount',
    title: 'Last Price Na',
    description: 'Closing time sa palengke. “Last price na, suki!” Everything must go.',
    boostWhen: { res: 'food', atMost: 5 },
    choiceA: { label: 'Take the bundle', effects: { coins: -4, food: 2 } },
    resultA: 'Bags of gulay and tuyo. Panalo ang hapunan.',
    choiceB: { label: 'Haggle to the bone', effects: { coins: -2, food: 2, goodwill: -2, time: 1 } },
    resultB: "You win the deal. The tindera's smile tightens.",
  },
  {
    id: 'fiesta-banner',
    title: 'First Banner!',
    description: 'The first fiesta banner appears! Kids chase your ride chanting for pasalubong.',
    choiceA: { label: 'Toss them your snacks', effects: { food: -4, goodwill: 1, time: 1 } },
    resultA: 'They cheer your name down the whole street!',
    choiceB: { label: 'Wave dramatically', effects: { goodwill: -4 } },
    resultB: 'They boo playfully. Ouch pero fair.',
  },
  // ---- v0.4 expansion: 12 more barangays' worth of trouble ----
  {
    id: 'barangay-raffle',
    title: 'Raffle Winner!',
    description: 'The barangay raffle calls your number. The prize is real. So is the requirement: a dance onstage, now.',
    choiceA: { label: 'Sayaw na. Full commit.', effects: { food: -3, coins: 1, time: 1 } },
    resultA: 'You give them the whole choreography. The prize is yours; the video already exists.',
    choiceB: { label: 'Decline the prize', effects: { goodwill: -3 } },
    resultB: 'You wave it off. The emcee announces your name twice more anyway, slower.',
  },
  {
    id: 'sukli-standoff',
    title: 'Ang Sukli',
    description: 'The tindera has no change for your bill. A line forms. Everyone is watching the math happen.',
    choiceA: { label: '“Keep the change po”', effects: { coins: -4, goodwill: 1 } },
    resultA: 'The line exhales. The tindera promotes you to suki on the spot.',
    choiceB: { label: 'Wait for exact sukli', effects: { goodwill: -3, time: 1 } },
    resultB: 'You get every piso. The line memorizes your face.',
  },
  {
    id: 'lolo-kwento',
    title: "Lolo's Kwento",
    description: 'A lolo by the road starts a story about the fiesta of 1972. It has no ending in sight.',
    choiceA: { label: 'Stay for the whole story', effects: { food: -4, goodwill: 2, time: 2 } },
    resultA: 'You share your baon through three plot twists. The 1972 fiesta was, apparently, legendary.',
    choiceB: { label: '“Po, next time po!”', effects: { goodwill: -3 } },
    resultB: 'He waves you off mid-sentence. The 1972 fiesta remains unresolved.',
  },
  {
    id: 'banderitas-bandits',
    title: 'Banderitas Bandits',
    description: "A gang of kids is 'borrowing' the banderitas off your trike. For their fort, daw.",
    choiceA: { label: 'Donate flags + snacks', effects: { food: -4, goodwill: 1, time: 1 } },
    resultA: 'The fort is magnificent. You are named an honorary member, rank: Supplier.',
    choiceB: { label: 'Reclaim your banderitas', effects: { goodwill: -3 } },
    resultB: 'Mission successful. The kids boo you in perfect unison.',
  },
  {
    id: 'pasalubong-math',
    title: 'Pasalubong Math',
    description: 'Last pasalubong stall before the plaza. The list in your head has eleven names on it.',
    choiceA: { label: 'Buy for everyone', effects: { coins: -4, goodwill: 2, time: 1 } },
    resultA: 'Eleven names, eleven boxes. The stall owner salutes your family tree.',
    choiceB: { label: 'One box, share-share', effects: { coins: -3, goodwill: -1 } },
    resultB: 'Math solved: one box, eleven polite bites each. Diplomacy in pastry form.',
  },
  {
    id: 'gc-receipts',
    title: 'Old Photo Alert',
    description: 'The GC unearths your fiesta photo from years ago. Reactions climbing. Silence is not an option.',
    choiceA: { label: '“Libre ko merienda!”', effects: { coins: -4, goodwill: 2 } },
    resultA: 'Bribery accepted. The photo is forgotten; the promise is not.',
    choiceB: { label: "Deflect with Kuya's photo", effects: { goodwill: -3 } },
    resultB: 'Instant pivot. Kuya types “...” for a very long time.',
  },
  {
    id: 'padala-package',
    title: 'Ang Padala',
    description: "Aling Rosa flags you down: one small padala for her cousin sa plaza. 'Maliit lang, promise.'",
    choiceA: { label: 'Load the padala', effects: { fuel: -4, goodwill: 1, time: 1 } },
    resultA: 'It is not maliit. The trike sits lower. Aling Rosa waves like a saint.',
    choiceB: { label: '“Sorry, puno na kami”', effects: { goodwill: -3 } },
    resultB: 'Aling Rosa says nothing. Her eyebrows say everything.',
  },
  {
    id: 'kain-gauntlet',
    title: 'Kain Muna Gauntlet',
    description: "Three houses in a row insist: 'Kain muna!' Declining all three is a diplomatic operation.",
    boostWhen: { res: 'food', atMost: 5 },
    choiceA: { label: 'Eat at every house', effects: { food: 1, fuel: -3, time: 2 } },
    resultA: 'Three merienda deep, you roll out slowly. Everyone is pleased. The trike groans.',
    choiceB: { label: 'Decline all three', effects: { goodwill: -3 } },
    resultB: 'You escape hungry but on schedule. Three titas file the incident away.',
  },
  {
    id: 'bangketa-barter',
    title: 'Barter sa Bangketa',
    description: 'A bangketa barter stand: snacks for load, load for gas, gas for chismis. Everything is negotiable.',
    choiceA: { label: 'Trade food for fuel', effects: { food: -4, fuel: 2 } },
    resultA: 'Your biscuits are now gasoline, economically speaking. Manong nods with respect.',
    choiceB: { label: 'Trade fuel for food', effects: { fuel: -4, food: 2 } },
    resultB: 'You siphon a little hope into a bag of pandesal. Fair deal, honestly.',
  },
  {
    id: 'hermana-mayor',
    title: 'Ang Hermana Mayor',
    description: "The Hermana Mayor herself flags you down. The fiesta needs 'one tiny favor.' It is never tiny.",
    choiceA: { label: 'Say yes to the favor', effects: { fuel: -4, goodwill: 2, time: 2 } },
    resultA: 'Two barangays later, the “tiny favor” is delivered. Your name enters the official good books.',
    choiceB: { label: 'Pretend not to see her', effects: { goodwill: -3 } },
    resultB: 'Impossible. She saw you. She always sees you.',
  },
  {
    id: 'alikabok-alley',
    title: 'Alikabok Attack',
    description: 'A dry stretch turns the road into one long dust cloud. Snacks and dignity, equally exposed.',
    choiceA: { label: 'Cover up, go slow', effects: { food: -2, time: 1 } },
    resultA: 'Everything survives. You cough once, elegantly, like a teleserye lead.',
    choiceB: { label: 'Speed through it', effects: { food: -2, fuel: -2 } },
    resultB: 'Fast, pero the dust seasons everything. RIP, biscuits.',
  },
  {
    id: 'cr-emergency',
    title: 'CR Emergency',
    description: "Your pasahero needs a CR. Now. The nearest decent one is a gas station, 'customers only.'",
    choiceA: { label: 'Buy something, use CR', effects: { coins: -3, time: 1 } },
    resultA: 'Crisis averted. You now own a commemorative keychain.',
    choiceB: { label: 'Knock sa kapitbahay', effects: { goodwill: -3 } },
    resultB: 'They say yes, of course. The whole street now knows your itinerary.',
  },
];

/* The road acting on you: no choices, resolved automatically.
   Interlude effects can NEVER drop a resource below 1 — only a choice
   can kill you. `requires` gates the state-reactive ones (including
   the night-only hostiles and the high-goodwill night blessings). */
const INTERLUDES = [
  { id: 'carabao', text: 'A carabao parade owns the road. Nothing to do but wait, and wave.', effects: { time: 1 } },
  { id: 'baha', text: "Last night's ulan flooded the low road. Single lane, inch by inch.", effects: { time: 1, fuel: -1 } },
  { id: 'fresh-asphalt', text: 'Fresh asphalt?! Grabe, may nag-ayos talaga. You make up an hour.', effects: { time: -1 } },
  { id: 'bagsak-presyo', text: 'Roadside bagsak-presyo stand. A whole buwig of saging for barya.', effects: { coins: -1, food: 1 } },
  { id: 'tita-text', text: 'Tita texts: “Ingat ka ha. May baon ka ba?” You smile for the next two barangays.', effects: { goodwill: 1 } },
  { id: 'flat-tire', text: 'Pssssst. Flat tire. The spare holds... for now.', effects: { time: 1, fuel: -1 } },
  { id: 'checkpoint', text: 'Checkpoint. “Saan po tayo?” Routine lang, but the line is long.', effects: { time: 1 } },
  { id: 'street-dance', text: 'A street-dance rehearsal blocks the road. You watch the whole thing. Worth it.', effects: { time: 1 } },
  { id: 'jeepney-draft', text: 'You draft behind a speeding jeepney blasting road-trip anthems. Libreng hangin, libreng oras!', effects: { time: -1 } },
  { id: 'wallet-save', text: 'Your wallet nearly flies off at a bump. A bystander catches it. You tip him your chips; he refuses twice, accepts on the third.', effects: { food: -1, goodwill: 2 } },
  { id: 'balik-bayad', text: 'A familiar trike pulls up. It’s the kapitbahay! “Sabi ko babayaran kita!” He pays. With interest: one warm pandesal.', effects: { coins: 2 }, requires: { flag: 'lent-money' } },
  { id: 'utang-rumor', text: 'Word travels on the trail: “May lista ka kay Aling Nena.” The tinderas’ smiles thin a little.', effects: { goodwill: -1 }, requires: { flag: 'utang' } },
  { id: 'liga-fans', text: 'Kids reenact your buzzer-beater as you pass. You stop for exactly one (1) photo. Okay, three.', effects: { goodwill: 1 }, requires: { flag: 'liga-hero' } },
  { id: 'lola-pandesal', text: "Someone's lola flags you down and presses warm pandesal into your hands. “Para sa biyahe. Kilala kita, mabait ka.”", effects: { food: 2 }, requires: { res: 'goodwill', atLeast: 9 } },
  { id: 'cold-road', text: 'Your horn greeting gets no wave back today. Nobody mentions the shortcut, either. The road feels longer.', effects: { time: 1 }, requires: { res: 'goodwill', atMost: 2 } },
  { id: 'night-askal', text: 'Dilim na. A pack of askals decides your trike is VERY interesting. Full throttle!', effects: { fuel: -1 }, requires: { time: 'gabi' } },
  { id: 'night-wrong-turn', text: 'Wrong turn sa dilim. The sign was there... somewhere. Probably. Balik ka.', effects: { time: 1 }, requires: { time: 'gabi' } },
  { id: 'night-tanod', text: '“Kilala ka dito!” A tanod on a motorbike escorts you through the dark stretch, siren humming a love song.', effects: { time: -1 }, requires: [{ time: 'gabi' }, { res: 'goodwill', atLeast: 7 }] },
  { id: 'night-porch', text: "A porch light flicks on as you pass. “Kumain ka muna!” Five minutes, one full baon, zero arguments accepted.", effects: { food: 2 }, requires: [{ time: 'gabi' }, { res: 'goodwill', atLeast: 7 }] },
];

/* Fixed landmarks: set-piece events at specific legs (keyed by 0-based
   leg index). They host the game's ONLY gambles — `gamble` on a choice
   means a 50/50 roll decides which extra effects and result you get.
   Everything outside a landmark stays fully transparent. */
const LANDMARKS = {
  4: {
    id: 'landmark-tulay',
    landmark: true,
    title: 'Ang Lumang Tulay',
    description: "Halfway! The old bridge is one lane and grumpy. Mang Islaw's bangka bobs by the bank, engine idling.",
    choiceA: { label: 'Lumang tulay, dahan-dahan', effects: { coins: -3, food: -1, time: 1 } },
    resultA: 'Toll muna po. Planks rattle; a tricycle salutes you midway. Slow and steady.',
    choiceB: {
      label: "Bangka ni Mang Islaw", effects: { coins: -3 },
      gamble: {
        odds: 0.5, win: {}, lose: { time: 2, fuel: -1 },
        resultWin: 'Perfect current! Mang Islaw sings the whole crossing. Grabe ang shortcut!',
        resultLose: 'The motor coughs mid-river. You paddle. The whole bridge watches.',
      },
    },
    choiceC: {
      label: "Sabay sa kapitan's barge", effects: { goodwill: -2 },
      requires: { res: 'goodwill', atLeast: 8 }, unlock: '💛 8+',
    },
    resultC: 'The kapitan waves you aboard personally. VIP crossing, walang pila.',
  },
  9: {
    id: 'landmark-huling-kanto',
    landmark: true,
    title: 'Ang Huling Kanto',
    description: 'You can hear the banda warming up! One last stretch, and the plaza glows sa malayo.',
    choiceA: { label: 'Diretso, steady lang', effects: { food: -3, fuel: -1, time: 1 } },
    resultA: 'You cruise in with the caravan of last-minute lechon deliveries.',
    choiceB: {
      label: 'Shortcut sa sementeryo', effects: { fuel: -2 },
      gamble: {
        odds: 0.5, win: {}, lose: { time: 2 },
        resultWin: 'Silent, spooky, FAST. You cross yourself twice and fly through.',
        resultLose: 'A funeral procession. You wait, respectfully. Of course you wait.',
      },
    },
    choiceC: { label: 'Full birit sa highway', effects: { fuel: -3, food: -1 } },
    resultC: 'Windows down, anthem up. The trike screams into town, ratatat ang tambutso.',
  },
};

const COLD_LINE = '🥶 Malamig ang trato. People stop going the extra mile for you.';
const NIGHT_LINE = '🌙 Gabi na. Sarado na ang mga tindahan... unless people love you.';

/* NAMED ENDINGS — every run resolves to exactly one story identity.
   Order IS priority: first match wins. Losses first (mutually exclusive
   with wins), then win rares → win specials → arrival-tier defaults.
   The last win entry has no extra condition, so a fallback always
   exists for both outcomes. Keep text ≤ 2 short lines for iPhone SE. */
const ENDINGS = [
  // ---- losses (by what ran out) ----
  {
    id: 'no-porch-lights', name: 'No Porch Lights', emoji: '🌑',
    when: (r) => r.outcome === 'lose' && r.deadResource === 'goodwill' && timeBand(r.hour) === 'gabi',
    text: 'Gabi na, and not one porch light turns on for you. The road home feels longer than the road there.',
    share: 'Walang nag-iwan ng ilaw para sa akin 🥲',
  },
  {
    id: 'group-chat-quiet', name: 'The Group Chat Went Quiet', emoji: '💬',
    when: (r) => r.outcome === 'lose' && r.deadResource === 'goodwill',
    text: 'You ask for a little help. People are typing... typing... Nothing sends. The silence has a message anyway.',
    share: 'Seen-zoned ng buong barangay 💬',
  },
  {
    id: 'supper-retreat', name: 'Supper Retreat', emoji: '🍽️',
    when: (r) => r.outcome === 'lose' && r.deadResource === 'food',
    text: 'You are too hungry to continue. The fiesta can wait. May kanin sa bahay, and honestly, tama naman. You turn back in time for supper.',
    share: 'Umuwi para sa hapunan. Walang regrets. Konting regrets.',
  },
  {
    id: 'no-pamasahe', name: 'No Pamasahe, No Problem?', emoji: '🪙',
    when: (r) => r.outcome === 'lose' && r.deadResource === 'coins',
    text: 'The wallet gives up before you do. No fare, no shortcut. Just a long walk home, and a lot of time to think.',
    share: 'Naubusan ng pamasahe. Character development daw.',
  },
  {
    id: 'tanaw-ang-fiesta', name: 'Tanaw ang Fiesta', emoji: '🌆',
    when: (r) => r.outcome === 'lose' && r.deadResource === 'fuel' && r.stop >= 8,
    text: 'You can SEE the fiesta lights from here. The tank coughs once, twice, then nothing. So close it is basically heartbreak.',
    share: 'Kita ko na ang fiesta. Kita lang. 💔',
  },
  {
    id: 'pahinga-makina', name: 'Pahinga Muna, Makina', emoji: '🔧',
    when: (r) => r.outcome === 'lose' && r.deadResource === 'fuel',
    text: 'The trike taps out somewhere between barangays. You pat the hood like a tired kalabaw and wait for rescue.',
    share: 'Nag-resign ang makina sa kalagitnaan 🔧',
  },
  // ---- win rares ----
  {
    id: 'utang-na-loob-economy', name: 'Utang na Loob Economy', emoji: '💛',
    when: (r) => r.outcome === 'win' && r.res.coins <= 2 && r.res.goodwill >= 10,
    text: 'You arrive broke and loved. Everything you gave away came back, just not as money. Empty wallet, full sidecar.',
    share: 'Zero pesos, infinite utang na loob 💛',
  },
  {
    id: 'solo-speedrun-villain', name: 'Solo Speedrun Villain', emoji: '😈',
    when: (r) => r.outcome === 'win' && r.hour < FIREWORKS_HOUR && r.res.goodwill <= 4,
    text: 'Incredible time. The whole barangay watched you make it, and nobody waves. The fireworks are great. The welcome is cold.',
    share: 'Umabot ako. Ako lang talaga. 😈',
  },
  {
    id: 'auntie-proof', name: 'Auntie-Proof', emoji: '🥘',
    when: (r) => r.outcome === 'win' && r.res.food >= 9 && r.res.goodwill >= 10,
    text: 'You arrive well-fed AND well-loved, which every tita at the fiesta finds personally suspicious. May baon ka pa.',
    share: 'Busog, mahal ng bayan, may baon pa. Suspicious. 🥘',
  },
  // ---- win specials ----
  {
    id: 'broke-but-beloved', name: 'Broke but Beloved', emoji: '🫶',
    when: (r) => r.outcome === 'win' && r.res.coins <= 3 && r.res.goodwill >= 9,
    text: 'Empty pockets, full escort. Half the barangay walks you into the plaza like a parade of your own.',
    share: 'Walang pera, pero maraming kasama 🫶',
  },
  {
    id: 'rich-walang-hatid', name: 'Rich but Walang Hatid', emoji: '💸',
    when: (r) => r.outcome === 'win' && r.res.coins >= 8 && r.res.goodwill <= 4,
    text: 'You arrive with money intact and bridges lightly burned. You can afford the lechon. Nobody saved you a seat.',
    share: 'May pera, walang naghihintay 💸',
  },
  {
    id: 'arrived-but', name: 'Arrived, But…', emoji: '😬',
    when: (r) => r.outcome === 'win' && r.res.goodwill <= 4,
    text: 'You made it. Technically. The hellos are polite, the seats are “taken”, and someone definitely brought up the school crossing incident.',
    share: 'Nakarating naman... pero may nag-uusap 😬',
  },
  {
    id: 'barangay-beloved', name: 'Barangay Beloved', emoji: '👑',
    when: (r) => r.outcome === 'win' && r.res.goodwill >= 11,
    text: 'The plaza opens for you like family. Everyone you helped today is here, and every single one saved you a seat.',
    share: 'Buong barangay, kakampi ko 👑',
  },
  {
    id: 'clean-run', name: 'Clean Run', emoji: '✨',
    when: (r) => r.outcome === 'win' && RES_KEYS.every((k) => r.res[k] >= 6),
    text: 'Bars healthy, schedule met, zero utang. Suspiciously smooth. The titas want your secret; the titos claim credit.',
    share: 'Clean run. Walang tanong. ✨',
  },
  {
    id: 'one-biscuit-left', name: 'One Biscuit Left', emoji: '🍪',
    when: (r) => r.outcome === 'win' && r.res.food === 1,
    text: 'You roll in on fumes, barya, crumbs, at dasal. One biscuit stands between you and disaster. It has seen things.',
    share: 'Survived with one (1) biscuit 🍪',
  },
  // ---- win defaults: the promise tier (did you keep your word?) ----
  {
    id: 'promise-kept', name: 'Promise Kept', emoji: '🤝',
    when: (r) => r.outcome === 'win' && r.passenger && r.hour <= r.passenger.desiredArrival,
    text: 'You said you would get them there, and you did. On time pa. Nothing to explain, nothing to defend. Rare feeling.',
    share: 'Promise kept. On time kami 🤝',
  },
  {
    id: 'promise-bent', name: 'Promise Bent', emoji: '😅',
    when: (r) => r.outcome === 'win' && r.passenger && r.hour <= r.passenger.desiredArrival + PROMISE_GRACE_HOURS,
    text: 'You arrive later than promised. Nobody says anything. Everybody noticed. The story now has an “actually...” section.',
    share: 'Medyo late, pero nakarating 😅',
  },
  {
    id: 'promise-very-bent', name: 'Promise Very Bent', emoji: '🫠',
    when: (r) => r.outcome === 'win',
    text: 'You got them there. Technically. The promised hour is a distant memory, and this arrival will be retold at every reunion.',
    share: 'Nakarating naman... eventually 🫠',
  },
];

/* ------------------------------------------------------------------ */
/* 2. GAME ENGINE — pure, DOM-free                                     */
/* ------------------------------------------------------------------ */

function clamp(v) {
  return Math.min(CAP, Math.max(0, v));
}

function shuffled(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function timeBand(hour) {
  return hour < 12 ? 'umaga' : hour < NIGHT_HOUR ? 'hapon' : 'gabi';
}

function condMet(run, req) {
  if (!req) return true;
  if (Array.isArray(req)) return req.every((r) => condMet(run, r));
  if (req.flag) return !!run.flags[req.flag];
  if (req.time) return timeBand(run.hour) === req.time;
  if (req.res) {
    const v = run.res[req.res];
    if (req.atLeast != null && v < req.atLeast) return false;
    if (req.atMost != null && v > req.atMost) return false;
  }
  return true;
}

/* A fresh run: full resources, 6 AM departure, live-draw pools, and a
   passenger pair offered from the same RNG stream (seed-safe for future
   daily runs). `passenger` stays null until the player chooses. */
function newRun(rand = Math.random) {
  return {
    res: { coins: START_VALUE, food: START_VALUE, fuel: START_VALUE, goodwill: START_VALUE },
    stop: 0,             // legs completed (0-based index of current leg)
    hour: START_HOUR,
    flags: {},
    pool: shuffled(DECK, rand),
    interludePool: shuffled(INTERLUDES, rand),
    passengerPair: shuffled(PASSENGERS, rand).slice(0, 2),
    passenger: null,
    rand,
    currentEvent: null,
    over: false,
    outcome: null,       // 'win' | 'lose'
    deadResource: null,
  };
}

/* Attach a chosen passenger to a run: identity + starting modifiers.
   The one place passenger state enters the engine (UI and sim both
   call this), so passives stay consistent everywhere. */
function assignPassenger(run, p) {
  run.passenger = p;
  for (const k of Object.keys(p.start || {})) {
    run.res[k] = clamp(run.res[k] + p.start[k]);
  }
}

/* Bonus trims: cold shoulder (goodwill < 3) and the night rule
   (gabi + goodwill < 7 → the world is closed to you). They stack.
   Time costs are never trimmed — hours are hours.
   PASSENGER PASSIVES also live here so every consumer (choice
   resolution, interludes, the sim bot, and the on-button display)
   sees identical numbers:
   - Lola Cora: cold shoulder and night trim never apply.
   - Kuya Jun: time costs of 2+ hours are reduced by 1.
   - Bunso Nico: goodwill costs are 1 lighter (toward zero).
   - Cousin Jessa: goodwill costs are 1 heavier (capped at −4). */
function effectiveEffects(run, effects) {
  const pid = run.passenger ? run.passenger.id : null;
  const immune = pid === 'lola-cora';
  const cold = !immune && run.res.goodwill < COLD_THRESHOLD;
  const night = !immune && timeBand(run.hour) === 'gabi' && run.res.goodwill < NIGHT_GOODWILL;
  const trim = (cold ? 1 : 0) + (night ? 1 : 0);
  let time = effects.time || 0;
  if (pid === 'kuya-jun' && time >= 2) time -= 1;
  const out = { time };
  for (const k of RES_KEYS) {
    let v = effects[k] || 0;
    if (trim && v > 0) v = Math.max(0, v - trim);
    if (k === 'goodwill' && v < 0) {
      if (pid === 'bunso-nico') v = Math.min(0, v + 1);
      else if (pid === 'cousin-jessa') v = Math.max(-4, v - 1);
    }
    if (k === 'food' && v > 0 && pid === 'bunso-nico') v = Math.max(0, v - 1); // he eats first
    out[k] = v;
  }
  return { effects: out, cold, night };
}

function weightedDraw(items, weightFn, rand) {
  let total = 0;
  const weights = items.map((it) => { const w = weightFn(it); total += w; return w; });
  if (total <= 0) return null;
  let roll = rand() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll < 0) return items[i];
  }
  return items[items.length - 1];
}

/* State-aware draw: relevant events get triple weight, no repeats. */
function drawEvent(run) {
  const ev = weightedDraw(run.pool, (e) => (e.boostWhen && condMet(run, e.boostWhen) ? 3 : 1), run.rand);
  run.pool = run.pool.filter((e) => e !== ev);
  run.currentEvent = ev;
}

/* Start a leg. A landmark IS the leg. Otherwise the road may act on
   you first — the returned interlude is a PREVIEW: nothing is applied
   until commitInterlude, so the UI can show cause before effect.
   Interlude resources floor at 1 — the road strands you NEAR death,
   only your choices finish you. The deltas are the ACTUAL post-clamp
   values, so a chip never claims a change that won't happen. */
function startLeg(run) {
  if (run.over) return null;
  const landmark = LANDMARKS[run.stop];
  if (landmark) {
    // set-piece leg: no interlude, the landmark IS the moment
    run.currentEvent = landmark;
    return null;
  }
  if (run.rand() < INTERLUDE_CHANCE) {
    const eligible = run.interludePool.filter((it) => condMet(run, it.requires));
    const pick = weightedDraw(eligible, (it) => (it.requires ? 3 : 1), run.rand);
    if (pick) {
      run.interludePool = run.interludePool.filter((it) => it !== pick);
      const { effects, cold } = effectiveEffects(run, pick.effects);
      const res = {};
      const deltas = {};
      for (const k of RES_KEYS) {
        const before = run.res[k];
        const floor = effects[k] < 0 ? Math.min(before, 1) : 0; // can't be killed by the road
        res[k] = Math.max(floor, clamp(before + effects[k]));
        deltas[k] = res[k] - before;
      }
      const hour = Math.max(START_HOUR, run.hour + effects.time);
      deltas.time = hour - run.hour;
      return { data: pick, res, hour, deltas, cold };
    }
  }
  drawEvent(run);
  return null;
}

/* Apply a previewed interlude, then reveal the leg's event
   (drawn after application so the deck reacts to the new state). */
function commitInterlude(run, pending) {
  run.res = { ...pending.res };
  run.hour = pending.hour;
  drawEvent(run);
}

function availableChoices(run) {
  const ev = run.currentEvent;
  const out = ['A', 'B'];
  if (ev && ev.choiceC && condMet(run, ev.choiceC.requires)) out.push('C');
  return out;
}

/* Possible outcomes of a choice before the trim pass:
   one certain outcome, or the two branches of a 50/50 gamble. */
function choiceOutcomes(choice) {
  const base = choice.effects || {};
  if (!choice.gamble) return [{ p: 1, effects: base, roll: null }];
  const merge = (extra) => {
    const m = { ...base };
    for (const k of Object.keys(extra)) m[k] = (m[k] || 0) + extra[k];
    return m;
  };
  return [
    { p: choice.gamble.odds, effects: merge(choice.gamble.win), roll: 'win' },
    { p: 1 - choice.gamble.odds, effects: merge(choice.gamble.lose), roll: 'lose' },
  ];
}

/* Evaluation order: apply effects → clamp → any resource at 0 = LOSE
   (stranded, the only fail state) → leg 10 done = WIN → else continue.
   The clock always advances 1h + the choice's time cost. */
function applyChoice(run, which) {
  if (run.over || !run.currentEvent) return null;
  const ev = run.currentEvent;
  const choice = which === 'A' ? ev.choiceA : which === 'B' ? ev.choiceB : ev.choiceC;
  const outcomes = choiceOutcomes(choice);
  const picked = outcomes.length === 1 ? outcomes[0]
    : (run.rand() < choice.gamble.odds ? outcomes[0] : outcomes[1]);
  const { effects, cold, night } = effectiveEffects(run, picked.effects);

  const deltas = {};
  const beforeRes = { ...run.res };
  for (const k of RES_KEYS) {
    run.res[k] = clamp(beforeRes[k] + effects[k]);
  }
  // Tita Baby's passive: once per run, goodwill refuses to hit zero.
  let titaSave = false;
  if (run.res.goodwill === 0 && run.passenger && run.passenger.id === 'tita-baby' && !run.flags['tita-called']) {
    run.res.goodwill = 1;
    run.flags['tita-called'] = true;
    titaSave = true;
  }
  for (const k of RES_KEYS) deltas[k] = run.res[k] - beforeRes[k];
  run.hour += LEG_HOURS + effects.time;
  deltas.time = effects.time;
  if (choice.sets) run.flags[choice.sets] = true;

  const dead = RES_KEYS.find((k) => run.res[k] === 0) || null;
  const lastStop = run.stop === TOTAL_STOPS - 1;
  if (dead) {
    run.over = true;
    run.outcome = 'lose';
    run.deadResource = dead;
  } else if (lastStop) {
    run.over = true;
    run.outcome = 'win';
  }
  run.stop++;
  run.currentEvent = null;

  return {
    deltas,
    cold,
    night,
    result: picked.roll
      ? (picked.roll === 'win' ? choice.gamble.resultWin : choice.gamble.resultLose)
      : which === 'A' ? ev.resultA : which === 'B' ? ev.resultB : ev.resultC,
    gambleRoll: picked.roll,
    titaSave,
    outcome: run.outcome,
    deadResource: dead,
  };
}

/* ---- scoring ------------------------------------------------------ */
/* Fiesta Score: 100 per stop survived, +700 for reaching the fiesta
   (any win outscores any loss), +10 per remaining resource point,
   +10 extra per goodwill point, plus an arrival bonus: before 8 PM
   you caught the fireworks (+150), before 11 PM the last dance (+75). */
const WIN_BONUS = 700;

const SCORE_TIERS = [
  { min: 2100, name: 'Fiesta Royalty 👑' },
  { min: 1740, name: 'Lodi ng Lansangan ⭐' },
  { min: 1000, name: 'Batikang Biyahero 🛺' },
  { min: 550,  name: 'Biyaherong Baguhan 🛵' },
  { min: 0,    name: 'Naiwan sa Kanto 🌧️' },
];

function arrivalBonus(hour) {
  return hour < FIREWORKS_HOUR ? 150 : hour < LAST_DANCE_HOUR ? 75 : 0;
}

function computeScore(run) {
  const survived = run.outcome === 'win' ? TOTAL_STOPS : Math.max(0, run.stop - 1);
  const resTotal = RES_KEYS.reduce((s, k) => s + run.res[k], 0);
  // Cousin Jessa's passive payoff: the arrival post pops off.
  const jessaBonus = run.outcome === 'win' && run.passenger && run.passenger.id === 'cousin-jessa' ? 250 : 0;
  const score = survived * 100
    + (run.outcome === 'win' ? WIN_BONUS + arrivalBonus(run.hour) + jessaBonus : 0)
    + resTotal * 10
    + run.res.goodwill * 10;
  return { score, survived, resTotal, hour: run.hour };
}

function tierFor(score) {
  return SCORE_TIERS.find((t) => score >= t.min).name;
}

/* Every finished run maps to exactly one named ending (first match in
   ENDINGS wins; the table guarantees a fallback for both outcomes). */
function resolveEnding(run) {
  return ENDINGS.find((e) => e.when(run));
}

/* The passenger's one-line coda for the ending screen and share card. */
function passengerEpilogue(run) {
  if (!run.passenger) return null;
  return run.outcome === 'win' ? run.passenger.epilogueWin : run.passenger.epilogueLoss;
}

/* Percentiles of a 9,000-traveler simulated population (1/3 random,
   1/3 semi-careful, 1/3 greedy) — regenerate with `node game.js --dist`
   after any balance change. Index i = score at the i-th percentile. */
const SCORE_PERCENTILES = [
  460, 570, 620, 640, 660, 670, 680, 690, 700, 700,
  710, 720, 720, 730, 730, 740, 750, 760, 760, 770,
  770, 780, 790, 790, 800, 800, 810, 820, 820, 830,
  830, 840, 840, 850, 850, 860, 860, 870, 870, 880,
  880, 890, 890, 900, 900, 910, 910, 920, 920, 930,
  930, 940, 940, 950, 950, 960, 960, 970, 970, 980,
  980, 990, 990, 1000, 1000, 1010, 1020, 1020, 1030, 1040,
  1050, 1060, 1070, 1090, 1120, 1190, 1810, 1830, 1850, 1860,
  1875, 1885, 1895, 1905, 1915, 1925, 1935, 1945, 1955, 1965,
  1975, 1985, 2000, 2020, 2040, 2060, 2080, 2115, 2150, 2200,
  2410,
];

function percentileFor(score) {
  let p = 0;
  for (let i = 0; i < SCORE_PERCENTILES.length; i++) {
    if (score >= SCORE_PERCENTILES[i]) p = i;
  }
  return Math.max(1, Math.min(99, p));
}

/* Shared clock formatting (integer hours only). */
function formatHour(hour) {
  const h24 = ((Math.round(hour) % 24) + 24) % 24;
  const mer = h24 < 12 ? 'AM' : 'PM';
  const h12 = ((h24 + 11) % 12) + 1;
  return `${h12}:00 ${mer}`;
}

/* ------------------------------------------------------------------ */
/* 3. MONTE CARLO SELF-TEST                                            */
/*    Never runs during normal play: only via ?sim, SIM=true, or Node. */
/* ------------------------------------------------------------------ */

function pickRandom(run) {
  const opts = availableChoices(run);
  return opts[Math.floor(Math.random() * opts.length)];
}

/* Daylight-aware greedy "thoughtful player": protect the lowest
   resource, avoid burning hours as evening approaches, and try to
   keep goodwill at night-insurance levels before dark. */
function pickGreedy(run) {
  const outcomeScore = (rawEffects) => {
    const { effects } = effectiveEffects(run, rawEffects);
    const after = RES_KEYS.map((k) => clamp(run.res[k] + effects[k]));
    if (after.some((v) => v === 0)) return -1e9;
    const timeWeight = run.hour >= 14 ? 45 : 15;
    let s = Math.min(...after) * 1000 + after.reduce((a, b) => a + b, 0) * 10 - (effects.time || 0) * timeWeight;
    // goodwill >= 7 keeps the night friendly; value it as dusk nears
    const afterGoodwill = clamp(run.res.goodwill + (effects.goodwill || 0));
    if (run.hour >= 13 && afterGoodwill >= NIGHT_GOODWILL) s += 160;
    return s;
  };
  const score = (which) => {
    const ev = run.currentEvent;
    const choice = which === 'A' ? ev.choiceA : which === 'B' ? ev.choiceB : ev.choiceC;
    // expected value across gamble branches (single branch when no gamble)
    return choiceOutcomes(choice).reduce((s, o) => s + o.p * outcomeScore(o.effects), 0);
  };
  let best = 'A';
  for (const which of availableChoices(run)) {
    if (score(which) > score(best)) best = which;
  }
  return best;
}

/* Simulated runs always carry a passenger, like real play: a forced
   one for per-passenger tuning, or a random pick from the offered pair. */
function playRun(picker, passenger) {
  const run = newRun();
  assignPassenger(run, passenger || run.passengerPair[Math.floor(Math.random() * 2)]);
  while (!run.over) {
    const pending = startLeg(run);
    if (pending) commitInterlude(run, pending);
    applyChoice(run, picker(run));
  }
  return run;
}

function simulate(runs, picker, passenger) {
  let wins = 0;
  let fireworks = 0;
  let hourSum = 0;
  const lossBy = { coins: 0, food: 0, fuel: 0, goodwill: 0 };
  for (let i = 0; i < runs; i++) {
    const run = playRun(picker, passenger);
    if (run.outcome === 'win') {
      wins++;
      hourSum += run.hour;
      if (run.hour < FIREWORKS_HOUR) fireworks++;
    } else {
      lossBy[run.deadResource]++;
    }
  }
  return {
    winRate: wins / runs,
    lossBy,
    avgArrival: wins ? hourSum / wins : 0,
    fireworksRate: wins ? fireworks / wins : 0,
  };
}

function runSimulation(runs = 1000) {
  const rnd = simulate(runs, pickRandom);
  const grd = simulate(runs, pickGreedy);
  const pct = (x) => (x * 100).toFixed(1) + '%';
  console.log(`[Barangay Trail sim] ${runs} runs each (random passenger from the offered pair)`);
  console.log(`  Random play win rate: ${pct(rnd.winRate)}  (losses by: ${JSON.stringify(rnd.lossBy)}; avg arrival ${formatHour(rnd.avgArrival)})`);
  console.log(`  Greedy play win rate: ${pct(grd.winRate)}  (losses by: ${JSON.stringify(grd.lossBy)}; avg arrival ${formatHour(grd.avgArrival)}, ${pct(grd.fireworksRate)} of wins catch the fireworks)`);
  const per = PASSENGERS.map((p) => `${p.id} ${pct(simulate(600, pickGreedy, p).winRate)}`);
  console.log(`  Greedy per passenger: ${per.join(' | ')}`);
  console.log('  Target: greedy 40–50% overall and per passenger.');
  return { random: rnd.winRate, greedy: grd.winRate };
}

/* Ending distribution across a mixed-skill population — the content
   health check for the named-endings table (`node game.js --endings`):
   every ending should fire, rares should stay rare. Not a balance tool. */
function endingReport(n = 6000) {
  const strategies = [
    (run) => pickRandom(run),
    (run) => (Math.random() < 0.65 ? pickGreedy(run) : pickRandom(run)),
    (run) => pickGreedy(run),
  ];
  const counts = {};
  for (let i = 0; i < n; i++) {
    const run = playRun(strategies[i % strategies.length]);
    const id = resolveEnding(run).id;
    counts[id] = (counts[id] || 0) + 1;
  }
  const rows = ENDINGS.map((e) => [e.id, counts[e.id] || 0]);
  rows.sort((a, b) => b[1] - a[1]);
  console.log(`[Barangay Trail endings] ${n} mixed-skill runs`);
  for (const [id, c] of rows) console.log(`  ${((100 * c) / n).toFixed(1).padStart(5)}%  ${id}${c === 0 ? '  ← NEVER FIRED' : ''}`);
}

/* Simulated-traveler population for the score percentile on the end
   screen: 1/3 random taps, 1/3 semi-careful, 1/3 greedy. */
function generateScoreDistribution(n = 9000) {
  const strategies = [
    (run) => pickRandom(run),
    (run) => (Math.random() < 0.65 ? pickGreedy(run) : pickRandom(run)),
    (run) => pickGreedy(run),
  ];
  const scores = [];
  for (let i = 0; i < n; i++) {
    const run = playRun(strategies[i % strategies.length]);
    scores.push(computeScore(run).score);
  }
  scores.sort((a, b) => a - b);
  const q = [];
  for (let p = 0; p <= 100; p++) q.push(scores[Math.min(n - 1, Math.floor((p / 100) * n))]);
  return q;
}

/* ------------------------------------------------------------------ */
/* 4. UI LAYER — only section that touches the DOM                     */
/* ------------------------------------------------------------------ */

const IN_BROWSER = typeof window !== 'undefined' && typeof document !== 'undefined';

if (IN_BROWSER) {
  initUI();
  const wantSim = window.SIM === true || new URLSearchParams(window.location.search).has('sim');
  if (wantSim) runSimulation();
} else if (typeof process !== 'undefined') {
  // `node game.js` — headless balance check; `--dist` regenerates the
  // SCORE_PERCENTILES table; `--endings` prints the ending distribution.
  if (process.argv.includes('--dist')) console.log(JSON.stringify(generateScoreDistribution()));
  else if (process.argv.includes('--endings')) endingReport();
  else runSimulation();
}

function initUI() {
  const $ = (id) => document.getElementById(id);
  const screens = { title: $('screen-title'), select: $('screen-select'), game: $('screen-game'), end: $('screen-end') };
  let run = null;
  let resolving = false;
  let pendingInterlude = null; // interlude shown before the event card
  let phase = 'title';         // 'title' | 'select' | 'interlude' | 'event' | 'result'

  /* ---- tiny WebAudio blips (no files); fails silently if blocked ---- */
  let actx = null;
  function tone(freq, start, dur, type = 'triangle', vol = 0.05) {
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, actx.currentTime + start);
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + start + dur);
    o.connect(g).connect(actx.destination);
    o.start(actx.currentTime + start);
    o.stop(actx.currentTime + start + dur + 0.02);
  }
  function sound(kind) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      if (kind === 'tap') tone(660, 0, 0.08);
      else if (kind === 'good') { tone(523, 0, 0.09); tone(784, 0.09, 0.12); }
      else if (kind === 'bad') { tone(330, 0, 0.09); tone(220, 0.09, 0.14); }
      else if (kind === 'road') tone(440, 0, 0.14, 'sine', 0.035);
      else if (kind === 'win') { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.18)); }
      else if (kind === 'lose') { [392, 330, 262, 196].forEach((f, i) => tone(f, i * 0.14, 0.2, 'sawtooth', 0.03)); }
    } catch (e) { /* audio is optional */ }
  }

  function show(name) {
    for (const key of Object.keys(screens)) screens[key].classList.toggle('active', key === name);
  }

  /* Effect tokens for a choice button, shown at their EFFECTIVE values
     (after night/cold trims and passenger passives) — the number on the
     button is always the number that will happen. Gains that can't land
     (bar full, or trimmed to nothing) are dimmed with the raw value
     struck through. */
  function renderEffects(el, choice) {
    el.innerHTML = '';
    const { effects: eff } = effectiveEffects(run, choice.effects);
    for (const k of RES_KEYS) {
      const raw = choice.effects[k] || 0;
      if (!raw) continue;
      const span = document.createElement('span');
      const wasted = raw > 0 && (run.res[k] >= CAP || eff[k] === 0);
      const shown = wasted ? raw : (eff[k] === 0 ? raw : eff[k]);
      span.textContent = `${RES_META[k].emoji} ${shown > 0 ? '+' : '−'}${Math.abs(shown)}`;
      if (wasted || eff[k] === 0) span.className = 'muted';
      el.appendChild(span);
    }
  }

  /* Time badge: TOTAL hours this stop takes (base 1 + effective cost,
     so Kuya Jun's shortcut shows right on the button). */
  function renderTimeBadge(el, choice) {
    const totals = choiceOutcomes(choice).map((o) => LEG_HOURS + effectiveEffects(run, o.effects).effects.time);
    if (totals.length > 1 && Math.min(...totals) !== Math.max(...totals)) {
      el.textContent = `🎲 ${Math.min(...totals)}–${Math.max(...totals)} hrs`;
      el.className = 'choice-km gamble';
      return;
    }
    const t = totals[0];
    el.textContent = `🕐 ${t} hr${t > 1 ? 's' : ''}`;
    el.className = 'choice-km ' + (t <= 1 ? 'fast' : t === 2 ? 'steady' : 'slow');
  }

  function bandEmoji(band) {
    return band === 'umaga' ? '☀️' : band === 'hapon' ? '🌇' : '🌙';
  }

  function renderBars(deltas) {
    for (const k of RES_KEYS) {
      const el = $(`bar-${k}`);
      const val = run.res[k];
      el.querySelector('.bar-num').textContent = val;
      el.querySelector('.bar-fill').style.width = `${(val / CAP) * 100}%`;
      el.classList.toggle('low', val <= 3);
      const deltaEl = el.querySelector('.bar-delta');
      const d = deltas ? deltas[k] : 0;
      if (d) {
        deltaEl.textContent = `${d > 0 ? '+' : '−'}${Math.abs(d)}`;
        deltaEl.className = `bar-delta show ${d > 0 ? 'up' : 'down'}`;
        el.classList.remove('pulse');
        void el.offsetWidth;
        el.classList.add('pulse');
        setTimeout(() => deltaEl.classList.remove('show'), 900);
      } else {
        deltaEl.className = 'bar-delta';
      }
    }
  }

  /* HUD: journey progress + the clock; the sky follows the time band.
     The daylight line is the time-budget readout — hours to dark vs
     stops to go, so every ⏳ hour has a visible exchange rate. */
  function renderHud() {
    const band = timeBand(run.hour);
    const pct = Math.min(100, (run.stop / TOTAL_STOPS) * 100);
    $('trail-fill').style.width = `${pct}%`;
    document.querySelector('.trail-trike').style.left = `${pct}%`;
    $('stop-label').textContent =
      `Stop ${Math.min(TOTAL_STOPS, run.stop + 1)}/${TOTAL_STOPS} · ${formatHour(run.hour)} ${bandEmoji(band)}`;
    document.body.classList.toggle('t-hapon', band === 'hapon');
    document.body.classList.toggle('t-gabi', band === 'gabi');

    const dl = $('daylight-label');
    const stopsLeft = TOTAL_STOPS - run.stop;
    if (band === 'gabi') {
      dl.textContent = `🌙 Gabi na · ${stopsLeft} stop${stopsLeft === 1 ? '' : 's'} to go`;
      dl.className = 'daylight-label late';
    } else {
      const hoursToDark = NIGHT_HOUR - run.hour;
      dl.textContent = `☀️ ${hoursToDark} hrs of daylight · ${stopsLeft} stop${stopsLeft === 1 ? '' : 's'} to go`;
      const diff = hoursToDark - stopsLeft;
      dl.className = 'daylight-label ' + (diff >= 1 ? 'ok' : diff >= -1 ? 'tight' : 'late');
    }
  }

  /* Persistent effect chips (interludes have no buttons to print on). */
  function renderChips(deltas) {
    const el = $('ev-chips');
    el.innerHTML = '';
    const add = (text, good) => {
      const span = document.createElement('span');
      span.className = `chip ${good ? 'up' : 'down'}`;
      span.textContent = text;
      el.appendChild(span);
    };
    for (const k of RES_KEYS) {
      const d = deltas[k] || 0;
      if (d) add(`${RES_META[k].emoji} ${d > 0 ? '+' : '−'}${Math.abs(d)}`, d > 0);
    }
    const dt = deltas.time || 0;
    if (dt) add(dt > 0 ? `⏳ +${dt} hr${dt > 1 ? 's' : ''}` : `🕐 −${-dt} hr`, dt < 0);
    el.classList.toggle('hidden', el.children.length === 0);
  }

  /* The interlude card is a PREVIEW: chips show what's about to happen;
     bars and clock only move when the player taps Tuloy. */
  function renderInterlude(interlude) {
    phase = 'interlude';
    const card = document.querySelector('.event-card');
    card.classList.add('interlude');
    card.classList.remove('landmark');
    $('ev-title').textContent = '🛣️ Sa Daan...';
    $('ev-desc').textContent = interlude.data.text;
    renderChips(interlude.deltas);
    $('ev-result').classList.add('hidden');
    $('ev-km').classList.add('hidden');
    $('ev-cold').classList.add('hidden');
    $('ev-passive').classList.add('hidden');
    renderBars(null);
    renderHud();
    $('choices').classList.add('hidden');
    const cont = $('btn-continue');
    cont.textContent = 'Tuloy... ➡️';
    cont.classList.remove('hidden');
    sound('road');
  }

  function renderEvent(interludeDeltas) {
    phase = 'event';
    resolving = false;
    const ev = run.currentEvent;
    const card = document.querySelector('.event-card');
    card.classList.remove('interlude');
    card.classList.toggle('landmark', !!ev.landmark);
    renderHud();
    $('ev-title').textContent = (ev.landmark ? '⭐ ' : '') + ev.title;
    $('ev-desc').textContent = ev.description;
    $('ev-chips').classList.add('hidden');
    $('ev-result').classList.add('hidden');
    $('ev-km').classList.add('hidden');
    $('ev-cold').classList.add('hidden');
    $('ev-passive').classList.add('hidden');
    renderBars(interludeDeltas || null); // bars pulse as the interlude lands
    const opts = availableChoices(run);
    for (const which of ['a', 'b', 'c']) {
      const btn = $(`btn-${which}`);
      const key = which.toUpperCase();
      if (!opts.includes(key)) { btn.classList.add('hidden'); continue; }
      const choice = key === 'A' ? ev.choiceA : key === 'B' ? ev.choiceB : ev.choiceC;
      btn.classList.remove('hidden');
      btn.disabled = false;
      btn.querySelector('.choice-label').textContent = choice.label;
      renderEffects(btn.querySelector('.choice-effects'), choice);
      renderTimeBadge(btn.querySelector('.choice-km'), choice);
      const chip = btn.querySelector('.choice-unlock');
      if (chip) chip.textContent = choice.unlock ? `unlocked · ${choice.unlock}` : '';
    }
    $('choices').classList.remove('hidden');
    $('btn-continue').classList.add('hidden');
    $('cold-banner').classList.toggle('hidden', run.res.goodwill >= COLD_THRESHOLD);
    const night = timeBand(run.hour) === 'gabi';
    const nightEl = $('night-banner');
    nightEl.classList.toggle('hidden', !night);
    if (night) {
      const loved = run.res.goodwill >= NIGHT_GOODWILL;
      nightEl.textContent = loved
        ? '🌙 Gabi na, pero may nag-iwan ng ilaw para sa’yo 💛'
        : NIGHT_LINE;
      nightEl.classList.toggle('loved', loved);
    }
  }

  function beginLeg() {
    pendingInterlude = startLeg(run);
    if (pendingInterlude) renderInterlude(pendingInterlude);
    else renderEvent();
  }

  function choose(which) {
    if (resolving || phase !== 'event' || !run || run.over) return;
    resolving = true;
    phase = 'result';
    for (const b of ['a', 'b', 'c']) $(`btn-${b}`).disabled = true;

    const outcome = applyChoice(run, which);
    renderBars(outcome.deltas);
    renderHud();

    const resultEl = $('ev-result');
    resultEl.textContent = outcome.result;
    resultEl.classList.remove('hidden');

    const kmEl = $('ev-km');
    if (run.over) {
      kmEl.classList.add('hidden');
    } else {
      const band = timeBand(run.hour);
      const stopsLeft = TOTAL_STOPS - run.stop;
      const detail = band === 'gabi'
        ? 'gabi na, ingat sa daan'
        : `dark in ${NIGHT_HOUR - run.hour} hrs, ${stopsLeft} stop${stopsLeft === 1 ? '' : 's'} to go`;
      kmEl.textContent = `${bandEmoji(band)} ${formatHour(run.hour)} · ${detail}`;
      kmEl.className = 'ev-km ' + (band === 'umaga' ? 'day' : band === 'hapon' ? 'dusk' : 'night');
    }

    $('ev-cold').classList.toggle('hidden', !outcome.cold);
    if (outcome.cold) $('ev-cold').textContent = COLD_LINE;
    $('ev-passive').classList.toggle('hidden', !outcome.titaSave);
    if (outcome.titaSave) $('ev-passive').textContent = '👒 Tita Baby makes exactly one phone call. Goodwill holds at 1. “Wag mo na uulitin, ha.”';

    $('choices').classList.add('hidden');
    const cont = $('btn-continue');
    cont.textContent = outcome.outcome === 'win' ? 'Sa fiesta na! 🎆'
      : outcome.outcome === 'lose' ? 'Hay naku... 😔'
      : 'Tuloy ang byahe ➡️';
    cont.classList.remove('hidden');

    const total = RES_KEYS.reduce((s, k) => s + outcome.deltas[k], 0);
    sound(total >= 0 ? 'good' : 'bad');
  }

  function continueRun() {
    if (!run) return;
    if (phase === 'interlude') {
      // the tap is the moment the road's effect actually lands
      sound('tap');
      commitInterlude(run, pendingInterlude);
      const deltas = pendingInterlude.deltas;
      pendingInterlude = null;
      renderEvent(deltas);
      return;
    }
    if (run.over) { showEnd(); return; }
    sound('tap');
    beginLeg();
  }

  function animateScore(el, target) {
    const dur = 900;
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(target * eased).toLocaleString('en-US');
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  let shareText = '';

  function showEnd() {
    const won = run.outcome === 'win';
    const s = computeScore(run);
    const pct = percentileFor(s.score);
    const tier = tierFor(s.score);
    const clock = formatHour(run.hour);
    const ending = resolveEnding(run);
    const epilogue = passengerEpilogue(run);

    $('end-kicker').textContent = won ? 'NAKARATING KAYO 🎉' : 'HINDI NAKARATING 😮‍💨';
    $('end-kicker').className = 'end-kicker ' + (won ? 'won' : 'lost');
    $('end-emoji').textContent = ending.emoji;
    $('end-title').textContent = ending.name;
    $('end-text').textContent = ending.text;
    const epEl = $('end-epilogue');
    epEl.classList.toggle('hidden', !epilogue);
    if (epilogue) epEl.textContent = epilogue;

    animateScore($('score-value'), s.score);
    $('score-tier').textContent = tier;
    $('score-beat').textContent = `Beat ~${pct}% of travelers 🏁`;
    $('end-sub').textContent =
      `${s.survived}/${TOTAL_STOPS} stops · ${won ? 'arrived' : 'stopped'} ${clock} · 🪙${run.res.coins} 🍚${run.res.food} ⛽${run.res.fuel} 💛${run.res.goodwill}`;

    shareText = [
      '🛺 Barangay Trail: Road to Fiesta',
      `${ending.emoji} ${ending.name} · ${ending.share}`,
      run.passenger ? `${run.passenger.emoji} Kasama: ${run.passenger.name}` : null,
      `🏆 Fiesta Score: ${s.score.toLocaleString('en-US')} · ${tier} · beat ~${pct}% of travelers`,
      `${s.survived}/${TOTAL_STOPS} stops · ${won ? `arrived ${clock}` : `stranded ${clock}`} · 🪙${run.res.coins} 🍚${run.res.food} ⛽${run.res.fuel} 💛${run.res.goodwill}`,
      'Kaya mo ba? 🎉',
    ].filter(Boolean).join('\n');
    const shareBtn = $('btn-share');
    shareBtn.disabled = false;
    shareBtn.textContent = 'Copy score 📋';

    document.body.classList.remove('t-hapon', 't-gabi');
    show('end');
    sound(won ? 'win' : 'lose');
  }

  function copyScore() {
    sound('tap');
    const done = () => {
      const btn = $('btn-share');
      btn.textContent = 'Copied! ✅';
      btn.disabled = true;
      setTimeout(() => { btn.textContent = 'Copy score 📋'; btn.disabled = false; }, 1500);
    };
    const fallback = () => {
      try {
        const ta = document.createElement('textarea');
        ta.value = shareText;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        done();
      } catch (e) { /* clipboard unavailable; leave the button as-is */ }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(shareText).then(done, fallback);
    } else {
      fallback();
    }
  }

  /* Every run starts at the passenger pick: 2 of 5, fresh pair per run,
     no reroll. Tapping a card IS the start of the journey. */
  function renderSelect() {
    phase = 'select';
    document.body.classList.remove('t-hapon', 't-gabi');
    for (const i of [0, 1]) {
      const p = run.passengerPair[i];
      const btn = $(`passenger-${i}`);
      btn.disabled = false;
      btn.querySelector('.passenger-emoji').textContent = p.emoji;
      btn.querySelector('.passenger-name').textContent = p.name;
      btn.querySelector('.passenger-blurb').textContent = p.blurb;
      btn.querySelector('.passenger-promise').textContent = `🕐 ${p.promiseChip}`;
      // start-modifier chips, only where a stat actually changes
      const statsEl = btn.querySelector('.passenger-stats');
      statsEl.innerHTML = '';
      const mods = RES_KEYS.filter((k) => p.start[k]);
      for (const k of mods) {
        const v = p.start[k];
        const chip = document.createElement('span');
        chip.className = `stat-chip ${v > 0 ? 'up' : 'down'}`;
        chip.textContent = `${RES_META[k].emoji}${v > 0 ? '+' : '−'}${Math.abs(v)}`;
        statsEl.appendChild(chip);
      }
      statsEl.classList.toggle('hidden', mods.length === 0);
      btn.querySelector('.passenger-passive').textContent = p.passiveShort;
    }
    show('select');
  }

  function selectPassenger(i) {
    if (!run || run.passenger || phase !== 'select') return;
    assignPassenger(run, run.passengerPair[i]);
    $('passenger-0').disabled = true;
    $('passenger-1').disabled = true;
    sound('tap');
    // the HUD carries the passenger AND their promised hour for the whole run
    const p = run.passenger;
    $('hud-passenger').textContent = `${p.emoji} ${p.name} · by ${formatHour(p.desiredArrival).replace(':00', '')}`;
    show('game');
    beginLeg();
  }

  function startGame() {
    run = newRun(); // fresh shuffle + full resources + 6 AM + fresh pair
    sound('tap');
    renderSelect();
  }

  $('btn-start').addEventListener('click', startGame);
  $('passenger-0').addEventListener('click', () => selectPassenger(0));
  $('passenger-1').addEventListener('click', () => selectPassenger(1));
  $('btn-a').addEventListener('click', () => choose('A'));
  $('btn-b').addEventListener('click', () => choose('B'));
  $('btn-c').addEventListener('click', () => choose('C'));
  $('btn-continue').addEventListener('click', continueRun);
  $('btn-replay').addEventListener('click', startGame);
  $('btn-share').addEventListener('click', copyScore);
  $('btn-home').addEventListener('click', () => {
    sound('tap');
    document.body.classList.remove('t-hapon', 't-gabi');
    show('title');
  });
}
