begin;
-- Member-visible totals contain collections only, never balances or expenses.
create or replace function public.mosque_finances() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not (mosque_private.allowed('reports') or mosque_private.allowed('expenses') or mosque_private.allowed('record') or mosque_private.allowed('verify')) then raise exception 'Finance permission required' using errcode='42501'; end if;
 return (select jsonb_build_object('bankPaise',coalesce(sum(bank_paise),0),'cashPaise',coalesce(sum(cash_paise),0)) from mosque_private.ledger);
end $$;
create or replace function public.mosque_financial_summary() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not mosque_private.active_member() then raise exception 'Membership required' using errcode='42501'; end if;
 if exists(select 1 from public.mosque_profiles where id=auth.uid() and role='member') then
  return jsonb_build_object('months',coalesce((select jsonb_agg(x) from (
   select to_char(paid_on,'YYYY-MM') as month,sum(amount_paise) as receipts
   from public.mosque_payments where status='verified' group by 1 order by 1 desc
  ) x),'[]'::jsonb));
 end if;
 return jsonb_build_object('balance',public.mosque_finances(),'months',coalesce((select jsonb_agg(x) from (
  select to_char(effective_on,'YYYY-MM') as month,sum(case when kind='payment' then bank_paise+cash_paise else 0 end) as receipts,
  -sum(case when kind='expense' then bank_paise+cash_paise else 0 end) as expenses,
  sum(case when kind='reversal' then bank_paise+cash_paise else 0 end) as adjustments
  from mosque_private.ledger group by 1 order by 1 desc
 ) x),'[]'::jsonb));
end $$;
drop policy expense_read on public.mosque_expenses;
create policy expense_read on public.mosque_expenses for select to authenticated using (
 mosque_private.allowed('expenses') or (status<>'draft' and mosque_private.allowed('reports'))
);
commit;
