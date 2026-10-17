"use client";

import { Circle, CircleCheck, CircleX, Copy } from "lucide-react";
import Link from "next/link";
import type { IconType } from "react-icons";
import { BsOpenai } from "react-icons/bs";
import { SiClaude } from "react-icons/si";
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
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { PanelHeader, SectionNav } from "@/components/section-nav";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
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
import type { Board as BoardData, BoardLeg, BoardParlay } from "@/lib/board";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useStoredFlag } from "@/hooks/use-stored-flag";
import { groupByDay, type DayGroup } from "@/lib/days";
import type { LegStatus, ParlayStatus } from "@/lib/grade";
import { FLAGS, MODEL_HINT, MODELS, type Model, type SlipLabels } from "@/lib/labels";
import { formatMoney, formatPrice, impliedPayout, parsePrice } from "@/lib/odds";
import { cn } from "@/lib/utils";

const LIVE_POLL_MS = 15_000;
const IDLE_POLL_MS = 60_000;

// From this width the full slip gets its own column beside the lanes; below it, it slides in over them.
const DETAIL_COLUMN_QUERY = "(min-width: 1400px)";

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

  // Lanes hold previews; one slip at a time is shown in full. With room for the detail column
  // there is always something in it (a live slip if there is one); in the slide-over, only what
  // was tapped.
  const hasDetailColumn = useMediaQuery(DETAIL_COLUMN_QUERY);
  // Whether the left panel is showing on desktop; remembered across reloads.
  const [panelOpen, setPanelOpen] = useStoredFlag("parlay-board:side-panel-open", true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const slips = day?.parlays ?? [];
  const selected =
    slips.find((p) => p.id === selectedId) ??
    (hasDetailColumn ? (slips.find((p) => p.status === "live") ?? slips[0] ?? null) : null);
  const actions: SlipActions = { onDelete: remove, onMarkLost: markLost, onSetStake: setStake };

  return (
    <SidebarProvider open={panelOpen} onOpenChange={setPanelOpen}>
      <SidePanel board={board} days={days} activeKey={day?.key ?? null} />
      {/* Once the lanes sit side by side the page itself stops scrolling and each lane scrolls instead.
          Below that width they stack, where one page scroll is the only thing that makes sense. */}
      <SidebarInset className="xl:h-svh xl:overflow-hidden">

        {!board ? (
          <p className="py-32 text-center type-caption text-muted-foreground">
            {error ? `Couldn't load the board: ${error}` : "Loading the board…"}
          </p>
        ) : (
          <section className="flex-1 px-5 py-20 xl:min-h-0 xl:pt-14 xl:pb-5 min-[1400px]:flex min-[1400px]:gap-5">
            <div className="mx-auto w-full max-w-[1320px] xl:flex xl:h-full xl:flex-col min-[1400px]:min-w-0 min-[1400px]:flex-1">
              {/* The button beside the title shows and hides the left panel: a drawer on a phone,
                  a collapsing column on desktop. It lives here because there is no header bar. */}
              <div className="flex items-center gap-3">
                <SidebarTrigger className="size-11 shrink-0 rounded-full bg-secondary/80 text-muted-foreground" />
                <h1 className="min-w-0 font-heading type-display sm:type-hero">{day ? `${day.label}.` : "Your parlays."}</h1>
              </div>

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

              {day && <Lanes parlays={slips} selectedId={selected?.id ?? null} onSelect={setSelectedId} />}
            </div>

            {hasDetailColumn && day && (
              <aside aria-label="Selected slip" className="h-full w-[26rem] shrink-0 rounded-xl bg-primary/75 p-3">
                {selected ? (
                  <SlipDetail key={selected.id} parlay={selected} {...actions} />
                ) : (
                  <p className="grid h-full place-items-center rounded-xl border border-dashed type-caption text-muted-foreground">
                    Select a slip to see its legs.
                  </p>
                )}
              </aside>
            )}
          </section>
        )}
      </SidebarInset>

      {!hasDetailColumn && (
        <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelectedId(null)}>
          <SheetContent side="right" className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
            <SheetHeader className="sr-only">
              <SheetTitle>{selected?.name ?? "Slip"}</SheetTitle>
              <SheetDescription>The slip&apos;s legs, wager and actions.</SheetDescription>
            </SheetHeader>
            {selected && <SlipDetail key={selected.id} parlay={selected} inSheet {...actions} />}
          </SheetContent>
        </Sheet>
      )}
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
      <PanelHeader live={board?.anyLive ?? false} fetchedAt={board?.fetchedAt ?? null} />
      <SidebarContent>
        <SectionNav />
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

function Lanes({
  parlays,
  selectedId,
  onSelect,
}: {
  parlays: BoardParlay[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
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
              <div data-slot="lane-body" className="grid gap-3 sm:grid-cols-2 xl:flex xl:min-h-0 xl:flex-col xl:overflow-y-auto xl:overscroll-contain">
                {slips.map((parlay) => (
                  <SlipPreview key={parlay.id} parlay={parlay} selected={parlay.id === selectedId} onSelect={() => onSelect(parlay.id)} />
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

function StatusBadge({ parlay }: { parlay: BoardParlay }) {
  const badge = PARLAY_BADGE[parlay.status];
  return (
    <Badge variant={badge.variant} className={badge.className}>
      {parlay.status === "live" && <span className="size-1.5 animate-pulse-soft rounded-full bg-current" />}
      {parlay.markedLost ? "Marked lost" : badge.label}
    </Badge>
  );
}

const PREVIEW_DOT: Record<ParlayStatus, string> = {
  pending: "bg-muted-foreground/50",
  live: "animate-pulse-soft bg-primary",
  won: "bg-hit",
  lost: "bg-miss",
  push: "bg-muted-foreground",
};

// What a slip looks like in a lane: enough to tell them apart and see how each is doing.
// One mark per leg stands in for the legs themselves; the full slip opens beside the lanes.
// There is no badge here because the lane already says which state the slip is in.
function SlipPreview({ parlay, selected, onSelect }: { parlay: BoardParlay; selected: boolean; onSelect: () => void }) {
  // Pending and in-progress slips don't repeat their lane's name; a settled one says how it ended.
  // The leg marks above already show how many legs have hit, so the line is just this and the wager.
  const outcome = parlay.markedLost
    ? "Marked lost"
    : parlay.status === "pending" || parlay.status === "live"
      ? null
      : PARLAY_BADGE[parlay.status].label;
  const stake =
    parlay.wager !== null && parlay.payout !== null ? `${formatMoney(parlay.wager)} pays ${formatMoney(parlay.payout)}` : null;
  const summary = [outcome, stake].filter(Boolean).join(" · ");
  const teams = slipTeams(parlay);

  return (
    <button
      type="button"
      data-slot="slip-preview"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "grid w-full shrink-0 cursor-pointer grid-cols-[minmax(0,1fr)] gap-2.5 border bg-card p-4 text-left transition-colors hover:bg-accent",
        selected ? "border-primary" : "border-transparent",
      )}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate type-caption font-semibold">{parlay.name}</span>
        <LabelMarks labels={parlay.labels} className="shrink-0 type-fine" />
      </span>
      <span className="flex flex-wrap gap-1">
        {parlay.legs.map((leg) => (
          <LegMark key={leg.id} status={leg.status} className="size-4" />
        ))}
      </span>
      {(summary || teams.length > 0) && (
        <span className="flex min-w-0 items-center justify-between gap-3">
          {summary && (
            <span className="flex min-w-0 items-center gap-1.5 type-fine text-muted-foreground">
              <span className={cn("size-1.5 shrink-0 rounded-full", PREVIEW_DOT[parlay.status])} />
              <span className="truncate">{summary}</span>
            </span>
          )}
          <TeamLogos teams={teams} className="ml-auto" />
        </span>
      )}
    </button>
  );
}

// Each team with a player on the slip, once, in leg order.
function slipTeams(parlay: BoardParlay): { abbr: string; logo: string }[] {
  const seen = new Map<string, string>();
  for (const leg of parlay.legs) if (leg.team && leg.teamLogo && !seen.has(leg.team)) seen.set(leg.team, leg.teamLogo);
  return [...seen].map(([abbr, logo]) => ({ abbr, logo }));
}

// A slate-wide slip can span a dozen teams, so past a few the rest are counted instead.
const MAX_LOGOS = 4;

function TeamLogos({ teams, className }: { teams: { abbr: string; logo: string }[]; className?: string }) {
  if (teams.length === 0) return null;
  const shown = teams.slice(0, teams.length > MAX_LOGOS ? MAX_LOGOS - 1 : MAX_LOGOS);
  const rest = teams.length - shown.length;
  return (
    <span className={cn("flex shrink-0 items-center gap-1", className)} title={teams.map((t) => t.abbr).join(", ")}>
      {shown.map((team) => (
        // Small local files, so next/image would add nothing. A team with no logo on disk hides its
        // broken image rather than showing one.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={team.abbr}
          src={team.logo}
          alt={team.abbr}
          width={20}
          height={20}
          onError={(e) => (e.currentTarget.hidden = true)}
          className="size-5 object-contain"
        />
      ))}
      {rest > 0 && <span className="type-fine text-muted-foreground tabular-nums">+{rest}</span>}
    </span>
  );
}

// The full slip: header, wager band and footer stay put while the legs scroll between them.
function SlipDetail({ parlay, inSheet = false, onDelete, onMarkLost, onSetStake }: { parlay: BoardParlay; inSheet?: boolean } & SlipActions) {
  const hits = parlay.legs.filter((l) => l.status === "hit").length;
  const [noteOpen, setNoteOpen] = useState(false);
  const [stakeOpen, setStakeOpen] = useState(false);

  return (
    <Card data-slot="slip-detail" className="@container/slip h-full gap-0 rounded-none border-0 pt-0">
      <CardHeader className="shrink-0 grid-cols-[minmax(0,1fr)] rounded-none border-b pt-(--card-spacing)">
        {/* In the slide-over, the close button sits over the top-right corner. */}
        <CardTitle className={cn(inSheet && "pr-10")}>{parlay.name}</CardTitle>
        <div className="mt-1.5 flex min-w-0 flex-col items-start gap-2">
          <div className="flex items-center gap-2.5">
            <StatusBadge parlay={parlay} />
            {/* Who built the slip and whether it was really placed; clicking opens the editor. */}
            {Object.values(parlay.labels).some(Boolean) && (
              <button
                type="button"
                aria-label={`Edit labels for ${parlay.name}`}
                onClick={() => setStakeOpen(true)}
                className="cursor-pointer leading-none"
              >
                <LabelMarks labels={parlay.labels} />
              </button>
            )}
          </div>
          {parlay.notes && (
            // A one-line preview; the full note opens in a dialog.
            <button
              type="button"
              aria-haspopup="dialog"
              aria-label={`Read the note for ${parlay.name}`}
              onClick={() => setNoteOpen(true)}
              className="w-full cursor-pointer truncate text-left type-caption text-muted-foreground transition-colors hover:text-foreground"
            >
              {parlay.notes}
            </button>
          )}
        </div>
      </CardHeader>

      <StakeStrip parlay={parlay} onEdit={() => setStakeOpen(true)} />

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

      <CardContent data-slot="slip-legs" className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-5">
        <ul className="divide-y">
          {parlay.legs.map((leg) => (
            <LegRow key={leg.id} leg={leg} />
          ))}
        </ul>
      </CardContent>

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

      <SlipFooter parlay={parlay} hits={hits} onDelete={onDelete} onMarkLost={onMarkLost} />
    </Card>
  );
}

// Simple Icons no longer carries OpenAI's marks, so ChatGPT's comes from Bootstrap Icons.
// Claude's is drawn in its brand orange; OpenAI's mark is monochrome, so it takes the text colour.
const MODEL_ICON: Record<Model, { icon: IconType; className?: string }> = {
  claude: { icon: SiClaude, className: "text-[#D97757]" },
  chatgpt: { icon: BsOpenai },
};

function ModelIcon({ model }: { model: Model }) {
  const { icon: Icon, className } = MODEL_ICON[model];
  return <Icon aria-hidden className={cn("size-[1em] shrink-0", className)} />;
}

// One mark per label, in a fixed order: who built it (person, then model), then whether it was real.
function labelMarks(labels: SlipLabels) {
  const [human, mock] = FLAGS;
  const model = MODELS.find((m) => m.key === labels.model);
  return [
    labels.human && { key: human.key, name: human.name, hint: human.hint, mark: human.emoji },
    model && { key: model.key, name: model.name, hint: `${model.name} ${MODEL_HINT}`, mark: <ModelIcon model={model.key} /> },
    labels.mock && { key: mock.key, name: mock.name, hint: mock.hint, mark: mock.emoji },
  ].filter((mark) => mark !== false && mark !== undefined);
}

function LabelMarks({ labels, className }: { labels: SlipLabels; className?: string }) {
  const shown = labelMarks(labels);
  if (shown.length === 0) return null;
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {shown.map((label) => (
        <span key={label.key} role="img" aria-label={label.name} title={`${label.name}: ${label.hint}`} className="inline-flex">
          {label.mark}
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
              {/* Claude and ChatGPT are one label with two values, so turning one on turns the other off. */}
              {[
                { ...FLAGS[0], mark: FLAGS[0].emoji, on: labels.human, toggle: () => setLabels({ ...labels, human: !labels.human }) },
                ...MODELS.map((model) => ({
                  key: model.key,
                  name: model.name,
                  hint: `${model.name} ${MODEL_HINT}`,
                  mark: <ModelIcon model={model.key} />,
                  on: labels.model === model.key,
                  toggle: () => setLabels({ ...labels, model: labels.model === model.key ? null : model.key }),
                })),
                { ...FLAGS[1], mark: FLAGS[1].emoji, on: labels.mock, toggle: () => setLabels({ ...labels, mock: !labels.mock }) },
              ].map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  aria-pressed={chip.on}
                  title={chip.hint}
                  onClick={chip.toggle}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 type-caption transition-colors",
                    chip.on ? "border-primary bg-primary/15 text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span aria-hidden className="inline-flex">
                    {chip.mark}
                  </span>
                  {chip.name}
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
    <CardFooter className="shrink-0 flex-col items-stretch gap-2 rounded-none type-fine text-muted-foreground">
      <div className="flex items-center justify-between gap-4">
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
      </div>
      <CopyId id={parlay.id} />
    </CardFooter>
  );
}

// The clipboard API only exists on localhost or HTTPS. The board is also opened from phones over
// plain http on the home network, so fall back to copying a selection there.
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.append(field);
    field.select();
    const copied = document.execCommand("copy");
    field.remove();
    return copied;
  }
}

// The slip's id, for quoting a slip to an agent or looking it up in the database. Clicking copies it.
function CopyId({ id }: { id: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), 1500);
    return () => clearTimeout(timer);
  }, [state]);

  return (
    <button
      type="button"
      title="Copy the slip's id"
      onClick={async () => setState((await copyText(id)) ? "copied" : "failed")}
      className="flex min-w-0 cursor-pointer items-center gap-1.5 text-left transition-colors hover:text-foreground"
    >
      <span className="min-w-0 truncate font-mono">{id}</span>
      {state === "idle" ? (
        <Copy aria-hidden className="size-3 shrink-0" />
      ) : (
        <span role="status" className={cn("shrink-0", state === "copied" ? "text-hit" : "text-destructive")}>
          {state === "copied" ? "Copied" : "Couldn't copy"}
        </span>
      )}
    </button>
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
function LegMark({ status, className: size = "size-5" }: { status: LegStatus; className?: string }) {
  const className = cn("shrink-0", size);
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

// The bar for one number against the line. A leg has one; an each-quarter leg has one per quarter.
function LegBar({ leg, value, status, started }: { leg: BoardLeg; value: number; status: LegStatus; started: boolean }) {
  const statusFill = LEG_FILL[status];
  const fill = started ? Math.max(0, Math.min(100, (value / (leg.line || 1)) * MARKER_AT)) : 0;
  const past = value > leg.line;
  // An over that's past the line reads as good and an under past it reads as bad, even before the final whistle.
  const liveFill = past ? (leg.direction === "over" ? "bg-hit" : "bg-miss") : statusFill;

  return (
    <div className="relative">
      <Progress
        value={fill}
        aria-label={`${value} of ${leg.line} ${lowerFirst(leg.statLabel)}`}
        indicatorClassName={status === "live" ? liveFill : statusFill}
      />
      <span className="absolute -top-1 h-3.5 w-0.5 rounded-full bg-foreground" style={{ left: `${MARKER_AT}%` }} />
    </div>
  );
}

function LegRow({ leg }: { leg: BoardLeg }) {
  const started = leg.game.state !== "pre";
  // Four quarters each have their own number, so the headline is how many of them are in the bag.
  const headline = leg.quarters ? `${leg.quarters.filter((q) => q.status === "hit").length}/4` : leg.value;

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
          {started ? headline : "–"}
        </p>
      </div>
      <p className="mt-2 type-caption text-muted-foreground">
        <span className="capitalize">{leg.direction}</span> {leg.line} {lowerFirst(leg.statLabel)}
        {leg.periodLabel && `, ${lowerFirst(leg.periodLabel)}`}
        <span className="mx-1.5">·</span>
        {[leg.position, leg.team].filter(Boolean).join(", ")}
      </p>

      {leg.quarters ? (
        <ol className="mt-3 grid grid-cols-4 gap-4">
          {leg.quarters.map((quarter, i) => {
            const quarterStarted = quarter.status !== "pending";
            return (
              <li key={i}>
                <LegBar leg={leg} value={quarter.value} status={quarter.status} started={quarterStarted} />
                <p className="mt-2 flex justify-between type-fine text-muted-foreground">
                  <span>Q{i + 1}</span>
                  <span className={cn("tabular-nums", quarterStarted && "text-foreground")}>{quarterStarted ? quarter.value : "–"}</span>
                </p>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="mt-3">
          <LegBar leg={leg} value={leg.value} status={leg.status} started={started} />
        </div>
      )}

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
