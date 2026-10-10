// ESPN's public JSON endpoints are undocumented and can change without notice.
// Everything that touches their response shapes lives in this file so a different
// stats provider can replace it without touching the rest of the app.

import type { GameState } from "./grade";
import { EMPTY_LINE, type PlayerLine } from "./stats";

const SITE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";
const WEB = "https://site.web.api.espn.com/apis/common/v3";

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

/** Square headshot from ESPN's image CDN, or null for ids that aren't real ESPN athletes. */
export function headshotUrl(athleteId: string, size = 96): string | null {
  if (!/^\d+$/.test(athleteId)) return null;
  return `https://a.espncdn.com/combiner/i?img=/i/headshots/nfl/players/full/${athleteId}.png&w=${size}&h=${size}&scale=crop`;
}

export async function getScoreboard(week?: number): Promise<{ week: number; games: Game[] }> {
  const query = week ? `?seasontype=2&week=${week}` : "";
  return cached(`scoreboard:${week ?? "current"}`, 15 * SECOND, async () => {
    const data = await getJson(`${SITE}/scoreboard${query}`);
    const weekNumber: number = data.week?.number ?? week ?? 0;
    const games: Game[] = (data.events ?? []).map((event: any) => toGame(event.competitions[0], weekNumber));
    return { week: weekNumber, games };
  });
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

async function getTeams(): Promise<{ id: string; abbr: string; name: string }[]> {
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
