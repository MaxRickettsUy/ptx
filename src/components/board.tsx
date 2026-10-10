"use client";

import { ChevronDown, Circle, CircleCheck, CircleX } from "lucide-react";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
import { useCollapsed } from "@/hooks/use-collapsed";
import { groupByDay, type DayGroup } from "@/lib/days";
import type { LegStatus, ParlayStatus } from "@/lib/grade";
import { LABELS, type SlipLabels } from "@/lib/labels";
import { formatMoney, formatPrice, impliedPayout, parsePrice } from "@/lib/odds";
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

  async function markLost(parlay: BoardParlay, markedLost: boolean) {
    const res = await fetch(`/api/parlays/${parlay.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markedLost }),
    });
    if (!res.ok) {
      setError("Couldn't update that slip.");
      return;
    }
    refresh();
  }

  async function setStake(parlay: BoardParlay, stake: Stake) {
    const res = await fetch(`/api/parlays/${parlay.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(stake),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error ?? "Couldn't save the wager.");
      return;
    }
    refresh();
  }

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

  return (
    <SidebarProvider>
      <SidePanel board={board} days={days} activeKey={day?.key ?? null} />
      {/* Once the lanes sit side by side the page itself stops scrolling and each lane scrolls instead.
          Below that width they stack, where one page scroll is the only thing that makes sense. */}
      <SidebarInset className="xl:h-svh xl:overflow-hidden">
        {/* On small screens the panel is a drawer, so it needs a way in now that there's no header. */}
        <SidebarTrigger className="fixed top-3 left-3 z-20 size-11 rounded-full bg-secondary/80 backdrop-blur-xl md:hidden" />

        {!board ? (
          <p className="py-32 text-center type-caption text-muted-foreground">
            {error ? `Couldn't load the board: ${error}` : "Loading the board…"}
          </p>
        ) : (
          <section className="flex-1 px-5 py-20 xl:min-h-0 xl:pt-14 xl:pb-5">
            <div className="mx-auto w-full max-w-[1320px] xl:flex xl:h-full xl:flex-col">
              <h1 className="font-heading type-display sm:type-hero">{day ? `${day.label}.` : "Your parlays."}</h1>

              {problem && (
                <p className="mt-8 max-w-xl rounded-xl border border-destructive/30 bg-card px-6 py-4 type-caption text-destructive">
                  {problem}
                </p>
              )}

              {days.length === 0 && (
                <p className="mt-6 max-w-md text-muted-foreground">
                  Nothing on the board yet. Open Claude Code in this project and run{" "}
                  <code className="rounded-xs bg-track px-1.5 py-0.5 font-mono type-caption text-foreground">/parlay</code>.
                  Once you approve a slip it appears here and tracks itself.
                </p>
              )}

              {!day && days.length > 0 && (
                <p className="mt-6 text-muted-foreground">
                  No slips on that day.{" "}
                  <Button variant="link" nativeButton={false} render={<Link href="/" />}>
                    Show {days[0].label}
                  </Button>
                </p>
              )}

              {day && <Lanes parlays={day.parlays} onDelete={remove} onMarkLost={markLost} onSetStake={setStake} />}
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

const LANES: { title: string; empty: string; statuses: ParlayStatus[]; className?: string }[] = [
  { title: "Pending", empty: "Nothing waiting to start.", statuses: ["pending"] },
  // Stacked on a phone, the live lane goes first since it's the one being watched.
  { title: "In progress", empty: "Nothing in play right now.", statuses: ["live"], className: "order-first xl:order-none" },
  { title: "Settled", empty: "Nothing settled yet.", statuses: ["won", "lost", "push"] },
];

type Stake = { wager: number | null; odds: number | null; multiplier: number | null; payout: number | null; labels: SlipLabels };

type SlipActions = {
  onDelete: (parlay: BoardParlay) => void;
  onMarkLost: (parlay: BoardParlay, markedLost: boolean) => void;
  onSetStake: (parlay: BoardParlay, stake: Stake) => void;
};

function Lanes({ parlays, onDelete, onMarkLost, onSetStake }: { parlays: BoardParlay[] } & SlipActions) {
  return (
    <div className="mt-12 grid items-start gap-5 xl:mt-10 xl:min-h-0 xl:flex-1 xl:grid-cols-3 xl:grid-rows-[minmax(0,1fr)]">
      {LANES.map((lane) => {
        const slips = parlays.filter((p) => lane.statuses.includes(p.status));
        return (
          <section key={lane.title} className={cn("rounded-xl bg-black/30 p-3 xl:flex xl:h-full xl:flex-col", lane.className)} aria-label={lane.title}>
            <h2 className="flex shrink-0 items-baseline justify-between px-3 pt-2 pb-4 font-heading type-tagline font-semibold">
              {lane.title}
              <span className="type-caption font-normal text-muted-foreground tabular-nums">{slips.length}</span>
            </h2>
            {slips.length === 0 ? (
              <p className="rounded-xl border border-dashed px-6 py-10 text-center type-caption text-muted-foreground">
                {lane.empty}
              </p>
            ) : (
              <div data-slot="lane-body" className="grid gap-3 lg:grid-cols-2 xl:flex xl:min-h-0 xl:flex-col xl:overflow-y-auto xl:overscroll-contain">
                {slips.map((parlay) => (
                  <ParlayCard key={parlay.id} parlay={parlay} onDelete={onDelete} onMarkLost={onMarkLost} onSetStake={onSetStake} />
                ))}
              </div>
            )}
          </section>
        );
      })}
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

const STATUS_DOT: Record<ParlayStatus, string> = {
  pending: "bg-muted-foreground/50",
  live: "animate-pulse-soft bg-primary",
  won: "bg-hit",
  lost: "bg-miss",
  push: "bg-muted-foreground",
};

function ParlayCard({ parlay, onDelete, onMarkLost, onSetStake }: { parlay: BoardParlay } & SlipActions) {
  const badge = PARLAY_BADGE[parlay.status];
  const hits = parlay.legs.filter((l) => l.status === "hit").length;
  const [collapsed, toggleCollapsed] = useCollapsed(parlay.id);
  const statusLabel = parlay.markedLost ? "Marked lost" : badge.label;
  const [noteOpen, setNoteOpen] = useState(false);
  const [stakeOpen, setStakeOpen] = useState(false);

  return (
    // In a lane, a slip shrinks to fit the space and scrolls its own legs, so the scrollbar stays
    // between the header and footer. One-leg and collapsed slips never shrink; there is nothing to scroll.
    <Card
      className={cn(
        "@container/slip gap-0 rounded-none border-0 pt-0",
        collapsed ? "pb-0 xl:shrink-0" : parlay.legs.length <= 1 ? "xl:shrink-0" : "xl:min-h-80",
      )}
    >
      {/* The whole header toggles the slip; the chevron is the control keyboards and screen readers use.
          Collapsed, it becomes two tight lines: the name, then status and tally as plain text, so a
          narrow card isn't sharing one row between a title, a tally, a badge and a button. */}
      <CardHeader
        onClick={toggleCollapsed}
        className={cn(
          "shrink-0 cursor-pointer rounded-none has-data-[slot=card-action]:grid-cols-[minmax(0,1fr)_auto]",
          collapsed ? "gap-0.5 py-4" : "border-b pt-(--card-spacing)",
        )}
      >
        <CardTitle className={cn(collapsed && "truncate type-body font-semibold")}>{parlay.name}</CardTitle>
        {collapsed ? (
          <CardDescription className="flex items-center gap-1.5 truncate">
            <span className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[parlay.status])} />
            {statusLabel} · {hits} of {parlay.legs.length} legs hit
            <LabelMarks labels={parlay.labels} className="ml-1" />
          </CardDescription>
        ) : (
          // The badge and note get the card's full width on their own rows, so the name only
          // shares its row with the chevron and neither has to wrap around the other.
          <div className="col-span-2 mt-1.5 flex flex-col items-start gap-2">
            <div className="flex items-center gap-2.5">
              <Badge variant={badge.variant} className={badge.className}>
                {parlay.status === "live" && <span className="size-1.5 animate-pulse-soft rounded-full bg-current" />}
                {statusLabel}
              </Badge>
              {/* Who built the slip and whether it was really placed; clicking opens the editor. */}
              {Object.values(parlay.labels).some(Boolean) && (
                <button
                  type="button"
                  aria-label={`Edit labels for ${parlay.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setStakeOpen(true);
                  }}
                  className="cursor-pointer leading-none"
                >
                  <LabelMarks labels={parlay.labels} />
                </button>
              )}
            </div>
            {parlay.notes && (
              // A one-line preview; the full note opens in a dialog. The click is kept from
              // reaching the header so it doesn't also collapse the slip.
              <button
                type="button"
                aria-haspopup="dialog"
                aria-label={`Read the note for ${parlay.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setNoteOpen(true);
                }}
                className="w-full cursor-pointer truncate text-left type-caption text-muted-foreground transition-colors hover:text-foreground"
              >
                {parlay.notes}
              </button>
            )}
          </div>
        )}
        <CardAction className={cn("flex items-center", collapsed ? "self-center" : "row-span-1")}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-expanded={!collapsed}
            aria-controls={`slip-body-${parlay.id}`}
            aria-label={collapsed ? `Expand ${parlay.name}` : `Collapse ${parlay.name}`}
            onClick={(event) => {
              event.stopPropagation();
              toggleCollapsed();
            }}
            className="-mr-2 text-muted-foreground aria-expanded:bg-transparent aria-expanded:text-muted-foreground hover:aria-expanded:bg-muted"
          >
            <ChevronDown className={cn("transition-transform", collapsed && "-rotate-90")} />
          </Button>
        </CardAction>
      </CardHeader>

      {!collapsed && <StakeStrip parlay={parlay} onEdit={() => setStakeOpen(true)} />}

      {/* Mounted only while open, so its fields start from the slip's current values each time. */}
      {stakeOpen && (
        <StakeDialog
          parlay={parlay}
          onClose={() => setStakeOpen(false)}
          onSave={(stake) => {
            onSetStake(parlay, stake);
            setStakeOpen(false);
          }}
        />
      )}

      {!collapsed && (
        <CardContent
          id={`slip-body-${parlay.id}`}
          data-slot="slip-legs"
          className="py-5 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:overscroll-contain"
        >
          <ul className="divide-y">
            {parlay.legs.map((leg) => (
              <LegRow key={leg.id} leg={leg} />
            ))}
          </ul>
        </CardContent>
      )}

      {/* Rendered outside the header: events from a dialog bubble to its React parent, and the
          header toggles on click. */}
      {parlay.notes && (
        <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{parlay.name}</DialogTitle>
              <DialogDescription className="whitespace-pre-wrap">{parlay.notes}</DialogDescription>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      )}

      {!collapsed && <SlipFooter parlay={parlay} hits={hits} onDelete={onDelete} onMarkLost={onMarkLost} />}
    </Card>
  );
}

function LabelMarks({ labels, className }: { labels: SlipLabels; className?: string }) {
  const shown = LABELS.filter((label) => labels[label.key]);
  if (shown.length === 0) return null;
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {shown.map((label) => (
        <span key={label.key} role="img" aria-label={label.name} title={`${label.name}: ${label.hint}`}>
          {label.emoji}
        </span>
      ))}
    </span>
  );
}

// Wager, odds and payout in a fixed band under the header. The whole band opens the editor.
function StakeStrip({ parlay, onEdit }: { parlay: BoardParlay; onEdit: () => void }) {
  const { wager, payout } = parlay;
  const price = formatPrice(parlay);
  const band = "shrink-0 cursor-pointer border-b px-(--card-spacing) py-3 text-left transition-colors hover:bg-muted/40";

  if (wager === null && price === null && payout === null) {
    return (
      <button type="button" onClick={onEdit} className={cn(band, "type-caption text-primary")}>
        Add wager, odds and labels
      </button>
    );
  }

  const cells = [
    { label: "Wager", value: wager === null ? "–" : formatMoney(wager) },
    { label: "Odds", value: price ?? "–" },
    {
      label: "Payout",
      value: payout === null ? "–" : formatMoney(payout),
      // A won slip's payout is real money; a lost one's never arrives.
      className: parlay.status === "won" ? "text-hit" : parlay.status === "lost" ? "text-muted-foreground line-through" : undefined,
    },
  ];

  return (
    <button type="button" onClick={onEdit} aria-label={`Edit wager and odds for ${parlay.name}`} className={cn(band, "grid grid-cols-3 gap-3")}>
      {cells.map((cell) => (
        <span key={cell.label} className="min-w-0">
          <span className="block type-fine text-muted-foreground">{cell.label}</span>
          <span className={cn("block truncate font-semibold tabular-nums", cell.className)}>{cell.value}</span>
        </span>
      ))}
    </button>
  );
}

function StakeDialog({ parlay, onClose, onSave }: { parlay: BoardParlay; onClose: () => void; onSave: (stake: Stake) => void }) {
  const [wager, setWager] = useState(parlay.wager === null ? "" : String(parlay.wager));
  const [price, setPrice] = useState(formatPrice(parlay) ?? "");
  // Only a payout the user typed is shown; a worked-out one appears as the placeholder instead.
  const [payout, setPayout] = useState(parlay.payoutEntered && parlay.payout !== null ? String(parlay.payout) : "");
  const [labels, setLabels] = useState(parlay.labels);
  const [problem, setProblem] = useState<string | null>(null);

  const amount = (text: string) => (text.trim() === "" ? null : Number(text.replace(/[$,\s]/g, "")));
  const wagerValue = amount(wager);
  const priceValue = parsePrice(price);
  const payoutValue = amount(payout);
  const implied =
    wagerValue !== null && Number.isFinite(wagerValue) && priceValue !== null && priceValue !== "invalid"
      ? impliedPayout(wagerValue, priceValue)
      : null;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const badAmount = (value: number | null) => value !== null && !(Number.isFinite(value) && value >= 0);
    if (badAmount(wagerValue)) return setProblem("Wager should be an amount, like 10 or 12.50.");
    if (priceValue === "invalid") return setProblem("Odds should be American odds like +450 or -120, or a multiple like 1.9x.");
    if (badAmount(payoutValue)) return setProblem("Payout should be an amount, like 55.");
    onSave({
      wager: wagerValue,
      odds: priceValue?.odds ?? null,
      multiplier: priceValue?.multiplier ?? null,
      payout: payoutValue,
      labels,
    });
  }

  const field = "grid gap-1.5 type-caption text-muted-foreground";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Slip details</DialogTitle>
            <DialogDescription className="type-caption">{parlay.name}</DialogDescription>
          </DialogHeader>
          <label className={field}>
            Wager
            <Input inputMode="decimal" placeholder="10" value={wager} onChange={(e) => setWager(e.target.value)} />
          </label>
          <label className={field}>
            Odds or multiple
            <Input inputMode="text" placeholder="+450 or 1.9x" value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
          <label className={field}>
            Payout
            <Input
              inputMode="decimal"
              placeholder={implied === null ? "Worked out from wager and odds" : `${implied} from the odds`}
              value={payout}
              onChange={(e) => setPayout(e.target.value)}
            />
            <span className="type-fine">Total returned on a win, stake included. Leave blank unless your book shows a different figure.</span>
          </label>
          <fieldset className="grid gap-1.5">
            <legend className="mb-1.5 type-caption text-muted-foreground">Labels</legend>
            <div className="flex flex-wrap gap-2">
              {LABELS.map((label) => (
                <button
                  key={label.key}
                  type="button"
                  aria-pressed={labels[label.key]}
                  title={label.hint}
                  onClick={() => setLabels({ ...labels, [label.key]: !labels[label.key] })}
                  className={cn(
                    "cursor-pointer rounded-full border px-3 py-1.5 type-caption transition-colors",
                    labels[label.key] ? "border-primary bg-primary/15 text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span aria-hidden className="mr-1.5">
                    {label.emoji}
                  </span>
                  {label.name}
                </button>
              ))}
            </div>
          </fieldset>
          {problem && <p className="type-caption text-destructive">{problem}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm">
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SlipFooter({
  parlay,
  hits,
  onDelete,
  onMarkLost,
}: { parlay: BoardParlay; hits: number } & Pick<SlipActions, "onDelete" | "onMarkLost">) {
  const linkClass = "h-auto px-0 type-fine";
  return (
    <CardFooter className="shrink-0 justify-between gap-4 rounded-none type-fine text-muted-foreground">
      {/* Everything here stays on one line: the date drops out when the card is narrow (a phone,
          or three lanes on a small laptop), and the tally truncates before the actions ever wrap. */}
      <span className="min-w-0 truncate">
        {hits} of {parlay.legs.length} legs hit
        <span className="hidden @[22rem]/slip:inline">
          {" · Added "}
          {new Date(parlay.createdAt).toLocaleDateString([], { month: "short", day: "numeric" })}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-4 whitespace-nowrap">
        {/* Writing a slip off is one click because Reopen undoes it; only deleting asks first. */}
        {parlay.status === "live" && (
          <Button variant="link" size="sm" className={linkClass} onClick={() => onMarkLost(parlay, true)}>
            Mark lost
          </Button>
        )}
        {parlay.markedLost && (
          <Button variant="link" size="sm" className={linkClass} onClick={() => onMarkLost(parlay, false)}>
            Reopen
          </Button>
        )}
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="link" size="sm" className={linkClass} />}>Delete</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete “{parlay.name}”?</AlertDialogTitle>
              <AlertDialogDescription>The slip and its legs are removed from the board. This can’t be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel size="sm">Cancel</AlertDialogCancel>
              <AlertDialogAction size="sm" onClick={() => onDelete(parlay)}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </span>
    </CardFooter>
  );
}

const LEG_FILL: Record<LegStatus, string> = {
  pending: "bg-muted-foreground",
  live: "bg-primary",
  hit: "bg-hit",
  lost: "bg-miss",
  push: "bg-muted-foreground",
};

// A leg shows one of three marks: hit, missed, or an empty circle for anything not yet decided.
function LegMark({ status }: { status: LegStatus }) {
  const className = "size-5 shrink-0";
  if (status === "hit") return <CircleCheck role="img" aria-label="Hit" className={cn(className, "text-hit")} />;
  if (status === "lost") return <CircleX role="img" aria-label="Missed" className={cn(className, "text-miss")} />;
  const label = status === "live" ? "In progress" : status === "push" ? "Push" : "Pending";
  return <Circle role="img" aria-label={label} className={cn(className, "text-muted-foreground/60")} />;
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

// "Rush + rec TDs" should keep its capitals mid-sentence, so only the first letter drops.
function lowerFirst(label: string): string {
  return label.charAt(0).toLowerCase() + label.slice(1);
}

// The line sits three-quarters of the way along the bar, leaving room to show a leg running past it.
const MARKER_AT = 75;

function LegRow({ leg }: { leg: BoardLeg }) {
  const statusFill = LEG_FILL[leg.status];
  const started = leg.game.state !== "pre";
  const fill = started ? Math.max(0, Math.min(100, (leg.value / (leg.line || 1)) * MARKER_AT)) : 0;
  const past = leg.value > leg.line;
  // An over that's past the line reads as good and an under past it reads as bad, even before the final whistle.
  const liveFill = past ? (leg.direction === "over" ? "bg-hit" : "bg-miss") : statusFill;

  return (
    <li className="py-5 first:pt-0 last:pb-0">
      {/* One row for who and how many; the bet itself gets the full width underneath, since
          beside a photo on a narrow card it wrapped to three or four lines. */}
      <div className="flex items-center gap-2.5">
        <LegMark status={leg.status} />
        {/* The fallback covers players with no photo on file, and the simulated game's made-up ones. */}
        <Avatar className="bg-muted">
          {leg.headshot && <AvatarImage src={leg.headshot} alt="" />}
          <AvatarFallback className="type-fine font-semibold">{initials(leg.playerName)}</AvatarFallback>
        </Avatar>
        <p className="min-w-0 flex-1 truncate font-semibold leading-[1.24]">{leg.playerName}</p>
        <p className={cn("shrink-0 font-heading type-lead font-semibold tabular-nums", started ? "text-foreground" : "text-muted-foreground/50")}>
          {started ? leg.value : "–"}
        </p>
      </div>
      <p className="mt-2 type-caption text-muted-foreground">
        <span className="capitalize">{leg.direction}</span> {leg.line} {lowerFirst(leg.statLabel)}
        <span className="mx-1.5">·</span>
        {[leg.position, leg.team].filter(Boolean).join(", ")}
      </p>

      <div className="relative mt-3">
        <Progress
          value={fill}
          aria-label={`${leg.value} of ${leg.line} ${lowerFirst(leg.statLabel)}`}
          indicatorClassName={leg.status === "live" ? liveFill : statusFill}
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
