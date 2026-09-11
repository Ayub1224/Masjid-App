'use client';
import Link from 'next/link';
import { MosqueDetailsEditor } from '@/features/admin/mosque-details';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowRight, ShieldCheck, LogOut, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AppShell } from './shell';
import { useMosqueData, useIdentity } from './providers';
import { usePreferences } from './preferences';
import { PrayerHome, MosqueSelector } from '@/features/mosque/public-home';
import { Finance } from '@/features/mosque/finance';
import { Contribute, Contributions } from '@/features/mosque/contributions';
import { Login } from '@/features/mosque/auth';
import { Settings } from '@/features/mosque/settings';
import { MfaSetup } from '@/features/mosque/live-auth';
import {
  AdminOverview,
  Members,
  Payments,
  Cash,
  Expenses,
  Balance,
  PrayerEditor,
  NewsEditor,
  Receiving,
  exportPayments,
} from '@/features/admin/screens';
import { Panel, PageTitle, Feedback } from './primitives';
import { themes, isThemeName } from '@/config/themes';
import { can, type Permission } from '@/lib/data/domain';
const routePowers: Record<string, Permission> = {
  '/admin/members': 'members',
  '/admin/payments': 'verify',
  '/admin/cash': 'record',
  '/admin/expenses': 'expenses',
  '/admin/balance': 'expenses',
  '/admin/prayers': 'prayers',
  '/admin/news': 'news',
  '/admin/receiving': 'receiving',
};
export function Application({ path }: { path: string }) {
  const query = useMosqueData();
  const { role, session, logout, loading } = useIdentity();
  const { t, setTheme } = usePreferences();
  const router = useRouter();
  const [signOutError, setSignOutError] = useState('');
  const data = query.data;
  const admin = path.startsWith('/admin'),
    superAdmin = path.startsWith('/super-admin');
  const publicPath = [
    '/',
    '/login',
    '/forgot-password',
    '/invite',
    '/settings',
  ].includes(path);
  const grants = session?.profile?.permissions ?? [];
  const allowed =
    publicPath ||
    (path === '/admin/mosque' &&
      (role === 'super-admin' || can(role, 'receiving', grants))) ||
    (superAdmin
      ? role === 'super-admin'
      : admin
        ? (role === 'admin' || role === 'owner') &&
          (path !== '/admin/administrators' || role === 'owner') &&
          (!routePowers[path] || can(role, routePowers[path], grants))
        : role !== 'guest' && role !== 'super-admin');
  useEffect(() => {
    const ctx = (
      document as Document & {
        modelContext?: {
          registerTool: (tool: unknown, options: unknown) => unknown;
        };
      }
    ).modelContext;
    if (!ctx) return;
    const controller = new AbortController();
    try {
      Promise.resolve(
        ctx.registerTool(
          {
            name: 'set_mosque_color_theme',
            title: 'Change mosque color theme',
            description:
              'Change only the local color preference for the mosque frontend.',
            inputSchema: {
              type: 'object',
              properties: {
                theme: { type: 'string', enum: Object.keys(themes) },
              },
              required: ['theme'],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false },
            execute: async (input: unknown) => {
              const name = (input as { theme?: unknown })?.theme;
              if (typeof name !== 'string' || !isThemeName(name))
                throw Error('Unknown theme');
              setTheme(name);
              await new Promise<void>((resolve) =>
                requestAnimationFrame(() =>
                  requestAnimationFrame(() => resolve()),
                ),
              );
              return { theme: name };
            },
          },
          { signal: controller.signal },
        ),
      ).catch(() => {});
    } catch {}
    return () => controller.abort();
  }, [setTheme]);
  let content;
  if (path === '/settings') content = <Settings />;
  else if (loading) content = <Skeleton className="h-48 w-full" />;
  else if (['/login', '/forgot-password', '/invite'].includes(path))
    content = (
      <Login
        recover={path === '/forgot-password'}
        invite={path === '/invite'}
      />
    );
  else if (
    (admin || superAdmin) &&
    (role === 'owner' || role === 'super-admin') &&
    session?.profile?.active &&
    session.aal !== 'aal2'
  )
    content = <MfaSetup />;
  else if (!allowed)
    content = (
      <div className="mx-auto max-w-md py-12 text-center">
        <ShieldCheck className="mx-auto mb-6 size-10 text-primary" />
        <PageTitle
          title="Sign in to continue"
          description="This page requires an active account with the appropriate permission."
        />
        <Button
          variant="outline"
          className="h-12"
          render={<Link href="/login" />}
        >
          Sign in
        </Button>
      </div>
    );
  else if (path === '/admin/mosque') content = <MosqueDetailsEditor />;
  else if (path === '/')
    content = (
      <>
        <MosqueSelector />
        <PrayerHome
          prayers={query.data?.prayers ?? []}
          notices={query.data?.notices ?? []}
          visitor
        />
      </>
    );
  else if (query.isPending)
    content = (
      <div aria-label="Loading mosque data" className="space-y-5">
        <Skeleton className="h-12 w-3/4" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  else if (query.isError || !data)
    content = (
      <Panel>
        <Feedback
          message={query.error?.message ?? 'Unable to load mosque records.'}
          error
        />
        <Button onClick={() => query.refetch()} className="mt-4 h-11">
          Retry
        </Button>
      </Panel>
    );
  else
    switch (path) {
      case '/':
      case '/home':
        content = (
          <>
            <div className="mb-7">
              <p className="mb-2 text-xs uppercase tracking-[.16em] text-muted-foreground">
                {t(
                  path === '/home'
                    ? `Assalamu alaikum, ${session?.profile?.name ?? 'Member'}`
                    : 'Your local mosque',
                  path === '/home' ? 'अस्सलामु अलैकुम, सदस्य' : 'आपकी स्थानीय मस्जिद',
                )}
              </p>
              <MosqueSelector />
            </div>
            <PrayerHome
              member={path === '/home'}
              prayers={data.prayers}
              notices={data.notices}
            />
            {path === '/home' &&
              data.payments.some(
                (p) => p.memberId === session?.userId && p.status === 'pending',
              ) && (
                <Link
                  href="/contributions"
                  className="mt-5 flex min-h-11 items-center justify-center gap-2 text-sm text-primary"
                >
                  {t('View pending contributions', 'लंबित योगदान देखें')}
                  <ArrowRight className="size-4" />
                </Link>
              )}
          </>
        );
        break;
      case '/login':
        content = <Login />;
        break;
      case '/forgot-password':
        content = <Login recover />;
        break;
      case '/invite':
        content = <Login invite />;
        break;
      case '/contribute':
        content = <Contribute data={data} />;
        break;
      case '/contribute/submit':
        content = <Contribute data={data} submit />;
        break;
      case '/contributions':
        content = <Contributions data={data} />;
        break;
      case '/finances':
        content = <Finance data={data} />;
        break;
      case '/profile':
        content = (
          <>
            <PageTitle title={t('Your profile', 'आपकी प्रोफ़ाइल')} />
            <Panel>
              <div className="flex items-center gap-4">
                <span className="flex size-14 items-center justify-center rounded-full bg-accent font-heading text-xl text-primary">
                  SM
                </span>
                <div>
                  <p className="font-medium">
                    {session?.profile?.name ?? 'Member'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {session?.profile?.email ?? ''}
                  </p>
                </div>
              </div>
            </Panel>
            <Button
              variant="outline"
              className="mt-6 h-14 w-full justify-between"
              render={<Link href="/settings" />}
            >
              {t('Settings', 'सेटिंग्स')}
              <ArrowRight className="size-4" />
            </Button>
            <Button
              variant="outline"
              className="mt-7 h-12 w-full"
              onClick={async () => {
                try {
                  await logout();
                  router.push('/');
                } catch (error) {
                  setSignOutError((error as Error).message);
                }
              }}
            >
              <LogOut />
              Sign out
            </Button>
            <Feedback message={signOutError} error />
          </>
        );
        break;
      case '/settings':
        content = <Settings />;
        break;
      case '/admin':
        content = <AdminOverview data={data} />;
        break;
      case '/admin/members':
        content = <Members data={data} />;
        break;
      case '/admin/payments':
        content = (
          <>
            <Payments data={data} />
            {can(role, 'reports', grants) && (
              <Button
                variant="outline"
                className="mt-6 h-11"
                onClick={() => exportPayments(data)}
              >
                <Download />
                Export CSV
              </Button>
            )}
          </>
        );
        break;
      case '/admin/cash':
        content = <Cash data={data} />;
        break;
      case '/admin/expenses':
        content = <Expenses data={data} />;
        break;
      case '/admin/balance':
        content = <Balance data={data} />;
        break;
      case '/admin/prayers':
        content = <PrayerEditor data={data} />;
        break;
      case '/admin/news':
        content = <NewsEditor data={data} />;
        break;
      case '/admin/receiving':
        content = <Receiving data={data} />;
        break;
      case '/admin/administrators':
      case '/super-admin':
        content = <Members data={data} administrators />;
        break;
      default:
        content = (
          <Panel>
            Page not found. <Link href="/">Return home</Link>
          </Panel>
        );
    }
  return <AppShell path={path}>{content}</AppShell>;
}
