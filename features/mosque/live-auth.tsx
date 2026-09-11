'use client';
import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/data/api';
import { useIdentity } from '@/components/app/providers';
import {
  Field,
  Form,
  Panel,
  PageTitle,
  Feedback,
} from '@/components/app/primitives';
import { Button } from '@/components/ui/button';
import { LocalLogin } from './local-auth';
const field = (f: FormData, key: string) =>
  typeof f.get(key) === 'string' ? (f.get(key) as string) : '';
type Turnstile = {
  render: (node: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
  reset: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}
function Captcha({
  onToken,
  epoch,
}: {
  onToken: (token: string) => void;
  epoch: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () =>
      api<{ turnstileSiteKey: string; local?: boolean }>('settings'),
  });
  useEffect(() => {
    if (settings.data?.local) {
      onToken('local');
      return;
    }
    if (!settings.data?.turnstileSiteKey) return;
    let widget: string | undefined;
    let stopped = false;
    const mount = () => {
      if (!stopped && ref.current && window.turnstile)
        widget = window.turnstile.render(ref.current, {
          sitekey: settings.data!.turnstileSiteKey,
          callback: onToken,
          'expired-callback': () => onToken(''),
          'error-callback': () => onToken(''),
        });
    };
    let script = document.querySelector<HTMLScriptElement>(
      'script[data-mosque-captcha]',
    );
    if (window.turnstile) mount();
    else {
      if (!script) {
        script = document.createElement('script');
        script.src =
          'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.dataset.mosqueCaptcha = 'true';
        script.async = true;
        document.head.appendChild(script);
      }
      script.addEventListener('load', mount);
    }
    return () => {
      stopped = true;
      script?.removeEventListener('load', mount);
      if (widget) window.turnstile?.remove(widget);
    };
  }, [settings.data?.turnstileSiteKey, settings.data?.local, onToken, epoch]);
  return (
    <div>
      <div ref={ref} />
      {!settings.data?.local && !settings.data?.turnstileSiteKey && (
        <p className="text-sm text-muted-foreground">
          Sign-in is awaiting administrator configuration.
        </p>
      )}
    </div>
  );
}
export function LiveLogin(props: { recover?: boolean; invite?: boolean }) {
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<{ local?: boolean }>('settings'),
    retry: 3,
    refetchOnWindowFocus: true,
  });
  return settings.data?.local ? (
    <LocalLogin {...props} />
  ) : (
    <HostedLogin {...props} />
  );
}
function HostedLogin({
  recover = false,
  invite = false,
}: {
  recover?: boolean;
  invite?: boolean;
}) {
  const router = useRouter();
  const { session, reload } = useIdentity();
  const [token, setToken] = useState(''),
    [identifier, setIdentifier] = useState(''),
    [epoch, setEpoch] = useState(0),
    [notice, setNotice] = useState(''),
    [invitation, setInvitation] = useState(''),
    [confirmation, setConfirmation] = useState<{
      tokenHash: string;
      type: string;
    } | null>(null),
    [resetReady, setResetReady] = useState(false);
  const [identifyReady, setIdentifyReady] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const url = new URL(window.location.href);
      setInvitation(new URLSearchParams(url.hash.slice(1)).get('token') ?? '');
      const hash = url.searchParams.get('token_hash'),
        type = url.searchParams.get('type');
      if (hash && ['signup', 'recovery'].includes(type ?? '')) {
        setConfirmation({ tokenHash: hash, type: type! });
        window.history.replaceState(null, '', url.pathname + url.hash);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  async function redirect() {
    const r = (await reload()) as { data?: { profile?: { role?: string } } };
    const role = r.data?.profile?.role;
    router.push(
      role === 'super-admin'
        ? '/super-admin'
        : role === 'owner' || role === 'admin'
          ? '/admin'
          : '/home',
    );
  }
  if (confirmation)
    return (
      <Panel>
        <Form
          submit="Confirm email link"
          onSubmit={async () => {
            await api('auth/confirm', confirmation);
            await reload();
            setResetReady(confirmation.type === 'recovery');
            setConfirmation(null);
            setNotice('Email confirmed. You can now continue.');
          }}
        >
          <p>Confirm this sign-in or recovery link for your mosque account.</p>
        </Form>
      </Panel>
    );
  if (invite && session?.userId)
    return (
      <Panel>
        <Form
          submit="Accept invitation"
          onSubmit={async () => {
            await api(
              'command',
              { type: 'accept-invite', token: invitation },
              { headers: { 'Idempotency-Key': crypto.randomUUID() } },
            );
            await redirect();
          }}
        >
          <Field
            name="token"
            label="Invitation token"
            value={invitation}
            onChange={(e) => setInvitation(e.target.value)}
            required
            maxLength={64}
          />
          <p>Use the original invitation link after confirming your email.</p>
        </Form>
      </Panel>
    );
  return (
    <>
      <PageTitle
        title={
          invite
            ? 'Join your mosque'
            : recover
              ? 'Reset your PIN'
              : 'Welcome back'
        }
      />
      <Panel>
        <Form
          submit={
            invite
              ? 'Create account'
              : recover
                ? resetReady
                  ? 'Save new PIN'
                  : 'Send recovery email'
                : identifyReady
                  ? 'Sign in'
                  : 'Continue'
          }
          onSubmit={async (f) => {
            if (!invite && !recover && !identifyReady) {
              const value = field(f, 'identifier');
              if (!value)
                throw Error('Enter your email address or phone number.');
              await api('auth/identify', { identifier: value });
              setIdentifier(value);
              setIdentifyReady(true);
              setNotice('Account found. Enter your six-digit PIN to continue.');
              return;
            }
            try {
              if (recover && resetReady) {
                await api('auth/password', { pin: field(f, 'pin') });
                await redirect();
                return;
              }
              if (!token) throw Error('Complete the security check first.');
              if (recover) {
                const r = await api<{ message: string }>('auth/recover', {
                  email: field(f, 'identifier'),
                  captchaToken: token,
                });
                setNotice(r.message);
              } else {
                const input = {
                  identifier,
                  pin: field(f, 'pin'),
                  captchaToken: token,
                  remember: f.get('remember') === 'on',
                };
                if (invite) {
                  const r = await api<{ message: string }>('auth/register', {
                    ...input,
                    invitationToken: invitation,
                  });
                  setNotice(
                    r.message + ' Return to this invitation after confirming.',
                  );
                } else {
                  await api('auth/login', input);
                  await redirect();
                }
              }
            } finally {
              setToken('');
              setEpoch((v) => v + 1);
            }
          }}
        >
          {!resetReady && (
            <Field
              label={
                invite || recover
                  ? 'Email address'
                  : 'Email or phone (include country code)'
              }
              name="identifier"
              type={invite || recover ? 'email' : 'text'}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
              required
              maxLength={254}
            />
          )}
          {(invite || resetReady || (!recover && identifyReady)) && (
            <Field
              label="6-digit PIN"
              name="pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]{6}"
              minLength={6}
              maxLength={6}
              autoComplete={
                invite || recover ? 'new-password' : 'current-password'
              }
              required
            />
          )}
          {!invite && !recover && identifyReady && (
            <label className="flex gap-3 items-center min-h-11">
              <input type="checkbox" name="remember" />
              Keep me signed in
            </label>
          )}
          {!resetReady && (invite || recover || identifyReady) && (
            <Captcha onToken={setToken} epoch={epoch} />
          )}
          <Feedback message={notice} />
        </Form>
        {!recover && (
          <Button
            variant="link"
            onClick={() => router.push('/forgot-password')}
          >
            Forgot PIN?
          </Button>
        )}
      </Panel>
    </>
  );
}
export function MfaSetup() {
  const { reload } = useIdentity();
  const [factor, setFactor] = useState(''),
    [uri, setUri] = useState(''),
    [notice, setNotice] = useState(''),
    [enrolling, setEnrolling] = useState(false);
  const query = useQuery({
    queryKey: ['mfa'],
    queryFn: () => api<{ totp: { id: string; status: string }[] }>('auth/mfa'),
  });
  const existing = query.data?.totp.find((f) => f.status === 'verified');
  return (
    <Panel>
      <PageTitle
        title="Protect administrator access"
        description="Verify with your authenticator app before managing mosque records."
      />
      {!query.isPending && !query.isError && !existing && !factor && (
        <Button
          disabled={enrolling}
          onClick={async () => {
            setEnrolling(true);
            setNotice('');
            try {
              const r = await api<{ id: string; totp: { uri: string } }>(
                'auth/mfa/enroll',
                {},
              );
              setFactor(r.id);
              setUri(r.totp.uri);
            } catch (e) {
              setNotice((e as Error).message);
            } finally {
              setEnrolling(false);
            }
          }}
        >
          {enrolling ? 'Preparing setup…' : 'Set up authenticator'}
        </Button>
      )}
      {query.isPending && (
        <output className="block text-sm text-muted-foreground">
          Checking authenticator setup…
        </output>
      )}
      {uri && !existing && (
        <div className="my-6 space-y-5">
          <div>
            <h2 className="font-medium">1. Scan with your authenticator</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Open Google Authenticator, Microsoft Authenticator, or your
              preferred app. Choose add account, then scan this QR code.
            </p>
          </div>
          <div className="mx-auto w-fit max-w-full rounded-2xl border bg-white p-4">
            <QRCodeSVG
              value={uri}
              size={240}
              marginSize={4}
              level="M"
              bgColor="#ffffff"
              fgColor="#000000"
              title="Scan to set up your mosque administrator authenticator"
              className="h-auto max-w-full"
            />
          </div>
          <details className="rounded-xl border p-4 text-sm">
            <summary className="cursor-pointer font-medium">
              Can’t scan the code?
            </summary>
            <div className="mt-3 space-y-3">
              <a
                href={uri}
                className="inline-block text-primary underline underline-offset-4"
              >
                Open authenticator on this device
              </a>
              <p className="text-muted-foreground">
                Or choose manual setup in your authenticator and enter this key
                as a time-based account.
              </p>
              <code className="block select-all break-all rounded-lg bg-muted p-3">
                {new URL(uri).searchParams.get('secret')}
              </code>
            </div>
          </details>
          <h2 className="font-medium">2. Enter the six-digit code to finish</h2>
        </div>
      )}
      {(existing || factor) && (
        <Form
          submit="Verify code"
          onSubmit={async (f) => {
            await api('auth/mfa/verify', {
              factorId: existing?.id ?? factor,
              code: field(f, 'code'),
            });
            setUri('');
            await reload();
          }}
        >
          <Field
            label="Authenticator code"
            name="code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            autoComplete="one-time-code"
          />
        </Form>
      )}
      <Feedback message={notice || query.error?.message || ''} error />
    </Panel>
  );
}
