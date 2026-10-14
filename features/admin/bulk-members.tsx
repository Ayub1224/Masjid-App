'use client';
import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { bulkMembersInput } from '@/lib/bulk-members';
import { api } from '@/lib/data/api';
import { phoneInputValue } from '@/lib/administrator-invitation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Panel, Feedback, Form } from '@/components/app/primitives';
type Row = { phone: string; name: string; address: string; pin: string };
const empty = (): Row => ({ phone: '', name: '', address: '', pin: '0000' });
export function BulkMembers({
  onDone,
  onCancel,
}: {
  onDone: (count: number) => void;
  onCancel: () => void;
}) {
  const cache = useQueryClient();
  const [rows, setRows] = useState<Row[]>([empty()]);
  const [paste, setPaste] = useState('');
  const [error, setError] = useState('');
  const [review, setReview] = useState(false);
  const [pending, setPending] = useState(false);
  const request = useRef({ body: '', key: '' });
  function validate() {
    const parsed = bulkMembersInput.safeParse({ members: rows });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw Error(
        `${typeof issue.path[1] === 'number' ? `Row ${issue.path[1] + 1}: ` : ''}${issue.message}`,
      );
    }
    return parsed.data;
  }
  return (
    <Panel className="mb-6 space-y-5">
      <div>
        <h2 className="font-heading text-2xl">Add members in bulk</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Up to 100 members per batch. The default temporary PIN is 0000; you
          can change it per row. Each member signs in with their phone number
          and temporary PIN, then must choose a new PIN.
        </p>
      </div>
      <Feedback message={error} error />
      {review ? (
        <>
          <output className="block">
            Ready to create {rows.length} member accounts. Check the names and
            phone numbers below before saving.
          </output>
          <div className="max-h-72 overflow-auto rounded-lg border">
            <ul className="divide-y">
              {rows.map((row, index) => (
                <li key={index} className="p-3">
                  <p className="font-medium">
                    {row.name} · {row.phone}
                  </p>
                  <p className="text-sm text-muted-foreground">{row.address}</p>
                </li>
              ))}
            </ul>
          </div>
          <Form
            submit={`Create ${rows.length} members`}
            pending={pending}
            onSubmit={async () => {
              const input = validate();
              const body = JSON.stringify(input);
              if (request.current.body !== body)
                request.current = { body, key: crypto.randomUUID() };
              setPending(true);
              try {
                const result = await api<{ count: number }>(
                  'members/bulk-add',
                  input,
                  { headers: { 'Idempotency-Key': request.current.key } },
                );
                await cache.invalidateQueries({ queryKey: ['mosque-data'] });
                onDone(result.count);
              } finally {
                setPending(false);
              }
            }}
          >
            <p className="text-sm text-muted-foreground">
              A duplicate number or invalid row stops the whole batch. No
              partial accounts will be created.
            </p>
          </Form>
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => setReview(false)}
          >
            Edit rows
          </Button>
        </>
      ) : (
        <>
          <details className="rounded-lg border p-4">
            <summary className="cursor-pointer font-medium">
              Paste from a spreadsheet
            </summary>
            <p className="my-3 text-sm text-muted-foreground">
              Copy up to 100 rows, without a header, in this order: phone, name,
              address, PIN (optional). Columns must be separated by tabs. Blank
              PINs become 0000.
            </p>
            <Textarea
              aria-label="Spreadsheet rows"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              rows={5}
            />
            <Button
              className="mt-3"
              variant="outline"
              onClick={() => {
                const lines = paste
                  .trim()
                  .split(/\r?\n/)
                  .filter((v) => v.trim());
                if (
                  !paste.trim() ||
                  lines.length > 100 ||
                  lines.some((line) => {
                    const n = line.split('\t').length;
                    return n < 3 || n > 4;
                  })
                ) {
                  setError(
                    'Paste 1–100 rows with three or four tab-separated columns.',
                  );
                  return;
                }
                setRows(
                  lines.map((line) => {
                    const [phone, name, address, pin] = line.split('\t');
                    return {
                      phone: phone.trim(),
                      name: name.trim(),
                      address: address.trim(),
                      pin: pin?.trim() || '0000',
                    };
                  }),
                );
                setPaste('');
                setError('');
              }}
            >
              Use pasted rows
            </Button>
          </details>
          <div className="max-h-[60vh] space-y-6 overflow-auto p-1">
            {rows.map((row, index) => (
              <fieldset
                key={index}
                className="rounded-xl border px-4 pb-5 pt-4 sm:px-6 sm:pb-6 sm:pt-5"
              >
                <legend className="px-2 text-sm font-medium">
                  Member {index + 1}
                </legend>
                <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
                  {(['phone', 'name', 'address', 'pin'] as const).map((key) => (
                    <label
                      key={key}
                      className="flex min-w-0 flex-col gap-2.5 text-sm"
                    >
                      <span className="font-medium leading-5">
                        {
                          {
                            phone: 'Phone number',
                            name: 'Full name',
                            address: 'Address',
                            pin: 'Temporary four-digit PIN',
                          }[key]
                        }
                      </span>
                      <Input
                        className="h-12 px-3 text-base"
                        type={
                          key === 'pin'
                            ? 'password'
                            : key === 'phone'
                              ? 'tel'
                              : 'text'
                        }
                        placeholder={
                          key === 'phone'
                            ? '9876543210 or +919876543210'
                            : undefined
                        }
                        inputMode={
                          key === 'pin'
                            ? 'numeric'
                            : key === 'phone'
                              ? 'tel'
                              : 'text'
                        }
                        autoComplete="off"
                        maxLength={
                          key === 'pin'
                            ? 4
                            : key === 'phone'
                              ? 25
                              : key === 'name'
                                ? 100
                                : 500
                        }
                        value={row[key]}
                        onChange={(e) =>
                          setRows((previous) =>
                            previous.map((r, i) =>
                              i === index
                                ? {
                                    ...r,
                                    [key]:
                                      key === 'phone'
                                        ? phoneInputValue(e.target.value)
                                        : key === 'pin'
                                          ? e.target.value.replace(/\D/g, '')
                                          : e.target.value,
                                  }
                                : r,
                            ),
                          )
                        }
                      />
                    </label>
                  ))}
                </div>
                <Button
                  className="mt-5 h-11 px-3"
                  variant="ghost"
                  disabled={rows.length === 1}
                  onClick={() => setRows(rows.filter((_, i) => i !== index))}
                >
                  Remove row {index + 1}
                </Button>
              </fieldset>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              className="h-11 px-4"
              disabled={rows.length >= 100}
              onClick={() => setRows([...rows, empty()])}
            >
              Add another row
            </Button>
            <Button
              className="h-11 px-4"
              onClick={() => {
                try {
                  validate();
                  setError('');
                  setReview(true);
                } catch (caught) {
                  setError((caught as Error).message);
                }
              }}
            >
              Review {rows.length} members
            </Button>
          </div>
        </>
      )}
      <Button variant="ghost" disabled={pending} onClick={onCancel}>
        Cancel bulk addition
      </Button>
    </Panel>
  );
}
