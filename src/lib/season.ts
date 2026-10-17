import { getWeekScores, type ScoreGame } from "./espn";

const HOUR = 60 * 60 * 1000;

export type TeamSeason = {
  abbr: string;
  name: string;
  games: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  /** Combined points in this team's games, both sides. */
  combined: number;
};

export type GameResult = { id: string; week: number; label: string; score: string; total: number };

export type SeasonStats = {
  /** Weeks 1 through this one are counted; only final games count. */
  throughWeek: number;
  games: number;
  teams: TeamSeason[];
  highest: GameResult | null;
  lowest: GameResult | null;
};

function result(game: ScoreGame): GameResult {
  return {
    id: game.id,
    week: game.week ?? 0,
    label: game.label,
    score: `${game.away.abbr} ${game.away.score}, ${game.home.abbr} ${game.home.score}`,
    total: game.total,
  };
}

/** Season-to-date totals for every team, from each regular-season week's final scores. */
export async function getSeasonStats(): Promise<SeasonStats> {
  const current = await getWeekScores();
  const through = current.currentWeek ?? current.weeks;
  // Finished weeks won't change, so they're only refetched hourly; the current one is live.
  const earlier = await Promise.all(
    Array.from({ length: Math.max(0, through - 1) }, (_, i) => getWeekScores(i + 1, HOUR)),
  );
  const weeks = current.currentWeek === null ? [...earlier, await getWeekScores(through, HOUR)] : [...earlier, current];

  const teams = new Map<string, TeamSeason>();
  const finals = weeks.flatMap((w) => w.games).filter((g) => g.state === "post");

  for (const game of finals) {
    for (const [team, other] of [
      [game.home, game.away],
      [game.away, game.home],
    ]) {
      const row = teams.get(team.abbr) ?? {
        abbr: team.abbr,
        name: team.name,
        games: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        combined: 0,
      };
      row.games += 1;
      if (team.score > other.score) row.wins += 1;
      else if (team.score < other.score) row.losses += 1;
      else row.ties += 1;
      row.pointsFor += team.score;
      row.pointsAgainst += other.score;
      row.combined += game.total;
      teams.set(team.abbr, row);
    }
  }

  const byTotal = [...finals].sort((a, b) => b.total - a.total);
  return {
    throughWeek: through,
    games: finals.length,
    teams: [...teams.values()],
    highest: byTotal[0] ? result(byTotal[0]) : null,
    lowest: byTotal.at(-1) ? result(byTotal.at(-1)!) : null,
  };
}
