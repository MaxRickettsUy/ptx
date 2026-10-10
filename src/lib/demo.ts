// A simulated game that is always in progress, for trying the board when no real game is on.
// Any leg whose event id starts with "demo-" is graded against this instead of ESPN.
// The game replays on a one-hour loop of real time, so the numbers climb as you watch.

import type { GameStats } from "./espn";
import { EMPTY_LINE, type PlayerLine } from "./stats";

const DEMO_PREFIX = "demo-";
const LOOP_MINUTES = 60;
const QUARTER_MINUTES = LOOP_MINUTES / 4;
const ORDINALS = ["1st", "2nd", "3rd", "4th"];

export function isDemoEvent(eventId: string): boolean {
  return eventId.startsWith(DEMO_PREFIX);
}

// Full-game stat lines; each is scaled by how far through the loop the clock is.
const FULL_GAME: Record<string, { name: string; team: string; line: Partial<PlayerLine> }> = {
  "demo-qb": { name: "Demo Passer", team: "HME", line: { passYds: 290, passCmp: 26, passAtt: 38, passTd: 2, rushYds: 18, rushAtt: 4 } },
  "demo-rb": { name: "Demo Runner", team: "HME", line: { rushYds: 96, rushAtt: 21, rushTd: 1, rec: 3, recYds: 22 } },
  "demo-wr": { name: "Demo Receiver", team: "AWY", line: { rec: 8, recYds: 105, recTd: 1 } },
};

export function demoGameStats(eventId: string, now: Date): GameStats {
  const elapsed = now.getMinutes() + now.getSeconds() / 60;
  const progress = elapsed / LOOP_MINUTES;
  const quarter = Math.min(3, Math.floor(elapsed / QUARTER_MINUTES));
  const secondsLeft = Math.round((QUARTER_MINUTES - (elapsed % QUARTER_MINUTES)) * 60);
  const clock = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`;

  const players: GameStats["players"] = {};
  for (const [id, player] of Object.entries(FULL_GAME)) {
    const line = { ...EMPTY_LINE };
    for (const [key, value] of Object.entries(player.line)) {
      line[key as keyof PlayerLine] = Math.floor(value * progress);
    }
    players[id] = { name: player.name, team: player.team, line };
  }

  return {
    game: {
      id: eventId,
      label: "AWY @ HME",
      date: now.toISOString(),
      week: null,
      state: "in",
      detail: `${clock} - ${ORDINALS[quarter]}`,
      home: { id: "demo-home", abbr: "HME", score: Math.floor(24 * progress) },
      away: { id: "demo-away", abbr: "AWY", score: Math.floor(20 * progress) },
    },
    players,
  };
}
