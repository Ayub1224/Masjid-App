'use client';
import { api } from '@/lib/data/api';
import { changePinInput } from '@/lib/bulk-members';
import { Form, Panel, PageTitle, value } from '@/components/app/primitives';
import { CredentialField } from '@/components/app/credential-field';
import { Modal } from '@/components/app/primitives';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
export function ChangePinButton() {
  const [open, setOpen] = useState(false);
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => api<{ local?: boolean }>('settings'),
  });
  if (!settings.data?.local) return null;
  return (
    <>
      <Button
        variant="outline"
        className="mt-6 w-full"
        onClick={() => setOpen(true)}
      >
        Change PIN
      </Button>
      <Modal open={open} onOpenChange={setOpen} title="Account security">
        <ChangePin
          onDone={async () => {
            setOpen(false);
          }}
        />
      </Modal>
    </>
  );
}
export function ChangePin({
  onDone,
  onSignOut,
  required = false,
}: {
  onDone: () => Promise<unknown>;
  onSignOut?: () => Promise<void>;
  required?: boolean;
}) {
  return (
    <div className="mx-auto w-full max-w-lg space-y-5 p-6">
      <PageTitle
        title={required ? 'Set your own PIN' : 'Change your PIN'}
        description={
          required
            ? 'Your administrator created a temporary PIN. Choose a new four-digit PIN before opening your account.'
            : 'Use your current PIN to choose a new one.'
        }
      />
      <Panel>
        <Form
          submit="Save new PIN"
          onSubmit={async (form) => {
            const result = changePinInput.safeParse({
              currentPin: value(form, 'currentPin'),
              pin: value(form, 'pin'),
            });
            if (!result.success) throw Error(result.error.issues[0].message);
            if (result.data.pin !== value(form, 'confirmation'))
              throw Error('PINs do not match.');
            await api('auth/change-pin', result.data);
            await onDone();
          }}
        >
          <CredentialField
            digits={4}
            compact
            name="currentPin"
            label={required ? 'Temporary PIN' : 'Current PIN'}
            type="password"
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            autoComplete="current-password"
            required
          />
          <CredentialField
            digits={4}
            compact
            name="pin"
            label="New four-digit PIN"
            type="password"
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            autoComplete="new-password"
            required
          />
          <CredentialField
            digits={4}
            compact
            name="confirmation"
            label="Confirm new PIN"
            type="password"
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            autoComplete="new-password"
            required
          />
        </Form>
      </Panel>
      {onSignOut && (
        <Form submit="Sign out" onSubmit={onSignOut}>
          <span className="sr-only">Sign out of this account</span>
        </Form>
      )}
    </div>
  );
}
