'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Feedback, PageTitle, Panel } from '@/components/app/primitives';

export function InvitationAccountGuard({
  email,
  onSignOut,
}: {
  email: string;
  onSignOut: () => Promise<void>;
}) {
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  return (
    <>
      <PageTitle title="Use the invited account" />
      <Panel className="space-y-5">
        <div className="space-y-2">
          <h2 className="font-heading text-2xl">You are already signed in</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            You are signed in as <strong className="text-foreground">{email}</strong>.
            This account already has mosque access, so it cannot accept another
            invitation.
          </p>
          <p className="text-sm leading-6 text-muted-foreground">
            Sign out, then continue with the email address named in the invitation.
            Your invitation link will remain open.
          </p>
        </div>
        <Feedback message={error} error />
        <Button
          className="w-full"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            setError('');
            try {
              await onSignOut();
            } catch (caught) {
              setError((caught as Error).message);
              setPending(false);
            }
          }}
        >
          {pending ? 'Signing out…' : 'Sign out and continue'}
        </Button>
      </Panel>
    </>
  );
}
