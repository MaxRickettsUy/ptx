import type { Metadata } from "next";
import { Suspense } from "react";
import { Scores } from "@/components/scores";

export const metadata: Metadata = { title: "Scores · ptx" };

export default function ScoresPage() {
  return (
    // The week and sort order come from the URL, which is only known at request time.
    <Suspense fallback={null}>
      <Scores />
    </Suspense>
  );
}
