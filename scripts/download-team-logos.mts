// Downloads every NFL team's logo into public/team-logos, so the board serves them itself
// rather than loading them from ESPN on every visit. Re-run with `pnpm logos` after a rebrand.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { espnTeamLogoUrl, getTeams } from "../src/lib/espn";

const dir = path.join(import.meta.dirname, "..", "public", "team-logos");
await mkdir(dir, { recursive: true });

const teams = await getTeams();
await Promise.all(
  teams.map(async (team) => {
    const res = await fetch(espnTeamLogoUrl(team.abbr));
    if (!res.ok) throw new Error(`${team.abbr}: ESPN responded ${res.status}`);
    await writeFile(path.join(dir, `${team.abbr.toLowerCase()}.png`), Buffer.from(await res.arrayBuffer()));
  }),
);
console.log(`Saved ${teams.length} logos to ${path.relative(process.cwd(), dir)}`);
