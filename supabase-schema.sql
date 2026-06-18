create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.auction_settings (
  key text primary key,
  value text not null
);

create table if not exists public.auction_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  description text not null,
  start_price integer not null check (start_price > 0),
  bid_step integer not null check (bid_step > 0),
  image_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.auction_bids (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.auction_items(id) on delete cascade,
  bidder text not null,
  amount integer not null check (amount > 0),
  created_at timestamptz not null default now()
);

alter table public.auction_settings enable row level security;
alter table public.auction_items enable row level security;
alter table public.auction_bids enable row level security;

drop policy if exists "Public can read auction items" on public.auction_items;
create policy "Public can read auction items"
on public.auction_items for select
to anon
using (true);

drop policy if exists "Public can read auction bids" on public.auction_bids;
create policy "Public can read auction bids"
on public.auction_bids for select
to anon
using (true);

insert into public.auction_settings (key, value)
values ('admin_password_hash', encode(extensions.digest('mariage2026', 'sha256'), 'hex'))
on conflict (key) do update set value = excluded.value;

create or replace function public.verify_admin_password(password_input text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.auction_settings
    where key = 'admin_password_hash'
      and value = encode(extensions.digest(password_input, 'sha256'), 'hex')
  );
$$;

create or replace function public.admin_create_item(
  password_input text,
  item_name text,
  item_category text,
  item_description text,
  item_start_price integer,
  item_bid_step integer,
  item_image_url text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if not public.verify_admin_password(password_input) then
    raise exception 'Mot de passe admin incorrect';
  end if;

  insert into public.auction_items (name, category, description, start_price, bid_step, image_url)
  values (item_name, item_category, item_description, item_start_price, item_bid_step, nullif(item_image_url, ''))
  returning id into new_id;

  return new_id;
end;
$$;

create or replace function public.admin_delete_item(password_input text, item_id_input uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.verify_admin_password(password_input) then
    raise exception 'Mot de passe admin incorrect';
  end if;

  delete from public.auction_items where id = item_id_input;
end;
$$;

create or replace function public.place_bid(item_id_input uuid, bidder_input text, amount_input integer)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  item_record public.auction_items%rowtype;
  current_amount integer;
  new_id uuid;
begin
  select * into item_record
  from public.auction_items
  where id = item_id_input;

  if not found then
    raise exception 'Objet introuvable';
  end if;

  select coalesce(max(amount), item_record.start_price)
  into current_amount
  from public.auction_bids
  where item_id = item_id_input;

  if amount_input < current_amount + item_record.bid_step then
    raise exception 'La mise minimum est de % EUR', current_amount + item_record.bid_step;
  end if;

  insert into public.auction_bids (item_id, bidder, amount)
  values (item_id_input, trim(bidder_input), amount_input)
  returning id into new_id;

  return new_id;
end;
$$;

create or replace function public.admin_reset_demo(password_input text, demo_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  bid jsonb;
  new_item_id uuid;
begin
  if not public.verify_admin_password(password_input) then
    raise exception 'Mot de passe admin incorrect';
  end if;

  delete from public.auction_items;

  for item in select * from jsonb_array_elements(demo_items)
  loop
    insert into public.auction_items (name, category, description, start_price, bid_step, image_url)
    values (
      item->>'name',
      item->>'category',
      item->>'description',
      (item->>'start_price')::integer,
      (item->>'bid_step')::integer,
      nullif(item->>'image_url', '')
    )
    returning id into new_item_id;

    for bid in select * from jsonb_array_elements(coalesce(item->'bids', '[]'::jsonb))
    loop
      insert into public.auction_bids (item_id, bidder, amount, created_at)
      values (
        new_item_id,
        bid->>'bidder',
        (bid->>'amount')::integer,
        to_timestamp(((bid->>'at')::numeric / 1000.0))
      );
    end loop;
  end loop;
end;
$$;

grant usage on schema public to anon;
grant select on public.auction_items to anon;
grant select on public.auction_bids to anon;
grant execute on function public.verify_admin_password(text) to anon;
grant execute on function public.admin_create_item(text, text, text, text, integer, integer, text) to anon;
grant execute on function public.admin_delete_item(text, uuid) to anon;
grant execute on function public.place_bid(uuid, text, integer) to anon;
grant execute on function public.admin_reset_demo(text, jsonb) to anon;

do $$
begin
  alter publication supabase_realtime add table public.auction_items;
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.auction_bids;
exception
  when duplicate_object then null;
end;
$$;
