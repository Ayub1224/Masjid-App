'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/data/api';
import { useDemoRole } from '@/components/app/providers';
import {
  Back,
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
  const { session, reload } = useDemoRole();
  const [token, setToken] = useState(''),
    [epoch, setEpoch] = useState(0),
    [notice, setNotice] = useState(''),
    [invitation, setInvitation] = useState(''),
    [confirmation, setConfirmation] = useState<{
      tokenHash: string;
      type: string;
    } | null>(null),
    [resetReady, setResetReady] = useState(false);
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
      <Back />
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
                : 'Sign in'
          }
          onSubmit={async (f) => {
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
                  identifier: field(f, 'identifier'),
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
              autoComplete="username"
              required
              maxLength={254}
            />
          )}
          {(!recover || resetReady) && (
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
          {!invite && !recover && (
            <label className="flex gap-3 items-center min-h-11">
              <input type="checkbox" name="remember" />
              Keep me signed in
            </label>
          )}
          {!resetReady && <Captcha onToken={setToken} epoch={epoch} />}
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
  const { reload } = useDemoRole();
  const [factor, setFactor] = useState(''),
    [uri, setUri] = useState(''),
    [notice, setNotice] = useState('');
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
      {!existing && !factor && (
        <Button
          onClick={async () => {
            try {
              const r = await api<{ id: string; totp: { uri: string } }>(
                'auth/mfa/enroll',
                {},
              );
              setFactor(r.id);
              setUri(r.totp.uri);
            } catch (e) {
              setNotice((e as Error).message);
            }
          }}
        >
          Set up authenticator
        </Button>
      )}
      {uri && (
        <p className="my-4 break-all text-sm">
          Add this setup URI to your authenticator:{' '}
          <a href={uri} className="underline">
            {uri}
          </a>
        </p>
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
            required
            autoComplete="one-time-code"
          />
        </Form>
      )}
      <Feedback message={notice || query.error?.message || ''} error />
    </Panel>
  );
}
