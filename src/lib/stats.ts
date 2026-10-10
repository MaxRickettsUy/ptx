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
};

type StatDef = {
  label: string;
  short: string;
  // Yardage can go backwards on a loss, so crossing the line mid-game isn't final.
  monotonic: boolean;
  value: (line: PlayerLine) => number;
};

export const STATS = {
  passing_yards: { label: "Passing yards", short: "PASS YDS", monotonic: false, value: (l) => l.passYds },
  passing_tds: { label: "Passing TDs", short: "PASS TD", monotonic: true, value: (l) => l.passTd },
  pass_completions: { label: "Completions", short: "CMP", monotonic: true, value: (l) => l.passCmp },
  pass_attempts: { label: "Pass attempts", short: "ATT", monotonic: true, value: (l) => l.passAtt },
  interceptions: { label: "Interceptions thrown", short: "INT", monotonic: true, value: (l) => l.passInt },
  rushing_yards: { label: "Rushing yards", short: "RUSH YDS", monotonic: false, value: (l) => l.rushYds },
  rushing_attempts: { label: "Rush attempts", short: "CAR", monotonic: true, value: (l) => l.rushAtt },
  receiving_yards: { label: "Receiving yards", short: "REC YDS", monotonic: false, value: (l) => l.recYds },
  receptions: { label: "Receptions", short: "REC", monotonic: true, value: (l) => l.rec },
  rush_rec_yards: { label: "Rush + rec yards", short: "RUSH+REC", monotonic: false, value: (l) => l.rushYds + l.recYds },
  pass_rush_yards: { label: "Pass + rush yards", short: "PASS+RUSH", monotonic: false, value: (l) => l.passYds + l.rushYds },
  touchdowns: { label: "Rush + rec TDs", short: "TD", monotonic: true, value: (l) => l.rushTd + l.recTd },
  field_goals_made: { label: "Field goals made", short: "FG", monotonic: true, value: (l) => l.fgMade },
  kicking_points: { label: "Kicking points", short: "KICK PTS", monotonic: true, value: (l) => l.kickPts },
} as const satisfies Record<string, StatDef>;

export type StatKey = keyof typeof STATS;

export const STAT_KEYS = Object.keys(STATS) as [StatKey, ...StatKey[]];

export function isStatKey(value: string): value is StatKey {
  return value in STATS;
}

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
