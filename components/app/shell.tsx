'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import {
  Home,
  HandCoins,
  ChartNoAxesCombined,
  UserRound,
  LayoutDashboard,
  Users,
  ClipboardCheck,
  Receipt,
  CalendarDays,
  Megaphone,
  QrCode,
  ShieldCheck,
  LogOut,
  Menu,
  X,
  ArrowRight,
  Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Brand } from './brand';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { useIdentity } from './providers';
import { usePreferences } from './preferences';
import { can, type Permission } from '@/lib/data/domain';
const adminNav = [
  ['/admin/mosque', 'Mosque details', Home, 'receiving'],
  ['/admin', 'Overview', LayoutDashboard, null],
  ['/admin/members', 'Members', Users, 'members'],
  ['/admin/payments', 'Payments', ClipboardCheck, 'verify'],
  ['/admin/expenses', 'Expenses', Receipt, 'expenses'],
  ['/admin/prayers', 'Prayer times', CalendarDays, 'prayers'],
  ['/admin/news', 'News & events', Megaphone, 'news'],
  ['/admin/receiving', 'Receiving details', QrCode, 'receiving'],
] as const;
export function AppShell({
  path,
  children,
}: {
  path: string;
  children: ReactNode;
}) {
  const { role, session, logout } = useIdentity();
  const { t } = usePreferences();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const admin = path.startsWith('/admin') || path.startsWith('/super-admin');
  const canManage = ['admin', 'owner', 'super-admin'].includes(role);
  const dashboardPath = role === 'super-admin' ? '/super-admin' : '/admin';
  const isMember = role !== 'guest' && role !== 'super-admin';
  const grants = session?.profile?.permissions ?? [];
  useEffect(() => {
    const frame = requestAnimationFrame(() => setMenu(false));
    return () => cancelAnimationFrame(frame);
  }, [path]);
  return (
    <div className="min-h-dvh">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-card focus:p-4"
      >
        Skip to content
      </a>
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 py-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            {admin && (
              <Button
                variant="ghost"
                className="size-11 lg:hidden"
                aria-label="Toggle navigation"
                aria-expanded={menu}
                onClick={() => setMenu(!menu)}
              >
                {menu ? <X /> : <Menu />}
              </Button>
            )}
            <Brand />
          </div>
          <div className="flex items-center gap-1 sm:gap-3">
            <Button
              variant="ghost"
              className="size-11 shrink-0 px-0"
              aria-label={t('Settings', 'सेटिंग्स')}
              render={<Link href="/settings" />}
            >
              <Settings className="size-4" />
            </Button>
            {role === 'guest' && path !== '/login' && (
              <Button
                className="size-11 shrink-0 px-0 sm:w-auto sm:px-4"
                aria-label={t('Member login', 'सदस्य लॉगिन')}
                render={<Link href="/login" />}
              >
                <span className="hidden sm:inline">
                  {t('Member login', 'सदस्य लॉगिन')}
                </span>
                <ArrowRight />
              </Button>
            )}
          </div>
        </div>
      </header>
      <div
        className={`mx-auto max-w-7xl ${admin ? 'lg:grid lg:grid-cols-[235px_minmax(0,1fr)]' : ''}`}
      >
        {admin && (
          <aside
            className={`${menu ? 'block' : 'hidden'} border-b bg-card p-4 lg:block lg:min-h-[calc(100dvh-135px)] lg:border-b-0 lg:border-r lg:bg-transparent lg:p-6`}
          >
            <p className="mb-5 px-3 text-xs font-medium uppercase tracking-[.18em] text-muted-foreground">
              {role === 'super-admin'
                ? 'Access management'
                : 'Mosque management'}
            </p>
            <nav className="space-y-1">
              {role === 'owner' && (
                <Link
                  href="/admin/administrators"
                  className="flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm"
                >
                  <ShieldCheck className="size-4" />
                  Administrators
                </Link>
              )}
              {role === 'super-admin' ? (
                <>
                  <Link
                    href="/admin/mosque"
                    className="flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm"
                  >
                    <Home className="size-4" />
                    Mosque details
                  </Link>
                  <Link
                    href="/super-admin"
                    className="flex min-h-12 items-center gap-3 rounded-lg bg-accent px-3 text-primary"
                  >
                    <ShieldCheck className="size-4" />
                    Administrators
                  </Link>
                </>
              ) : (
                adminNav
                  .filter(
                    ([, , , p]) => !p || can(role, p as Permission, grants),
                  )
                  .map(([href, label, Icon]) => (
                    <Link
                      key={href}
                      href={href}
                      className={`flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm ${path === href ? 'bg-accent font-medium text-primary' : 'text-muted-foreground hover:bg-muted'}`}
                    >
                      <Icon className="size-4" />
                      {label}
                    </Link>
                  ))
              )}
            </nav>
            <div className="mt-10 border-t pt-5">
              <Link
                href="/"
                className="flex min-h-11 items-center gap-3 px-3 text-sm text-muted-foreground"
              >
                <Home className="size-4" />
                Public home
              </Link>
              <Button
                variant="ghost"
                className="h-11 w-full justify-start gap-3 px-3"
                onClick={async () => {
                  try {
                    await logout();
                    router.push('/');
                  } catch (error) {
                    setSignOutError((error as Error).message);
                  }
                }}
              >
                <LogOut className="size-4" />
                Sign out
              </Button>
              {signOutError && (
                <p role="alert" className="mt-3 text-sm text-destructive">
                  {signOutError}
                </p>
              )}
            </div>
          </aside>
        )}
        <main
          id="main-content"
          key={path}
          className={
            admin
              ? 'min-w-0 px-5 py-8 sm:p-8 lg:p-10'
              : 'mx-auto w-full max-w-xl px-5 pb-28 pt-7 sm:px-8 sm:pt-10'
          }
        >
          {!admin && canManage && (
            <Link
              href={dashboardPath}
              className="mb-6 flex min-h-16 items-center gap-3 rounded-xl border bg-accent px-4 py-3 text-primary transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <LayoutDashboard className="size-5 shrink-0" />
              <span className="flex-1 text-sm font-medium">
                {role === 'super-admin'
                  ? t(
                      'Back to super admin dashboard',
                      'सुपर एडमिन डैशबोर्ड पर वापस जाएँ',
                    )
                  : t('Back to admin dashboard', 'एडमिन डैशबोर्ड पर वापस जाएँ')}
              </span>
              <ArrowRight className="size-4 shrink-0" />
            </Link>
          )}
          {path !== '/' && (
            <Breadcrumb className="mb-6">
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink
                    render={
                      <Link
                        href={
                          role === 'guest'
                            ? '/'
                            : role === 'super-admin'
                              ? '/super-admin'
                              : role === 'member'
                                ? '/home'
                                : '/admin'
                        }
                      />
                    }
                  >
                    {role === 'guest'
                      ? t('Home', 'होम')
                      : isMember
                        ? t('Home', 'होम')
                        : t('Mosque management', 'मस्जिद प्रबंधन')}
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>
                    {path
                      .split('/')
                      .filter(Boolean)
                      .at(-1)
                      ?.replaceAll('-', ' ') ?? 'Page'}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          )}
          {children}
        </main>
      </div>
      {!admin && isMember && (
        <nav
          aria-label="Member navigation"
          className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
        >
          <div className="mx-auto grid max-w-xl grid-cols-4">
            {[
              ['/home', t('Home', 'होम'), Home],
              ['/contributions', t('Contributions', 'योगदान'), HandCoins],
              ['/finances', t('Finances', 'वित्त'), ChartNoAxesCombined],
              ['/profile', t('Profile', 'प्रोफ़ाइल'), UserRound],
            ].map(([href, label, Icon]) => {
              const I = Icon as typeof Home;
              return (
                <Link
                  key={String(href)}
                  href={String(href)}
                  className={`flex min-h-18 flex-col items-center justify-center gap-1 text-xs ${path === href ? 'font-medium text-primary' : 'text-muted-foreground'}`}
                >
                  <I className="size-5" strokeWidth={1.6} />
                  {String(label)}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
