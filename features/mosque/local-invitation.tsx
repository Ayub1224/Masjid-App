'use client';
import { CredentialField } from '@/components/app/credential-field';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, BackendError } from '@/lib/data/api';
import { useIdentity } from '@/components/app/providers';
import { Form, PageTitle, Panel } from '@/components/app/primitives';
import { Button } from '@/components/ui/button';
import { InvitationAccountGuard } from './invitation-account-guard';

type Invitation = {
  name: string;
  role: 'owner' | 'admin' | 'member';
  identifier: string;
  mosqueName: string;
  existingAccount: boolean;
  method: { kind: 'password' | 'pin'; digits: number };
};
export function LocalInvitation() {
  const router = useRouter();
  const { session, reload, logout } = useIdentity();
  const initial = useRef({ session, reload, router });
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [token, setToken] = useState('');
  const [legacyLink, setLegacyLink] = useState('');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showSecret, setShowSecret] = useState(false);
  const confirming = useRef<Promise<{ destination?: string }> | null>(null);
  const completed = useRef(false);
  useEffect(() => {
    const frame = requestAnimationFrame(async () => {
      setLoading(true);
      setError('');
      const url = new URL(window.location.href);
      const rawToken =
        new URLSearchParams(url.hash.slice(1)).get('token') ?? '';
      const hash = url.searchParams.get('token_hash');
      if (hash && url.searchParams.get('type') === 'signup') {
        setLegacyLink(hash);
        setLoading(false);
        return;
      }
      setToken(rawToken);
      try {
        if (rawToken) {
          setInvitation(
            await api<Invitation>('auth/invitation', { token: rawToken }),
          );
        } else if (
          initial.current.session?.userId &&
          !initial.current.session.profile
        ) {
          const result = await api<{ destination: string }>(
            'auth/invitation/resume',
            {},
          );
          await initial.current.reload();
          initial.current.router.replace(result.destination);
        } else throw new BackendError(410, 'INVITATION_UNAVAILABLE');
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : 'Unable to check the invitation. Please try again.',
        );
      } finally {
        setLoading(false);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [retry]);
  useEffect(() => {
    if (!legacyLink || session?.profile || completed.current) return;
    let active = true;
    confirming.current ??= api<{ destination?: string }>('auth/confirm', {
      tokenHash: legacyLink,
      type: 'signup',
    });
    void confirming.current
      .then(async (result) => {
        if (!active) return;
        completed.current = true;
        setOpening(true);
        await initial.current.reload();
        initial.current.router.replace(result.destination ?? '/home');
      })
      .catch((caught) => {
        if (active)
          setError(
            caught instanceof Error
              ? caught.message
              : 'Unable to complete your invitation.',
          );
      });
    return () => {
      active = false;
    };
  }, [legacyLink, session?.profile]);
  if (loading)
    return (
      <Panel>
        <output>Checking your invitation…</output>
      </Panel>
    );
  if (error)
    return (
      <Panel className="space-y-5">
        <h1 className="font-heading text-2xl">
          Unable to open this invitation
        </h1>
        <p role="alert" className="text-sm text-muted-foreground">
          {error}
        </p>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={() => {
              confirming.current = null;
              setLegacyLink('');
              setRetry((n) => n + 1);
            }}
          >
            Try again
          </Button>
          <Button render={<Link href="/login" />}>Go to sign in</Button>
        </div>
      </Panel>
    );
  if (opening)
    return (
      <Panel>
        <output>Opening your mosque…</output>
      </Panel>
    );
  if (session?.profile)
    return (
      <InvitationAccountGuard
        email={session.profile.email || session.profile.phone}
        onSignOut={logout}
      />
    );
  if (legacyLink)
    return (
      <Panel>
        <output>Completing your invitation…</output>
      </Panel>
    );
  if (!invitation) return null;
  const password = invitation.method.kind === 'password';
  const label = password ? 'Password' : `${invitation.method.digits}-digit PIN`;
  const credentialName = password ? 'password' : label;
  const existing = invitation.existingAccount;
  return (
    <>
      <PageTitle
        title={`Assalamu alaikum, ${invitation.name}`}
        description={`Welcome to ${invitation.mosqueName}. You’ve been invited as ${invitation.role === 'owner' ? 'the owner' : invitation.role === 'admin' ? 'an administrator' : 'a member'}.`}
      />
      <Panel>
        <Form
          noValidate
          submit={existing ? 'Sign in and join' : 'Join mosque'}
          onSubmit={async (data) => {
            const rawSecret = data.get('credential'),
              rawConfirmation = data.get('confirmation');
            const secret = typeof rawSecret === 'string' ? rawSecret : '';
            const confirmation =
              typeof rawConfirmation === 'string' ? rawConfirmation : '';
            const next: Record<string, string> = {};
            if (
              password
                ? secret.length < 12 || secret.length > 128
                : !new RegExp(`^[0-9]{${invitation.method.digits}}$`).test(
                    secret,
                  )
            )
              next.credential = password
                ? 'Use a password between 12 and 128 characters.'
                : `Enter exactly ${invitation.method.digits} digits.`;
            if (!existing && secret !== confirmation)
              next.confirmation = `${label}s do not match.`;
            setErrors(next);
            if (Object.keys(next).length) {
              document.getElementById(Object.keys(next)[0])?.focus();
              return;
            }
            try {
              const result = await api<{ destination: string }>(
                'auth/register',
                {
                  invitationToken: token,
                  ...(password ? { password: secret } : { pin: secret }),
                },
              );
              completed.current = true;
              setOpening(true);
              await reload();
              router.replace(result.destination);
            } catch (caught) {
              if (
                caught instanceof BackendError &&
                caught.code === 'INVALID_CREDENTIALS'
              ) {
                setErrors({
                  credential: `That ${credentialName} is incorrect. Please try again.`,
                });
                document.getElementById('credential')?.focus();
                return;
              }
              throw caught;
            }
          }}
        >
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {existing
                ? `Continue with your ${credentialName}`
                : `Create your ${credentialName}`}
            </p>
            <p className="break-all text-sm text-muted-foreground">
              Your sign-in: {invitation.identifier}
            </p>
            {existing && (
              <p className="text-sm text-muted-foreground">
                Use the {credentialName} you already created to finish joining.
              </p>
            )}
          </div>
          <CredentialField
            digits={password ? undefined : invitation.method.digits}
            name="credential"
            label={existing ? label : `New ${credentialName}`}
            type={showSecret ? 'text' : 'password'}
            inputMode={password ? undefined : 'numeric'}
            maxLength={password ? 128 : invitation.method.digits}
            autoComplete={existing ? 'current-password' : 'new-password'}
            required
            error={errors.credential}
            onChange={() =>
              setErrors((current) => ({ ...current, credential: '' }))
            }
          />
          {!existing && (
            <CredentialField
              digits={password ? undefined : invitation.method.digits}
              name="confirmation"
              label={`Confirm ${credentialName}`}
              type={showSecret ? 'text' : 'password'}
              inputMode={password ? undefined : 'numeric'}
              maxLength={password ? 128 : invitation.method.digits}
              autoComplete="new-password"
              required
              error={errors.confirmation}
              onChange={() =>
                setErrors((current) => ({ ...current, confirmation: '' }))
              }
            />
          )}
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={showSecret}
              onChange={(e) => setShowSecret(e.target.checked)}
            />
            Show {credentialName}
          </label>
          {password && (
            <p className="text-sm text-muted-foreground">
              Use at least 12 characters. You’ll set up your authenticator after
              joining.
            </p>
          )}
        </Form>
      </Panel>
    </>
  );
}
