'use client';
import { receivingDetails } from '@/lib/receiving-details';
import { api, invitationLinks, BackendError } from '@/lib/data/api';
import { RecordActions, OpeningBalance } from './record-actions';
import { initialPrayers } from '@/config/mosque';
/* oxlint-disable next/no-img-element -- User-selected data URLs must remain local previews, without an image optimizer. */
import Link from 'next/link';
import { useState } from 'react';
import {
  invitationInput,
  paymentPermissions,
} from '@/lib/administrator-invitation';
import {
  Users,
  Plus,
  ArrowRight,
  ClipboardCheck,
  Wallet,
  Landmark,
  Copy,
  Share2,
  ShieldCheck,
  Check,
  FileImage,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { DataTable } from '@/components/app/data-table';
import {
  PageTitle,
  Panel,
  Disclosure,
  Field,
  Form,
  Choice,
  Modal,
  Status,
  Feedback,
  value,
} from '@/components/app/primitives';
import { useMosqueAction, useIdentity } from '@/components/app/providers';
import {
  balances,
  money,
  parseAmount,
  validateDate,
  can,
  permissions,
  permissionLabels,
  type DemoState,
  type Member,
  type Payment,
  type Expense,
  type Permission,
} from '@/lib/data/domain';
import type { ColumnDef } from '@tanstack/react-table';
import { readImage } from '@/features/mosque/contributions';
export function AdminOverview({ data }: { data: DemoState }) {
  const b = balances(data);
  const pending = data.payments.filter((p) => p.status === 'pending');
  const { role, session } = useIdentity();
  const grants = session?.profile?.permissions ?? [];
  return (
    <>
      <PageTitle
        title="Assalamu alaikum"
        description="A little care for your mosque, every day."
      />
      <div className="space-y-6">
        {can(role, 'verify', grants) && (
          <div className="flex flex-wrap items-center justify-between gap-5 rounded-2xl bg-primary p-6 text-primary-foreground">
            <div className="flex gap-4">
              <ClipboardCheck className="mt-1 size-6 opacity-80" />
              <div>
                <p className="text-xl font-medium">
                  {pending.length
                    ? `${pending.length} payment${pending.length === 1 ? '' : 's'} to review`
                    : 'All caught up'}
                </p>
                <p className="mt-1 text-sm opacity-75">
                  {pending.length
                    ? 'A member is waiting for verification.'
                    : 'No contributions are waiting for verification.'}
                </p>
              </div>
            </div>
            <Button
              variant="secondary"
              className="h-11"
              render={<Link href="/admin/payments" />}
            >
              Review payments
              <ArrowRight />
            </Button>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ['Recorded total', b.total, Wallet],
            ['Bank', b.bank, Landmark],
            ['Cash', b.cash, Wallet],
          ].map(([label, amount, Icon]) => {
            const I = Icon as typeof Wallet;
            return (
              <Panel key={String(label)}>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>{String(label)}</span>
                  <I className="size-4" />
                </div>
                <p className="mt-3 text-3xl font-medium tabular-nums">
                  {money(Number(amount))}
                </p>
              </Panel>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-3">
          {can(role, 'members', grants) && (
            <Button
              variant="outline"
              className="h-12"
              render={<Link href="/admin/members" />}
            >
              <Users />
              Manage members
            </Button>
          )}
          {can(role, 'record', grants) && (
            <Button
              variant="outline"
              className="h-12"
              render={<Link href="/admin/cash" />}
            >
              <Plus />
              Record cash
            </Button>
          )}
          {can(role, 'expenses', grants) && (
            <Button
              variant="outline"
              className="h-12"
              render={<Link href="/admin/balance" />}
            >
              <Landmark />
              Check bank balance
            </Button>
          )}
        </div>
        <Disclosure title="Recent activity">
          {data.audit.length ? (
            <ul className="space-y-3">
              {data.audit.slice(0, 10).map((entry, i) => (
                <li
                  key={i}
                  className="break-words text-sm text-muted-foreground"
                >
                  {entry}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">
              No recent activity to display.
            </p>
          )}
        </Disclosure>
        <p className="text-xs text-muted-foreground">
          Bank figures reflect the mosque register, not a live bank connection.
        </p>
      </div>
    </>
  );
}
export function Members({
  data,
  administrators = false,
}: {
  data: DemoState;
  administrators?: boolean;
}) {
  const action = useMosqueAction();
  const { role: actorRole } = useIdentity();
  const [open, setOpen] = useState(false),
    [created, setCreated] = useState(''),
    [editing, setEditing] = useState<Member | null>(null),
    [notice, setNotice] = useState(''),
    [noticeError, setNoticeError] = useState(false);
  const rows = data.members.filter((m) =>
    administrators ? m.role !== 'member' : m.role === 'member',
  );
  async function change(id: string, status: 'inactive' | 'invited') {
    try {
      setNoticeError(false);
      const pending = ['invited', 'expired'].includes(
        rows.find((m) => m.id === id)?.status ?? '',
      );
      await action.mutateAsync({ type: 'member-status', id, status });
      setNotice(
        pending
          ? 'Invitation revoked.'
          : status === 'inactive'
            ? 'Access deactivated.'
            : 'Access reactivated.',
      );
    } catch (e) {
      setNoticeError(true);
      setNotice((e as Error).message);
    }
  }
  const cols: ColumnDef<Member, unknown>[] = [
    {
      accessorKey: 'name',
      header: 'Name',
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.name}</p>
          <p className="text-xs text-muted-foreground">
            {row.original.email || row.original.phone}
          </p>
        </div>
      ),
    },
    {
      accessorKey: administrators ? 'role' : 'address',
      header: administrators ? 'Role' : 'Address',
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <Status status={row.original.status} />,
    },
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex gap-2">
          {(row.original.role !== 'owner' || actorRole === 'super-admin') && (
            <RecordActions record={row.original} kind="member" />
          )}
          {administrators &&
            (row.original.role === 'admin' ||
              (row.original.role === 'owner' && actorRole === 'super-admin')) &&
            row.original.status === 'active' && (
              <Button
                variant="ghost"
                className="h-11"
                onClick={() => setEditing(row.original)}
              >
                Permissions
              </Button>
            )}
          {(row.original.role !== 'owner' || actorRole === 'super-admin') && (
            <Button
              variant="ghost"
              className="h-11"
              onClick={() =>
                change(
                  row.original.id,
                  row.original.status === 'inactive' ? 'invited' : 'inactive',
                )
              }
            >
              {row.original.status === 'inactive'
                ? 'Reactivate'
                : ['invited', 'expired'].includes(row.original.status)
                  ? 'Revoke'
                  : 'Deactivate'}
            </Button>
          )}
        </div>
      ),
    },
  ];
  const [seatTime] = useState(() => Date.now());
  const occupied = rows.filter(
    (m) => m.status !== 'inactive' && (!m.expiresAt || m.expiresAt > seatTime),
  ).length;
  return (
    <>
      <PageTitle
        title={administrators ? 'Administrators' : 'Members'}
        description={
          administrators
            ? 'One owner. Four admins. Permissions stay in your hands.'
            : 'Your local community, one person at a time.'
        }
        action={
          <Button
            className="h-11"
            disabled={administrators && occupied >= 5}
            onClick={() => {
              setOpen(true);
              setCreated('');
            }}
          >
            <Plus />
            {administrators ? 'Add administrator' : 'Add member'}
          </Button>
        }
      />
      {administrators && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <Panel>
            <ShieldCheck className="mb-3 size-5 text-primary" />
            <p className="font-medium">Owner seat</p>
            <p className="text-sm text-muted-foreground">
              {rows.some(
                (m) =>
                  m.role === 'owner' &&
                  ['active', 'invited'].includes(m.status),
              )
                ? '1 of 1 occupied'
                : 'Available'}
            </p>
          </Panel>
          <Panel>
            <Users className="mb-3 size-5 text-primary" />
            <p className="font-medium">Admin seats</p>
            <p className="text-sm text-muted-foreground">
              {
                rows.filter(
                  (m) =>
                    m.role === 'admin' &&
                    m.status !== 'inactive' &&
                    (!m.expiresAt || m.expiresAt > seatTime),
                ).length
              }{' '}
              of 4 occupied · pending invites reserve a seat
            </p>
          </Panel>
        </div>
      )}
      <Feedback message={notice} error={noticeError} />
      <DataTable
        data={rows}
        columns={cols}
        searchLabel={
          administrators ? 'Search administrators' : 'Search members'
        }
      />
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={
          created
            ? 'Invitation ready'
            : administrators
              ? 'Add administrator'
              : 'Add member'
        }
        description="Owners set a password and MFA. Admins set a 6-digit PIN; members set a 4-digit PIN."
      >
        {created ? (
          <InviteResult
            id={created}
            name={data.members.find((m) => m.id === created)?.name}
          />
        ) : (
          <InvitationForm
            data={data}
            administrators={administrators}
            onCreated={setCreated}
          />
        )}
      </Modal>
      <Modal
        open={!!editing}
        onOpenChange={(v) => {
          if (!v) setEditing(null);
        }}
        title="Administrator permissions"
      >
        {editing && (
          <PermissionEditor member={editing} onDone={() => setEditing(null)} />
        )}
      </Modal>
    </>
  );
}
function InvitationForm({
  data,
  administrators,
  onCreated,
}: {
  data: DemoState;
  administrators: boolean;
  onCreated: (id: string) => void;
}) {
  const action = useMosqueAction();
  const { role: actorRole } = useIdentity();
  const [selectedRole, setSelectedRole] = useState<
    'admin' | 'owner' | 'member'
  >(administrators ? 'admin' : 'member');
  const [grants, setGrants] = useState<Permission[]>(
    permissions.filter((p) => !paymentPermissions.includes(p)),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const ownerOccupied = data.members.some(
    (m) => m.role === 'owner' && ['active', 'invited'].includes(m.status),
  );
  const clearError = (name: string) =>
    setErrors((current) => ({ ...current, [name]: '' }));
  return (
    <Form
      noValidate
      submit="Create invitation"
      onSubmit={async (f) => {
        const result = invitationInput.safeParse({
          name: value(f, 'name'),
          email: value(f, 'email'),
          phone: value(f, 'phone'),
          address: value(f, 'address'),
          role: selectedRole,
          permissions: administrators ? grants : [],
        });
        if (!result.success) {
          const next: Record<string, string> = {};
          for (const issue of result.error.issues)
            next[String(issue.path[0])] ??= issue.message;
          setErrors(next);
          document.getElementById(Object.keys(next)[0])?.focus();
          return;
        }
        setErrors({});
        try {
          const r = await action.mutateAsync({
            type: 'invite',
            member: result.data,
          });
          onCreated(r.id);
        } catch (error) {
          if (
            error instanceof BackendError &&
            ['PHONE_IN_USE', 'EMAIL_IN_USE'].includes(error.code)
          ) {
            const field = error.code === 'PHONE_IN_USE' ? 'phone' : 'email';
            setErrors({ [field]: error.message });
            document.getElementById(field)?.focus();
            return;
          }
          throw error;
        }
      }}
    >
      {administrators && (
        <Field name="role" label="Role" required>
          <Choice
            name="role"
            value={selectedRole}
            onChange={(role) => {
              const next = role as 'admin' | 'owner';
              setSelectedRole(next);
              setGrants(
                next === 'owner'
                  ? [...permissions]
                  : permissions.filter((p) => !paymentPermissions.includes(p)),
              );
              setErrors({});
            }}
          >
            <option value="admin">Admin</option>
            {actorRole === 'super-admin' && (
              <option value="owner" disabled={ownerOccupied}>
                Owner{ownerOccupied ? ' — seat occupied' : ''}
              </option>
            )}
          </Choice>
        </Field>
      )}
      <Field
        name="name"
        label="Full name"
        required
        maxLength={100}
        error={errors.name}
        onChange={() => clearError('name')}
      />
      {administrators && (
        <Field
          name="email"
          label={
            selectedRole === 'admin'
              ? 'Email address (optional)'
              : 'Email address'
          }
          required={selectedRole === 'owner'}
          type="email"
          maxLength={254}
          error={errors.email}
          onChange={() => clearError('email')}
        />
      )}
      <Field
        name="phone"
        label="Indian mobile number"
        required
        type="tel"
        inputMode="tel"
        maxLength={25}
        placeholder="9876543210 or +91 9876543210"
        error={errors.phone}
        onChange={() => clearError('phone')}
      />
      <Field
        name="address"
        label="Address"
        required
        maxLength={500}
        error={errors.address}
        onChange={() => clearError('address')}
      />
      {administrators && (
        <>
          <Disclosure title="Permissions">
            <PermissionSwitches
              grants={grants}
              onChange={setGrants}
              role={selectedRole}
            />
          </Disclosure>
          <p className="text-xs text-muted-foreground">
            Owners use a password and authenticator. Admins use a 6-digit PIN.
            Payment permissions are unavailable to admins.
          </p>
        </>
      )}
    </Form>
  );
}

function PermissionSwitches({
  grants,
  onChange,
  role = 'owner',
}: {
  role?: string;
  grants: Permission[];
  onChange: (p: Permission[]) => void;
}) {
  return (
    <div className="space-y-1">
      {permissions.map((p) => (
        <label
          key={p}
          htmlFor={`grant-${p}`}
          className="flex min-h-12 items-center justify-between gap-4"
        >
          <span>{permissionLabels[p]}</span>
          <Switch
            id={`grant-${p}`}
            disabled={role === 'admin' && paymentPermissions.includes(p)}
            checked={
              !(role === 'admin' && paymentPermissions.includes(p)) &&
              grants.includes(p)
            }
            onCheckedChange={(checked) =>
              onChange(checked ? [...grants, p] : grants.filter((g) => g !== p))
            }
          />
        </label>
      ))}
    </div>
  );
}
function PermissionEditor({
  member,
  onDone,
}: {
  member: Member;
  onDone: () => void;
}) {
  const [grants, setGrants] = useState(
    member.permissions.filter(
      (p) => member.role !== 'admin' || !paymentPermissions.includes(p),
    ),
  );
  const action = useMosqueAction();
  return (
    <Form
      submit="Save permissions"
      onSubmit={async () => {
        await action.mutateAsync({
          type: 'permissions',
          id: member.id,
          permissions: grants,
        });
        onDone();
      }}
    >
      <PermissionSwitches
        grants={grants}
        onChange={setGrants}
        role={member.role}
      />
    </Form>
  );
}
function InviteResult({ id, name }: { id: string; name?: string }) {
  const [notice, setNotice] = useState('');
  const url =
    typeof window === 'undefined' ? '' : (invitationLinks.get(id) ?? '');
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setNotice('Invitation link copied.');
    } catch {
      setNotice('Select and copy the link below.');
    }
  }
  if (!url)
    return (
      <p className="text-sm text-muted-foreground">
        The invitation link is unavailable. Generate a new invitation from the
        member record.
      </p>
    );
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 text-success">
        <Check />
        {name ? `Invitation ready for ${name}` : 'Invitation ready'}
      </div>
      <Input
        readOnly
        aria-label="Invitation link"
        value={url}
        className="h-12"
      />
      <div className="flex gap-3">
        <Button className="h-11 flex-1" onClick={copy}>
          <Copy />
          Copy link
        </Button>
        <Button
          variant="outline"
          className="h-11 flex-1"
          onClick={async () => {
            try {
              if (navigator.share)
                await navigator.share({
                  title: 'Mosque invitation',
                  text: 'Use this invitation to join your mosque.',
                  url,
                });
              else await copy();
            } catch {
              setNotice('Sharing cancelled or unavailable.');
            }
          }}
        >
          <Share2 />
          Share
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Invitations expire after 48 hours. Share this private link only with the
        invited person.
      </p>
      <Feedback message={notice} />
    </div>
  );
}
export function Payments({ data }: { data: DemoState }) {
  const { role } = useIdentity();
  const action = useMosqueAction();
  const [selected, setSelected] = useState<Payment | null>(null),
    [filter, setFilter] = useState('pending'),
    [reject, setReject] = useState(false),
    [bulkReject, setBulkReject] = useState(false),
    [selectedIds, setSelectedIds] = useState<string[]>([]),
    [message, setMessage] = useState('');
  const p = selected
    ? data.payments.find((p) => p.id === selected.id)
    : undefined;
  const columns: ColumnDef<Payment, unknown>[] = [
    {
      id: 'select',
      header: ({ table }) => {
        const available = table
          .getFilteredRowModel()
          .rows.map((r) => r.original)
          .filter((p) => p.status === 'pending')
          .slice(0, 25);
        return (
          <Checkbox
            aria-label="Select up to 25 matching pending payments"
            checked={
              available.length > 0 &&
              available.every((p) => selectedIds.includes(p.id))
            }
            onCheckedChange={(checked) =>
              setSelectedIds(checked ? available.map((p) => p.id) : [])
            }
          />
        );
      },
      cell: ({ row }) => (
        <Checkbox
          aria-label={`Select payment from ${data.memberNames?.[row.original.memberId] ?? data.members.find((member) => member.id === row.original.memberId)?.name ?? 'member'}`}
          checked={selectedIds.includes(row.original.id)}
          disabled={
            row.original.status !== 'pending' ||
            (!selectedIds.includes(row.original.id) && selectedIds.length >= 25)
          }
          onCheckedChange={(checked) =>
            setSelectedIds((current) =>
              checked
                ? [...new Set([...current, row.original.id])]
                : current.filter((id) => id !== row.original.id),
            )
          }
        />
      ),
    },
    {
      id: 'member',
      accessorFn: (p) =>
        data.memberNames?.[p.memberId] ??
        data.members.find((m) => m.id === p.memberId)?.name ??
        'Member',
      header: 'Member',
    },
    {
      accessorKey: 'amount',
      header: 'Amount',
      cell: ({ row }) => money(row.original.amount),
    },
    { accessorKey: 'date', header: 'Date' },
    { accessorKey: 'method', header: 'Method' },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <Status status={row.original.status} />,
    },
    {
      id: 'review',
      header: '',
      cell: ({ row }) => (
        <Button
          variant="outline"
          className="h-11"
          onClick={() => {
            setSelected(row.original);
            setReject(false);
            setMessage('');
          }}
        >
          View
          <ArrowRight className="size-3" />
        </Button>
      ),
    },
  ];
  return (
    <>
      <PageTitle
        title="Payments"
        description="Verify received money before adding it to the register."
      />
      <div className="mb-5 flex gap-2">
        {['pending', 'all'].map((f) => (
          <Button
            key={f}
            variant={filter === f ? 'default' : 'outline'}
            className="h-11"
            onClick={() => setFilter(f)}
          >
            {f === 'pending' ? 'Awaiting review' : 'All payments'}
          </Button>
        ))}
      </div>
      {filter === 'pending' && (
        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
          <span className="mr-auto text-sm text-muted-foreground">
            {selectedIds.length} selected
          </span>
          <Button
            className="h-11"
            disabled={!selectedIds.length || action.isPending}
            onClick={async () => {
              try {
                await action.mutateAsync({
                  type: 'bulk-review',
                  ids: selectedIds,
                  status: 'verified',
                });
                setSelectedIds([]);
                setMessage('');
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          >
            <Check /> Approve selected
          </Button>
          <Button
            variant="destructive"
            className="h-11"
            disabled={!selectedIds.length || action.isPending}
            onClick={() => setBulkReject(true)}
          >
            Reject selected
          </Button>
        </div>
      )}
      <DataTable
        data={data.payments.filter(
          (p) => filter === 'all' || p.status === 'pending',
        )}
        columns={columns}
      />
      <Feedback message={message} error />
      <Modal
        open={!!p}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title="Payment review"
        description="Check the actual incoming bank transaction before approving."
      >
        {p && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-3xl font-medium">{money(p.amount)}</span>
              <Status status={p.status} />
            </div>
            <p>
              {data.memberNames?.[p.memberId] ??
                data.members.find((m) => m.id === p.memberId)?.name}
            </p>
            <p className="text-sm text-muted-foreground">
              {p.date} · {p.purpose} · {p.method}
            </p>
            <p className="break-all text-sm">
              Reference: {p.reference || 'Cash'}
            </p>
            {p.evidencePath && (
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    const file = await api<{ url: string }>('files/download', {
                      bucket: 'payment-evidence',
                      path: p.evidencePath,
                    });
                    window.open(file.url, '_blank', 'noopener,noreferrer');
                  } catch (e) {
                    setMessage((e as Error).message);
                  }
                }}
              >
                Open payment screenshot
              </Button>
            )}
            {p.evidence ? (
              <img
                alt="Submitted screenshot"
                src={p.evidence}
                className="max-h-60 w-full rounded-lg object-contain"
              />
            ) : (
              <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted text-muted-foreground">
                <FileImage />
                <span className="text-sm">No payment screenshot available</span>
              </div>
            )}
            {p.reason && <Feedback message={p.reason} error />}
            {p.status === 'pending' && (
              <>
                {reject ? (
                  <Form
                    submit="Reject submission"
                    onSubmit={async (f) => {
                      await action.mutateAsync({
                        type: 'review',
                        id: p.id,
                        status: 'rejected',
                        reason: value(f, 'reason'),
                      });
                      setSelected(null);
                    }}
                  >
                    <Field
                      name="reason"
                      label="Reason for rejection"
                      required
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-11"
                      onClick={() => setReject(false)}
                    >
                      Cancel
                    </Button>
                  </Form>
                ) : (
                  <>
                    <Button
                      className="h-12"
                      disabled={action.isPending}
                      onClick={async () => {
                        try {
                          await action.mutateAsync({
                            type: 'review',
                            id: p.id,
                            status: 'verified',
                          });
                          setSelected(null);
                        } catch (e) {
                          setMessage((e as Error).message);
                        }
                      }}
                    >
                      Verify received payment
                    </Button>
                    <Button
                      variant="destructive"
                      className="h-11"
                      onClick={() => setReject(true)}
                    >
                      Reject submission
                    </Button>
                  </>
                )}
              </>
            )}
            {role === 'owner' && p.status === 'verified' && (
              <Disclosure title="Reverse this entry">
                <Form
                  submit="Reverse with history preserved"
                  onSubmit={async (f) => {
                    await action.mutateAsync({
                      type: 'reverse',
                      kind: 'payment',
                      id: p.id,
                      reason: value(f, 'reason'),
                    });
                    setSelected(null);
                  }}
                >
                  <Field name="reason" label="Correction reason" required />
                </Form>
              </Disclosure>
            )}
            <Feedback message={message} error />
          </>
        )}
      </Modal>
      <Modal
        open={bulkReject}
        onOpenChange={setBulkReject}
        title="Reject selected payments"
        description="A shared reason will be saved for every selected submission."
      >
        <Form
          submit="Reject selected"
          onSubmit={async (form) => {
            const reason = value(form, 'reason');
            await action.mutateAsync({
              type: 'bulk-review',
              ids: selectedIds,
              status: 'rejected',
              reason,
            });
            setSelectedIds([]);
            setBulkReject(false);
          }}
        >
          <Field
            name="reason"
            label="Reason for rejection"
            required
            maxLength={500}
          />
        </Form>
      </Modal>
    </>
  );
}
export function Cash({ data }: { data: DemoState }) {
  const action = useMosqueAction();
  const [saved, setSaved] = useState(false);
  return (
    <div className="max-w-xl">
      <PageTitle
        title="Record cash"
        description="For contributions received in person."
      />
      {saved ? (
        <Panel>
          <Feedback message="Cash contribution recorded." />
          <Button className="mt-5 h-12" onClick={() => setSaved(false)}>
            Record another
          </Button>
        </Panel>
      ) : (
        <Panel>
          <Form
            submit="Save cash contribution"
            onSubmit={async (f) => {
              validateDate(value(f, 'date'));
              await action.mutateAsync({
                type: 'cash',
                payment: {
                  memberId: value(f, 'member'),
                  amount: parseAmount(value(f, 'amount')),
                  date: value(f, 'date'),
                  purpose: value(f, 'purpose'),
                },
              });
              setSaved(true);
            }}
          >
            <Field name="member" label="Member">
              <Choice name="member" required>
                {data.members
                  .filter((m) => m.status !== 'inactive')
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </Choice>
            </Field>
            <Field
              name="amount"
              label="Amount (₹)"
              inputMode="decimal"
              required
              placeholder="0.00"
            />
            <Field
              name="date"
              label="Received date"
              type="date"
              defaultValue={new Intl.DateTimeFormat('en-CA', {
                timeZone: 'Asia/Kolkata',
              }).format(new Date())}
              required
            />
            <Field name="purpose" label="Purpose">
              <Choice name="purpose">
                <option>General support</option>
                <option>Special occasion</option>
              </Choice>
            </Field>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Wallet className="size-4" />
              Cash · Your account is recorded as the collector
            </p>
          </Form>
        </Panel>
      )}
    </div>
  );
}
export function Expenses({ data }: { data: DemoState }) {
  const action = useMosqueAction();
  const { role } = useIdentity();
  const [open, setOpen] = useState(false),
    [reverse, setReverse] = useState<Expense | null>(null),
    [notice, setNotice] = useState('');
  const [noticeError, setNoticeError] = useState(false);
  const [account, setAccount] = useState<'Bank' | 'Cash'>('Bank');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const available = data.balance?.[account === 'Bank' ? 'bank' : 'cash'] ?? 0;
  const columns: ColumnDef<Expense, unknown>[] = [
    { accessorKey: 'description', header: 'Description' },
    {
      accessorKey: 'amount',
      header: 'Amount',
      cell: ({ row }) => money(row.original.amount),
    },
    { accessorKey: 'category', header: 'Category' },
    { accessorKey: 'account', header: 'Account' },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <Status status={row.original.status} />,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) =>
        row.original.status === 'draft' ? (
          <div className="flex gap-2">
            <RecordActions record={row.original} kind="expense" />
            <Button
              className="h-11"
              variant="outline"
              onClick={async () => {
                try {
                  await action.mutateAsync({
                    type: 'post-expense',
                    id: row.original.id,
                  });
                  setNoticeError(false);
                  setNotice('Expense marked as paid.');
                } catch (e) {
                  setNoticeError(true);
                  setNotice((e as Error).message);
                }
              }}
            >
              Mark paid
            </Button>
          </div>
        ) : role === 'owner' && row.original.status === 'paid' ? (
          <Button
            variant="ghost"
            className="h-11"
            onClick={() => setReverse(row.original)}
          >
            Reverse
          </Button>
        ) : null,
    },
  ];
  return (
    <>
      <PageTitle
        title="Expenses"
        action={
          <Button
            className="h-11"
            onClick={() => {
              setFieldErrors({});
              setAccount('Bank');
              setOpen(true);
            }}
          >
            <Plus />
            Add expense
          </Button>
        }
      />
      <Feedback message={notice} error={noticeError} />
      <DataTable data={data.expenses} columns={columns} />
      <Modal open={open} onOpenChange={setOpen} title="Add expense">
        <Form
          submit="Save expense"
          noValidate
          onSubmit={async (f) => {
            const errors: Record<string, string> = {};
            let amount = 0;
            if (!value(f, 'description').trim())
              errors.description = 'Enter an expense description.';
            try {
              amount = parseAmount(value(f, 'amount'));
            } catch (e) {
              errors.amount = (e as Error).message;
            }
            try {
              validateDate(value(f, 'date'));
            } catch (e) {
              errors.date = (e as Error).message;
            }
            if (
              !errors.amount &&
              value(f, 'status') === 'paid' &&
              amount > available
            )
              errors.amount = `Only ${money(available)} is available in ${account.toLowerCase()}. Record missing receipts or save as a draft.`;
            setFieldErrors(errors);
            if (Object.keys(errors).length) {
              document.getElementById(Object.keys(errors)[0])?.focus();
              return;
            }
            try {
              await action.mutateAsync({
                type: 'expense',
                expense: {
                  amount,
                  date: value(f, 'date'),
                  category: value(f, 'category'),
                  description: value(f, 'description'),
                  account: value(f, 'account') as 'Bank' | 'Cash',
                  status: value(f, 'status') as 'draft' | 'paid',
                },
              });
            } catch (e) {
              if (
                e instanceof BackendError &&
                e.code === 'INSUFFICIENT_BALANCE'
              ) {
                setFieldErrors({ amount: e.message });
                document.getElementById('amount')?.focus();
                return;
              }
              throw e;
            }
            setNoticeError(false);
            setNotice(
              value(f, 'status') === 'draft'
                ? 'Expense saved as a draft.'
                : 'Expense recorded as paid.',
            );
            setOpen(false);
          }}
        >
          <Field
            name="description"
            error={fieldErrors.description}
            label="Description"
            required
            maxLength={200}
          />
          <Field
            name="amount"
            error={fieldErrors.amount}
            label="Amount (₹)"
            inputMode="decimal"
            required
          />
          <Field
            name="date"
            error={fieldErrors.date}
            label="Date"
            type="date"
            defaultValue={new Intl.DateTimeFormat('en-CA', {
              timeZone: 'Asia/Kolkata',
            }).format(new Date())}
            required
          />
          <div className="grid grid-cols-2 gap-4">
            <Field name="category" label="Category">
              <Choice name="category">
                {['Utilities', 'Maintenance', 'Cleaning', 'Other'].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Choice>
            </Field>
            <Field name="account" label="Paid from">
              <Choice
                name="account"
                value={account}
                onChange={(e) => {
                  setAccount(e as 'Bank' | 'Cash');
                  setFieldErrors({});
                }}
              >
                <option>Bank</option>
                <option>Cash</option>
              </Choice>
            </Field>
          </div>
          <output className="block text-sm text-muted-foreground">
            Available in {account.toLowerCase()}:{' '}
            <strong>{money(available)}</strong>. Drafts do not deduct money.
          </output>
          <Field name="status" label="Status">
            <Choice name="status" onChange={() => setFieldErrors({})}>
              <option value="draft">Draft — not yet paid</option>
              <option value="paid">Paid</option>
            </Choice>
          </Field>
        </Form>
      </Modal>
      <Modal
        open={!!reverse}
        onOpenChange={(o) => {
          if (!o) setReverse(null);
        }}
        title="Reverse expense"
      >
        <Form
          submit="Reverse with history preserved"
          onSubmit={async (f) => {
            if (reverse)
              await action.mutateAsync({
                type: 'reverse',
                kind: 'expense',
                id: reverse.id,
                reason: value(f, 'reason'),
              });
            setReverse(null);
          }}
        >
          <Field name="reason" label="Correction reason" required />
        </Form>
      </Modal>
    </>
  );
}
export function Balance({ data }: { data: DemoState }) {
  const action = useMosqueAction();
  const b = balances(data);
  const [notice, setNotice] = useState('');
  return (
    <>
      <PageTitle
        title="Bank balance check"
        description="Compare an observation with your recorded balance."
      />
      <OpeningBalance />
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Panel>
          <p className="text-sm text-muted-foreground">Recorded bank balance</p>
          <p className="mb-6 mt-2 text-4xl font-medium">{money(b.bank)}</p>
          <Form
            submit="Save observation"
            onSubmit={async (f) => {
              const raw = value(f, 'amount');
              const amount =
                raw === '0' || raw === '0.00' ? 0 : parseAmount(raw);
              await action.mutateAsync({
                type: 'balance-check',
                amount,
                date: value(f, 'date'),
                note: value(f, 'note'),
              });
              setNotice(
                'Observation saved. The recorded balance was not changed.',
              );
            }}
          >
            <Field
              name="amount"
              label="Observed bank balance (₹)"
              inputMode="decimal"
              required
            />
            <Field
              name="date"
              label="As of date (IST)"
              type="date"
              defaultValue={new Intl.DateTimeFormat('en-CA', {
                timeZone: 'Asia/Kolkata',
              }).format(new Date())}
              required
            />
            <Field
              name="note"
              label="Reconciliation note"
              required
              maxLength={300}
            />
            <p className="text-xs text-muted-foreground">
              The comparison uses the recorded bank balance as of the selected
              date. Observations do not change the ledger.
            </p>
          </Form>
          <div className="mt-4">
            <Feedback message={notice} />
          </div>
        </Panel>
        <div className="space-y-5">
          <Panel>
            <h2 className="mb-4 font-heading text-xl">Last observation</h2>
            {data.checks[0] && (
              <>
                <p className="text-xs text-muted-foreground">
                  {data.checks[0].date.replace('T', ' · ')} IST
                </p>
                <div className="my-4 flex justify-between">
                  <span>Observed</span>
                  <strong>{money(data.checks[0].amount)}</strong>
                </div>
                <div className="my-4 flex justify-between">
                  <span>Recorded at check</span>
                  <strong>{money(data.checks[0].recorded)}</strong>
                </div>
                <div className="flex justify-between border-t pt-4 text-warning">
                  <span>Difference</span>
                  <strong>
                    {money(data.checks[0].amount - data.checks[0].recorded)}
                  </strong>
                </div>
              </>
            )}
          </Panel>
          <Disclosure title="Deposit cash into bank">
            <Form
              submit="Record cash-to-bank transfer"
              onSubmit={async (f) => {
                validateDate(value(f, 'date'));
                await action.mutateAsync({
                  type: 'transfer',
                  amount: parseAmount(value(f, 'amount')),
                  date: value(f, 'date'),
                });
                setNotice('Transfer recorded. Total funds are unchanged.');
              }}
            >
              <p className="text-sm">Available cash: {money(b.cash)}</p>
              <Field
                name="amount"
                label="Amount (₹)"
                required
                inputMode="decimal"
              />
              <Field
                name="date"
                label="Transfer date"
                type="date"
                defaultValue={new Intl.DateTimeFormat('en-CA', {
                  timeZone: 'Asia/Kolkata',
                }).format(new Date())}
                required
              />
            </Form>
          </Disclosure>
        </div>
      </div>
    </>
  );
}
export function PrayerEditor({ data }: { data: DemoState }) {
  const action = useMosqueAction();
  const schedule = data.prayers.length ? data.prayers : initialPrayers;
  const [notice, setNotice] = useState('');
  return (
    <div className="max-w-2xl">
      <PageTitle
        title="Prayer times"
        description="Keep adhan and jamaat separate."
      />
      <Panel>
        <Form
          submit="Update timetable"
          onSubmit={async (f) => {
            const prayers = schedule.map((p) => ({
              ...p,
              adhan: value(f, `${p.id}-adhan`),
              jamaat: value(f, `${p.id}-jamaat`),
            }));
            for (const p of prayers)
              if (p.jamaat < p.adhan)
                throw Error(`${p.name}: jamaat cannot be earlier than adhan.`);
            await action.mutateAsync({ type: 'prayers', prayers });
            setNotice('Mosque timetable saved.');
          }}
        >
          <div className="grid grid-cols-[1fr_1fr_1fr] gap-3 text-sm text-muted-foreground">
            <span>Prayer</span>
            <span>Adhan</span>
            <span>Jamaat</span>
          </div>
          {schedule.map((p) => (
            <div
              className="grid grid-cols-[1fr_1fr_1fr] items-center gap-3"
              key={p.id}
            >
              <span className="font-medium">{p.name}</span>
              <Input
                aria-label={`${p.name} adhan`}
                name={`${p.id}-adhan`}
                type="time"
                defaultValue={p.adhan}
                required
                className="h-12"
              />
              <Input
                aria-label={`${p.name} jamaat`}
                name={`${p.id}-jamaat`}
                type="time"
                defaultValue={p.jamaat}
                required
                className="h-12"
              />
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Changes take effect immediately. Confirm the timetable with your
            mosque before saving.
          </p>
        </Form>
        <div className="mt-4">
          <Feedback message={notice} />
        </div>
      </Panel>
    </div>
  );
}
export function NewsEditor({ data }: { data: DemoState }) {
  const action = useMosqueAction();
  const [open, setOpen] = useState(false),
    [notice, setNotice] = useState('');
  return (
    <>
      <PageTitle
        title="News & events"
        action={
          <Button className="h-11" onClick={() => setOpen(true)}>
            <Plus />
            Add notice
          </Button>
        }
      />
      <Feedback message={notice} error />
      <div className="space-y-4">
        {data.notices.map((n) => (
          <Panel key={n.id}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium">{n.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {n.date} · {n.published ? 'Published' : 'Draft'}
                </p>
              </div>
              <Button
                variant="outline"
                className="h-11"
                onClick={async () => {
                  try {
                    await action.mutateAsync({
                      type: 'toggle-notice',
                      id: n.id,
                    });
                  } catch (e) {
                    setNotice((e as Error).message);
                  }
                }}
              >
                {n.published ? 'Unpublish' : 'Publish'}
              </Button>
            </div>
            <p className="mt-3 text-sm">{n.body}</p>
            <div className="mt-3 flex gap-2">
              <RecordActions record={n} kind="notice" />
            </div>
          </Panel>
        ))}
      </div>
      <Modal open={open} onOpenChange={setOpen} title="Add notice">
        <Form
          submit="Save draft"
          onSubmit={async (f) => {
            await action.mutateAsync({
              type: 'notice',
              notice: {
                title: value(f, 'title'),
                body: value(f, 'body'),
                hindiTitle: value(f, 'hindiTitle'),
                hindiBody: value(f, 'hindiBody'),
                date: value(f, 'date'),
                published: false,
                image: value(f, 'image'),
              },
            });
            setOpen(false);
          }}
        >
          <Field
            name="title"
            label="Title (English)"
            required
            maxLength={100}
          />
          <Field name="body" label="Message">
            <Textarea id="body" name="body" required maxLength={1000} />
          </Field>
          <Field
            name="date"
            label="Date"
            type="date"
            required
            defaultValue={new Intl.DateTimeFormat('en-CA', {
              timeZone: 'Asia/Kolkata',
            }).format(new Date())}
          />
          <Field
            name="image"
            label="Picture URL (optional)"
            type="url"
            placeholder="https://…"
          />
          <Disclosure title="Hindi translation (optional)">
            <div className="space-y-4">
              <Field name="hindiTitle" label="शीर्षक" maxLength={100} />
              <Field name="hindiBody" label="संदेश">
                <Textarea id="hindiBody" name="hindiBody" maxLength={1000} />
              </Field>
            </div>
          </Disclosure>
        </Form>
      </Modal>
    </>
  );
}
export function Receiving({ data }: { data: DemoState }) {
  const action = useMosqueAction();
  const [image, setImage] = useState(data.receiving.image ?? ''),
    [notice, setNotice] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [readingImage, setReadingImage] = useState(false);
  return (
    <div className="max-w-xl">
      <PageTitle
        title="Receiving details"
        description="Manage the mosque’s payment instructions."
      />
      <Panel>
        <Form
          submit="Save receiving details"
          noValidate
          pending={readingImage}
          onSubmit={async (f) => {
            setNotice('');
            const result = receivingDetails.safeParse({
              recipient: value(f, 'recipient'),
              upi: value(f, 'upi'),
            });
            const next: Record<string, string> = {};
            if (!result.success)
              for (const issue of result.error.issues)
                next[String(issue.path[0])] ??= issue.message;
            if (!image && !data.receiving.qrPath)
              next.qr = 'Choose the mosque’s payment QR image.';
            setErrors(next);
            if (Object.keys(next).length) {
              document.getElementById(Object.keys(next)[0])?.focus();
              return;
            }
            if (!result.success) return;
            await action.mutateAsync({
              type: 'receiving',
              receiving: {
                ...result.data,
                image,
              },
            });
            setNotice('Receiving details updated.');
          }}
        >
          <Field
            name="recipient"
            label="Recipient name"
            maxLength={120}
            error={errors.recipient}
            onChange={() => setErrors((e) => ({ ...e, recipient: '' }))}
            defaultValue={data.receiving.recipient}
            required
          />
          <Field
            name="upi"
            label="UPI ID"
            required
            error={errors.upi}
            onChange={() => setErrors((e) => ({ ...e, upi: '' }))}
            defaultValue={data.receiving.upi}
            placeholder="masjid@bank"
            autoCapitalize="none"
            spellCheck={false}
          />
          <p className="text-sm text-muted-foreground">
            Enter the UPI ID shown in the receiving account’s payment app,
            including @ and the bank handle.
          </p>
          <Field name="qr" label="Payment QR image" required error={errors.qr}>
            <Input
              id="qr"
              type="file"
              aria-invalid={!!errors.qr}
              aria-describedby={errors.qr ? 'qr-error' : undefined}
              accept="image/png,image/jpeg,image/webp"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f)
                  try {
                    setReadingImage(true);
                    setErrors((e) => ({ ...e, qr: '' }));
                    setImage(await readImage(f));
                    setNotice('');
                  } catch (e) {
                    setErrors((current) => ({
                      ...current,
                      qr: (e as Error).message,
                    }));
                  } finally {
                    setReadingImage(false);
                  }
              }}
              className="h-12"
            />
          </Field>
          {image && (
            <img
              src={image}
              alt="Mosque UPI payment QR code"
              className="mx-auto size-40 object-contain"
            />
          )}
          <p className="text-xs text-muted-foreground">
            Check that the UPI ID and QR image belong to the same recipient
            before saving.
          </p>
        </Form>
        <div className="mt-4">
          <Feedback message={notice} />
        </div>
      </Panel>
    </div>
  );
}
export function exportPayments(data: DemoState) {
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = [
    ['Date', 'Amount INR', 'Method', 'Status', 'Purpose'],
    ...data.payments.map((p) => [
      p.date,
      String(p.amount / 100),
      p.method,
      p.status,
      p.purpose,
    ]),
  ];
  const csv = lines
    .map((r) => r.map((v) => escape(/^[=+@-]/.test(v) ? `'${v}` : v)).join(','))
    .join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'contributions.csv';
  a.click();
  URL.revokeObjectURL(url);
}
