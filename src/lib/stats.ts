// The leagues a leg can be in. Each has its own markets below and its own ESPN endpoints.
export const SPORTS = ["nfl", "nba"] as const;

export type Sport = (typeof SPORTS)[number];

export function isSport(value: unknown): value is Sport {
  return SPORTS.includes(value as Sport);
}

/** One flat line covers both leagues; a player only ever fills in their own sport's fields. */
export type PlayerLine = {
  passYds: number;
  passTd: number;
  passCmp: number;
  passAtt: number;
  passInt: number;
  rushYds: number;
  rushAtt: number;
  rushTd: number;
  rec: number;
  recYds: number;
  recTd: number;
  fgMade: number;
  kickPts: number;
  pts: number;
  reb: number;
  ast: number;
  threes: number;
  stl: number;
  blk: number;
  tov: number;
};

export const EMPTY_LINE: PlayerLine = {
  passYds: 0,
  passTd: 0,
  passCmp: 0,
  passAtt: 0,
  passInt: 0,
  rushYds: 0,
  rushAtt: 0,
  rushTd: 0,
  rec: 0,
  recYds: 0,
  recTd: 0,
  fgMade: 0,
  kickPts: 0,
  pts: 0,
  reb: 0,
  ast: 0,
  threes: 0,
  stl: 0,
  blk: 0,
  tov: 0,
};

type StatDef = {
  sport: Sport;
  label: string;
  short: string;
  // Yardage can go backwards on a loss, so crossing the line mid-game isn't final.
  monotonic: boolean;
  value: (line: PlayerLine) => number;
};

export const STATS = {
  passing_yards: { sport: "nfl", label: "Passing yards", short: "PASS YDS", monotonic: false, value: (l) => l.passYds },
  passing_tds: { sport: "nfl", label: "Passing TDs", short: "PASS TD", monotonic: true, value: (l) => l.passTd },
  pass_completions: { sport: "nfl", label: "Completions", short: "CMP", monotonic: true, value: (l) => l.passCmp },
  pass_attempts: { sport: "nfl", label: "Pass attempts", short: "ATT", monotonic: true, value: (l) => l.passAtt },
  interceptions: { sport: "nfl", label: "Interceptions thrown", short: "INT", monotonic: true, value: (l) => l.passInt },
  rushing_yards: { sport: "nfl", label: "Rushing yards", short: "RUSH YDS", monotonic: false, value: (l) => l.rushYds },
  rushing_attempts: { sport: "nfl", label: "Rush attempts", short: "CAR", monotonic: true, value: (l) => l.rushAtt },
  receiving_yards: { sport: "nfl", label: "Receiving yards", short: "REC YDS", monotonic: false, value: (l) => l.recYds },
  receptions: { sport: "nfl", label: "Receptions", short: "REC", monotonic: true, value: (l) => l.rec },
  rush_rec_yards: { sport: "nfl", label: "Rush + rec yards", short: "RUSH+REC", monotonic: false, value: (l) => l.rushYds + l.recYds },
  pass_rush_yards: { sport: "nfl", label: "Pass + rush yards", short: "PASS+RUSH", monotonic: false, value: (l) => l.passYds + l.rushYds },
  touchdowns: { sport: "nfl", label: "Rush + rec TDs", short: "TD", monotonic: true, value: (l) => l.rushTd + l.recTd },
  field_goals_made: { sport: "nfl", label: "Field goals made", short: "FG", monotonic: true, value: (l) => l.fgMade },
  kicking_points: { sport: "nfl", label: "Kicking points", short: "KICK PTS", monotonic: true, value: (l) => l.kickPts },
  // Basketball counting stats only go up, so an over can cash the moment it's crossed.
  points: { sport: "nba", label: "Points", short: "PTS", monotonic: true, value: (l) => l.pts },
  rebounds: { sport: "nba", label: "Rebounds", short: "REB", monotonic: true, value: (l) => l.reb },
  assists: { sport: "nba", label: "Assists", short: "AST", monotonic: true, value: (l) => l.ast },
  threes_made: { sport: "nba", label: "Threes made", short: "3PM", monotonic: true, value: (l) => l.threes },
  steals: { sport: "nba", label: "Steals", short: "STL", monotonic: true, value: (l) => l.stl },
  blocks: { sport: "nba", label: "Blocks", short: "BLK", monotonic: true, value: (l) => l.blk },
  turnovers: { sport: "nba", label: "Turnovers", short: "TOV", monotonic: true, value: (l) => l.tov },
  pts_reb_ast: { sport: "nba", label: "Pts + reb + ast", short: "PRA", monotonic: true, value: (l) => l.pts + l.reb + l.ast },
  pts_reb: { sport: "nba", label: "Pts + reb", short: "P+R", monotonic: true, value: (l) => l.pts + l.reb },
  pts_ast: { sport: "nba", label: "Pts + ast", short: "P+A", monotonic: true, value: (l) => l.pts + l.ast },
  reb_ast: { sport: "nba", label: "Reb + ast", short: "R+A", monotonic: true, value: (l) => l.reb + l.ast },
  steals_blocks: { sport: "nba", label: "Steals + blocks", short: "STL+BLK", monotonic: true, value: (l) => l.stl + l.blk },
} as const satisfies Record<string, StatDef>;

export type StatKey = keyof typeof STATS;

export const STAT_KEYS = Object.keys(STATS) as [StatKey, ...StatKey[]];

export function isStatKey(value: string): value is StatKey {
  return value in STATS;
}

export const statsFor = (sport: Sport) => (Object.keys(STATS) as StatKey[]).filter((key) => STATS[key].sport === sport);

// The part of the game a leg covers. "each_quarter" means the line has to be beaten in every
// one of the four quarters on its own, as in "10+ rushing yards in each quarter".
export const PERIODS = {
  game: { label: "Full game", quarter: null },
  q1: { label: "1st quarter", quarter: 1 },
  q2: { label: "2nd quarter", quarter: 2 },
  q3: { label: "3rd quarter", quarter: 3 },
  q4: { label: "4th quarter", quarter: 4 },
  each_quarter: { label: "Each quarter", quarter: null },
} as const;

export type PeriodKey = keyof typeof PERIODS;

export const PERIOD_KEYS = Object.keys(PERIODS) as [PeriodKey, ...PeriodKey[]];

export function isPeriodKey(value: string): value is PeriodKey {
  return value in PERIODS;
}

export function addLines(lines: PlayerLine[]): PlayerLine {
  const total = { ...EMPTY_LINE };
  for (const line of lines) {
    for (const key of Object.keys(total) as (keyof PlayerLine)[]) total[key] += line[key];
  }
  return total;
}
