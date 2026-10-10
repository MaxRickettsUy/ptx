import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="bg-black text-white">
      <div className="mx-auto flex h-11 w-full max-w-[980px] items-center justify-between px-5 type-fine">
        <Link href="/" className="font-semibold">
          Parlay Board
        </Link>
        <span className="text-white/70">
          Build with <code className="font-mono text-white">/parlay</code> in Claude Code
        </span>
      </div>
    </header>
  );
}
