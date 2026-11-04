// The game's log (logs/godot*.log) names every card played; the run files don't. It keeps only the last five launches,
// so each log is read into a small summary per run and kept. A run is found by the seed of its "Embarking" line, or,
// when it was continued after a restart, by the history file the game writes when it ends.

const EMBARK = /^\[INFO\] Embarking on a .*Seed: ([A-Za-z0-9_]+)/;
const FIGHT = /^\[INFO\] Creating NCombatRoom with mode=ActiveCombat encounter=([A-Z0-9_]+)/;
const PLAY = /^\[INFO\] Player (\d+) playing card ([A-Z0-9_]+)/;
const ENEMY = /^\[INFO\] Monster \S+ performing move/;
const COPY = /^\[INFO\] Copying \S+\/history\/(\d+)\.run from cloud/;
const ENDED = /^\[INFO\] Wrote \d+ bytes to path=\S+\/history\/(\d+)\.run/;

/** One player's cards in one run: how many, which most, and the turn with the most. */
function summarize(turns) {
  const players = {};
  for (const { fight, plays } of turns) {
    const byPlayer = {};
    for (const [player, card] of plays) (byPlayer[player] ??= []).push(card);
    for (const [player, cards] of Object.entries(byPlayer)) {
      const p = (players[player] ??= { played: 0, counts: {}, best: { n: 0, cards: [], fight: "" } });
      p.played += cards.length;
      for (const card of cards) p.counts[card] = (p.counts[card] || 0) + 1;
      if (cards.length > p.best.n) p.best = { n: cards.length, cards, fight };
    }
  }
  for (const p of Object.values(players)) {
    p.top = Object.entries(p.counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    delete p.counts;
  }
  return players;
}

/** A whole log → [{ seed, start, players }], one per run seen in it. A run without any card played is left out. */
export function parseLog(text) {
  const found = [], copied = new Set();
  let run = null, turn = null, fight = "";
  const close = (start = null) => {
    if (run?.turns.some((t) => t.plays.length)) found.push({ seed: run.seed, start, players: summarize(run.turns) });
    run = turn = null;
  };
  for (const line of text.split("\n")) {
    if (!line.startsWith("[INFO]")) continue;
    let m;
    if ((m = EMBARK.exec(line))) {
      close();
      run = { seed: m[1], turns: [] };
    } else if ((m = FIGHT.exec(line))) {
      fight = m[1];
      turn = null;
    } else if ((m = PLAY.exec(line))) {
      run ??= { seed: null, turns: [] };
      if (!turn) run.turns.push((turn = { fight, plays: [] }));
      turn.plays.push([m[1], m[2]]);
    } else if (ENEMY.test(line)) {
      turn = null; // the enemies moved: the next card is a new turn
    } else if ((m = COPY.exec(line))) {
      copied.add(m[1]);
    } else if ((m = ENDED.exec(line)) && !copied.has(m[1])) {
      close(Number(m[1]));
    }
  }
  close();
  return found;
}

/** The parts of one run kept from several logs, put together. In solo the log calls the player "1". */
export function playsFor(run, parts) {
  if (!parts.length) return null;
  const players = run.players.map((p) => {
    const mine = parts.map((part) => part.players[p.steamId] ?? (run.players.length === 1 ? Object.values(part.players)[0] : null)).filter(Boolean);
    if (!mine.length) return null;
    const counts = {};
    for (const part of mine) for (const [card, n] of part.top) counts[card] = (counts[card] || 0) + n;
    return {
      played: mine.reduce((sum, part) => sum + part.played, 0),
      top: Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5),
      best: mine.map((part) => part.best).reduce((a, b) => (b.n > a.n ? b : a)),
    };
  });
  return players.some(Boolean) ? players : null;
}
