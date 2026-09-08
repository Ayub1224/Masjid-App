'use client';
import { useState } from 'react';
import {
  Wallet,
  Landmark,
  ChartNoAxesCombined,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react';
import { balances, money, type DemoState } from '@/lib/data/domain';
import { Disclosure, PageTitle } from '@/components/app/primitives';
import { usePreferences } from '@/components/app/preferences';
export function Finance({ data }: { data: DemoState }) {
  const { t } = usePreferences();
  const b = balances(data);
  const [month, setMonth] = useState('2026-09');
  const receipts = data.payments
    .filter((p) => p.status === 'verified' && p.date.startsWith(month))
    .reduce((a, p) => a + p.amount, 0);
  const paid = data.expenses.filter(
    (e) => e.status === 'paid' && e.date.startsWith(month),
  );
  const expenses = paid.reduce((a, e) => a + e.amount, 0);
  return (
    <>
      <PageTitle title={t('Mosque finances', 'मस्जिद का वित्त')} />
      <div className="space-y-4">
        <div className="rounded-2xl bg-primary p-7 text-primary-foreground">
          <p className="text-xs uppercase tracking-[.16em] opacity-80">
            {t('Current recorded balance', 'वर्तमान दर्ज शेष राशि')}
          </p>
          <p className="my-3 text-4xl font-medium tabular-nums">
            {money(b.total)}
          </p>
          <p className="text-xs opacity-80">
            {t(
              'Sample register · Opening balance on 1 Sep 2026',
              'नमूना रजिस्टर · प्रारंभिक राशि 1 सितंबर 2026',
            )}
          </p>
        </div>
        <Disclosure
          title={t('Cash & bank breakdown', 'नकद और बैंक का विवरण')}
          icon={<Wallet className="size-5 text-primary" />}
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-muted p-4">
              <Landmark className="mb-3 size-5 text-primary" />
              <p className="text-muted-foreground">{t('Bank', 'बैंक')}</p>
              <p className="text-xl font-medium">{money(b.bank)}</p>
            </div>
            <div className="rounded-lg bg-muted p-4">
              <Wallet className="mb-3 size-5 text-primary" />
              <p className="text-muted-foreground">{t('Cash', 'नकद')}</p>
              <p className="text-xl font-medium">{money(b.cash)}</p>
            </div>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            {t(
              'Based on recorded transactions, not a live bank connection.',
              'दर्ज लेनदेन पर आधारित, लाइव बैंक कनेक्शन नहीं।',
            )}
          </p>
        </Disclosure>
        <Disclosure
          title={t('Monthly income & expenses', 'मासिक आय और खर्च')}
          icon={<ChartNoAxesCombined className="size-5 text-primary" />}
        >
          <label className="mb-5 block">
            {t('Month', 'महीना')}
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="mt-2 h-11 w-full rounded-lg border bg-background px-3"
            />
          </label>
          <div className="space-y-4">
            <div className="flex justify-between">
              <span className="flex items-center gap-2">
                <ArrowDownLeft className="size-4 text-success" />
                {t('Verified receipts', 'सत्यापित प्राप्तियाँ')}
              </span>
              <strong>{money(receipts)}</strong>
            </div>
            <div className="flex justify-between">
              <span className="flex items-center gap-2">
                <ArrowUpRight className="size-4 text-warning" />
                {t('Paid expenses', 'भुगतान किए खर्च')}
              </span>
              <strong>{money(expenses)}</strong>
            </div>
            <div className="flex justify-between border-t pt-4">
              <span>{t('Net movement', 'शुद्ध बदलाव')}</span>
              <strong>{money(receipts - expenses)}</strong>
            </div>
          </div>
        </Disclosure>
        <Disclosure title={t('Expense categories', 'खर्च की श्रेणियाँ')}>
          <div className="space-y-5">
            {['Utilities', 'Maintenance', 'Cleaning', 'Other'].map(
              (category, i) => {
                const amount = paid
                  .filter((e) => e.category === category)
                  .reduce((a, e) => a + e.amount, 0);
                if (!amount) return null;
                return (
                  <div key={category}>
                    <div className="mb-2 flex justify-between">
                      <span>{category}</span>
                      <span className="font-medium">{money(amount)}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${expenses ? (amount / expenses) * 100 : 0}%`,
                          background: `var(--chart-${i + 1})`,
                        }}
                      />
                    </div>
                  </div>
                );
              },
            )}
            {!expenses && (
              <p className="text-muted-foreground">
                {t('No paid expenses this month.', 'इस महीने कोई खर्च नहीं।')}
              </p>
            )}
          </div>
        </Disclosure>
      </div>
    </>
  );
}
