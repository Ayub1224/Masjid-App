'use client';

import type { ComponentProps } from 'react';
import { Field } from './primitives';
import { InputOTP } from '@/components/ui/input-otp';

// One accessible input preserves paste, arrow keys, backspace and FormData;
// the visual slots show one digit each without splitting the submitted value.
export function CredentialField({
  digits,
  onChange,
  ...props
}: Omit<ComponentProps<typeof Field>, 'onChange'> & {
  digits?: number;
  onChange?: () => void;
}) {
  if (!digits) return <Field {...props} onChange={onChange} />;
  const { name, label, error, required, type, autoComplete, disabled } = props;
  return (
    <Field name={name} label={label} error={error} required={required}>
      <InputOTP
        id={name}
        name={name}
        maxLength={digits}
        minLength={digits}
        pattern="^[0-9]*$"
        inputMode="numeric"
        type={type === 'password' ? 'password' : 'text'}
        autoComplete={autoComplete}
        required={required}
        disabled={disabled}
        aria-invalid={!!error}
        aria-describedby={error ? `${name}-error` : undefined}
        onChange={onChange}
        pasteTransformer={(text) => text.replace(/\s/g, '')}
        containerClassName="w-full"
        render={({ slots }) => (
          <div className="flex w-full max-w-sm gap-2" aria-hidden="true">
            {slots.map((slot, index) => (
              <div
                key={index}
                className={`relative flex h-12 min-w-0 flex-1 items-center justify-center rounded-lg border bg-background text-xl shadow-[var(--neo-inset)] ${error ? 'border-destructive' : 'border-input'} ${slot.isActive ? (error ? 'ring-2 ring-destructive' : 'ring-2 ring-primary') : ''}`}
              >
                {slot.char && (type === 'password' ? '•' : slot.char)}
                {slot.hasFakeCaret && (
                  <span className="absolute h-5 w-px animate-caret-blink bg-foreground" />
                )}
              </div>
            ))}
          </div>
        )}
      />
    </Field>
  );
}
