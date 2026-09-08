'use client';
import Link from 'next/link';
import { type ReactNode, type SyntheticEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Check, Clock3, TriangleAlert, ArrowLeft } from 'lucide-react';
import { usePreferences } from './preferences';
export function PageTitle({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-heading text-3xl sm:text-4xl">{title}</h1>
        {description && (
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
export function Panel({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border bg-card p-5 sm:p-6 ${className}`}>
      {children}
    </section>
  );
}
export function Disclosure({
  title,
  children,
  icon,
}: {
  title: string;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <Accordion className="rounded-xl border bg-card">
      <AccordionItem value="details">
        <AccordionTrigger className="items-center px-5 py-5 text-base hover:no-underline">
          <span className="flex items-center gap-3">
            {icon}
            {title}
          </span>
        </AccordionTrigger>
        <AccordionContent className="px-5 pb-5 text-sm">
          {children}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
export function Field({
  label,
  name,
  children,
  ...props
}: { label: string; name: string; children?: ReactNode } & React.ComponentProps<
  typeof Input
>) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name} className="text-sm">
        {label}
        {props.required && <span className="text-destructive"> *</span>}
      </Label>
      {children ?? (
        <Input
          id={name}
          name={name}
          className="h-12 bg-background/30 text-base"
          {...props}
        />
      )}
    </div>
  );
}
export function Status({ status }: { status: string }) {
  const { t } = usePreferences();
  const good = ['verified', 'active', 'paid'].includes(status),
    bad = ['rejected', 'inactive', 'reversed'].includes(status);
  const labels: Record<string, [string, string]> = {
    pending: ['Pending verification', 'सत्यापन बाकी'],
    verified: ['Verified', 'सत्यापित'],
    rejected: ['Rejected', 'अस्वीकृत'],
    reversed: ['Reversed', 'वापस किया गया'],
    active: ['Active', 'सक्रिय'],
    invited: ['Invited', 'आमंत्रित'],
    inactive: ['Inactive', 'निष्क्रिय'],
    draft: ['Draft', 'मसौदा'],
    paid: ['Paid', 'भुगतान किया'],
  };
  const Icon = good ? Check : bad ? TriangleAlert : Clock3;
  return (
    <Badge
      className={`gap-1.5 border-0 px-2.5 py-1 font-normal ${good ? 'bg-success-background text-success' : bad ? 'bg-danger-background text-destructive' : 'bg-warning-background text-warning'}`}
    >
      <Icon className="size-3" />
      {labels[status] ? t(...labels[status]) : status}
    </Badge>
  );
}
export function Feedback({
  message,
  error = false,
}: {
  message: string;
  error?: boolean;
}) {
  if (!message) return null;
  return (
    <Alert
      className={
        error
          ? 'border-destructive/30 bg-danger-background text-destructive'
          : 'border-success/20 bg-success-background text-success'
      }
    >
      <AlertDescription
        role={error ? 'alert' : 'status'}
        className="text-inherit"
      >
        {message}
      </AlertDescription>
    </Alert>
  );
}
export function Form({
  children,
  onSubmit,
  submit = 'Save',
  pending = false,
}: {
  children: ReactNode;
  onSubmit: (data: FormData) => Promise<void> | void;
  submit?: string;
  pending?: boolean;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function handle(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      await onSubmit(new FormData(e.currentTarget));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Something went wrong. Please retry.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={handle} className="space-y-5">
      {children}
      <Feedback message={error} error />
      <Button
        type="submit"
        disabled={busy || pending}
        className="h-12 w-full text-base"
      >
        {busy || pending ? 'Saving…' : submit}
      </Button>
    </form>
  );
}
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto p-6 sm:max-w-lg">
        <DialogTitle className="pr-7 text-2xl">{title}</DialogTitle>
        <DialogDescription>
          {description ?? 'Changes apply to this sample frontend only.'}
        </DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function Back({ href = '/' }: { href?: string }) {
  return (
    <Button
      variant="ghost"
      className="mb-5 h-11 px-0"
      render={<Link href={href} />}
    >
      <ArrowLeft className="mr-2 size-4" />
      Back
    </Button>
  );
}
export const value = (f: FormData, k: string) =>
  (typeof f.get(k) === 'string' ? (f.get(k) as string) : '').trim();
export function Choice({
  name,
  children,
  defaultValue,
  required = false,
}: {
  name: string;
  children: ReactNode;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <select
      id={name}
      name={name}
      defaultValue={defaultValue}
      required={required}
      className="h-12 w-full rounded-lg border bg-background px-3 text-base outline-ring"
    >
      {children}
    </select>
  );
}
