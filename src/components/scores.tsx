"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PanelHeader, SectionNav } from "@/components/section-nav";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useStoredFlag } from "@/hooks/use-stored-flag";
import type { ScoreGame, WeekScores } from "@/lib/espn";
import { cn } from "@/lib/utils";

const LIVE_POLL_MS = 15_000;
const IDLE_POLL_MS = 60_000;

type ScoresData = WeekScores & { fetchedAt: string };

type Sort = "kickoff" | "most" | "fewest";

const SORTS: Sort[] = ["kickoff", "most", "fewest"];

// Sorting by points only means something once a game has some, so games yet to kick off
// go to the bottom in kickoff order whichever way the points run.
function sortGames(games: ScoreGame[], sort: Sort): ScoreGame[] {
  const kickoff = (a: ScoreGame, b: ScoreGame) => Date.parse(a.date) - Date.parse(b.date);
  if (sort === "kickoff") return [...games].sort(kickoff);
  const sign = sort === "most" ? -1 : 1;
  return [...games].sort((a, b) => {
    const aPre = a.state === "pre";
    const bPre = b.state === "pre";
    if (aPre !== bPre) return aPre ? 1 : -1;
    if (aPre) return kickoff(a, b);
    return sign * (a.total - b.total) || kickoff(a, b);
  });
}

export function Scores() {
  const params = useSearchParams();
  const requestedWeek = params.get("week");
  const sort: Sort = SORTS.find((s) => s === params.get("sort")) ?? "most";

  const [data, setData] = useState<ScoresData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const query = requestedWeek ? `?week=${encodeURIComponent(requestedWeek)}` : "";
      const res = await fetch(`/api/scores${query}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      setData(body);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [requestedWeek]);

  const anyLive = data?.games.some((g) => g.state === "in") ?? false;
  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const timer = setInterval(refresh, anyLive ? LIVE_POLL_MS : IDLE_POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, anyLive]);

  // Shares the board's setting, so the panel stays open or closed when switching sections.
  const [panelOpen, setPanelOpen] = useStoredFlag("parlay-board:side-panel-open", true);

  // A week's data stays on screen until the next one arrives, so only trust it once it matches the URL.
  const shown = data && (!requestedWeek || String(data.week) === requestedWeek) ? data : null;
  const href = (week: number | null, nextSort: Sort) => {
    const query = new URLSearchParams();
    if (week !== null) query.set("week", String(week));
    if (nextSort !== "most") query.set("sort", nextSort);
    const text = query.toString();
    return text ? `/scores?${text}` : "/scores";
  };

  return (
    <SidebarProvider open={panelOpen} onOpenChange={setPanelOpen}>
      <WeekPanel data={data} activeWeek={data?.week ?? null} anyLive={anyLive} linkTo={(week) => href(week, sort)} />
      <SidebarInset>
        <section className="flex-1 px-5 py-20 xl:pt-14">
          <div className="mx-auto w-full max-w-[1320px]">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="size-11 shrink-0 rounded-full bg-secondary/80 text-muted-foreground" />
              <h1 className="min-w-0 font-heading type-display sm:type-hero">
                {data ? `Week ${data.week}.` : "Scores."}
              </h1>
            </div>

            {error && (
              <p className="mt-8 max-w-xl rounded-xl border border-destructive/30 bg-card px-6 py-4 type-caption text-destructive">
                {data ? error : `Couldn't load scores: ${error}`}
              </p>
            )}

            {!shown && !error && <p className="py-32 text-center type-caption text-muted-foreground">Loading scores…</p>}

            {shown && shown.games.length === 0 && (
              <p className="mt-10 text-muted-foreground">No games scheduled for week {shown.week}.</p>
            )}

            {shown && shown.games.length > 0 && (
              <GameTable
                games={sortGames(shown.games, sort)}
                sort={sort}
                sortHref={(next) => href(requestedWeek ? Number(requestedWeek) : null, next)}
              />
            )}

            {shown && shown.byes.length > 0 && (
              <p className="mt-8 type-caption text-muted-foreground">On bye: {shown.byes.join(", ")}</p>
            )}
          </div>
        </section>
      </SidebarInset>
    </SidebarProvider>
  );
}

function WeekPanel({
  data,
  activeWeek,
  anyLive,
  linkTo,
}: {
  data: ScoresData | null;
  activeWeek: number | null;
  anyLive: boolean;
  linkTo: (week: number) => string;
}) {
  const { setOpenMobile } = useSidebar();
  const weeks = Array.from({ length: data?.weeks ?? 0 }, (_, i) => i + 1);

  return (
    <Sidebar>
      <PanelHeader live={anyLive} fetchedAt={data?.fetchedAt ?? null} />
      <SidebarContent>
        <SectionNav />
        {weeks.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Weeks</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {weeks.map((week) => (
                  <SidebarMenuItem key={week}>
                    <SidebarMenuButton
                      isActive={week === activeWeek}
                      render={<Link href={linkTo(week)} />}
                      onClick={() => setOpenMobile(false)}
                    >
                      <span className="truncate">Week {week}</span>
                    </SidebarMenuButton>
                    {week === data?.currentWeek && <SidebarMenuBadge className="text-muted-foreground">Now</SidebarMenuBadge>}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}

function GameTable({ games, sort, sortHref }: { games: ScoreGame[]; sort: Sort; sortHref: (sort: Sort) => string }) {
  const cell = "px-3 py-2";
  // Clicking Total flips between most and fewest points; Kickoff goes back to schedule order.
  const totalNext: Sort = sort === "most" ? "fewest" : "most";
  const sortLink = (label: string, next: Sort, active: boolean, arrow: string) => (
    <Link href={sortHref(next)} replace scroll={false} className={cn("hover:text-foreground", active && "text-foreground")}>
      {label}
      {active && <span aria-hidden> {arrow}</span>}
    </Link>
  );

  return (
    <div className="mt-8 overflow-x-auto rounded-xl border">
      <table className="w-full type-caption tabular-nums">
        <thead className="border-b bg-card text-left text-muted-foreground">
          <tr>
            <th scope="col" className={cn(cell, "font-normal")} aria-sort={sort === "kickoff" ? "ascending" : undefined}>
              {sortLink("Kickoff", "kickoff", sort === "kickoff", "↑")}
            </th>
            <th scope="col" className={cn(cell, "font-normal")}>Away</th>
            <th scope="col" className={cn(cell, "font-normal")}>Home</th>
            <th scope="col" className={cn(cell, "text-right font-normal")}>Score</th>
            <th
              scope="col"
              className={cn(cell, "text-right font-normal")}
              aria-sort={sort === "most" ? "descending" : sort === "fewest" ? "ascending" : undefined}
            >
              {sortLink("Total", totalNext, sort !== "kickoff", sort === "most" ? "↓" : "↑")}
            </th>
            <th scope="col" className={cn(cell, "font-normal")}>Status</th>
          </tr>
        </thead>
        <tbody>
          {games.map((game) => {
            const started = game.state !== "pre";
            const final = game.state === "post";
            const winner = (team: ScoreGame["home"], other: ScoreGame["home"]) => final && team.score > other.score;
            return (
              <tr key={game.id} className="even:bg-card hover:bg-muted/40">
                <td className={cn(cell, "whitespace-nowrap text-muted-foreground")}>
                  {new Date(game.date).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}
                </td>
                <td className={cn(cell, winner(game.away, game.home) && "font-semibold")}>{game.away.abbr}</td>
                <td className={cn(cell, winner(game.home, game.away) && "font-semibold")}>{game.home.abbr}</td>
                <td className={cn(cell, "text-right whitespace-nowrap")}>
                  {started ? `${game.away.score}–${game.home.score}` : "–"}
                </td>
                <td className={cn(cell, "text-right font-semibold")}>{started ? game.total : "–"}</td>
                <td className={cn(cell, "whitespace-nowrap", game.state === "in" ? "text-primary" : "text-muted-foreground")}>
                  {started ? game.detail : "Scheduled"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
