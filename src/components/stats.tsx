"use client";

import { useCallback, useEffect, useState } from "react";
import { PanelHeader, SectionNav } from "@/components/section-nav";
import { Sidebar, SidebarContent, SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useStoredFlag } from "@/hooks/use-stored-flag";
import type { GameResult, SeasonStats, TeamSeason } from "@/lib/season";
import { cn } from "@/lib/utils";

// Season totals only move when a game goes final, so there's no need to poll fast.
const POLL_MS = 5 * 60_000;

type StatsData = SeasonStats & { fetchedAt: string };

type Column = {
  key: string;
  label: string;
  value: (team: TeamSeason) => number | string;
  format?: (team: TeamSeason) => string;
};

const perGame = (n: number, team: TeamSeason) => (team.games ? n / team.games : 0);
const oneDecimal = (n: number) => n.toFixed(1);
const signed = (n: number, digits = 0) => (n > 0 ? "+" : "") + n.toFixed(digits);

const COLUMNS: Column[] = [
  { key: "team", label: "Team", value: (t) => t.abbr },
  { key: "games", label: "GP", value: (t) => t.games },
  {
    key: "record",
    label: "W-L",
    value: (t) => perGame(t.wins + t.ties / 2, t),
    format: (t) => `${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ""}`,
  },
  { key: "pf", label: "PF", value: (t) => t.pointsFor },
  { key: "pa", label: "PA", value: (t) => t.pointsAgainst },
  { key: "diff", label: "Diff", value: (t) => t.pointsFor - t.pointsAgainst, format: (t) => signed(t.pointsFor - t.pointsAgainst) },
  { key: "pfg", label: "PF/G", value: (t) => perGame(t.pointsFor, t), format: (t) => oneDecimal(perGame(t.pointsFor, t)) },
  { key: "pag", label: "PA/G", value: (t) => perGame(t.pointsAgainst, t), format: (t) => oneDecimal(perGame(t.pointsAgainst, t)) },
  {
    key: "diffg",
    label: "Diff/G",
    value: (t) => perGame(t.pointsFor - t.pointsAgainst, t),
    format: (t) => signed(perGame(t.pointsFor - t.pointsAgainst, t), 1),
  },
  { key: "totalg", label: "Total/G", value: (t) => perGame(t.combined, t), format: (t) => oneDecimal(perGame(t.combined, t)) },
];

// Per game rather than season totals, since byes leave teams with different numbers of games.
const LEADERS: { label: string; column: string; most: boolean }[] = [
  { label: "Most points", column: "pfg", most: true },
  { label: "Fewest points", column: "pfg", most: false },
  { label: "Most allowed", column: "pag", most: true },
  { label: "Fewest allowed", column: "pag", most: false },
  { label: "Best differential", column: "diffg", most: true },
  { label: "Worst differential", column: "diffg", most: false },
  { label: "Highest-scoring games", column: "totalg", most: true },
  { label: "Lowest-scoring games", column: "totalg", most: false },
];

function sortTeams(teams: TeamSeason[], column: Column, descending: boolean): TeamSeason[] {
  return [...teams].sort((a, b) => {
    const x = column.value(a);
    const y = column.value(b);
    const order = typeof x === "string" ? x.localeCompare(String(y)) : x - (y as number);
    return (descending ? -order : order) || a.abbr.localeCompare(b.abbr);
  });
}

export function Stats() {
  const [data, setData] = useState<StatsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/stats", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      setData(body);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const timer = setInterval(refresh, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  // Shares the board's setting, so the panel stays open or closed when switching sections.
  const [panelOpen, setPanelOpen] = useStoredFlag("parlay-board:side-panel-open", true);

  return (
    <SidebarProvider open={panelOpen} onOpenChange={setPanelOpen}>
      <Sidebar>
        <PanelHeader live={false} fetchedAt={data?.fetchedAt ?? null} />
        <SidebarContent>
          <SectionNav />
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <section className="flex-1 px-5 py-20 xl:pt-14">
          <div className="mx-auto w-full max-w-[1320px]">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="size-11 shrink-0 rounded-full bg-secondary/80 text-muted-foreground" />
              <h1 className="min-w-0 font-heading type-display sm:type-hero">Season stats.</h1>
            </div>

            {data && (
              <p className="mt-3 type-caption text-muted-foreground">
                {data.games} final games through week {data.throughWeek}. Leaders are per game.
              </p>
            )}

            {error && (
              <p className="mt-8 max-w-xl rounded-xl border border-destructive/30 bg-card px-6 py-4 type-caption text-destructive">
                {data ? error : `Couldn't load stats: ${error}`}
              </p>
            )}

            {!data && !error && <p className="py-32 text-center type-caption text-muted-foreground">Loading stats…</p>}

            {data && data.teams.length > 0 && (
              <>
                <Leaders data={data} />
                <TeamTable teams={data.teams} />
              </>
            )}
          </div>
        </section>
      </SidebarInset>
    </SidebarProvider>
  );
}

function Leaders({ data }: { data: StatsData }) {
  const box = "rounded-xl border bg-card px-4 py-3";
  const heading = "mb-2 type-fine text-muted-foreground";

  return (
    <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {LEADERS.map((leader) => {
        const column = COLUMNS.find((c) => c.key === leader.column)!;
        const top = sortTeams(data.teams, column, leader.most).slice(0, 3);
        return (
          <section key={leader.label} className={box} aria-label={leader.label}>
            <h2 className={heading}>{leader.label}</h2>
            <ol className="grid gap-0.5 type-caption tabular-nums">
              {top.map((team, i) => (
                <li key={team.abbr} className={cn("flex justify-between gap-3", i > 0 && "text-muted-foreground")}>
                  <span className={cn(i === 0 && "font-semibold")}>{team.abbr}</span>
                  <span className={cn(i === 0 && "font-semibold")}>{column.format?.(team) ?? column.value(team)}</span>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
      <GameBox label="Highest-scoring game" game={data.highest} className={box} heading={heading} />
      <GameBox label="Lowest-scoring game" game={data.lowest} className={box} heading={heading} />
      <section className={box} aria-label="Average game total">
        <h2 className={heading}>Average game total</h2>
        <p className="type-caption tabular-nums">
          <span className="font-semibold">
            {oneDecimal(data.teams.reduce((sum, t) => sum + t.pointsFor, 0) / Math.max(1, data.games))}
          </span>{" "}
          <span className="text-muted-foreground">combined points per game</span>
        </p>
      </section>
    </div>
  );
}

function GameBox({ label, game, className, heading }: { label: string; game: GameResult | null; className: string; heading: string }) {
  return (
    <section className={className} aria-label={label}>
      <h2 className={heading}>{label}</h2>
      {game ? (
        <p className="grid gap-0.5 type-caption tabular-nums">
          <span className="flex justify-between gap-3 font-semibold">
            <span>{game.label}</span>
            <span>{game.total}</span>
          </span>
          <span className="text-muted-foreground">
            Week {game.week} · {game.score}
          </span>
        </p>
      ) : (
        <p className="type-caption text-muted-foreground">–</p>
      )}
    </section>
  );
}

function TeamTable({ teams }: { teams: TeamSeason[] }) {
  const [sortKey, setSortKey] = useState("pfg");
  const [descending, setDescending] = useState(true);
  const column = COLUMNS.find((c) => c.key === sortKey)!;
  const cell = "px-3 py-2";

  // Clicking a new column sorts it high to low (A to Z for the team); clicking it again flips it.
  function sortBy(key: string) {
    if (key === sortKey) return setDescending(!descending);
    setSortKey(key);
    setDescending(key !== "team");
  }

  return (
    <div className="mt-8 overflow-x-auto rounded-xl border">
      <table className="w-full type-caption tabular-nums">
        <thead className="border-b bg-card text-muted-foreground">
          <tr>
            {COLUMNS.map((c) => {
              const active = c.key === sortKey;
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={active ? (descending ? "descending" : "ascending") : undefined}
                  className={cn(cell, "font-normal whitespace-nowrap", c.key === "team" ? "text-left" : "text-right")}
                >
                  <button type="button" onClick={() => sortBy(c.key)} className={cn("cursor-pointer hover:text-foreground", active && "text-foreground")}>
                    {c.label}
                    {active && <span aria-hidden> {descending ? "↓" : "↑"}</span>}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortTeams(teams, column, descending).map((team) => (
            <tr key={team.abbr} className="even:bg-card hover:bg-muted/40">
              {COLUMNS.map((c) => (
                <td
                  key={c.key}
                  className={cn(cell, "whitespace-nowrap", c.key === "team" ? "text-left" : "text-right", c.key === sortKey && "font-semibold")}
                >
                  {c.key === "team" ? (
                    <>
                      {team.abbr} <span className="text-muted-foreground">{team.name}</span>
                    </>
                  ) : (
                    (c.format?.(team) ?? c.value(team))
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
