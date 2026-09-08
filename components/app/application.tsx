'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ArrowRight, ShieldCheck, Check, LogOut, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AppShell } from './shell';
import { useDemoData, useDemoRole } from './providers';
import { usePreferences } from './preferences';
import { PrayerHome, MosqueSelector } from '@/features/mosque/public-home';
import { Finance } from '@/features/mosque/finance';
import { Contribute, Contributions } from '@/features/mosque/contributions';
import { Login } from '@/features/mosque/auth';
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
  const query = useDemoData();
  const { role, setRole } = useDemoRole();
  const { t, theme, setTheme } = usePreferences();
  const router = useRouter();
  const data = query.data;
  const admin = path.startsWith('/admin'),
    superAdmin = path.startsWith('/super-admin');
  const publicPath = ['/', '/login', '/forgot-password', '/invite'].includes(
    path,
  );
  const grants = data?.members.find((m) => m.id === 'a1')?.permissions;
  const allowed =
    publicPath ||
    (superAdmin
      ? role === 'super-admin'
      : admin
        ? (role === 'admin' || role === 'owner') &&
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
  if (!allowed)
    content = (
      <div className="mx-auto max-w-md py-12 text-center">
        <ShieldCheck className="mx-auto mb-6 size-10 text-primary" />
        <PageTitle
          title="Choose a demo role"
          description="This area is available to a different role. Use the demo selector above to explore it."
        />
        <Button variant="outline" className="h-12" render={<Link href="/" />}>
          Return home
        </Button>
      </div>
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
        <Feedback message="Unable to load sample data." error />
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
                    ? 'Assalamu alaikum, Sample Member'
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
                (p) => p.memberId === 'm1' && p.status === 'pending',
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
                  <p className="font-medium">Sample Member</p>
                  <p className="text-sm text-muted-foreground">
                    member@example.com
                  </p>
                </div>
              </div>
            </Panel>
            <div className="mt-6">
              <PageTitle title={t('Make it yours', 'अपना रंग चुनें')} />
              <div className="space-y-3">
                {Object.entries(themes).map(([id, v]) => (
                  <button
                    key={id}
                    onClick={() => setTheme(id as keyof typeof themes)}
                    className={`flex min-h-20 w-full items-center gap-4 rounded-xl border bg-card p-4 text-left ${theme === id ? 'border-primary ring-1 ring-primary' : ''}`}
                    aria-pressed={theme === id}
                  >
                    <span
                      className="size-10 rounded-full"
                      style={{ background: v.colors.primary }}
                    />
                    <span className="flex-1">
                      <span className="block font-medium">{v.label}</span>
                      <span className="text-sm text-muted-foreground">
                        {v.description}
                      </span>
                    </span>
                    {theme === id && <Check className="size-5 text-primary" />}
                  </button>
                ))}
              </div>
            </div>
            <Button
              variant="outline"
              className="mt-7 h-12 w-full"
              onClick={() => {
                setRole('guest');
                router.push('/');
              }}
            >
              <LogOut />
              Leave member demo
            </Button>
          </>
        );
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
                Export sample CSV
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
