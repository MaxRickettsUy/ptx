// ESPN's public JSON endpoints are undocumented and can change without notice.
// Everything that touches their response shapes lives in this file so a different
// stats provider can replace it without touching the rest of the app.

import type { GameState } from "./grade";
import { EMPTY_LINE, type PlayerLine } from "./stats";

const SITE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
const WEB = "https://site.web.api.espn.com/apis/common/v3";
const CORE = "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl";

const SECOND = 1000;
const MINUTE = 60 * SECOND;

export type TeamSide = { id: string; abbr: string; score: number };

export type Game = {
  id: string;
  label: string;
  date: string;
  week: number | null;
  state: GameState;
  detail: string;
  home: TeamSide;
  away: TeamSide;
};

export type PlayerSummary = {
  athleteId: string;
  name: string;
  position: string | null;
  team: string | null;
  jersey: string | null;
};

export type GameStats = {
  game: Game;
  players: Record<string, { name: string; team: string; line: PlayerLine }>;
};

export type QuarterStats = {
  /** How many of the four quarters have finished. */
  quartersDone: number;
  /** One stat line per period for each player: index 0 is the first quarter, and overtime follows the fourth. */
  players: Record<string, PlayerLine[]>;
};

/* eslint-disable @typescript-eslint/no-explicit-any */

const cache = new Map<string, { expires: number; value: Promise<unknown> }>();

function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as Promise<T>;
  const value = load();
  cache.set(key, { expires: Date.now() + ttl, value });
  value.catch(() => cache.delete(key));
  return value;
}

/** Drops cached responses whose key starts with `prefix`, so the next read goes back to ESPN. */
function forget(prefix: string) {
  for (const key of cache.keys()) if (key.startsWith(prefix)) cache.delete(key);
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15 * SECOND) });
  if (!res.ok) throw new Error(`ESPN responded ${res.status} for ${url}`);
  return res.json();
}

function num(value: unknown): number {
  const n = Number.parseFloat(String(value));
  return Number.isFinite(n) ? n : 0;
}

function toGame(competition: any, week: number | null): Game {
  const side = (homeAway: "home" | "away"): TeamSide => {
    const c = competition.competitors.find((x: any) => x.homeAway === homeAway);
    return { id: String(c.team.id), abbr: c.team.abbreviation, score: num(c.score) };
  };
  const home = side("home");
  const away = side("away");
  const type = competition.status?.type ?? {};
  return {
    id: String(competition.id),
    label: `${away.abbr} @ ${home.abbr}`,
    date: competition.date,
    week,
    state: (type.state as GameState) ?? "pre",
    detail: type.shortDetail ?? type.description ?? "",
    home,
    away,
  };
}

/**
 * A team's logo on ESPN's image CDN, in the version drawn for dark backgrounds. The app serves
 * copies from public/team-logos instead; `pnpm logos` downloads them from here.
 */
export function espnTeamLogoUrl(abbr: string, size = 128): string {
  const team = encodeURIComponent(abbr.toLowerCase());
  return `https://a.espncdn.com/combiner/i?img=/i/teamlogos/nfl/500-dark/${team}.png&w=${size}&h=${size}`;
}

/** Square headshot from ESPN's image CDN, or null for ids that aren't real ESPN athletes. */
export function headshotUrl(athleteId: string, size = 96): string | null {
  if (!/^\d+$/.test(athleteId)) return null;
  return `https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/${athleteId}.png&w=${size}&h=${size}&scale=crop`;
}

function scoreboardData(week?: number, ttl = 15 * SECOND): Promise<any> {
  const query = week ? `?seasontype=2&week=${week}` : "";
  return cached(`scoreboard:${week ?? "current"}:${ttl}`, ttl, () => getJson(`${SITE}/scoreboard${query}`));
}

/** Forgets cached scoreboards: one week's (and the current week's), or every week's when none is given. */
export function forgetScoreboards(week?: number) {
  if (week === undefined) return forget("scoreboard:");
  forget(`scoreboard:${week}:`);
  forget("scoreboard:current:");
}

export async function getScoreboard(week?: number): Promise<{ week: number; games: Game[] }> {
  const data = await scoreboardData(week);
  const weekNumber: number = data.week?.number ?? week ?? 0;
  const games: Game[] = (data.events ?? []).map((event: any) => toGame(event.competitions[0], weekNumber));
  return { week: weekNumber, games };
}

export type ScoreTeam = TeamSide & { name: string; record: string | null; quarters: number[] };

export type ScoreGame = Omit<Game, "home" | "away"> & { home: ScoreTeam; away: ScoreTeam; total: number };

export type WeekScores = {
  week: number;
  /** The regular-season week being played now, or null outside the regular season. */
  currentWeek: number | null;
  /** How many weeks the regular season has. */
  weeks: number;
  games: ScoreGame[];
  /** Abbreviations of the teams with no game this week. */
  byes: string[];
};

/**
 * Every regular-season game in a week, with each side's points by quarter. Defaults to the current week.
 * A week that's over can pass a longer `ttl`, since its scores won't change.
 */
export async function getWeekScores(week?: number, ttl?: number): Promise<WeekScores> {
  const [data, current] = await Promise.all([scoreboardData(week, ttl), week ? scoreboardData() : null]);
  const now = current ?? data;
  const weekNumber: number = data.week?.number ?? week ?? 0;
  const regular = (data.leagues?.[0]?.calendar ?? []).find((c: any) => String(c.value) === "2");

  const games = (data.events ?? []).map((event: any): ScoreGame => {
    const competition = event.competitions[0];
    const game = toGame(competition, weekNumber);
    const side = (base: TeamSide): ScoreTeam => {
      const c = competition.competitors.find((x: any) => String(x.team.id) === base.id);
      return {
        ...base,
        name: c.team.shortDisplayName ?? c.team.displayName ?? base.abbr,
        record: c.records?.[0]?.summary ?? null,
        quarters: (c.linescores ?? []).map((l: any) => num(l.value)),
      };
    };
    return { ...game, home: side(game.home), away: side(game.away), total: game.home.score + game.away.score };
  });

  return {
    week: weekNumber,
    currentWeek: now.season?.type === 2 ? (now.week?.number ?? null) : null,
    weeks: regular?.entries?.length || 18,
    games,
    byes: (data.week?.teamsOnBye ?? []).map((t: any) => t.abbreviation),
  };
}

// Maps the boxscore's per-category `keys` onto our flat stat line.
const BOX_FIELDS: Record<string, Record<string, (line: PlayerLine, raw: string) => void>> = {
  passing: {
    "completions/passingAttempts": (line, raw) => {
      const [cmp, att] = raw.split("/");
      line.passCmp = num(cmp);
      line.passAtt = num(att);
    },
    passingYards: (line, raw) => void (line.passYds = num(raw)),
    passingTouchdowns: (line, raw) => void (line.passTd = num(raw)),
    interceptions: (line, raw) => void (line.passInt = num(raw)),
  },
  rushing: {
    rushingAttempts: (line, raw) => void (line.rushAtt = num(raw)),
    rushingYards: (line, raw) => void (line.rushYds = num(raw)),
    rushingTouchdowns: (line, raw) => void (line.rushTd = num(raw)),
  },
  receiving: {
    receptions: (line, raw) => void (line.rec = num(raw)),
    receivingYards: (line, raw) => void (line.recYds = num(raw)),
    receivingTouchdowns: (line, raw) => void (line.recTd = num(raw)),
  },
  kicking: {
    "fieldGoalsMade/fieldGoalAttempts": (line, raw) => void (line.fgMade = num(raw.split("/")[0])),
    totalKickingPoints: (line, raw) => void (line.kickPts = num(raw)),
  },
};

export async function getGameStats(eventId: string): Promise<GameStats> {
  return cached(`summary:${eventId}`, 15 * SECOND, async () => {
    const data = await getJson(`${SITE}/summary?event=${encodeURIComponent(eventId)}`);
    const game = toGame(data.header.competitions[0], data.header.week ?? null);
    const players: GameStats["players"] = {};

    for (const team of data.boxscore?.players ?? []) {
      for (const category of team.statistics ?? []) {
        const fields = BOX_FIELDS[category.name];
        if (!fields) continue;
        const keys: string[] = category.keys ?? [];
        for (const row of category.athletes ?? []) {
          const id = String(row.athlete.id);
          players[id] ??= {
            name: row.athlete.displayName,
            team: team.team.abbreviation,
            line: { ...EMPTY_LINE },
          };
          keys.forEach((key, i) => fields[key]?.(players[id].line, String(row.stats[i] ?? "")));
        }
      }
    }
    return { game, players };
  });
}

// Yards between two spots as the play-by-play writes them: "BLT 41", or a bare "50" at midfield.
function yardsBetween(a: string, b: string): number {
  const [sideA, atA] = a.includes(" ") ? a.split(" ") : [null, a];
  const [sideB, atB] = b.includes(" ") ? b.split(" ") : [null, b];
  const acrossMidfield = sideA !== null && sideB !== null && sideA !== sideB;
  return acrossMidfield ? 100 - num(atA) - num(atB) : Math.abs(num(atA) - num(atB));
}

const SPOT = String.raw`((?:[A-Z]+ )?\d+)`;

function creditedYards(play: any, full: string, text: string): number {
  // On a fumbled snap the yardage that counts is the pass that followed it.
  const described = text.slice(Math.max(0, text.search(/\bpass\b/i)));
  const gain = /for (-?\d+) yards?/i.exec(described);
  const yards = gain ? num(gain[1]) : /for no gain/i.test(described) ? 0 : num(play.statYardage);

  // A foul by the offense during the play is marked off from where it happened, and the
  // ball carrier is only credited up to that spot.
  const foulAt = new RegExp(`penalty on .*?enforced at ${SPOT}`, "i").exec(full)?.[1];
  if (!foulAt) return yards;
  const endedAt = new RegExp(`(?:to|at) ${SPOT} for`).exec(described)?.[1];
  if (endedAt) return yards - yardsBetween(endedAt, foulAt);

  // A touchdown run that was called back names no end spot, but it ended on the goal line.
  // The foul was either N yards out or 100 - N; only count it when one of those fits the run.
  const out = num(foulAt.split(" ").at(-1));
  const fits = [out, 100 - out].filter((n) => n <= yards);
  return /touchdown/i.test(text) && fits.length === 1 ? yards - fits[0] : yards;
}

// The box score only carries game totals, so quarter-by-quarter lines are rebuilt from the
// play-by-play. That can drift from the official totals on odd plays (laterals, fumbles, stat
// corrections), so callers should check the quarters still add up to the box score.
export function quarterStatsFromPlays(plays: any[], finished: boolean): QuarterStats {
  const players: QuarterStats["players"] = {};
  const ended = new Set<number>();
  let latest = 0;

  for (const play of plays) {
    const period = num(play.period?.number);
    if (period < 1) continue;
    latest = Math.max(latest, period);
    if (/^End (Period|of Half|of Game)/i.test(play.type?.text ?? "")) ended.add(period);

    // After a replay reversal the corrected ruling follows the original one.
    const full: string = (play.text ?? "").split(/reversed\./i).at(-1);
    if (/no play/i.test(full)) continue;

    const lineFor = (athleteId: string): PlayerLine => {
      const periods = (players[athleteId] ??= []);
      while (periods.length < period) periods.push({ ...EMPTY_LINE });
      return periods[period - 1];
    };
    const who = (type: string): string[] =>
      (play.participants ?? [])
        .filter((p: any) => p.type === type)
        .map((p: any) => /athletes\/(\d+)/.exec(p.athlete?.$ref ?? "")?.[1])
        .filter(Boolean);

    if (/field goal is good/i.test(full)) {
      for (const id of who("kicker").slice(0, 1)) {
        lineFor(id).fgMade += 1;
        lineFor(id).kickPts += 3;
      }
    }
    if (/extra point is good/i.test(full)) {
      for (const id of who("kicker").slice(0, 1)) lineFor(id).kickPts += 1;
    }

    // A conversion try or a penalty tacked on the end describes something other than the play being counted.
    const text = full.split(/two-point conversion|penalty on/i)[0];
    const yards = creditedYards(play, full, text);
    const touchdown = play.scoringPlay === true && /touchdown/i.test(text);
    const scorers = touchdown ? who("scorer") : [];

    const [passer] = who("passer");
    const [rusher] = who("rusher");
    if (passer) {
      if (/sacked/i.test(text)) continue;
      const line = lineFor(passer);
      line.passAtt += 1;
      if (/intercepted/i.test(text)) {
        line.passInt += 1;
      } else if (!/incomplete|spiked/i.test(text)) {
        const [receiver] = who("receiver");
        line.passCmp += 1;
        // The passer gets the whole play when the catch is lateralled on; the receiver only his part.
        line.passYds += /lateral/i.test(text) ? num(play.statYardage) : yards;
        if (receiver) {
          lineFor(receiver).rec += 1;
          lineFor(receiver).recYds += yards;
          if (scorers.includes(receiver)) {
            lineFor(receiver).recTd += 1;
            line.passTd += 1;
          }
        }
      }
    } else if (rusher) {
      lineFor(rusher).rushAtt += 1;
      lineFor(rusher).rushYds += yards;
      if (scorers.includes(rusher)) lineFor(rusher).rushTd += 1;
    }
  }

  const quartersDone = finished ? 4 : Math.min(4, ended.has(latest) ? latest : latest - 1);
  return { quartersDone: Math.max(0, quartersDone), players };
}

export async function getQuarterStats(eventId: string, finished: boolean): Promise<QuarterStats> {
  return cached(`plays:${eventId}:${finished}`, 15 * SECOND, async () => {
    const base = `${CORE}/events/${encodeURIComponent(eventId)}/competitions/${encodeURIComponent(eventId)}/plays?limit=400`;
    const first = await getJson(base);
    const plays: any[] = first.items ?? [];
    for (let page = 2; page <= num(first.pageCount); page++) {
      plays.push(...((await getJson(`${base}&page=${page}`)).items ?? []));
    }
    return quarterStatsFromPlays(plays, finished);
  });
}

export async function getTeams(): Promise<{ id: string; abbr: string; name: string }[]> {
  return cached("teams", 24 * 60 * MINUTE, async () => {
    const data = await getJson(`${SITE}/teams`);
    return data.sports[0].leagues[0].teams.map((t: any) => ({
      id: String(t.team.id),
      abbr: t.team.abbreviation,
      name: t.team.displayName,
    }));
  });
}

async function resolveTeam(team: string) {
  const teams = await getTeams();
  const needle = team.trim().toLowerCase();
  const found =
    teams.find((t) => t.abbr.toLowerCase() === needle) ??
    teams.find((t) => t.name.toLowerCase().includes(needle));
  if (!found) {
    throw new Error(`Unknown team "${team}". Use an abbreviation such as ${teams.slice(0, 4).map((t) => t.abbr).join(", ")}.`);
  }
  return found;
}

export async function searchPlayers(query: string): Promise<PlayerSummary[]> {
  const url = `${WEB}/search?query=${encodeURIComponent(query)}&type=player&sport=football&league=nfl&limit=8`;
  const data = await cached(`search:${query.toLowerCase()}`, 10 * MINUTE, () => getJson(url));
  return (data.items ?? [])
    .filter((item: any) => item.isActive !== false)
    .map((item: any) => ({
      athleteId: String(item.id),
      name: item.displayName,
      position: item.position?.abbreviation ?? null,
      team: item.teamRelationships?.[0]?.core?.abbreviation ?? null,
      jersey: item.jersey ?? null,
    }));
}

const PROP_POSITIONS = new Set(["QB", "RB", "FB", "WR", "TE", "PK", "K"]);

export async function getRoster(team: string) {
  const resolved = await resolveTeam(team);
  const data = await cached(`roster:${resolved.id}`, 10 * MINUTE, () => getJson(`${SITE}/teams/${resolved.id}/roster`));
  const players = (data.athletes ?? [])
    .filter((group: any) => group.position !== "practiceSquad")
    .flatMap((group: any) =>
      (group.items ?? [])
        .filter((p: any) => PROP_POSITIONS.has(p.position?.abbreviation))
        .map((p: any) => ({
          athleteId: String(p.id),
          name: p.displayName,
          position: p.position.abbreviation,
          jersey: p.jersey ?? null,
          rosterStatus: group.position === "injuredReserveOrOut" ? "IR / out" : "active",
          injury: p.injuries?.[0]?.status ?? null,
        })),
    );
  return { team: resolved.abbr, players };
}

export async function getInjuries(team: string) {
  const resolved = await resolveTeam(team);
  // One ~9MB payload covers the whole league, so keep it around for a while.
  const data = await cached("injuries", 10 * MINUTE, () => getJson(`${SITE}/injuries`));
  const entry = (data.injuries ?? []).find((t: any) => String(t.id) === resolved.id);
  const injuries = (entry?.injuries ?? [])
    .filter((i: any) => PROP_POSITIONS.has(i.athlete?.position?.abbreviation))
    .map((i: any) => ({
      name: i.athlete.displayName,
      position: i.athlete.position.abbreviation,
      status: i.status,
      injury: i.details?.type ?? null,
      updated: i.date,
      note: i.shortComment ?? null,
    }));
  return { team: resolved.abbr, injuries };
}

export async function getGameLog(athleteId: string, options: { lastN?: number; season?: number } = {}) {
  const { lastN = 6, season } = options;
  const query = season ? `?season=${season}` : "";
  const url = `${WEB}/sports/football/nfl/athletes/${encodeURIComponent(athleteId)}/gamelog${query}`;
  const data = await cached(`gamelog:${athleteId}:${season ?? "current"}`, 5 * MINUTE, () => getJson(url));
  const names: string[] = data.names ?? [];

  const games = (data.seasonTypes ?? [])
    .filter((s: any) => /regular|post/i.test(s.displayName ?? ""))
    .flatMap((s: any) => (s.categories ?? []).flatMap((c: any) => c.events ?? []))
    .map((row: any) => {
      const meta = data.events?.[row.eventId] ?? {};
      return {
        week: meta.week ?? null,
        date: meta.gameDate ?? null,
        opponent: `${meta.atVs ?? ""} ${meta.opponent?.abbreviation ?? "?"}`.trim(),
        result: meta.gameResult ? `${meta.gameResult} ${meta.score ?? ""}`.trim() : null,
        stats: Object.fromEntries(names.map((name, i) => [name, row.stats?.[i] ?? null])),
      };
    })
    .sort((a: any, b: any) => String(b.date).localeCompare(String(a.date)))
    .slice(0, lastN);

  return { athleteId, season: season ?? "current", games };
}
