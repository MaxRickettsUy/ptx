import { Suspense } from "react";
import { Board } from "@/components/board";

export default function Home() {
  return (
    // The board reads the selected day from the URL, which is only known at request time.
    <Suspense fallback={null}>
      <Board />
    </Suspense>
  );
}
