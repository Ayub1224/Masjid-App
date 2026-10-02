'use client';
import { CredentialField } from '@/components/app/credential-field';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { LocalInvitation } from './local-invitation';
import { Toaster, toast } from '@/components/ui/toast';
type Method = { kind: 'password' | 'pin'; digits: number };
export function LocalLogin(props: { recover?: boolean; invite?: boolean }) {
  return props.invite ? (
    <LocalInvitation />
  ) : (
    <LocalSignIn recover={props.recover} />
  );
}
function LocalSignIn({ recover = false }: { recover?: boolean }) {
  const router = useRouter();
  const { reload } = useIdentity();
  const initialReload = useRef(reload);
  const [identifier, setIdentifier] = useState(''),
    [method, setMethod] = useState<Method | null>(null),
    [notice, setNotice] = useState(''),
    [checkingLink, setCheckingLink] = useState(false),
    [linkError, setLinkError] = useState(false),
    [ready, setReady] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(async () => {
      const url = new URL(window.location.href);
      const hash = url.searchParams.get('token_hash'),
        type = url.searchParams.get('type');
      if (hash && type === 'recovery') {
        window.history.replaceState(null, '', url.pathname + url.hash);
        if (type === 'recovery') {
          setCheckingLink(true);
          try {
            const result = await api<{ identifier: string; method: Method }>(
              'auth/confirm',
              { tokenHash: hash, type },
            );
            setIdentifier(result.identifier);
            setMethod(result.method);
            setReady(true);
            await initialReload.current();
          } catch {
            setLinkError(true);
          } finally {
            setCheckingLink(false);
          }
        }
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    if (!linkError) return;
    const frame = requestAnimationFrame(() => {
      toast.add({
        title: 'Recovery link is invalid or expired.',
        description: 'Request a new recovery email and try again.',
        type: 'error',
        timeout: 10000,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [linkError]);
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
  if (checkingLink)
    return (
      <>
        <Toaster />
        <Panel>Checking recovery link…</Panel>
      </>
    );
  const label =
    method?.kind === 'password'
      ? 'Password'
      : `${method?.digits ?? 4}-digit PIN`;
  return (
    <>
      <Toaster />
      <PageTitle
        title={
          recover
            ? ready
              ? `Reset your ${label.toLowerCase()}`
              : 'Recover your account'
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
              });
              setMethod(r);
              return;
            }
            const raw = f.get('credential');
            const secret = typeof raw === 'string' ? raw : '';
            if (ready && secret !== f.get('confirmation'))
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
            await api('auth/login', input);
            await redirect();
          }}
        >
          {!method && !ready ? (
            <Field
              label={recover ? 'Email address' : 'Phone number or email'}
              name="identifier"
              type={recover ? 'email' : 'text'}
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
              <CredentialField
                digits={method.kind === 'pin' ? method.digits : undefined}
                name="credential"
                label={label}
                type="password"
                inputMode={method.kind === 'pin' ? 'numeric' : undefined}
                pattern={
                  method.kind === 'pin' ? `[0-9]{${method.digits}}` : undefined
                }
                minLength={method.kind === 'password' ? 12 : method.digits}
                maxLength={method.kind === 'password' ? 128 : method.digits}
                autoComplete={ready ? 'new-password' : 'current-password'}
                required
              />
              {ready && (
                <CredentialField
                  digits={method.kind === 'pin' ? method.digits : undefined}
                  name="confirmation"
                  label={`Confirm ${label.toLowerCase()}`}
                  type="password"
                  autoComplete="new-password"
                  required
                />
              )}
              {!recover && (
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
