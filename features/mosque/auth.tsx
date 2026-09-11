'use client';
import { LiveLogin } from './live-auth';
export function Login({
  recover = false,
  invite = false,
}: {
  recover?: boolean;
  invite?: boolean;
}) {
  return <LiveLogin recover={recover} invite={invite} />;
}
