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
  Palette,
  ChevronDown,
  Menu,
  X,
  ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Brand } from './brand';
import { useDemoRole, useDemoData } from './providers';
import { usePreferences } from './preferences';
import { themes, isThemeName } from '@/config/themes';
import { can, type Role, type Permission } from '@/lib/data/domain';
const adminNav = [
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
  const { role, setRole } = useDemoRole();
  const { language, setLanguage, theme, setTheme, t } = usePreferences();
  const { data } = useDemoData();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const admin = path.startsWith('/admin') || path.startsWith('/super-admin');
  const isMember = role !== 'guest' && role !== 'super-admin';
  const grants = data?.members.find((m) => m.id === 'a1')?.permissions;
  function switchRole(next: Role) {
    setRole(next);
    router.push(
      next === 'guest'
        ? '/'
        : next === 'member'
          ? '/home'
          : next === 'super-admin'
            ? '/super-admin'
            : '/admin',
    );
    setMenu(false);
  }
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
      <div className="border-b bg-secondary/60">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-5 py-2 text-xs text-secondary-foreground">
          <span className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-primary" />
            {t(
              'Frontend demo · Sample data · Resets on reload',
              'फ़्रंटएंड डेमो · नमूना डेटा · रीलोड पर रीसेट',
            )}
          </span>
          <label className="flex items-center gap-2">
            {t('Explore as', 'डेमो भूमिका')}
            <select
              aria-label="Demo role"
              value={role}
              onChange={(e) => switchRole(e.target.value as Role)}
              className="min-h-9 max-w-36 rounded-md border bg-card px-2"
            >
              <option value="guest">Visitor</option>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
              <option value="owner">Owner</option>
              <option value="super-admin">Super admin</option>
            </select>
          </label>
        </div>
      </div>
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
              className="h-11 px-2 sm:px-3"
              onClick={() => setLanguage(language === 'en' ? 'hi' : 'en')}
            >
              {language === 'en' ? 'हिन्दी' : 'English'}
            </Button>
            <label className="relative flex items-center">
              <Palette className="pointer-events-none absolute left-3 size-4 text-primary" />
              <select
                aria-label="Color theme"
                value={theme}
                onChange={(e) => {
                  if (isThemeName(e.target.value)) setTheme(e.target.value);
                }}
                className="h-11 w-11 appearance-none rounded-full border bg-background pl-10 text-transparent sm:w-32 sm:rounded-lg sm:text-foreground"
              >
                {Object.entries(themes).map(([id, v]) => (
                  <option value={id} key={id}>
                    {v.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 hidden size-3 sm:block" />
            </label>
            {role === 'guest' && path !== '/login' && (
              <Button
                className="hidden h-11 px-4 sm:inline-flex"
                render={<Link href="/login" />}
              >
                {t('Member login', 'सदस्य लॉगिन')}
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
              {role === 'super-admin' ? (
                <Link
                  href="/super-admin"
                  className="flex min-h-12 items-center gap-3 rounded-lg bg-accent px-3 text-primary"
                >
                  <ShieldCheck className="size-4" />
                  Administrators
                </Link>
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
                onClick={() => switchRole('guest')}
              >
                <LogOut className="size-4" />
                Leave demo role
              </Button>
            </div>
          </aside>
        )}
        <main
          id="main-content"
          className={
            admin
              ? 'min-w-0 px-5 py-8 sm:p-8 lg:p-10'
              : 'mx-auto w-full max-w-xl px-5 pb-28 pt-7 sm:px-8 sm:pt-10'
          }
        >
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
