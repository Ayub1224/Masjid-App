'use client';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/data/api';
import type { Member, Expense, Notice } from '@/lib/data/domain';
import { parseAmount } from '@/lib/data/domain';
import { useDemoRole } from '@/components/app/providers';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Modal, Form, Field, Choice } from '@/components/app/primitives';
export function OpeningBalance() {
  const { role, demo } = useDemoRole();
  const cache = useQueryClient();
  const [open, setOpen] = useState(false);
  if (demo || role !== 'owner') return null;
  return (
    <>
      <Button
        variant="outline"
        className="mb-5 h-11"
        onClick={() => setOpen(true)}
      >
        Set initial ledger balance
      </Button>
      <Modal
        title="Initial ledger balance"
        description="Only available before the first financial entry. Later bank observations do not change this ledger."
        open={open}
        onOpenChange={setOpen}
      >
        <Form
          submit="Record initial balances"
          onSubmit={async (f) => {
            const amount = (key: string) => {
              const raw = f.get(key);
              return raw === '0' || raw === '0.00'
                ? 0
                : parseAmount(typeof raw === 'string' ? raw : '');
            };
            const date = f.get('date');
            await api(
              'command',
              {
                type: 'opening',
                amountPaise: amount('bank'),
                cashPaise: amount('cash'),
                date: typeof date === 'string' ? date : '',
              },
              { headers: { 'Idempotency-Key': crypto.randomUUID() } },
            );
            await cache.invalidateQueries({ queryKey: ['mosque-data'] });
            setOpen(false);
          }}
        >
          <Field
            name="bank"
            label="Initial bank balance (₹)"
            inputMode="decimal"
            required
          />
          <Field
            name="cash"
            label="Initial cash balance (₹)"
            inputMode="decimal"
            required
          />
          <Field name="date" label="As of date" type="date" required />
        </Form>
      </Modal>
    </>
  );
}
export function RecordActions({
  record,
  kind,
}: {
  record: Member | Expense | Notice;
  kind: 'member' | 'expense' | 'notice';
}) {
  const { demo } = useDemoRole();
  const cache = useQueryClient();
  const [mode, setMode] = useState<'edit' | 'delete' | null>(null);
  if (
    demo ||
    (kind === 'member' && (record as Member).status === 'invited') ||
    (kind === 'expense' && (record as Expense).status !== 'draft')
  )
    return null;
  const member = record as Member,
    expense = record as Expense,
    notice = record as Notice;
  return (
    <>
      <Button
        variant="outline"
        className="h-11"
        onClick={() => setMode('edit')}
      >
        Edit
      </Button>
      {kind !== 'member' && (
        <Button
          variant="ghost"
          className="h-11"
          onClick={() => setMode('delete')}
        >
          Delete
        </Button>
      )}
      <Modal
        open={!!mode}
        onOpenChange={(v) => {
          if (!v) setMode(null);
        }}
        title={`${mode === 'delete' ? 'Delete' : 'Edit'} ${kind}`}
        description={
          mode === 'delete'
            ? 'Confirm removal of this record. Posted financial entries are preserved.'
            : 'Changes are saved to the mosque register.'
        }
      >
        <Form
          submit={mode === 'delete' ? 'Delete record' : 'Save changes'}
          onSubmit={async (f) => {
            const val = (key: string) =>
              typeof f.get(key) === 'string' ? (f.get(key) as string) : '';
            let body: Record<string, unknown> = {
              type: `${mode === 'delete' ? 'delete' : 'update'}-${kind}`,
              id: record.id,
            };
            if (mode === 'edit') {
              if (kind === 'member')
                body = {
                  ...body,
                  name: val('name'),
                  phone: val('phone'),
                  address: val('address'),
                };
              if (kind === 'expense')
                body = {
                  ...body,
                  amountPaise: parseAmount(val('amount')),
                  date: val('date'),
                  category: val('category'),
                  description: val('description'),
                  account: val('account'),
                };
              if (kind === 'notice')
                body = {
                  ...body,
                  title: val('title'),
                  text: val('body'),
                  hindiTitle: val('hindiTitle'),
                  hindiBody: val('hindiBody'),
                  date: val('date'),
                  published: notice.published,
                  image: val('image'),
                };
            }
            await api('command', body, {
              headers: { 'Idempotency-Key': crypto.randomUUID() },
            });
            await cache.invalidateQueries({ queryKey: ['mosque-data'] });
            setMode(null);
          }}
        >
          {mode === 'delete' ? (
            <p>
              Delete “{kind === 'notice' ? notice.title : expense.description}”?
            </p>
          ) : kind === 'member' ? (
            <>
              <Field
                label="Name"
                name="name"
                defaultValue={member.name}
                required
                maxLength={120}
              />
              <Field
                label="Phone (include country code)"
                name="phone"
                defaultValue={member.phone}
                maxLength={25}
              />
              <Field
                label="Address"
                name="address"
                defaultValue={member.address}
                maxLength={500}
              />
              <p className="text-sm">
                Email and role changes require the invitation/access workflow.
              </p>
            </>
          ) : kind === 'expense' ? (
            <>
              <Field
                label="Description"
                name="description"
                defaultValue={expense.description}
                required
                maxLength={500}
              />
              <Field
                label="Amount (₹)"
                name="amount"
                defaultValue={expense.amount / 100}
                required
                inputMode="decimal"
              />
              <Field
                label="Date"
                name="date"
                type="date"
                defaultValue={expense.date}
                required
              />
              <Field
                label="Category"
                name="category"
                defaultValue={expense.category}
                required
                maxLength={80}
              />
              <Field label="Account" name="account">
                <Choice name="account" defaultValue={expense.account}>
                  <option>Bank</option>
                  <option>Cash</option>
                </Choice>
              </Field>
            </>
          ) : (
            <>
              <Field
                label="Title"
                name="title"
                defaultValue={notice.title}
                required
                maxLength={160}
              />
              <Field label="Description" name="body">
                <Textarea
                  name="body"
                  defaultValue={notice.body}
                  required
                  maxLength={4000}
                />
              </Field>
              <Field
                label="Date"
                name="date"
                type="date"
                defaultValue={notice.date}
                required
              />
              <Field
                label="Image URL"
                name="image"
                type="url"
                defaultValue={notice.image}
                maxLength={2048}
              />
              <Field
                label="Hindi title"
                name="hindiTitle"
                defaultValue={notice.hindiTitle}
                maxLength={160}
              />
              <Field label="Hindi description" name="hindiBody">
                <Textarea
                  name="hindiBody"
                  defaultValue={notice.hindiBody}
                  maxLength={4000}
                />
              </Field>
            </>
          )}
        </Form>
      </Modal>
    </>
  );
}
