-- Run the preflight block first in the target Supabase project. It checks the existing
-- finance schema assumptions used by the confirmation RPC and stops before creating tables.
do $preflight$
declare
    column_type text;
    required_column text;
    required_columns text[] := array[
        'expenses.id', 'expenses.user_id', 'expenses.amount', 'expenses.category', 'expenses.category_id',
        'expenses.description', 'expenses.spent_at', 'expenses.created_at', 'expenses.is_dating', 'expenses.is_for_partner',
        'expense_categories.id', 'expense_categories.name', 'expense_categories.user_id'
    ];
begin
    if to_regclass('public.expenses') is null then
        raise exception 'Preflight failed: public.expenses is missing; inspect the current finance schema before applying this migration.';
    end if;
    if to_regclass('public.expense_categories') is null then
        raise exception 'Preflight failed: public.expense_categories is missing; inspect the current finance schema before applying this migration.';
    end if;

    foreach required_column in array required_columns loop
        if not exists (
            select 1 from information_schema.columns
            where table_schema = 'public'
              and table_name = split_part(required_column, '.', 1)
              and column_name = split_part(required_column, '.', 2)
        ) then
            raise exception 'Preflight failed: required finance column % is missing.', required_column;
        end if;
    end loop;

    select udt_name into column_type from information_schema.columns
    where table_schema = 'public' and table_name = 'expenses' and column_name = 'category_id';
    if column_type <> 'uuid' then
        raise exception 'Preflight failed: public.expenses.category_id must be uuid, found %.', column_type;
    end if;

    foreach required_column in array array['expenses.id', 'expenses.user_id', 'expense_categories.user_id'] loop
        select udt_name into column_type from information_schema.columns
        where table_schema = 'public'
          and table_name = split_part(required_column, '.', 1)
          and column_name = split_part(required_column, '.', 2);
        if column_type <> 'uuid' then
            raise exception 'Preflight failed: %.% must be uuid, found %.',
                split_part(required_column, '.', 1), split_part(required_column, '.', 2), column_type;
        end if;
    end loop;

    select udt_name into column_type from information_schema.columns
    where table_schema = 'public' and table_name = 'expense_categories' and column_name = 'id';
    if column_type <> 'uuid' then
        raise exception 'Preflight failed: public.expense_categories.id must be uuid, found %.', column_type;
    end if;

    select udt_name into column_type from information_schema.columns
    where table_schema = 'public' and table_name = 'expenses' and column_name = 'spent_at';
    if column_type not in ('date', 'timestamp', 'timestamptz') then
        raise exception 'Preflight failed: public.expenses.spent_at must be a date or timestamp, found %.', column_type;
    end if;

    foreach required_column in array array['expenses.is_dating', 'expenses.is_for_partner'] loop
        select udt_name into column_type from information_schema.columns
        where table_schema = 'public'
          and table_name = 'expenses'
          and column_name = split_part(required_column, '.', 2);
        if column_type <> 'bool' then
            raise exception 'Preflight failed: %.% must be boolean, found %.',
                split_part(required_column, '.', 1), split_part(required_column, '.', 2), column_type;
        end if;
    end loop;
end;
$preflight$;

create extension if not exists pgcrypto;

create table if not exists public.pending_import_tokens (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    token_hash text not null unique,
    label text not null default 'iPhone Shortcuts',
    created_at timestamptz not null default now(),
    expires_at timestamptz not null default (now() + interval '90 days'),
    last_used_at timestamptz,
    revoked_at timestamptz
);

create table if not exists public.pending_transactions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    import_token_id uuid references public.pending_import_tokens(id) on delete set null,
    source text not null check (source in ('shortcut_http', 'shortcut_ocr', 'app_paste')),
    raw_text text not null check (char_length(raw_text) <= 20000),
    dedupe_key text,
    parsed_amount numeric(12, 2),
    parsed_currency text,
    selected_currency text,
    manual_conversion boolean not null default false,
    parsed_date date,
    parsed_merchant text,
    parsed_source text,
    parsed_reference text,
    parsed_event_id text,
    parsed_type text not null default 'unknown',
    parse_warning text,
    possible_duplicates jsonb not null default '[]'::jsonb,
    reclassification_confirmed boolean not null default false,
    status text not null default 'pending' check (status in ('pending', 'confirmed', 'ignored')),
    description text,
    category text,
    category_id uuid,
    is_dating boolean not null default false,
    is_for_partner boolean not null default false,
    confirmed_expense_id uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    confirmed_at timestamptz,
    ignored_at timestamptz
);

alter table public.pending_import_tokens add column if not exists expires_at timestamptz;
update public.pending_import_tokens
set expires_at = coalesce(expires_at, created_at + interval '90 days');
alter table public.pending_import_tokens alter column expires_at set default (now() + interval '90 days');
alter table public.pending_import_tokens alter column expires_at set not null;

alter table public.pending_transactions add column if not exists parsed_event_id text;
alter table public.pending_transactions add column if not exists selected_currency text;
alter table public.pending_transactions add column if not exists manual_conversion boolean not null default false;
alter table public.pending_transactions add column if not exists possible_duplicates jsonb not null default '[]'::jsonb;
alter table public.pending_transactions add column if not exists reclassification_confirmed boolean not null default false;
alter table public.pending_transactions alter column dedupe_key drop not null;
alter table public.pending_transactions drop constraint if exists pending_transactions_parsed_type_check;
alter table public.pending_transactions add constraint pending_transactions_parsed_type_check
check (parsed_type in ('expense', 'wallet_topup', 'self_transfer', 'payment_to_other', 'unknown'));

create unique index if not exists pending_transactions_user_dedupe_key_idx
on public.pending_transactions (user_id, dedupe_key)
where dedupe_key is not null and status <> 'ignored';

update public.pending_transactions as pending
set dedupe_key = encode(digest(
    jsonb_build_array(
        case
            when nullif(trim(coalesce(pending.parsed_event_id, '')), '') is not null then 'event'
            else 'reference'
        end,
        lower(regexp_replace(trim(coalesce(pending.parsed_source, '')), '[[:space:]]+', ' ', 'g')),
        case
            when nullif(trim(coalesce(pending.parsed_event_id, '')), '') is not null then trim(pending.parsed_event_id)
            else trim(pending.parsed_reference)
        end
    )::text,
    'sha256'
), 'hex')
where pending.dedupe_key is not null
  and lower(regexp_replace(trim(coalesce(pending.parsed_source, '')), '[[:space:]]+', ' ', 'g')) <> ''
  and (
      nullif(trim(coalesce(pending.parsed_event_id, '')), '') is not null
      or nullif(trim(coalesce(pending.parsed_reference, '')), '') is not null
  );

create index if not exists pending_transactions_user_status_created_idx
on public.pending_transactions (user_id, status, created_at desc);

create index if not exists pending_import_tokens_user_revoked_idx
on public.pending_import_tokens (user_id, revoked_at);

create table if not exists public.pending_transaction_rate_limits (
    actor_key text not null,
    action text not null,
    window_started_at timestamptz not null,
    hit_count integer not null,
    primary key (actor_key, action)
);
alter table public.pending_transaction_rate_limits enable row level security;
revoke all on public.pending_transaction_rate_limits from public, anon, authenticated, service_role;

alter table public.pending_import_tokens enable row level security;
alter table public.pending_transactions enable row level security;

do $policy_cleanup$
declare
    existing_policy record;
begin
    for existing_policy in
        select schemaname, tablename, policyname
        from pg_policies
        where schemaname = 'public'
          and tablename in ('pending_import_tokens', 'pending_transactions')
    loop
        if not (
            (existing_policy.tablename = 'pending_import_tokens' and existing_policy.policyname = 'pending_import_tokens_select_own')
            or (existing_policy.tablename = 'pending_transactions' and existing_policy.policyname = 'pending_transactions_select_own')
        ) then
            raise exception 'Preflight failed: unexpected policy %.% (%); inspect it before applying this migration.',
                existing_policy.schemaname, existing_policy.tablename, existing_policy.policyname;
        end if;
        execute format('drop policy if exists %I on %I.%I', existing_policy.policyname, existing_policy.schemaname, existing_policy.tablename);
    end loop;
end;
$policy_cleanup$;

create policy pending_import_tokens_select_own
on public.pending_import_tokens for select
using ((select auth.uid()) = user_id);

create policy pending_transactions_select_own
on public.pending_transactions for select
using ((select auth.uid()) = user_id);

revoke all on public.pending_import_tokens from public, anon, authenticated, service_role;
revoke all on public.pending_transactions from public, anon, authenticated, service_role;
grant select (id, user_id, label, created_at, expires_at, last_used_at, revoked_at)
on public.pending_import_tokens to authenticated;
grant select on public.pending_transactions to authenticated;


-- Remove the earlier confirmation signature and all direct table-write entry points.
drop function if exists public.confirm_pending_transaction(uuid, numeric, text, uuid, text, boolean, boolean);
drop function if exists public.ignore_pending_transaction(uuid);
drop function if exists public.confirm_pending_transaction_legacy(uuid, numeric, text, uuid, text, boolean, boolean);
drop function if exists public.ignore_pending_transaction_legacy(uuid);

create or replace function public.bump_pending_transaction_rate_limit(p_actor_key text, p_action text)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
    request_limit integer;
    window_seconds integer;
    current_window timestamptz;
    current_hits integer;
begin
    case p_action
        when 'import' then request_limit := 60; window_seconds := 3600;
        when 'pending_list' then request_limit := 120; window_seconds := 3600;
        when 'token_list' then request_limit := 60; window_seconds := 3600;
        when 'token_create' then request_limit := 5; window_seconds := 86400;
        when 'token_revoke' then request_limit := 30; window_seconds := 3600;
        when 'edit' then request_limit := 120; window_seconds := 3600;
        when 'confirm' then request_limit := 60; window_seconds := 3600;
        when 'ignore' then request_limit := 60; window_seconds := 3600;
        else raise exception 'Unsupported rate-limit action' using errcode = '22023';
    end case;

    insert into public.pending_transaction_rate_limits (actor_key, action, window_started_at, hit_count)
    values (p_actor_key, p_action, clock_timestamp(), 1)
    on conflict (actor_key, action) do update
    set window_started_at = case
            when public.pending_transaction_rate_limits.window_started_at + window_seconds * interval '1 second' <= clock_timestamp()
                then clock_timestamp()
            else public.pending_transaction_rate_limits.window_started_at
        end,
        hit_count = case
            when public.pending_transaction_rate_limits.window_started_at + window_seconds * interval '1 second' <= clock_timestamp()
                then 1
            else public.pending_transaction_rate_limits.hit_count + 1
        end
    returning window_started_at, hit_count into current_window, current_hits;

    if current_hits > request_limit then
        return greatest(1, ceil(extract(epoch from (current_window + window_seconds * interval '1 second' - clock_timestamp())))::integer);
    end if;
    return 0;
end;
$function$;

create or replace function public.enforce_pending_rate_limit(p_action text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
    current_user_id uuid := auth.uid();
    retry_after integer;
begin
    if current_user_id is null or auth.role() <> 'authenticated' then
        raise exception 'Not authenticated' using errcode = '42501';
    end if;
    if p_action not in ('pending_list', 'token_list') then
        raise exception 'Unsupported rate-limit action' using errcode = '22023';
    end if;
    retry_after := public.bump_pending_transaction_rate_limit('user:' || current_user_id::text, p_action);
    return jsonb_build_object('rate_limited', retry_after > 0, 'retry_after_seconds', retry_after);
end;
$function$;

create or replace function public.create_pending_import_token(p_token_hash text, p_label text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
    current_user_id uuid := auth.uid();
    retry_after integer;
    token_row public.pending_import_tokens%rowtype;
begin
    if current_user_id is null or auth.role() <> 'authenticated' then
        raise exception 'Not authenticated' using errcode = '42501';
    end if;
    if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or char_length(coalesce(p_label, '')) > 80 then
        raise exception 'Invalid token request' using errcode = '22023';
    end if;

    retry_after := public.bump_pending_transaction_rate_limit('user:' || current_user_id::text, 'token_create');
    if retry_after > 0 then
        return jsonb_build_object('rate_limited', true, 'retry_after_seconds', retry_after);
    end if;

    insert into public.pending_import_tokens (user_id, token_hash, label, expires_at)
    values (current_user_id, p_token_hash, coalesce(nullif(trim(p_label), ''), 'iPhone Shortcuts'), clock_timestamp() + interval '90 days')
    returning * into token_row;

    return jsonb_build_object(
        'id', token_row.id,
        'label', token_row.label,
        'created_at', token_row.created_at,
        'expires_at', token_row.expires_at
    );
end;
$function$;

create or replace function public.revoke_pending_import_token(p_token_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
    current_user_id uuid := auth.uid();
    token_row public.pending_import_tokens%rowtype;
    retry_after integer;
begin
    if current_user_id is null or auth.role() <> 'authenticated' then
        raise exception 'Not authenticated' using errcode = '42501';
    end if;

    select * into token_row
    from public.pending_import_tokens
    where id = p_token_id and user_id = current_user_id
    for update;
    if not found then
        raise exception 'Import token not found' using errcode = 'P0002';
    end if;

    retry_after := public.bump_pending_transaction_rate_limit('user:' || current_user_id::text, 'token_revoke');
    if retry_after > 0 then
        return jsonb_build_object('rate_limited', true, 'retry_after_seconds', retry_after);
    end if;

    update public.pending_import_tokens
    set revoked_at = coalesce(revoked_at, clock_timestamp())
    where id = token_row.id;
    return jsonb_build_object('id', token_row.id, 'revoked', true);
end;
$function$;

create or replace function public.suggest_pending_transaction_categories()
returns table (pending_id uuid, category_id uuid)
language sql
security definer
set search_path = pg_catalog, public
as $function$
    with pending_merchants as (
        select p.id,
               lower(regexp_replace(coalesce(p.parsed_merchant, ''), '[^[:alnum:]]', '', 'g')) as merchant_key
        from public.pending_transactions as p
        where p.user_id = auth.uid()
          and p.status = 'pending'
    ),
    confirmed_history as (
        select distinct
               lower(regexp_replace(coalesce(history.parsed_merchant, ''), '[^[:alnum:]]', '', 'g')) as merchant_key,
               history.category_id
        from public.pending_transactions as history
        where history.user_id = auth.uid()
          and history.status = 'confirmed'
    ),
    consistent_categories as (
        select confirmed_history.merchant_key,
               (array_agg(confirmed_history.category_id))[1] as category_id
        from confirmed_history
        group by confirmed_history.merchant_key
        having count(*) = 1
    )
    select pending_merchants.id, consistent_categories.category_id
    from pending_merchants
    join consistent_categories
      on pending_merchants.merchant_key = consistent_categories.merchant_key
    join public.expense_categories as category
      on category.id = consistent_categories.category_id
     and (category.user_id is null or category.user_id = auth.uid())
    where pending_merchants.merchant_key <> '';
$function$;

create or replace function public.create_pending_transaction(
    p_pairing_token_hash text,
    p_import_source text,
    p_raw_text text,
    p_amount numeric,
    p_currency text,
    p_date date,
    p_merchant text,
    p_provider text,
    p_reference text,
    p_event_id text,
    p_kind text,
    p_warning text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
    current_user_id uuid := auth.uid();
    current_role text := auth.role();
    import_token public.pending_import_tokens%rowtype;
    pending_row public.pending_transactions%rowtype;
    existing_row public.pending_transactions%rowtype;
    actor_key text;
    stable_provider text;
    stable_reference text;
    stable_event_id text;
    stable_key text;
    merchant_key text;
    candidate_duplicates jsonb := '[]'::jsonb;
    retry_after integer;
begin
    if p_import_source is null or p_import_source not in ('shortcut_http', 'shortcut_ocr', 'app_paste')
       or char_length(coalesce(p_raw_text, '')) > 20000
       or char_length(coalesce(p_currency, '')) > 8
       or (p_currency is not null and p_currency !~ '^[A-Za-z]{2,8}$')
       or char_length(coalesce(p_merchant, '')) > 200
       or char_length(coalesce(p_provider, '')) > 120
       or char_length(coalesce(p_reference, '')) > 250
       or char_length(coalesce(p_event_id, '')) > 250
       or char_length(coalesce(p_warning, '')) > 200
       or p_kind is null or p_kind not in ('expense', 'wallet_topup', 'self_transfer', 'payment_to_other', 'unknown')
       or (p_amount is not null and (p_amount <= 0 or p_amount > 9999999999.99 or p_amount <> round(p_amount, 2))) then
        raise exception 'Invalid pending transaction' using errcode = '22023';
    end if;

    if p_pairing_token_hash is null then
        if current_user_id is null or current_role <> 'authenticated' then
            raise exception 'Not authenticated' using errcode = '42501';
        end if;
        actor_key := 'user:' || current_user_id::text;
    else
        if current_role <> 'service_role' or current_user_id is not null or p_pairing_token_hash !~ '^[0-9a-f]{64}$' then
            raise exception 'Invalid import token' using errcode = '28000';
        end if;
        select * into import_token
        from public.pending_import_tokens
        where token_hash = p_pairing_token_hash
        for update;
        if not found or import_token.revoked_at is not null or import_token.expires_at <= clock_timestamp() then
            raise exception 'Invalid or expired import token' using errcode = '28000';
        end if;
        current_user_id := import_token.user_id;
        actor_key := 'token:' || p_pairing_token_hash;
    end if;

    retry_after := public.bump_pending_transaction_rate_limit(actor_key, 'import');
    if retry_after > 0 then
        return jsonb_build_object('rate_limited', true, 'retry_after_seconds', retry_after);
    end if;
    if import_token.id is not null then
        update public.pending_import_tokens
        set last_used_at = clock_timestamp()
        where id = import_token.id;
    end if;

    stable_provider := lower(regexp_replace(trim(coalesce(p_provider, '')), '[[:space:]]+', ' ', 'g'));
    stable_reference := trim(coalesce(p_reference, ''));
    stable_event_id := trim(coalesce(p_event_id, ''));
    if stable_provider <> '' and stable_event_id <> '' then
        stable_key := encode(digest(jsonb_build_array('event', stable_provider, stable_event_id)::text, 'sha256'), 'hex');
    elsif stable_provider <> '' and stable_reference <> '' then
        stable_key := encode(digest(jsonb_build_array('reference', stable_provider, stable_reference)::text, 'sha256'), 'hex');
    else
        stable_key := null;
    end if;

    if stable_key is not null then
        select * into existing_row
        from public.pending_transactions
        where user_id = current_user_id and dedupe_key = stable_key and status <> 'ignored'
        limit 1;
        if found then
            return jsonb_build_object('duplicate', true, 'pending_id', existing_row.id, 'status', existing_row.status);
        end if;
    end if;

    merchant_key := lower(regexp_replace(coalesce(p_merchant, ''), '[^[:alnum:]]', '', 'g'));
    if p_amount is not null and p_date is not null and char_length(merchant_key) >= 4 then
        select coalesce(jsonb_agg(jsonb_build_object(
            'record_type', candidate.record_type,
            'id', candidate.record_id,
            'description', candidate.record_label,
            'amount', candidate.record_amount,
            'date', candidate.record_date
        )), '[]'::jsonb)
        into candidate_duplicates
        from (
            select matches.record_type, matches.record_id, matches.record_label, matches.record_amount, matches.record_date
            from (
                select 'pending'::text as record_type, p.id::text as record_id,
                       coalesce(p.description, p.parsed_merchant, 'Pending import') as record_label,
                       p.parsed_amount as record_amount, p.parsed_date as record_date,
                       lower(regexp_replace(coalesce(p.parsed_merchant, p.description, ''), '[^[:alnum:]]', '', 'g')) as record_merchant_key,
                       p.created_at as record_created_at
                from public.pending_transactions p
                where p.user_id = current_user_id and p.status in ('pending', 'confirmed')
                union all
                select 'expense'::text as record_type, e.id::text as record_id,
                       coalesce(e.description, 'Expense') as record_label,
                       e.amount::numeric as record_amount, e.spent_at::date as record_date,
                       lower(regexp_replace(coalesce(e.description, ''), '[^[:alnum:]]', '', 'g')) as record_merchant_key,
                       e.created_at as record_created_at
                from public.expenses e
                where e.user_id = current_user_id
                  and not exists (
                      select 1 from public.pending_transactions confirmed
                      where confirmed.user_id = current_user_id
                        and confirmed.confirmed_expense_id = e.id
                  )
            ) matches
            where matches.record_amount between p_amount - 0.01 and p_amount + 0.01
              and matches.record_date between p_date - 3 and p_date + 3
              and char_length(matches.record_merchant_key) >= 4
              and (
                  matches.record_merchant_key = merchant_key
                  or position(merchant_key in matches.record_merchant_key) > 0
                  or position(matches.record_merchant_key in merchant_key) > 0
              )
            order by abs(matches.record_amount - p_amount), abs(matches.record_date - p_date), matches.record_created_at desc
            limit 5
        ) candidate;
    end if;

    insert into public.pending_transactions (
        user_id, import_token_id, source, raw_text, dedupe_key,
        parsed_amount, parsed_currency, selected_currency, manual_conversion,
        parsed_date, parsed_merchant, parsed_source, parsed_reference, parsed_event_id,
        parsed_type, parse_warning, possible_duplicates
    ) values (
        current_user_id, import_token.id, p_import_source, p_raw_text, stable_key,
        p_amount, p_currency, p_currency, false,
        p_date, p_merchant, p_provider, p_reference, p_event_id,
        p_kind, p_warning, candidate_duplicates
    )
    on conflict (user_id, dedupe_key)
        where dedupe_key is not null and status <> 'ignored'
    do nothing
    returning * into pending_row;

    if not found and stable_key is not null then
        select * into existing_row
        from public.pending_transactions
        where user_id = current_user_id and dedupe_key = stable_key and status <> 'ignored'
        limit 1;
        return jsonb_build_object('duplicate', true, 'pending_id', existing_row.id, 'status', existing_row.status);
    end if;

    return jsonb_build_object('duplicate', false, 'pending_id', pending_row.id, 'status', pending_row.status);
end;
$function$;

create or replace function public.edit_pending_transaction(
    p_pending_id uuid,
    p_amount numeric,
    p_currency text,
    p_manual_conversion boolean,
    p_date date,
    p_description text,
    p_category_id uuid,
    p_category text,
    p_kind text,
    p_reclassification_confirmed boolean,
    p_is_dating boolean,
    p_is_for_partner boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
    current_user_id uuid := auth.uid();
    pending_row public.pending_transactions%rowtype;
    selected_category_name text;
    retry_after integer;
begin
    if current_user_id is null or auth.role() <> 'authenticated' then
        raise exception 'Not authenticated' using errcode = '42501';
    end if;
    if p_kind is null or p_kind not in ('expense', 'wallet_topup', 'self_transfer', 'payment_to_other', 'unknown')
       or char_length(coalesce(p_currency, '')) > 8
       or (p_currency is not null and p_currency <> '' and p_currency !~ '^[A-Za-z]{2,8}$')
       or char_length(coalesce(p_description, '')) > 500
       or char_length(coalesce(p_category, '')) > 120
       or (p_amount is not null and (p_amount <= 0 or p_amount > 9999999999.99 or p_amount <> round(p_amount, 2))) then
        raise exception 'Invalid edit values' using errcode = '22023';
    end if;
    if p_manual_conversion and upper(coalesce(p_currency, '')) <> 'MYR' then
        raise exception 'Manual conversion must use MYR' using errcode = '22023';
    end if;

    select * into pending_row
    from public.pending_transactions
    where id = p_pending_id and user_id = current_user_id
    for update;
    if not found then raise exception 'Pending transaction not found' using errcode = 'P0002'; end if;
    if pending_row.status <> 'pending' then raise exception 'Only pending transactions can be edited' using errcode = 'P0001'; end if;

    retry_after := public.bump_pending_transaction_rate_limit('user:' || current_user_id::text, 'edit');
    if retry_after > 0 then
        return jsonb_build_object('rate_limited', true, 'retry_after_seconds', retry_after);
    end if;
    begin
    if p_kind = 'expense' and pending_row.parsed_type <> 'expense' and not coalesce(p_reclassification_confirmed, false) then
        raise exception 'Review the reclassification before selecting expense' using errcode = '22023';
    end if;

    selected_category_name := nullif(trim(coalesce(p_category, '')), '');
    if p_category_id is not null then
        select name into selected_category_name
        from public.expense_categories
        where id = p_category_id and (user_id is null or user_id = current_user_id)
        limit 1;
        if selected_category_name is null then raise exception 'Category not found' using errcode = '22023'; end if;
    end if;

    update public.pending_transactions
    set parsed_amount = p_amount,
        selected_currency = nullif(upper(trim(coalesce(p_currency, ''))), ''),
        manual_conversion = coalesce(p_manual_conversion, false),
        parsed_date = p_date,
        description = nullif(trim(coalesce(p_description, '')), ''),
        category_id = p_category_id,
        category = selected_category_name,
        parsed_type = p_kind,
        reclassification_confirmed = p_kind = 'expense' and (
            pending_row.parsed_type = 'expense'
            or coalesce(p_reclassification_confirmed, false)
            or pending_row.reclassification_confirmed
        ),
        is_dating = coalesce(p_is_dating, false),
        is_for_partner = coalesce(p_is_for_partner, false),
        updated_at = clock_timestamp()
    where id = pending_row.id
    returning * into pending_row;

    return jsonb_build_object('pending', to_jsonb(pending_row));
    exception
        when others then
            return jsonb_build_object('failure_code', SQLSTATE);
    end;
end;
$function$;

create or replace function public.confirm_pending_transaction(
    p_pending_id uuid,
    p_amount numeric,
    p_date date,
    p_currency text,
    p_manual_conversion boolean,
    p_kind text,
    p_reclassification_confirmed boolean,
    p_description text,
    p_category_id uuid,
    p_category text,
    p_is_dating boolean,
    p_is_for_partner boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
    current_user_id uuid := auth.uid();
    pending_row public.pending_transactions%rowtype;
    selected_category_id uuid;
    selected_category_name text;
    confirmed_amount numeric(12, 2);
    confirmed_description text;
    confirmed_date date;
    expense_id uuid;
    retry_after integer;
begin
    if current_user_id is null or auth.role() <> 'authenticated' then
        raise exception 'Not authenticated' using errcode = '42501';
    end if;

    select * into pending_row
    from public.pending_transactions
    where id = p_pending_id and user_id = current_user_id
    for update;
    if not found then raise exception 'Pending transaction not found' using errcode = 'P0002'; end if;

    retry_after := public.bump_pending_transaction_rate_limit('user:' || current_user_id::text, 'confirm');
    if retry_after > 0 then
        return jsonb_build_object('rate_limited', true, 'retry_after_seconds', retry_after);
    end if;

    if pending_row.status = 'confirmed' then
        return jsonb_build_object('pending_id', pending_row.id, 'status', pending_row.status, 'expense_id', pending_row.confirmed_expense_id);
    end if;
    begin
    if pending_row.status = 'ignored' then
        raise exception 'Ignored transactions cannot be confirmed' using errcode = 'P0001';
    end if;
    if p_kind is distinct from 'expense' then
        raise exception 'Select Expense only after reviewing this transaction' using errcode = '22023';
    end if;
    if pending_row.parsed_type <> 'expense'
       and not (coalesce(p_reclassification_confirmed, false) or pending_row.reclassification_confirmed) then
        raise exception 'Explicitly confirm this reclassification before creating an expense' using errcode = '22023';
    end if;

    confirmed_amount := coalesce(p_amount, pending_row.parsed_amount);
    confirmed_date := coalesce(p_date, pending_row.parsed_date);
    confirmed_description := nullif(trim(coalesce(p_description, pending_row.description, '')), '');
    if confirmed_amount is null or confirmed_amount <= 0 or confirmed_amount > 9999999999.99 or confirmed_amount <> round(confirmed_amount, 2) then
        raise exception 'A valid positive amount is required' using errcode = '22023';
    end if;
    if upper(coalesce(p_currency, pending_row.selected_currency, pending_row.parsed_currency, '')) <> 'MYR' then
        raise exception 'Currency must be MYR before confirming' using errcode = '22023';
    end if;
    if upper(coalesce(pending_row.parsed_currency, '')) <> 'MYR' and not coalesce(p_manual_conversion, false) then
        raise exception 'Explicitly confirm your manual RM conversion' using errcode = '22023';
    end if;
    if confirmed_date is null then raise exception 'A transaction date is required' using errcode = '22023'; end if;
    if confirmed_description is null or char_length(confirmed_description) > 500 then
        raise exception 'A description is required' using errcode = '22023';
    end if;

    if p_category_id is not null then
        select id, name into selected_category_id, selected_category_name
        from public.expense_categories
        where id = p_category_id and (user_id is null or user_id = current_user_id)
        limit 1;
    else
        select id, name into selected_category_id, selected_category_name
        from public.expense_categories
        where lower(trim(name)) = lower(trim(coalesce(p_category, pending_row.category, '')))
          and (user_id is null or user_id = current_user_id)
        order by user_id nulls last
        limit 1;
    end if;
    if selected_category_id is null then raise exception 'A valid expense category is required' using errcode = '22023'; end if;

    insert into public.expenses (
        user_id, amount, category, category_id, description, spent_at, is_dating, is_for_partner
    ) values (
        current_user_id, confirmed_amount, selected_category_name, selected_category_id,
        confirmed_description, confirmed_date, coalesce(p_is_dating, false), coalesce(p_is_for_partner, false)
    ) returning id into expense_id;

    update public.pending_transactions
    set status = 'confirmed',
        parsed_amount = confirmed_amount,
        selected_currency = 'MYR',
        manual_conversion = coalesce(p_manual_conversion, false),
        parsed_type = 'expense',
        reclassification_confirmed = true,
        description = confirmed_description,
        category = selected_category_name,
        category_id = selected_category_id,
        is_dating = coalesce(p_is_dating, false),
        is_for_partner = coalesce(p_is_for_partner, false),
        confirmed_expense_id = expense_id,
        confirmed_at = clock_timestamp(),
        updated_at = clock_timestamp()
    where id = pending_row.id;

    return jsonb_build_object('pending_id', pending_row.id, 'status', 'confirmed', 'expense_id', expense_id);
    exception
        when others then
            return jsonb_build_object('failure_code', SQLSTATE);
    end;
end;
$function$;

create or replace function public.ignore_pending_transaction(p_pending_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $function$
declare
    current_user_id uuid := auth.uid();
    pending_row public.pending_transactions%rowtype;
    retry_after integer;
begin
    if current_user_id is null or auth.role() <> 'authenticated' then
        raise exception 'Not authenticated' using errcode = '42501';
    end if;
    select * into pending_row
    from public.pending_transactions
    where id = p_pending_id and user_id = current_user_id
    for update;
    if not found then raise exception 'Pending transaction not found' using errcode = 'P0002'; end if;

    retry_after := public.bump_pending_transaction_rate_limit('user:' || current_user_id::text, 'ignore');
    if retry_after > 0 then
        return jsonb_build_object('rate_limited', true, 'retry_after_seconds', retry_after);
    end if;
    if pending_row.status = 'confirmed' then
        return jsonb_build_object('pending_id', pending_row.id, 'status', pending_row.status);
    end if;
    if pending_row.status = 'ignored' then
        return jsonb_build_object('pending_id', pending_row.id, 'status', 'ignored');
    end if;

    update public.pending_transactions
    set status = 'ignored', ignored_at = coalesce(ignored_at, clock_timestamp()), updated_at = clock_timestamp()
    where id = pending_row.id;
    return jsonb_build_object('pending_id', pending_row.id, 'status', 'ignored');
end;
$function$;

revoke all on function public.bump_pending_transaction_rate_limit(text, text) from public, anon, authenticated, service_role;
revoke all on function public.enforce_pending_rate_limit(text) from public, anon, authenticated, service_role;
revoke all on function public.create_pending_import_token(text, text) from public, anon, authenticated, service_role;
revoke all on function public.revoke_pending_import_token(uuid) from public, anon, authenticated, service_role;
revoke all on function public.suggest_pending_transaction_categories() from public, anon, authenticated, service_role;
revoke all on function public.create_pending_transaction(text, text, text, numeric, text, date, text, text, text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.edit_pending_transaction(uuid, numeric, text, boolean, date, text, uuid, text, text, boolean, boolean, boolean) from public, anon, authenticated, service_role;
revoke all on function public.confirm_pending_transaction(uuid, numeric, date, text, boolean, text, boolean, text, uuid, text, boolean, boolean) from public, anon, authenticated, service_role;
revoke all on function public.ignore_pending_transaction(uuid) from public, anon, authenticated, service_role;

grant execute on function public.enforce_pending_rate_limit(text) to authenticated;
grant execute on function public.create_pending_import_token(text, text) to authenticated;
grant execute on function public.revoke_pending_import_token(uuid) to authenticated;
grant execute on function public.suggest_pending_transaction_categories() to authenticated;
grant execute on function public.create_pending_transaction(text, text, text, numeric, text, date, text, text, text, text, text, text) to authenticated, service_role;
grant execute on function public.edit_pending_transaction(uuid, numeric, text, boolean, date, text, uuid, text, text, boolean, boolean, boolean) to authenticated;
grant execute on function public.confirm_pending_transaction(uuid, numeric, date, text, boolean, text, boolean, text, uuid, text, boolean, boolean) to authenticated;
grant execute on function public.ignore_pending_transaction(uuid) to authenticated;
