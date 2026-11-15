import type { Metadata } from "next";
import { Suspense } from "react";
import { Lineups } from "@/components/lineups";

export const metadata: Metadata = { title: "Lineups · ptx" };

export default function LineupsPage() {
  return (
    // The league comes from the URL, which is only known at request time.
    <Suspense fallback={null}>
      <Lineups />
    </Suspense>
  );
}
