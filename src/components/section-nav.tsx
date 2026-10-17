"use client";

import { ChartColumn, LayoutList, Trophy } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const SECTIONS = [
  { href: "/", label: "Parlays", icon: LayoutList },
  { href: "/scores", label: "Scores", icon: Trophy },
  { href: "/stats", label: "Stats", icon: ChartColumn },
];

/** The app name and when the page's data was last fetched, at the top of each left panel. */
export function PanelHeader({ live, fetchedAt }: { live: boolean; fetchedAt: string | null }) {
  return (
    // Safari on the Mac lays a translucent strip of its toolbar over the top ~40px of the page,
    // so on desktop the panel's content starts below that, level with the main column's padding.
    <SidebarHeader className="gap-1 px-4 pt-5 pb-3 md:pt-14">
      <p className="font-heading type-tagline font-semibold">ptx</p>
      <p className="flex items-center gap-2 type-fine text-muted-foreground">
        {live && (
          <span className="flex items-center gap-1.5 text-primary">
            <span className="size-1.5 animate-pulse-soft rounded-full bg-primary" />
            Live
          </span>
        )}
        {fetchedAt
          ? `Updated ${new Date(fetchedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
          : "Loading…"}
      </p>
    </SidebarHeader>
  );
}

/** The app's top-level sections, at the top of each page's left panel. */
export function SectionNav() {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {SECTIONS.map(({ href, label, icon: Icon }) => (
            <SidebarMenuItem key={href}>
              <SidebarMenuButton isActive={pathname === href} render={<Link href={href} />} onClick={() => setOpenMobile(false)}>
                <Icon />
                <span>{label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
