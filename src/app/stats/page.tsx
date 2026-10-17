import type { Metadata } from "next";
import { Stats } from "@/components/stats";

export const metadata: Metadata = { title: "Stats · ptx" };

export default function StatsPage() {
  return <Stats />;
}
