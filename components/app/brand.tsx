import Link from 'next/link';
import { MoonStar } from 'lucide-react';
export function Brand() {
  return (
    <Link
      href="/"
      className="flex min-w-0 items-center gap-3"
      aria-label="Gausul wara masjid home"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/5 text-primary">
        <MoonStar className="size-6" strokeWidth={1.4} />
      </span>
      <span className="min-w-0">
        <span className="block font-heading text-lg leading-tight">
          Gausul wara masjid
        </span>
        <span className="text-xs tracking-wide text-muted-foreground">
          POTIYA KALA · DURG
        </span>
      </span>
    </Link>
  );
}
