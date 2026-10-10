"use client";

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

  const open = board?.parlays.filter((p) => p.status === "pending" || p.status === "live") ?? [];
  const settled = board?.parlays.filter((p) => p.status !== "pending" && p.status !== "live") ?? [];
  const problem = error ?? (board && board.problems.length > 0 ? board.problems.join(" ") : null);

  return (
    <SidebarProvider>
      <SidePanel board={board} open={open} settled={settled} />
      <SidebarInset>
        {/* On small screens the panel is a drawer, so it needs a way in now that there's no header. */}
        <SidebarTrigger className="fixed top-3 left-3 z-20 size-11 rounded-full bg-secondary/80 backdrop-blur-xl md:hidden" />

        {!board ? (
          <p className="py-32 text-center type-caption text-muted-foreground">
            {error ? `Couldn't load the board: ${error}` : "Loading the board…"}
          </p>
        ) : (
          <>
            <section className="px-5 pt-20 pb-20">
              <div className="mx-auto w-full max-w-[980px]">
                <header className="text-center">
                  <h1 className="font-heading type-display sm:type-hero">Your parlays.</h1>
                  <p className="mt-3 type-tagline text-muted-foreground sm:type-lead">
                    {board.parlays.length === 0
                      ? "Nothing on the board yet."
                      : `${open.length} open. ${settled.length} settled.`}
                  </p>
                </header>

                {problem && (
                  <p className="mx-auto mt-8 max-w-xl rounded-xl border border-destructive/30 bg-card px-6 py-4 type-caption text-destructive">
                    {problem}
                  </p>
                )}

                {board.parlays.length === 0 && (
                  <p className="mx-auto mt-8 max-w-md text-center text-muted-foreground">
                    Open Claude Code in this project and run{" "}
                    <code className="rounded-xs bg-track px-1.5 py-0.5 font-mono type-caption text-foreground">/parlay</code>.
                    Once you approve a slip it appears here and tracks itself.
                  </p>
                )}

                {open.length > 0 && <Grid parlays={open} onDelete={remove} className="mt-12" />}
              </div>
            </section>

            {settled.length > 0 && (
              // The settled band drops to true black; the colour change is the section divider.
              <section className="flex-1 bg-black px-5 py-20">
                <div className="mx-auto w-full max-w-[980px]">
                  <h2 className="text-center font-heading type-display">Settled.</h2>
                  <Grid parlays={settled} onDelete={remove} className="mt-12" />
                </div>
              </section>
            )}
          </>
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}

const DOT: Record<ParlayStatus, string> = {
  pending: "bg-muted-foreground/50",
  live: "animate-pulse-soft bg-primary",
  won: "bg-hit",
  lost: "bg-miss",
  push: "bg-muted-foreground",
};

function SidePanel({ board, open, settled }: { board: BoardData | null; open: BoardParlay[]; settled: BoardParlay[] }) {
  const { setOpenMobile } = useSidebar();

  const group = (label: string, parlays: BoardParlay[]) =>
    parlays.length > 0 && (
      <SidebarGroup>
        <SidebarGroupLabel>{label}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {parlays.map((parlay) => (
              <SidebarMenuItem key={parlay.id}>
                <SidebarMenuButton render={<a href={`#slip-${parlay.id}`} />} onClick={() => setOpenMobile(false)}>
                  <span className={cn("size-1.5 shrink-0 rounded-full", DOT[parlay.status])} />
                  <span className="truncate">{parlay.name}</span>
                </SidebarMenuButton>
                <SidebarMenuBadge className="text-muted-foreground">
                  {parlay.legs.filter((l) => l.status === "hit").length}/{parlay.legs.length}
                </SidebarMenuBadge>
              </SidebarMenuItem>
            ))}
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
        {group("Open", open)}
        {group("Settled", settled)}
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
      {parlays.map((parlay, i) => (
        <ParlayCard key={parlay.id} parlay={parlay} index={i} onDelete={() => onDelete(parlay)} />
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

function ParlayCard({ parlay, index, onDelete }: { parlay: BoardParlay; index: number; onDelete: () => void }) {
  const badge = PARLAY_BADGE[parlay.status];
  const hits = parlay.legs.filter((l) => l.status === "hit").length;

  return (
    <Card id={`slip-${parlay.id}`} className="animate-rise scroll-mt-6" style={{ animationDelay: `${index * 60}ms` }}>
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
