/* Barangay Trail — engine & content invariant suite.
   Run with: node test.mjs
   Pure Node, no dependencies. Loads game.js with its auto-run sim
   disabled, then hammers the engine and checks every content rule. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
let src = readFileSync(join(here, 'game.js'), 'utf8');
src = src.replace("} else if (typeof process !== 'undefined') {", '} else if (false) {');

const checks = `
const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

// 1. Deck integrity: 24 events, one per topic; landmarks fixed at legs 5 & 10
const TOPICS = ['sari-sari','tricycle-fare','jeepney-queue','palengke','sudden-rain','brownout','karaoke','fiesta-prep','tita-advice','basketball-court','barangay-captain','merienda','lechon-queue','family-group-chat','road-detour','school-crossing','gas-station','neighbor-help','cousin-ride','halo-halo-stand','church-bell','town-plaza','market-discount','fiesta-banner'];
ok(DECK.length === 24, 'deck has ' + DECK.length + ' events');
const ids = DECK.map(e => e.id);
for (const t of TOPICS) ok(ids.includes(t), 'missing topic ' + t);
ok(new Set(ids).size === 24, 'duplicate ids');
ok(LANDMARKS[4] && LANDMARKS[9] && Object.keys(LANDMARKS).length === 2, 'landmarks not at legs 5 and 10');

// 2. Effects ranges: resources in [-4,+3], time in [0,2] for choices; interludes small
const allChoices = (e) => [['A', e.choiceA, e.resultA], ['B', e.choiceB, e.resultB]].concat(e.choiceC ? [['C', e.choiceC, e.resultC]] : []);
for (const e of DECK) {
  ok(e.description.trim().split(/\\s+/).length <= 20, e.id + ' description > 20 words');
  for (const [tag, ch, result] of allChoices(e)) {
    ok(ch.label && ch.effects && result, e.id + tag + ' malformed');
    ok(!ch.gamble, e.id + tag + ' has a gamble outside a landmark');
    for (const k of Object.keys(ch.effects)) {
      const v = ch.effects[k];
      if (k === 'time') ok(v >= 0 && v <= 2, e.id + tag + ' time out of range: ' + v);
      else { ok(RES_KEYS.includes(k), e.id + tag + ' unknown key ' + k); ok(v >= -4 && v <= 3, e.id + tag + ' out of range: ' + k + '=' + v); }
    }
    if (tag === 'C') ok(!!ch.requires && !!ch.unlock, e.id + 'C missing requires/unlock');
  }
}
for (const it of INTERLUDES) {
  for (const k of Object.keys(it.effects)) {
    const v = it.effects[k];
    if (k === 'time') ok(v >= -1 && v <= 1, it.id + ' interlude time out of range');
    else ok(v >= -2 && v <= 2, it.id + ' interlude effect too big: ' + k + '=' + v);
  }
}

// 3. No strictly dominant option (5 dims: resources + negated time cost)
for (const e of DECK) {
  const cs = allChoices(e).map(([tag, ch]) => [tag, RES_KEYS.map(k => ch.effects[k] || 0).concat([-(ch.effects.time || 0)])]);
  for (let i = 0; i < cs.length; i++) for (let j = 0; j < cs.length; j++) {
    if (i === j) continue;
    const [ta, fa] = cs[i], [tb, fb] = cs[j];
    const dom = fa.every((v, x) => v >= fb[x]) && fa.some((v, x) => v > fb[x]);
    ok(!dom, e.id + ': choice ' + ta + ' dominates ' + tb);
  }
}

// 4. Goodwill rules: gains only by giving; pay-in-goodwill options exist
for (const e of DECK) {
  for (const [tag, ch] of allChoices(e)) {
    if ((ch.effects.goodwill || 0) > 0) {
      const gives = RES_KEYS.some(k => k !== 'goodwill' && (ch.effects[k] || 0) < 0);
      ok(gives, e.id + tag + ' gains goodwill without giving');
    }
  }
}
const favorEvents = DECK.filter(e => allChoices(e).some(([t, ch]) => (ch.effects.goodwill || 0) < 0 && RES_KEYS.every(k => k === 'goodwill' || (ch.effects[k] || 0) >= 0)));
ok(favorEvents.length >= 3, 'only ' + favorEvents.length + ' pay-in-goodwill events');

// 5. Hammer runs: interlude previews don't mutate, chips match commits,
//    floors/clamps hold, clock only advances, no repeats, gating honest
for (let i = 0; i < 5000; i++) {
  const run = newRun();
  const seen = new Set();
  while (!run.over) {
    const legIndex = run.stop;
    const before = { ...run.res };
    const hourBefore = run.hour;
    const il = startLeg(run);
    if (il) {
      ok(RES_KEYS.every(k => run.res[k] === before[k]) && run.hour === hourBefore, 'interlude preview mutated state');
      if (il.data.requires) ok(condMet(run, il.data.requires), il.data.id + ' fired ineligible');
      commitInterlude(run, il);
      for (const k of RES_KEYS) {
        ok(run.res[k] === before[k] + (il.deltas[k] || 0), 'delta mismatch on ' + k);
        ok(run.res[k] >= (before[k] >= 1 ? 1 : 0) && run.res[k] <= 12, 'interlude floor/clamp: ' + k);
      }
      ok(run.hour === hourBefore + (il.deltas.time || 0), 'time delta mismatch');
    }
    if (legIndex === 4 || legIndex === 9) ok(run.currentEvent.landmark, 'landmark missing at leg ' + (legIndex + 1));
    else ok(!run.currentEvent.landmark, 'landmark at wrong leg ' + (legIndex + 1));
    ok(!seen.has(run.currentEvent.id), 'event repeated: ' + run.currentEvent.id);
    seen.add(run.currentEvent.id);
    const opts = availableChoices(run);
    applyChoice(run, opts[Math.floor(Math.random() * opts.length)]);
    ok(run.hour >= hourBefore + LEG_HOURS - 1.01, 'clock went backwards');
    for (const k of RES_KEYS) ok(run.res[k] >= 0 && run.res[k] <= 12, 'clamp violated: ' + k + '=' + run.res[k]);
  }
  ok(run.outcome === 'win' || (run.outcome === 'lose' && run.deadResource), 'bad outcome');
  ok(run.outcome !== 'win' || RES_KEYS.every(k => run.res[k] > 0), 'won with a dead resource');
}

// 6. Stranded overrides win on the final leg; arrival time never fails you; win fires once
{
  const run = newRun();
  run.stop = 9; run.hour = 25;
  run.res = { coins: 2, food: 12, fuel: 12, goodwill: 12 };
  run.currentEvent = DECK.find(e => e.id === 'sari-sari');
  const out = applyChoice(run, 'A');
  ok(out.outcome === 'lose' && out.deadResource === 'coins', 'stranded did not override win');
}
{
  const run = newRun();
  run.stop = 9; run.hour = 27;
  run.res = { coins: 12, food: 12, fuel: 12, goodwill: 12 };
  run.currentEvent = DECK.find(e => e.id === 'sari-sari');
  const out = applyChoice(run, 'A');
  ok(out.outcome === 'win', 'surviving all 10 stops did not win');
  ok(applyChoice(run, 'B') === null, 'applyChoice not a no-op after run over');
}

// 7. Night + cold trims stack; time never trimmed; night insurance at threshold
{
  const run = newRun();
  run.hour = 19; run.res.goodwill = 2;
  const eff = effectiveEffects(run, { food: 3, time: 2 });
  ok(eff.cold && eff.night && eff.effects.food === 1 && eff.effects.time === 2, 'stacked trim wrong: ' + JSON.stringify(eff));
  run.res.goodwill = NIGHT_GOODWILL;
  const eff2 = effectiveEffects(run, { food: 3 });
  ok(!eff2.night && eff2.effects.food === 3, 'night insurance failed');
}

// 8. Time-band conditions gate night content
{
  const run = newRun();
  run.hour = 10;
  ok(!condMet(run, [{ time: 'gabi' }, { res: 'goodwill', atLeast: 7 }]), 'gabi condition met in the morning');
  run.hour = 19; run.res.goodwill = 8;
  ok(condMet(run, [{ time: 'gabi' }, { res: 'goodwill', atLeast: 7 }]), 'night blessing condition failed at night');
}

// 9. Passenger layer (v0.2): pool integrity, pair invariants, seed determinism, no gameplay effect
ok(PASSENGERS.length === 5, 'passenger pool has ' + PASSENGERS.length);
ok(new Set(PASSENGERS.map(p => p.id)).size === 5, 'duplicate passenger ids');
for (const p of PASSENGERS) ok(p.id && p.name && p.emoji && p.blurb && p.tag, 'passenger ' + p.id + ' missing fields');
for (let i = 0; i < 500; i++) {
  const run = newRun();
  ok(run.passenger === null, 'passenger preselected');
  ok(run.passengerPair.length === 2 && run.passengerPair[0] !== run.passengerPair[1], 'bad passenger pair');
  ok(run.passengerPair.every(p => PASSENGERS.includes(p)), 'pair member not from pool');
}
{
  const seeded = (seed) => { let s = seed; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; };
  const a = newRun(seeded(42));
  const b = newRun(seeded(42));
  ok(a.passengerPair[0].id === b.passengerPair[0].id && a.passengerPair[1].id === b.passengerPair[1].id, 'passenger pair not seed-deterministic');
  ok(a.pool[0].id === b.pool[0].id, 'event order not seed-deterministic');
}

// 10. Any win outscores any loss (50k runs); win tier floor holds
{
  let minWin = Infinity, maxLoss = -Infinity;
  for (let i = 0; i < 50000; i++) {
    const run = playRun(i % 2 ? pickGreedy : pickRandom);
    const s = computeScore(run).score;
    if (run.outcome === 'win') minWin = Math.min(minWin, s); else maxLoss = Math.max(maxLoss, s);
  }
  ok(minWin > maxLoss, 'a loss (' + maxLoss + ') can outscore a win (' + minWin + ')');
  ok(tierFor(minWin) !== 'Batikang Biyahero 🛺', 'a win fell below the win tier');
  console.log('score ordering: minWin=' + minWin + ' maxLoss=' + maxLoss);
}

if (fails.length) {
  console.error('FAILED (' + fails.length + '):');
  [...new Set(fails)].slice(0, 20).forEach(f => console.error(' - ' + f));
  process.exit(1);
}
console.log('All invariants passed.');
`;

eval(src + checks);
