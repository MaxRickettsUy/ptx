"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PanelHeader, SectionNav } from "@/components/section-nav";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
  // Which league to show comes from the URL, so a league's view can be bookmarked; none means all of them.
  const leagueParam = useSearchParams().get("league");
  const league = data?.leagues.find((l) => l.id === leagueParam) ?? null;
  const weeks = byWeek((data?.lineups ?? []).filter((l) => !league || l.leagueId === league.id));

  return (
    <SidebarProvider open={panelOpen} onOpenChange={setPanelOpen}>
      <Sidebar>
        <PanelHeader live={anyLive} fetchedAt={data?.fetchedAt ?? null} />
        <SidebarContent>
          <SectionNav />
          {data && data.leagues.length > 0 && <LeagueNav leagues={data.leagues} active={league} />}
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <section className="flex-1 px-5 py-20 xl:pt-14">
          <div className="mx-auto w-full max-w-[1100px]">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="size-11 shrink-0 rounded-full bg-secondary/80 text-muted-foreground" />
              <h1 className="min-w-0 font-heading type-display sm:type-hero">{league ? `${league.name}.` : "Fantasy lineups."}</h1>
            </div>

            {league && (
              <p className="mt-3 type-caption text-muted-foreground">
                {league.teamName} · {league.scoringLabel} · <span className="tabular-nums">{formatRecord(league.record)}</span>
              </p>
            )}

            {error && (
              <p className="mt-8 max-w-xl rounded-xl border border-destructive/30 bg-card px-6 py-4 type-caption text-destructive">
                {data ? error : `Couldn't load lineups: ${error}`}
              </p>
            )}

            {data && data.problems.length > 0 && (
              <ul className="mt-8 grid max-w-xl gap-1 rounded-xl border border-destructive/30 bg-card px-6 py-4 type-caption text-destructive">
                {data.problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            )}

            {!data && !error && <p className="py-32 text-center type-caption text-muted-foreground">Loading lineups…</p>}

            {data && weeks.length === 0 && (
              <p className="py-32 text-center type-caption text-muted-foreground">
                {data.leagues.length === 0 ? "No leagues yet." : `No lineups saved${league ? ` for ${league.name}` : ""} yet.`} Run{" "}
                <code className="font-mono">/lineup</code> in Claude Code to add {data.leagues.length === 0 ? "one" : "this week’s"}.
              </p>
            )}

            {weeks.map((week) => (
              <section key={week.key} className="mt-10" aria-label={week.label}>
                <h2 className="mb-3 type-caption font-semibold text-muted-foreground">{week.label}</h2>
                <div className="grid gap-4">
                  {week.lineups.map((lineup) => (
                    <MatchupCard key={lineup.id} lineup={lineup} showLeague={!league} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>
      </SidebarInset>
    </SidebarProvider>
  );
}

// The API returns lineups newest week first, so grouping keeps that order.
function byWeek(lineups: Lineup[]): { key: string; label: string; lineups: Lineup[] }[] {
  const weeks = new Map<string, { key: string; label: string; lineups: Lineup[] }>();
  for (const lineup of lineups) {
    const key = `${lineup.season}-${lineup.week}`;
    const week = weeks.get(key) ?? { key, label: `Week ${lineup.week}, ${lineup.season}`, lineups: [] };
    week.lineups.push(lineup);
    weeks.set(key, week);
  }
  return [...weeks.values()];
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
    <article id={lineup.id} className="scroll-mt-6 rounded-xl border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
        <p className="type-fine text-muted-foreground">{showLeague ? `${lineup.leagueName} · ${lineup.scoringLabel}` : lineup.scoringLabel}</p>
        <Badge variant={badge.variant} className={badge.className}>
          {lineup.live && <span className="size-1.5 animate-pulse-soft rounded-full bg-current" />}
          {lineup.live ? "Live" : badge.label}
        </Badge>
      </header>

      <div className={cn("grid divide-y md:divide-y-0 md:divide-x", sides.length > 1 && "md:grid-cols-2")}>
        {sides.map((side, i) => (
          <SideColumn key={i} side={side} leading={side === leading} live={lineup.live} />
        ))}
      </div>

      {lineup.notes && <p className="border-t px-5 py-3 type-fine text-muted-foreground">{lineup.notes}</p>}
    </article>
  );
}

function SideColumn({ side, leading, live }: { side: LineupSide; leading: boolean; live: boolean }) {
  return (
    <div className="min-w-0 px-5 py-4">
      <div className="flex items-end justify-between gap-3">
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

      <ol className="mt-4 divide-y">
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
