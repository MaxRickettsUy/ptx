"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import type { Board as BoardData, BoardLeg, BoardParlay } from "@/lib/board";
import { groupByDay, type DayGroup } from "@/lib/days";
import type { LegStatus, ParlayStatus } from "@/lib/grade";
import { cn } from "@/lib/utils";

const LIVE_POLL_MS = 15_000;
const IDLE_POLL_MS = 60_000;

export function Board() {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/board", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      setBoard(data);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const anyLive = board?.anyLive ?? false;
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

  async function remove(parlay: BoardParlay) {
    const res = await fetch(`/api/parlays/${parlay.id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Couldn't delete that slip.");
      return;
    }
    refresh();
  }

  const problem = error ?? (board && board.problems.length > 0 ? board.problems.join(" ") : null);
  const days = board ? groupByDay(board.parlays, new Date(board.fetchedAt)) : [];

  // Each day is its own page at /?day=YYYY-MM-DD. With no day chosen, land on the most
  // relevant one: today, else the next upcoming day, else the latest past day.
  const requested = useSearchParams().get("day");
  const day = days.find((d) => d.key === requested) ?? (requested ? null : days[0]) ?? null;
  const open = day?.parlays.filter((p) => p.status === "pending" || p.status === "live").length ?? 0;

  return (
    <SidebarProvider>
      <SidePanel board={board} days={days} activeKey={day?.key ?? null} />
      <SidebarInset>
        {/* On small screens the panel is a drawer, so it needs a way in now that there's no header. */}
        <SidebarTrigger className="fixed top-3 left-3 z-20 size-11 rounded-full bg-secondary/80 backdrop-blur-xl md:hidden" />

        {!board ? (
          <p className="py-32 text-center type-caption text-muted-foreground">
            {error ? `Couldn't load the board: ${error}` : "Loading the board…"}
          </p>
        ) : (
          <section className="flex-1 px-5 py-20">
            <div className="mx-auto w-full max-w-[980px]">
              <header className="text-center">
                <h1 className="font-heading type-display sm:type-hero">{day ? `${day.label}.` : "Your parlays."}</h1>
                <p className="mt-3 type-tagline text-muted-foreground sm:type-lead">
                  {day
                    ? `${open} open. ${day.parlays.length - open} settled.`
                    : days.length === 0
                      ? "Nothing on the board yet."
                      : "No slips on that day."}
                </p>
              </header>

              {problem && (
                <p className="mx-auto mt-8 max-w-xl rounded-xl border border-destructive/30 bg-card px-6 py-4 type-caption text-destructive">
                  {problem}
                </p>
              )}

              {days.length === 0 && (
                <p className="mx-auto mt-8 max-w-md text-center text-muted-foreground">
                  Open Claude Code in this project and run{" "}
                  <code className="rounded-xs bg-track px-1.5 py-0.5 font-mono type-caption text-foreground">/parlay</code>.
                  Once you approve a slip it appears here and tracks itself.
                </p>
              )}

              {!day && days.length > 0 && (
                <p className="mt-8 text-center">
                  <Button variant="link" nativeButton={false} render={<Link href="/" />}>
                    Show {days[0].label}
                  </Button>
                </p>
              )}

              {day && <Grid parlays={day.parlays} onDelete={remove} className="mt-12" />}
            </div>
          </section>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}

function SidePanel({ board, days, activeKey }: { board: BoardData | null; days: DayGroup[]; activeKey: string | null }) {
  const { setOpenMobile } = useSidebar();

  const group = (label: string, list: DayGroup[]) =>
    list.length > 0 && (
      <SidebarGroup>
        <SidebarGroupLabel>{label}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {list.map((day) => {
              const live = day.parlays.some((p) => p.status === "live");
              return (
                <SidebarMenuItem key={day.key}>
                  <SidebarMenuButton
                    isActive={day.key === activeKey}
                    render={<Link href={`/?day=${day.key}`} />}
                    onClick={() => setOpenMobile(false)}
                  >
                    <span className={cn("size-1.5 shrink-0 rounded-full", live ? "animate-pulse-soft bg-primary" : "bg-transparent")} />
                    <span className="truncate">{day.label}</span>
                  </SidebarMenuButton>
                  <SidebarMenuBadge className="text-muted-foreground">{day.parlays.length}</SidebarMenuBadge>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );

  return (
    <Sidebar>
      {/* Safari on the Mac lays a translucent strip of its toolbar over the top ~40px of the page,
          so on desktop the panel's content starts below that, level with the main column's padding. */}
      <SidebarHeader className="gap-1 px-4 pt-5 pb-3 md:pt-14">
        <p className="font-heading type-tagline font-semibold">Parlay Board</p>
        <p className="flex items-center gap-2 type-fine text-muted-foreground">
          {board?.anyLive && (
            <span className="flex items-center gap-1.5 text-primary">
              <span className="size-1.5 animate-pulse-soft rounded-full bg-primary" />
              Live
            </span>
          )}
          {board
            ? `Updated ${new Date(board.fetchedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
            : "Loading…"}
        </p>
      </SidebarHeader>
      <SidebarContent>
        {group("Upcoming", days.filter((d) => !d.past))}
        {group("Earlier", days.filter((d) => d.past))}
      </SidebarContent>
      <SidebarFooter className="px-4 pb-5 type-fine text-muted-foreground">
        <p>
          Build with <code className="font-mono text-foreground">/parlay</code> in Claude Code
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}

function Grid({ parlays, onDelete, className }: { parlays: BoardParlay[]; onDelete: (p: BoardParlay) => void; className?: string }) {
  return (
    <div className={cn("grid items-start gap-6 md:grid-cols-2", parlays.length === 1 && "md:mx-auto md:max-w-[478px] md:grid-cols-1", className)}>
      {parlays.map((parlay) => (
        <ParlayCard key={parlay.id} parlay={parlay} onDelete={() => onDelete(parlay)} />
      ))}
    </div>
  );
}

const PARLAY_BADGE: Record<ParlayStatus, { label: string; variant: "default" | "secondary" | "outline"; className?: string }> = {
  pending: { label: "Not started", variant: "outline", className: "text-muted-foreground" },
  live: { label: "Live", variant: "default" },
  won: { label: "Won", variant: "default", className: "bg-hit text-white dark:text-black" },
  lost: { label: "Lost", variant: "secondary", className: "text-muted-foreground" },
  push: { label: "Push", variant: "secondary", className: "text-muted-foreground" },
};

function ParlayCard({ parlay, onDelete }: { parlay: BoardParlay; onDelete: () => void }) {
  const badge = PARLAY_BADGE[parlay.status];
  const hits = parlay.legs.filter((l) => l.status === "hit").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{parlay.name}</CardTitle>
        {parlay.notes && <CardDescription>{parlay.notes}</CardDescription>}
        <CardAction>
          <Badge variant={badge.variant} className={badge.className}>
            {parlay.status === "live" && <span className="size-1.5 animate-pulse-soft rounded-full bg-current" />}
            {badge.label}
          </Badge>
        </CardAction>
      </CardHeader>

      <CardContent>
        <ul className="divide-y">
          {parlay.legs.map((leg) => (
            <LegRow key={leg.id} leg={leg} />
          ))}
        </ul>
      </CardContent>

      <CardFooter className="justify-between type-fine text-muted-foreground">
        <span>
          {hits} of {parlay.legs.length} legs hit · Added{" "}
          {new Date(parlay.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}
        </span>
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="link" size="sm" className="h-auto px-0 type-fine" />}>Delete</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete “{parlay.name}”?</AlertDialogTitle>
              <AlertDialogDescription>The slip and its legs are removed from the board. This can’t be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel size="sm">Cancel</AlertDialogCancel>
              <AlertDialogAction size="sm" onClick={onDelete}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardFooter>
    </Card>
  );
}

const LEG_TONE: Record<LegStatus, { text: string; fill: string; label: string }> = {
  pending: { text: "text-muted-foreground", fill: "bg-muted-foreground", label: "Pending" },
  live: { text: "text-primary", fill: "bg-primary", label: "Live" },
  hit: { text: "text-hit", fill: "bg-hit", label: "Hit" },
  lost: { text: "text-miss", fill: "bg-miss", label: "Missed" },
  push: { text: "text-muted-foreground", fill: "bg-muted-foreground", label: "Push" },
};

// "Rush + rec TDs" should keep its capitals mid-sentence, so only the first letter drops.
function lowerFirst(label: string): string {
  return label.charAt(0).toLowerCase() + label.slice(1);
}

// The line sits three-quarters of the way along the bar, leaving room to show a leg running past it.
const MARKER_AT = 75;

function LegRow({ leg }: { leg: BoardLeg }) {
  const tone = LEG_TONE[leg.status];
  const started = leg.game.state !== "pre";
  const fill = started ? Math.max(0, Math.min(100, (leg.value / (leg.line || 1)) * MARKER_AT)) : 0;
  const past = leg.value > leg.line;
  // An over that's past the line reads as good and an under past it reads as bad, even before the final whistle.
  const liveFill = past ? (leg.direction === "over" ? "bg-hit" : "bg-miss") : tone.fill;

  return (
    <li className="py-5 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate font-semibold leading-[1.24]">{leg.playerName}</p>
          <p className="mt-1 type-caption text-muted-foreground">
            <span className="capitalize">{leg.direction}</span> {leg.line} {lowerFirst(leg.statLabel)}
            <span className="mx-1.5">·</span>
            {[leg.position, leg.team].filter(Boolean).join(", ")}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className={cn("font-heading type-display tabular-nums", started ? "text-foreground" : "text-muted-foreground/50")}>
            {started ? leg.value : "–"}
          </p>
          <p className={cn("type-fine font-semibold", tone.text)}>{tone.label}</p>
        </div>
      </div>

      <div className="relative mt-3">
        <Progress
          value={fill}
          aria-label={`${leg.value} of ${leg.line} ${lowerFirst(leg.statLabel)}`}
          indicatorClassName={leg.status === "live" ? liveFill : tone.fill}
        />
        <span className="absolute -top-1 h-3.5 w-0.5 rounded-full bg-foreground" style={{ left: `${MARKER_AT}%` }} />
      </div>

      <p className="mt-2.5 flex justify-between type-fine text-muted-foreground">
        <span>{leg.game.score ?? leg.game.label}</span>
        <span>
          {leg.game.state === "pre"
            ? new Date(leg.game.date).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })
            : leg.game.detail}
        </span>
      </p>
    </li>
  );
}
