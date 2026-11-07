// Downloads every NFL and NBA team's logo into public/team-logos/<sport>, so the board serves them
// itself rather than loading them from ESPN on every visit. Re-run with `pnpm logos` after a rebrand.
// Each sport gets its own folder because the leagues share abbreviations (DAL, LAC, IND, ...).

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { espnTeamLogoUrl, getTeams } from "../src/lib/espn";
import { SPORTS } from "../src/lib/stats";

for (const sport of SPORTS) {
  const dir = path.join(import.meta.dirname, "..", "public", "team-logos", sport);
  await mkdir(dir, { recursive: true });

  const teams = await getTeams(sport);
  await Promise.all(
    teams.map(async (team) => {
      const res = await fetch(espnTeamLogoUrl(team.abbr, sport));
      if (!res.ok) throw new Error(`${sport} ${team.abbr}: ESPN responded ${res.status}`);
      await writeFile(path.join(dir, `${team.abbr.toLowerCase()}.png`), Buffer.from(await res.arrayBuffer()));
    }),
  );
  console.log(`Saved ${teams.length} ${sport.toUpperCase()} logos to ${path.relative(process.cwd(), dir)}`);
}
