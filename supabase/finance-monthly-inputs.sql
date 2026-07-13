create index if not exists incomes_user_received_at_idx
on public.incomes (user_id, received_at);

create index if not exists expenses_user_spent_at_idx
on public.expenses (user_id, spent_at);

create index if not exists savings_transactions_user_saved_at_idx
on public.savings_transactions (user_id, saved_at);

create or replace function public.finance_monthly_inputs()
returns table (
    month_start date,
    income_total numeric,
    expenses_total numeric,
    savings_from_income_total numeric,
    savings_existing_money_total numeric,
    savings_other_total numeric,
    manual_withdrawals_total numeric
)
language sql
stable
security invoker
set search_path = ''
as $function$
    with income_by_month as (
        select
            date_trunc('month', received_at)::date as month_start,
            coalesce(sum(amount), 0)::numeric as income_total
        from public.incomes
        where user_id = (select auth.uid())
        group by 1
    ),
    expenses_by_month as (
        select
            date_trunc('month', spent_at)::date as month_start,
            coalesce(sum(amount), 0)::numeric as expenses_total
        from public.expenses
        where user_id = (select auth.uid())
        group by 1
    ),
    savings_by_month as (
        select
            date_trunc('month', saved_at)::date as month_start,
            coalesce(
                sum(amount) filter (
                    where type = 'deposit'
                    and coalesce(source, 'monthly_income') = 'monthly_income'
                ),
                0
            )::numeric as savings_from_income_total,
            coalesce(
                sum(amount) filter (where type = 'deposit' and source = 'existing_money'),
                0
            )::numeric as savings_existing_money_total,
            coalesce(
                sum(amount) filter (where type = 'deposit' and source = 'other'),
                0
            )::numeric as savings_other_total,
            coalesce(
                sum(amount) filter (where type = 'withdrawal'),
                0
            )::numeric as manual_withdrawals_total
        from public.savings_transactions
        where user_id = (select auth.uid())
        group by 1
    ),
    months as (
        select month_start from income_by_month
        union
        select month_start from expenses_by_month
        union
        select month_start from savings_by_month
    )
    select
        months.month_start,
        coalesce(income_by_month.income_total, 0)::numeric,
        coalesce(expenses_by_month.expenses_total, 0)::numeric,
        coalesce(savings_by_month.savings_from_income_total, 0)::numeric,
        coalesce(savings_by_month.savings_existing_money_total, 0)::numeric,
        coalesce(savings_by_month.savings_other_total, 0)::numeric,
        coalesce(savings_by_month.manual_withdrawals_total, 0)::numeric
    from months
    left join income_by_month using (month_start)
    left join expenses_by_month using (month_start)
    left join savings_by_month using (month_start)
    order by months.month_start;
$function$;

revoke execute on function public.finance_monthly_inputs() from public;
revoke execute on function public.finance_monthly_inputs() from anon;
grant execute on function public.finance_monthly_inputs() to authenticated;
