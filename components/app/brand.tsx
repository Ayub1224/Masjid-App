'use client';
/* oxlint-disable next/no-img-element -- optional mosque image */
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/data/api';
import type { MosqueDetails } from '@/lib/mosque-details';
import Link from 'next/link';
import { Landmark } from 'lucide-react';
export function Brand() {
  const { data } = useQuery({
    queryKey: ['mosque-details'],
    queryFn: () => api<MosqueDetails | null>('mosque'),
  });
  return (
    <Link
      href="/"
      className="flex min-w-0 items-center gap-3"
      aria-label={`${data?.name ?? 'Prayer times'} home`}
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/5 text-primary">
        {data?.picture ? (
          <img
            src={data.picture}
            alt=""
            className="size-11 rounded-full object-cover"
          />
        ) : (
          <Landmark className="size-6" strokeWidth={1.4} />
        )}
      </span>
      <span className="min-w-0">
        <span className="block font-heading text-lg leading-tight">
          {data?.name ?? 'Prayer times'}
        </span>
        <span className="text-xs tracking-wide text-muted-foreground">
          {data?.address ?? 'Durg · India'}
        </span>
      </span>
    </Link>
  );
}
