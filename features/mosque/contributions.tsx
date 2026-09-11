'use client';
import { useIdentity } from '@/components/app/providers';
/* oxlint-disable next/no-img-element -- User-selected data URLs must remain local previews, without an image optimizer. */
import Link from 'next/link';
import { useState } from 'react';
import {
  QrCode,
  Copy,
  ImagePlus,
  Check,
  ArrowRight,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import { useMosqueAction } from '@/components/app/providers';
import { usePreferences } from '@/components/app/preferences';
import {
  PageTitle,
  Panel,
  Field,
  Form,
  Choice,
  Disclosure,
  Feedback,
  Status,
  value,
} from '@/components/app/primitives';
import {
  money,
  parseAmount,
  validateDate,
  type DemoState,
  type Payment,
} from '@/lib/data/domain';
export async function readImage(file: File) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
    throw Error('Choose a PNG, JPEG, or WebP image.');
  if (file.size > 5 * 1024 * 1024)
    throw Error('Choose an image smaller than 5 MB.');
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(typeof r.result === 'string' ? r.result : '');
    r.onerror = () => reject(Error('Unable to read image.'));
    r.readAsDataURL(file);
  });
}
export function Contribute({
  data,
  submit = false,
}: {
  data: DemoState;
  submit?: boolean;
}) {
  const { t } = usePreferences();
  const mutation = useMosqueAction();
  const { session } = useIdentity();
  const [file, setFile] = useState<File | null>(null),
    [image, setImage] = useState(''),
    [message, setMessage] = useState(''),
    [success, setSuccess] = useState(false);
  if (success)
    return (
      <div className="py-12 text-center">
        <span className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-success-background text-success">
          <Check className="size-8" />
        </span>
        <PageTitle title={t('Contribution submitted', 'योगदान जमा हुआ')} />
        <Status status="pending" />
        <p className="my-6 text-muted-foreground">
          {t(
            'Your submission is ready for admin review.',
            'आपका नमूना भुगतान व्यवस्थापक समीक्षा के लिए तैयार है।',
          )}
        </p>
        <Button className="h-12 w-full" render={<Link href="/contributions" />}>
          {t('View my contributions', 'मेरे योगदान देखें')}
          <ArrowRight />
        </Button>
      </div>
    );
  return (
    <>
      <PageTitle
        title={t(
          submit ? 'Add payment details' : 'Make a contribution',
          submit ? 'भुगतान विवरण जोड़ें' : 'योगदान करें',
        )}
        description={t(
          'Any amount, given with kindness.',
          'कोई भी राशि, आपकी इच्छा से।',
        )}
      />
      {!submit ? (
        <div className="space-y-5">
          <Panel>
            <p className="text-center text-sm font-medium">
              Gausul wara masjid
            </p>
            <div className="mx-auto my-6 flex aspect-square w-44 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed bg-background text-muted-foreground">
              {data.receiving.image ? (
                <img
                  src={data.receiving.image}
                  alt="Mosque UPI payment QR code"
                  className="size-36 object-contain"
                />
              ) : (
                <>
                  <QrCode className="size-14 opacity-30" />
                  <span className="text-xs">QR not configured</span>
                </>
              )}
            </div>
            <p className="text-center text-sm text-muted-foreground">
              {t(
                'Pay using your UPI app, then upload the screenshot.',
                'UPI से भुगतान करें, फिर स्क्रीनशॉट अपलोड करें।',
              )}
            </p>
            <div className="mt-5 flex items-center justify-between rounded-lg bg-muted p-3">
              <span className="text-sm">
                {data.receiving.upi || '[UPI ID]'}
              </span>
              <Button
                variant="ghost"
                className="h-11"
                disabled={!data.receiving.upi}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(data.receiving.upi);
                    setMessage('Copied.');
                  } catch {
                    setMessage('Copy is unavailable in this browser.');
                  }
                }}
              >
                <Copy className="size-4" />
                {t('Copy', 'कॉपी')}
              </Button>
            </div>
          </Panel>
          <Button
            className="h-12 w-full text-base"
            render={<Link href="/contribute/submit" />}
          >
            {t('I’ve paid — add details', 'भुगतान किया — विवरण जोड़ें')}
            <ArrowRight />
          </Button>
          <Feedback message={message} />
          <Disclosure title={t('How to pay', 'भुगतान कैसे करें')}>
            <ol className="list-decimal space-y-3 pl-5">
              <li>
                {t(
                  'In the live app, scan the mosque QR in your UPI app.',
                  'लाइव ऐप में UPI ऐप से मस्जिद का QR स्कैन करें।',
                )}
              </li>
              <li>
                {t(
                  'Check the recipient and complete your payment.',
                  'प्राप्तकर्ता जाँचें और भुगतान करें।',
                )}
              </li>
              <li>
                {t(
                  'Return here to upload your screenshot for verification.',
                  'सत्यापन के लिए स्क्रीनशॉट यहाँ अपलोड करें।',
                )}
              </li>
            </ol>
          </Disclosure>
        </div>
      ) : (
        <Panel>
          <Form
            submit={t('Submit for verification', 'सत्यापन के लिए जमा करें')}
            pending={mutation.isPending}
            onSubmit={async (f) => {
              const amount = parseAmount(value(f, 'amount'));
              const date = value(f, 'date');
              validateDate(date);
              if (!file || !image) throw Error('Upload a payment screenshot.');
              await mutation.mutateAsync({
                type: 'submit',
                payment: {
                  memberId: session!.userId,
                  amount,
                  date,
                  purpose: value(f, 'purpose'),
                  reference: value(f, 'reference'),
                  method: 'UPI',
                  evidence: image,
                  evidenceName: file.name,
                },
              });
              setSuccess(true);
            }}
          >
            <Field
              label={t('Amount (₹)', 'राशि (₹)')}
              name="amount"
              inputMode="decimal"
              required
              placeholder="0.00"
            />
            <Field
              label={t('Payment date', 'भुगतान की तारीख')}
              name="date"
              type="date"
              required
              defaultValue={new Intl.DateTimeFormat('en-CA', {
                timeZone: 'Asia/Kolkata',
              }).format(new Date())}
            />
            <Field label={t('Purpose', 'उद्देश्य')} name="purpose">
              <Choice name="purpose">
                <option>General support</option>
                <option>Special occasion</option>
              </Choice>
            </Field>
            <Field
              label={t('Transaction reference', 'लेनदेन संदर्भ')}
              name="reference"
              required
              maxLength={100}
              placeholder="UPI transaction reference"
            />
            <Field
              label={t('Payment screenshot', 'भुगतान स्क्रीनशॉट')}
              name="evidence"
            >
              <div className="rounded-xl border border-dashed p-4">
                <Input
                  id="evidence"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={async (e) => {
                    setMessage('');
                    setFile(null);
                    setImage('');
                    const f = e.target.files?.[0];
                    if (f)
                      try {
                        const img = await readImage(f);
                        setFile(f);
                        setImage(img);
                      } catch (e) {
                        setMessage((e as Error).message);
                      }
                  }}
                  className="h-auto min-h-11"
                />
                {image ? (
                  <div className="mt-4">
                    <img
                      src={image}
                      alt="Payment screenshot preview"
                      className="max-h-48 w-full rounded-lg object-contain"
                    />
                    <Button
                      variant="ghost"
                      type="button"
                      className="mt-2 h-11"
                      onClick={() => {
                        setFile(null);
                        setImage('');
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                ) : (
                  <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <ImagePlus className="size-4" />
                    PNG, JPEG or WebP · up to 5 MB
                  </p>
                )}
              </div>
            </Field>
            <Feedback message={message} error />
            <p className="text-xs text-muted-foreground">
              {t(
                'Your screenshot is stored privately for payment verification.',
                'आपका स्क्रीनशॉट भुगतान सत्यापन के लिए निजी रूप से सहेजा जाता है।',
              )}
            </p>
          </Form>
        </Panel>
      )}
    </>
  );
}
export function Contributions({ data }: { data: DemoState }) {
  const { t } = usePreferences();
  const { session } = useIdentity();
  const [filter, setFilter] = useState('all');
  const rows = data.payments.filter((p) => p.memberId === session?.userId);
  const verified = rows
    .filter((p) => p.status === 'verified')
    .reduce((a, p) => a + p.amount, 0);
  return (
    <>
      <PageTitle
        title={t('My contributions', 'मेरे योगदान')}
        action={
          <Button className="h-11" render={<Link href="/contribute" />}>
            {t('Contribute', 'योगदान करें')}
          </Button>
        }
      />
      <Panel className="mb-5">
        <div className="flex justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              {t('Verified', 'सत्यापित')}
            </p>
            <p className="mt-1 text-3xl font-medium">{money(verified)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">
              {t('Awaiting review', 'समीक्षा बाकी')}
            </p>
            <p className="mt-1 text-2xl">
              {rows.filter((p) => p.status === 'pending').length}
            </p>
          </div>
        </div>
      </Panel>
      <select
        aria-label="Filter contributions"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="mb-4 h-11 w-full rounded-lg border bg-card px-3"
      >
        <option value="all">{t('All contributions', 'सभी योगदान')}</option>
        <option value="verified">Verified</option>
        <option value="pending">Pending verification</option>
        <option value="rejected">Rejected</option>
      </select>
      <Accordion className="rounded-xl border bg-card">
        {rows
          .filter((p) => filter === 'all' || p.status === filter)
          .map((p) => (
            <AccordionItem key={p.id} value={p.id}>
              <AccordionTrigger className="items-center gap-2 px-4 py-5 hover:no-underline">
                <span>
                  <span className="block text-lg font-medium">
                    {money(p.amount)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {p.date}
                  </span>
                </span>
                <span className="ml-auto">
                  <Status status={p.status} />
                </span>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 px-4 pb-5">
                <p>
                  {p.purpose} · {p.method}
                </p>
                <p className="break-all text-xs text-muted-foreground">
                  {p.reference || 'Cash contribution'}
                </p>
                {p.reason && <Feedback message={p.reason} error />}
                {p.evidence && (
                  <img
                    src={p.evidence}
                    alt="Your payment screenshot"
                    className="max-h-48 w-full object-contain"
                  />
                )}
                {p.status === 'verified' && (
                  <Button
                    variant="outline"
                    className="h-11"
                    onClick={() => downloadReceipt(p)}
                  >
                    <FileText className="size-4" />
                    {t('Download receipt', 'नमूना रसीद डाउनलोड करें')}
                  </Button>
                )}
                {p.status === 'rejected' && (
                  <Button
                    variant="outline"
                    className="h-11"
                    render={<Link href="/contribute/submit" />}
                  >
                    {t('Submit corrected details', 'सही विवरण जमा करें')}
                  </Button>
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
      </Accordion>
      {!rows.filter((p) => filter === 'all' || p.status === filter).length && (
        <Panel>No contributions match this filter.</Panel>
      )}
    </>
  );
}
function downloadReceipt(p: Payment) {
  const blob = new Blob(
    [
      `CONTRIBUTION ACKNOWLEDGEMENT\nGausul wara masjid\nReference: ${p.id}\nDate: ${p.date}\nAmount: ${money(p.amount)}\nPurpose: ${p.purpose}\nStatus: ${p.status}\n`,
    ],
    { type: 'text/plain' },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `receipt-${p.id}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}
