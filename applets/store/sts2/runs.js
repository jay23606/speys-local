// Slay the Spire 2 writes every finished run as plain JSON. The format changes between patches (schema 9 and 10 sit in
// the same folder), so no field is trusted: a missing one falls back to a default and an unreadable file is counted.
// The source key matches Speys' importer (`sts2:<start>:<seed>`), so a later sync will not create the same run twice.

const bareId = (id) => (typeof id !== "string" ? "" : id.includes(".") ? id.slice(id.indexOf(".") + 1) : id);
const rows = (value) => (Array.isArray(value) ? value.filter((v) => v && typeof v === "object") : []);

/** "CHARACTER.NECROBINDER" → "Necrobinder", "ENCOUNTER.THE_OBSCURA_NORMAL" → "The Obscura". */
function readable(id, dropSuffix = false) {
  if (typeof id !== "string" || !id || id.startsWith("NONE")) return "";
  let name = bareId(id);
  if (dropSuffix) name = name.replace(/_(NORMAL|ELITE|BOSS|WEAK|STRONG)$/i, "");
  return name.toLowerCase().split("_").filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
}

/** One file, or null if it can't be read. A Steam id has 17 digits and JSON.parse would round it, so it becomes text first. */
export function parseRun(raw) {
  let data;
  try {
    data = JSON.parse(raw.replace(/"id"\s*:\s*(\d{15,})/g, '"id":"$1"'));
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const startTime = Number(data.start_time);
  const players = Array.isArray(data.players) ? data.players : [];
  if (!Number.isFinite(startTime) || startTime <= 0 || !players.length) return null;
  const seed = typeof data.seed === "string" ? data.seed : "";
  const win = data.win === true;
  return {
    sourceKey: `sts2:${startTime}:${seed}`,
    startTime,
    duration: Math.max(1, Math.round((Number(data.run_time) || 0) / 60)),
    win,
    abandoned: data.was_abandoned === true,
    ascension: Number(data.ascension) || 0,
    gameMode: typeof data.game_mode === "string" ? data.game_mode : "standard",
    seed,
    build: typeof data.build_id === "string" ? data.build_id : "",
    floors: rows2(data.map_point_history).length,
    killedBy: win ? "" : readable(data.killed_by_encounter, true) || readable(data.killed_by_event, true),
    players: players.map((p) => ({
      steamId: typeof p?.id === "string" && p.id.length >= 15 ? p.id : null,
      character: readable(p?.character) || "?",
      deck: rows(p?.deck).map((c) => ({ id: bareId(c.id), up: Number(c.current_upgrade_level) || 0 })).filter((c) => c.id),
      relics: rows(p?.relics).map((r) => bareId(r.id)).filter(Boolean),
    })),
  };
}

/** map_point_history is one list of rooms per act. */
const rows2 = (acts) => (Array.isArray(acts) ? acts.flatMap((act) => rows(act)) : []);

const count = (value) => (Array.isArray(value) ? value.length : 0);

/** A run with its floor-by-floor story for one opened run; too much to keep for every run in the cache. */
export function parseRunDetail(raw) {
  const run = parseRun(raw);
  if (!run) return null;
  const data = JSON.parse(raw.replace(/"(id|player_id)"\s*:\s*(\d{15,})/g, '"$1":"$2"'));
  const acts = Array.isArray(data.map_point_history) ? data.map_point_history : [];
  const players = run.players.map((player, index) => {
    const source = data.players[index];
    const totals = { damage: 0, healed: 0, goldGained: 0, goldSpent: 0, upgrades: 0, removed: 0, potions: 0 };
    let floor = 0;
    const floors = acts.flatMap((act, actIndex) => rows(act).map((point) => {
      floor += 1;
      const room = rows(point.rooms)[0] ?? {};
      const stats = rows(point.player_stats).find((s) => String(s.player_id) === String(source?.id)) ?? {};
      totals.damage += Number(stats.damage_taken) || 0;
      totals.healed += Number(stats.hp_healed) || 0;
      totals.goldGained += Number(stats.gold_gained) || 0;
      totals.goldSpent += Number(stats.gold_spent) || 0;
      totals.upgrades += count(stats.upgraded_cards);
      totals.removed += count(stats.cards_removed);
      totals.potions += count(stats.potion_used);
      return {
        floor,
        act: actIndex + 1,
        type: (point.map_point_type === "unknown" && room.room_type) || point.map_point_type || "unknown",
        name: readable(room.model_id, true),
        turns: Number(room.turns_taken) || 0,
        hp: Number(stats.current_hp) || 0,
        maxHp: Number(stats.max_hp) || 0,
        damage: Number(stats.damage_taken) || 0,
      };
    }));
    return {
      ...player,
      deck: rows(source?.deck).map((c) => ({ id: bareId(c.id), up: Number(c.current_upgrade_level) || 0, floor: Number(c.floor_added_to_deck) || 0 })).filter((c) => c.id),
      relics: rows(source?.relics).map((r) => ({ id: bareId(r.id), floor: Number(r.floor_added_to_deck) || 0 })).filter((r) => r.id),
      // the game's own end-of-run awards; a tiered one (ELITE) names its tier
      badges: rows(source?.badges).map((b) => (typeof b.rarity === "string" && b.rarity ? `${b.id}.${b.rarity}` : b.id)).filter((b) => typeof b === "string"),
      totals,
      floors,
    };
  });
  return { ...run, players };
}

/** A run still being played (saves/current_run*.save). The game names the fields differently there (net_id, character_id),
 * so the file is turned into the history shape first; on top come the act, the next boss and each player's HP and gold now. */
export function parseCurrent(raw) {
  let data;
  try {
    data = JSON.parse(raw.replace(/"(net_id|id|player_id)"\s*:\s*(\d{15,})/g, '"$1":"$2"'));
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const source = rows(data.players);
  const asHistory = {
    ...data,
    seed: typeof data.seed === "string" ? data.seed : data.rng?.seed, // same source key as the finished run
    win: false,
    was_abandoned: false,
    players: source.map((p) => ({ ...p, id: p.net_id ?? p.id, character: p.character_id ?? p.character })),
  };
  const run = parseRunDetail(JSON.stringify(asHistory));
  if (!run) return null;
  const acts = rows(data.acts);
  const actIndex = Number(data.current_act_index) || 0;
  return {
    ...run,
    killedBy: "",
    inProgress: true,
    savedAt: Number(data.save_time) || 0,
    act: actIndex + 1,
    boss: readable(acts[actIndex]?.rooms?.boss_id, true),
    players: run.players.map((player, index) => {
      const now = { hp: Number(source[index].current_hp) || 0, maxHp: Number(source[index].max_hp) || 0, gold: Number(source[index].gold) || 0 };
      // only this file has it: a finished run's history file does not keep the damage dealt
      const dealt = Number(source[index].extra_fields?.damage_dealt);
      // the room being played has no numbers yet: its bar shows the HP the player has now
      const floors = player.floors.map((f, i) => (i === player.floors.length - 1 && !f.maxHp ? { ...f, hp: now.hp, maxHp: now.maxHp } : f));
      return { ...player, ...now, floors, totals: { ...player.totals, dealt: Number.isFinite(dealt) ? dealt : null } };
    }),
  };
}

/** filter: { mode: "solo" | "coop" | null, character, person }. */
export const filterRuns = (runs, { mode, character, person } = {}) => runs.filter((run) =>
  (!mode || (mode === "solo") === (run.players.length === 1))
  && (!character || ownPlayer(run).character === character)
  && (!person || run.players.some((p) => p.steamId === person)));

/** The owner's player in a run: their Steam id in co-op, the only player in solo. */
export const ownPlayer = (run) => run.players.find((p) => p.steamId && p.steamId === run.owner) ?? run.players[0];

const bump = (map, key, make) => map.get(key) ?? map.set(key, make()).get(key);
const best = (current, run) => (run.win ? Math.max(current, run.ascension) : current);

/** Numbers for the page. Abandoned runs count as games but not towards the win rate: they were never decided. */
export function summarize(runs) {
  const owners = new Set(runs.map((r) => r.owner).filter(Boolean));
  const characters = new Map(), people = new Map(), killers = new Map();
  const totals = { games: runs.length, wins: 0, abandoned: 0, minutes: 0, best: -1 };
  for (const run of runs) {
    if (run.killedBy && !run.abandoned) bump(killers, run.killedBy, () => ({ name: run.killedBy, games: 0 })).games += 1;
    totals.wins += run.win ? 1 : 0;
    totals.abandoned += run.abandoned ? 1 : 0;
    totals.minutes += run.duration;
    totals.best = best(totals.best, run);
    const coop = run.players.length > 1;
    const row = bump(characters, ownPlayer(run).character, () => ({ character: ownPlayer(run).character, games: 0, wins: 0, bestSolo: -1, bestCoop: -1 }));
    row.games += 1;
    row.wins += run.win ? 1 : 0;
    if (coop) row.bestCoop = best(row.bestCoop, run);
    else row.bestSolo = best(row.bestSolo, run);
    for (const p of run.players) {
      if (!p.steamId || owners.has(p.steamId)) continue;
      const person = bump(people, p.steamId, () => ({ steamId: p.steamId, games: 0, wins: 0, best: -1 }));
      person.games += 1;
      person.wins += run.win ? 1 : 0;
      person.best = best(person.best, run);
    }
  }
  const byGames = (a, b) => b.games - a.games;
  return {
    totals,
    characters: [...characters.values()].sort(byGames),
    people: [...people.values()].sort(byGames),
    killers: [...killers.values()].sort(byGames).slice(0, 5),
  };
}

/** A row of the run list: everything but decks and relics, which the page asks for when a run is opened. */
export const listRow = (run) => ({
  ...run,
  players: run.players.map(({ steamId, character, hp, maxHp, gold }) => ({ steamId, character, ...(run.inProgress && { hp, maxHp, gold }) })),
});
