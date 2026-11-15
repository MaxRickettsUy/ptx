"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PanelHeader, SectionNav } from "@/components/section-nav";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import type { League, Lineup, LineupPlayer, LineupSide, Lineups as LineupsData } from "@/lib/lineups";
import { cn } from "@/lib/utils";

const LIVE_POLL_MS = 15_000;
const IDLE_POLL_MS = 60_000;

const formatPoints = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 });

export function Lineups() {
  const [data, setData] = useState<LineupsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/lineups", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      setData(body);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const anyLive = data?.anyLive ?? false;
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
  // The league and page come from the URL, so a view can be bookmarked and the back button pages back.
  const params = useSearchParams();
  const league = data?.leagues.find((l) => l.id === params.get("league")) ?? null;
  const lineups = ordered(data, league);
  const page = Math.min(Math.max(1, Number.parseInt(params.get("page") ?? "", 10) || 1), Math.max(1, lineups.length));
  const shown = lineups[page - 1] ?? null;
  const pageHref = (n: number) => {
    const query = new URLSearchParams();
    if (league) query.set("league", league.id);
    if (n > 1) query.set("page", String(n));
    return query.size ? `/lineups?${query}` : "/lineups";
  };

  return (
    <SidebarProvider open={panelOpen} onOpenChange={setPanelOpen}>
      <Sidebar>
        <PanelHeader live={anyLive} fetchedAt={data?.fetchedAt ?? null} />
        <SidebarContent>
          <SectionNav />
          {data && data.leagues.length > 0 && <LeagueNav leagues={data.leagues} active={league} />}
        </SidebarContent>
      </Sidebar>
      {/* From tablet width up the page fits the window and only the player lists scroll; on a
          phone the stacked card would leave too little room, so the page scrolls as usual. */}
      <SidebarInset className="md:h-svh md:overflow-hidden">
        <section className="flex flex-1 flex-col px-5 py-20 md:min-h-0 md:pb-6 xl:pt-14">
          <div className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col md:min-h-0">
            <div className="flex shrink-0 items-center gap-3">
              <SidebarTrigger className="size-11 shrink-0 rounded-full bg-secondary/80 text-muted-foreground" />
              <h1 className="min-w-0 font-heading type-display sm:type-hero">{league ? `${league.name}.` : "Fantasy lineups."}</h1>
            </div>

            {league && (
              <p className="mt-3 shrink-0 type-caption text-muted-foreground">
                {league.teamName} · {league.scoringLabel} · <span className="tabular-nums">{formatRecord(league.record)}</span>
              </p>
            )}

            {error && (
              <p className="mt-8 max-w-xl shrink-0 rounded-xl border border-destructive/30 bg-card px-6 py-4 type-caption text-destructive">
                {data ? error : `Couldn't load lineups: ${error}`}
              </p>
            )}

            {data && data.problems.length > 0 && (
              <ul className="mt-8 grid max-w-xl shrink-0 gap-1 rounded-xl border border-destructive/30 bg-card px-6 py-4 type-caption text-destructive">
                {data.problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            )}

            {!data && !error && <p className="py-32 text-center type-caption text-muted-foreground">Loading lineups…</p>}

            {data && lineups.length === 0 && (
              <p className="py-32 text-center type-caption text-muted-foreground">
                {data.leagues.length === 0 ? "No leagues yet." : `No lineups saved${league ? ` for ${league.name}` : ""} yet.`} Run{" "}
                <code className="font-mono">/lineup</code> in Claude Code to add {data.leagues.length === 0 ? "one" : "this week’s"}.
              </p>
            )}

            {shown && (
              <>
                <Pager page={page} pages={lineups.length} href={pageHref} label={league ? "week" : "lineup"} />
                <MatchupCard key={shown.id} lineup={shown} showLeague={!league} />
              </>
            )}
          </div>
        </section>
      </SidebarInset>
    </SidebarProvider>
  );
}

// Newest week first; within a week, leagues in the order they were set up, matching the sidebar.
function ordered(data: LineupsData | null, league: League | null): Lineup[] {
  if (!data) return [];
  const rank = new Map(data.leagues.map((l, i) => [l.id, i]));
  return data.lineups
    .filter((l) => !league || l.leagueId === league.id)
    .toSorted((a, b) => b.season - a.season || b.week - a.week || (rank.get(a.leagueId) ?? 0) - (rank.get(b.leagueId) ?? 0));
}

function Pager({ page, pages, href, label }: { page: number; pages: number; href: (page: number) => string; label: string }) {
  if (pages < 2) return <div className="mt-8 shrink-0" />;
  const step = (to: number, children: React.ReactNode, ariaLabel: string) =>
    to < 1 || to > pages ? (
      <Button variant="secondary" size="icon" disabled aria-label={ariaLabel}>
        {children}
      </Button>
    ) : (
      <Button variant="secondary" size="icon" aria-label={ariaLabel} nativeButton={false} render={<Link href={href(to)} scroll={false} />}>
        {children}
      </Button>
    );

  return (
    <nav aria-label="Lineup pages" className="mt-8 mb-3 flex shrink-0 items-center justify-end gap-2">
      <span className="mr-1 type-fine text-muted-foreground tabular-nums">
        {label === "week" ? "Week" : "Lineup"} {page} of {pages}
      </span>
      {step(page - 1, <ChevronLeft />, label === "week" ? "Newer week" : "Previous lineup")}
      {step(page + 1, <ChevronRight />, label === "week" ? "Older week" : "Next lineup")}
    </nav>
  );
}

const formatRecord = ({ won, lost, tie }: League["record"]) => `${won}-${lost}${tie ? `-${tie}` : ""}`;

function LeagueNav({ leagues, active }: { leagues: League[]; active: League | null }) {
  const { setOpenMobile } = useSidebar();
  const items = [{ key: "all", href: "/lineups", label: "All leagues", league: null }, ...leagues.map((l) => ({ key: l.id, href: `/lineups?league=${l.id}`, label: l.name, league: l }))];
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Leagues</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.key}>
              <SidebarMenuButton isActive={item.league?.id === active?.id} render={<Link href={item.href} />} onClick={() => setOpenMobile(false)}>
                {item.league?.live && <span className="size-1.5 shrink-0 animate-pulse-soft rounded-full bg-primary" />}
                <span className="truncate">{item.label}</span>
              </SidebarMenuButton>
              {item.league && <SidebarMenuBadge className="tabular-nums">{formatRecord(item.league.record)}</SidebarMenuBadge>}
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

type Outcome = "pending" | "live" | "final" | "won" | "lost" | "tie";

function outcome(lineup: Lineup): Outcome {
  if (lineup.result) return lineup.result;
  if (lineup.final) return "final";
  if (lineup.live) return "live";
  const started = [lineup.mine, lineup.opponent].some((side) => side?.starters.some((p) => p.state === "post"));
  return started ? "live" : "pending";
}

const RESULT_BADGE: Record<Outcome, { label: string; variant: "default" | "secondary" | "outline"; className?: string }> = {
  pending: { label: "Not started", variant: "outline", className: "text-muted-foreground" },
  // Between Thursday and Sunday no game is on, but the week is under way.
  live: { label: "In progress", variant: "default" },
  final: { label: "Final", variant: "secondary", className: "text-muted-foreground" },
  won: { label: "Won", variant: "default", className: "bg-hit text-white dark:text-black" },
  lost: { label: "Lost", variant: "secondary", className: "text-muted-foreground" },
  tie: { label: "Tie", variant: "secondary", className: "text-muted-foreground" },
};

function MatchupCard({ lineup, showLeague }: { lineup: Lineup; showLeague: boolean }) {
  const state = outcome(lineup);
  const badge = RESULT_BADGE[state];
  const sides = [lineup.mine, lineup.opponent].filter((side) => side !== null);
  const leading = lineup.opponent && lineup.mine.points !== lineup.opponent.points
    ? lineup.mine.points > lineup.opponent.points
      ? lineup.mine
      : lineup.opponent
    : null;

  return (
    <article id={lineup.id} className="flex flex-col rounded-xl border bg-card md:min-h-0 md:flex-1">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
        <p className="type-fine text-muted-foreground">
          <span className="font-semibold text-foreground">Week {lineup.week}</span>
          {" · "}
          {showLeague ? `${lineup.leagueName} · ${lineup.scoringLabel}` : lineup.scoringLabel}
        </p>
        <Badge variant={badge.variant} className={badge.className}>
          {lineup.live && <span className="size-1.5 animate-pulse-soft rounded-full bg-current" />}
          {lineup.live ? "Live" : badge.label}
        </Badge>
      </header>

      <div className={cn("grid divide-y md:min-h-0 md:flex-1 md:grid-rows-[minmax(0,1fr)] md:divide-y-0 md:divide-x", sides.length > 1 && "md:grid-cols-2")}>
        {sides.map((side, i) => (
          <SideColumn key={i} side={side} leading={side === leading} live={lineup.live} />
        ))}
      </div>

      {lineup.notes && <p className="shrink-0 border-t px-5 py-3 type-fine text-muted-foreground">{lineup.notes}</p>}
    </article>
  );
}

function SideColumn({ side, leading, live }: { side: LineupSide; leading: boolean; live: boolean }) {
  return (
    <div className="flex min-w-0 flex-col md:min-h-0">
      <div className="flex shrink-0 items-end justify-between gap-3 border-b px-5 py-4">
        <div className="min-w-0">
          <h3 className="truncate type-caption font-semibold">{side.name}</h3>
          <p className="type-fine text-muted-foreground">
            {side.yetToFinish === 0 ? "All done" : `${side.yetToFinish} still to finish`}
          </p>
        </div>
        <p
          className={cn(
            "shrink-0 font-heading type-display font-semibold tabular-nums",
            leading ? (live ? "text-primary" : "text-hit") : "text-foreground",
          )}
        >
          {formatPoints(side.points)}
        </p>
      </div>

      {/* The team's name and score stay put while the players scroll underneath. */}
      <div className="px-5 pb-4 md:min-h-0 md:flex-1 md:overflow-y-auto md:overscroll-contain">
        <ol className="divide-y">
          {side.starters.map((player) => (
            <PlayerRow key={player.id} player={player} />
          ))}
        </ol>

        {side.bench.length > 0 && (
          <>
            <p className="mt-4 mb-1 type-fine text-muted-foreground">
              Bench <span className="tabular-nums">· {formatPoints(side.bench.reduce((sum, p) => sum + p.points, 0))}</span>
            </p>
            <ol className="divide-y opacity-60">
              {side.bench.map((player) => (
                <PlayerRow key={player.id} player={player} />
              ))}
            </ol>
          </>
        )}
      </div>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function gameLine(player: LineupPlayer): string {
  if (player.state === "bye" || !player.game) return "Bye";
  if (player.state === "pre") {
    const kickoff = Date.parse(player.game.date);
    return Number.isFinite(kickoff)
      ? `${player.game.label} · ${new Date(kickoff).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}`
      : player.game.label;
  }
  return [player.game.score ?? player.game.label, player.game.detail].join(" · ");
}

function PlayerRow({ player }: { player: LineupPlayer }) {
  const started = player.state === "in" || player.state === "post";
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className="w-9 shrink-0 type-fine font-semibold text-muted-foreground">{player.slotLabel}</span>
      {/* A defense shows its team's logo; a player falls back to initials when ESPN has no photo. */}
      <Avatar size="sm" className="bg-muted">
        <AvatarImage src={player.headshot ?? player.teamLogo} alt="" className={cn(!player.headshot && "object-contain p-0.5")} />
        <AvatarFallback className="font-semibold">{initials(player.name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate type-caption font-semibold">
          {player.name}{" "}
          <span className="font-normal text-muted-foreground">{[player.position === "DST" ? null : player.position, player.team].filter(Boolean).join(" · ")}</span>
        </p>
        <p className="truncate type-fine text-muted-foreground">
          {player.summary && started ? `${player.summary} · ` : ""}
          {gameLine(player)}
        </p>
      </div>
      <p
        className={cn(
          "shrink-0 font-heading type-tagline font-semibold tabular-nums",
          player.state === "in" ? "text-primary" : started ? "text-foreground" : "text-muted-foreground/50",
        )}
      >
        {started ? formatPoints(player.points) : "–"}
      </p>
    </li>
  );
}
