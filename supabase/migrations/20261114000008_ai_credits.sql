-- AI credits: an approximate, per-user measure of model spend, for a later fair-use limit,
-- free allowance or paid plan. 1 credit = USD 0.01 of model cost at list prices.
--
-- The database prices every usage_log row as it is inserted, so the figure does not depend on
-- the edge functions or on anything the inserting client sends.

-- List prices per million tokens. Change a price with a new migration; existing rows keep the
-- cost they were charged at.
create table public.model_prices (
  model_id text primary key,
  input_usd_per_mtok numeric(10, 4) not null check (input_usd_per_mtok >= 0),
  output_usd_per_mtok numeric(10, 4) not null check (output_usd_per_mtok >= 0),
  updated_at timestamptz not null default now()
);

insert into public.model_prices (model_id, input_usd_per_mtok, output_usd_per_mtok) values
  ('claude-sonnet-5-5', 2.00, 10.00),
  ('claude-haiku-5-5', 0.10, 0.50),
  ('claude-opus-5-5', 4.00, 20.00);

alter table public.model_prices enable row level security;
create policy model_prices_select on public.model_prices for select to authenticated using (true);

alter table public.usage_log
  add column cost_usd numeric(12, 6) not null default 0,
  add column credits numeric(12, 4) not null default 0;

-- Prices a row. An unknown model is charged at the highest listed rate, never at zero.
create function public.price_usage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  usd_per_credit constant numeric := 0.01;
  p_in numeric;
  p_out numeric;
begin
  select input_usd_per_mtok, output_usd_per_mtok into p_in, p_out
  from public.model_prices where model_id = new.model_id;
  if p_in is null then
    select max(input_usd_per_mtok), max(output_usd_per_mtok) into p_in, p_out from public.model_prices;
  end if;
  new.cost_usd := round((greatest(new.input_tokens, 0) * p_in + greatest(new.output_tokens, 0) * p_out) / 1000000.0, 6);
  new.credits := round(new.cost_usd / usd_per_credit, 4);
  return new;
end;
$$;

create trigger usage_log_price
  before insert on public.usage_log
  for each row execute function public.price_usage();

-- Backfill rows logged before this migration, with the same rule as the trigger.
update public.usage_log u
set cost_usd = round((
    greatest(u.input_tokens, 0) * coalesce((select p.input_usd_per_mtok from public.model_prices p where p.model_id = u.model_id),
                                           (select max(p.input_usd_per_mtok) from public.model_prices p))
  + greatest(u.output_tokens, 0) * coalesce((select p.output_usd_per_mtok from public.model_prices p where p.model_id = u.model_id),
                                            (select max(p.output_usd_per_mtok) from public.model_prices p))
  ) / 1000000.0, 6);
update public.usage_log set credits = round(cost_usd / 0.01, 4);

-- The signed-in user's own totals (row-level security limits the rows to theirs).
create function public.my_usage()
returns table (total_credits numeric, month_credits numeric, calls integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    coalesce(sum(credits), 0),
    coalesce(sum(credits) filter (where created_at >= date_trunc('month', now())), 0),
    count(*)::integer
  from public.usage_log
  where user_id = (select auth.uid());
$$;

revoke execute on function public.my_usage() from public, anon;
grant execute on function public.my_usage() to authenticated;

-- Per-user totals for the project owner (dashboard SQL editor or service role). Not exposed
-- to signed-in users. Join auth.users on user_id for email addresses.
create view public.usage_by_user
with (security_invoker = true)
as
select
  l.user_id,
  count(*)::integer as calls,
  sum(l.credits) as total_credits,
  sum(l.credits) filter (where l.created_at >= date_trunc('month', now())) as month_credits,
  sum(l.cost_usd) as total_cost_usd,
  max(l.created_at) as last_call_at
from public.usage_log l
group by l.user_id;

revoke all on public.usage_by_user from public, anon, authenticated;
grant select on public.usage_by_user to service_role;
