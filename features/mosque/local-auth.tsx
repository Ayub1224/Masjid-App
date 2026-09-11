'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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
type Method = { kind: 'password' | 'pin'; digits: number };
export function LocalLogin({
  recover = false,
  invite = false,
}: {
  recover?: boolean;
  invite?: boolean;
}) {
  const router = useRouter();
  const { session, reload } = useDemoRole();
  const [identifier, setIdentifier] = useState(''),
    [method, setMethod] = useState<Method | null>(null),
    [invitation, setInvitation] = useState(''),
    [notice, setNotice] = useState(''),
    [ready, setReady] = useState(false),
    [confirmation, setConfirmation] = useState<{
      tokenHash: string;
      type: string;
    } | null>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const url = new URL(window.location.href);
      setInvitation(new URLSearchParams(url.hash.slice(1)).get('token') ?? '');
      const hash = url.searchParams.get('token_hash'),
        type = url.searchParams.get('type');
      if (hash && (type === 'signup' || type === 'recovery')) {
        setConfirmation({ tokenHash: hash, type });
        window.history.replaceState(null, '', url.pathname + url.hash);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  async function redirect() {
    const r = await api<{ profile: { role: string } | null }>('me');
    await reload();
    router.push(
      r.profile?.role === 'super-admin'
        ? '/super-admin'
        : r.profile?.role === 'owner' || r.profile?.role === 'admin'
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
            const r = await api<{ identifier: string; method: Method }>(
              'auth/confirm',
              confirmation,
            );
            setIdentifier(r.identifier);
            setMethod(r.method);
            setReady(confirmation.type === 'recovery');
            setConfirmation(null);
            await reload();
            setNotice('Email confirmed. Continue with your account.');
          }}
        >
          <p>Confirm this account or recovery link.</p>
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
            label="Invitation token"
            name="token"
            value={invitation}
            onChange={(e) => setInvitation(e.target.value)}
            required
          />
          <p>Return to the original invitation link if the token is empty.</p>
        </Form>
      </Panel>
    );
  const label =
    method?.kind === 'password'
      ? 'Password'
      : `${method?.digits ?? 4}-digit PIN`;
  return (
    <>
      <Back />
      <PageTitle
        title={
          recover
            ? 'Recover your account'
            : invite
              ? 'Join your mosque'
              : 'Welcome back'
        }
        description={
          !method && !recover
            ? 'Enter your phone number or email to continue.'
            : undefined
        }
      />
      <Panel>
        <Form
          key={`${method?.kind}-${method?.digits}-${ready}`}
          submit={
            recover
              ? ready
                ? `Save ${label.toLowerCase()}`
                : 'Send recovery email'
              : !method
                ? 'Continue'
                : invite
                  ? 'Create account'
                  : 'Sign in'
          }
          onSubmit={async (f) => {
            if (recover && !ready) {
              const r = await api<{ message: string }>('auth/recover', {
                email: identifier,
                captchaToken: 'local',
              });
              setNotice(r.message);
              return;
            }
            if (!method) {
              const r = await api<Method>('auth/identify', {
                identifier,
                ...(invite ? { invitationToken: invitation } : {}),
              });
              setMethod(r);
              return;
            }
            const raw = f.get('credential');
            const secret = typeof raw === 'string' ? raw : '';
            if (
              (invite || ready) &&
              secret !== f.get('confirmation')
            )
              throw Error(`${label}s do not match.`);
            const value =
              method.kind === 'password'
                ? { password: secret }
                : { pin: secret };
            if (ready) {
              await api('auth/password', value);
              await redirect();
              return;
            }
            const input = {
              identifier,
              ...value,
              captchaToken: 'local',
              remember: f.get('remember') === 'on',
            };
            if (invite) {
              const r = await api<{ message: string }>('auth/register', {
                ...input,
                invitationToken: invitation,
              });
              setNotice(
                r.message + ' Then return to the original invitation link.',
              );
            } else {
              await api('auth/login', input);
              await redirect();
            }
          }}
        >
          {!method && !ready ? (
            <Field
              label={
                invite || recover ? 'Email address' : 'Phone number or email'
              }
              name="identifier"
              type={invite || recover ? 'email' : 'text'}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
              required
              maxLength={254}
            />
          ) : (
            <div className="flex items-center justify-between gap-3">
              <span className="break-all text-sm">{identifier}</span>
              {!ready && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setMethod(null);
                    setNotice('');
                  }}
                >
                  Change
                </Button>
              )}
            </div>
          )}
          {method && (!recover || ready) && (
            <>
              <Field
                name="credential"
                label={label}
                type="password"
                inputMode={method.kind === 'pin' ? 'numeric' : undefined}
                pattern={
                  method.kind === 'pin' ? `[0-9]{${method.digits}}` : undefined
                }
                minLength={method.kind === 'password' ? 12 : method.digits}
                maxLength={method.kind === 'password' ? 128 : method.digits}
                autoComplete={
                  invite || ready ? 'new-password' : 'current-password'
                }
                required
              />
              {(invite || ready) && (
                <Field
                  name="confirmation"
                  label={`Confirm ${label.toLowerCase()}`}
                  type="password"
                  autoComplete="new-password"
                  required
                />
              )}
              {!invite && !recover && (
                <label className="flex gap-3 items-center min-h-11">
                  <input type="checkbox" name="remember" />
                  Keep me signed in
                </label>
              )}
            </>
          )}
          <Feedback message={notice} />
        </Form>
        {!recover && (
          <Button
            variant="link"
            onClick={() => router.push('/forgot-password')}
          >
            Forgot password or PIN?
          </Button>
        )}
      </Panel>
    </>
  );
}
