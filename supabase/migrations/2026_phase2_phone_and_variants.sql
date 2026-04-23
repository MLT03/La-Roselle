-- =========================================================================
-- La Roselle — Phase 2 migration
--   1. Phone-based order lookup + cancel (guest access)
--   2. Variant-aware stock decrement / restock (shoes + clothes sizes)
--
-- Run this whole file in Supabase → SQL editor.
-- =========================================================================

-- Drop old signatures (parameter names changed, so CREATE OR REPLACE won't work)
drop function if exists public.get_orders_for_customer(text, text);
drop function if exists public.get_orders_for_customer(text);
drop function if exists public.cancel_order_for_customer(text, text);

-- -------------------------------------------------------------------------
-- 1) get_orders_for_customer(p_phone text)
--    Returns a jsonb array of orders whose data->customer->>phone matches
--    the given phone, normalized by stripping spaces/dashes/parens/dots.
-- -------------------------------------------------------------------------
create or replace function public.get_orders_for_customer(p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_norm text;
  v_rows jsonb;
begin
  v_norm := regexp_replace(coalesce(p_phone, ''), '[\s\-\(\)\.]', '', 'g');
  if length(v_norm) < 4 then
    return '[]'::jsonb;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', o.id,
      'status', o.status,
      'createdAt', o.created_at,
      'data', o.data
    ) order by o.created_at desc
  ), '[]'::jsonb)
  into v_rows
  from orders o
  where regexp_replace(coalesce(o.data->'customer'->>'phone',''), '[\s\-\(\)\.]', '', 'g') = v_norm;

  return coalesce(v_rows, '[]'::jsonb);
end;
$$;

grant execute on function public.get_orders_for_customer(text) to anon, authenticated;

-- -------------------------------------------------------------------------
-- 2) cancel_order_for_customer(p_id text, p_phone text)
--    Customer self-cancel. Allowed only while status is 'pending' or
--    'confirmed' (before shipping). Returns the canceled order jsonb.
-- -------------------------------------------------------------------------
create or replace function public.cancel_order_for_customer(
  p_id    text,
  p_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_norm   text;
  v_row    orders%rowtype;
  v_phone  text;
begin
  v_norm := regexp_replace(coalesce(p_phone, ''), '[\s\-\(\)\.]', '', 'g');

  select * into v_row from orders where id = p_id for update;
  if not found then
    raise exception 'not_found';
  end if;

  v_phone := regexp_replace(coalesce(v_row.data->'customer'->>'phone',''), '[\s\-\(\)\.]', '', 'g');
  if v_phone = '' or v_phone <> v_norm then
    raise exception 'not_found';
  end if;

  if v_row.status not in ('pending','confirmed') then
    raise exception 'cannot_cancel';
  end if;

  update orders
     set status = 'cancelled',
         data   = jsonb_set(coalesce(data, '{}'::jsonb), '{status}', to_jsonb('cancelled'::text), true)
   where id = p_id
   returning * into v_row;

  -- Restock the items (variant-aware)
  perform public.restock_items(coalesce(v_row.data->'items', '[]'::jsonb));

  return jsonb_build_object(
    'id', v_row.id,
    'status', v_row.status,
    'createdAt', v_row.created_at,
    'data', v_row.data
  );
end;
$$;

grant execute on function public.cancel_order_for_customer(text, text) to anon, authenticated;

-- -------------------------------------------------------------------------
-- 3) decrement_stock(p_items jsonb)
--    Atomic multi-item stock decrement.
--    Each item: { id, qty, size? }
--      - If size provided and product has variants, decrement that variant.
--      - Otherwise decrement the flat `stock` column.
--    On shortage: raise 'stock_conflict:<productId>:<available>:<requested>'
-- -------------------------------------------------------------------------
create or replace function public.decrement_stock(p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  it          jsonb;
  v_id        text;
  v_qty       int;
  v_size      text;
  v_prod      products%rowtype;
  v_variants  jsonb;
  v_idx       int;
  v_vstock    int;
  v_new_vars  jsonb;
  v_total     int;
begin
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_id   := it->>'id';
    v_qty  := coalesce((it->>'qty')::int, 0);
    v_size := nullif(it->>'size', '');

    if v_id is null or v_qty <= 0 then
      continue;
    end if;

    select * into v_prod from products where id = v_id for update;
    if not found then
      raise exception 'stock_conflict:%:0:%', v_id, v_qty;
    end if;

    v_variants := v_prod.data->'variants';

    if v_size is not null and jsonb_typeof(v_variants) = 'array' and jsonb_array_length(v_variants) > 0 then
      -- Variant path: find the matching size
      v_idx := null;
      for i in 0 .. jsonb_array_length(v_variants) - 1 loop
        if (v_variants->i->>'size') = v_size then
          v_idx := i;
          exit;
        end if;
      end loop;

      if v_idx is null then
        raise exception 'stock_conflict:%:0:%', v_id, v_qty;
      end if;

      v_vstock := coalesce((v_variants->v_idx->>'stock')::int, 0);
      if v_vstock < v_qty then
        raise exception 'stock_conflict:%:%:%', v_id, v_vstock, v_qty;
      end if;

      v_new_vars := jsonb_set(
        v_variants,
        array[v_idx::text, 'stock'],
        to_jsonb(v_vstock - v_qty),
        true
      );

      -- Recompute total stock from variants
      select coalesce(sum((v->>'stock')::int), 0)
        into v_total
        from jsonb_array_elements(v_new_vars) as v;

      update products
         set data  = jsonb_set(v_prod.data, '{variants}', v_new_vars, true),
             stock = greatest(0, v_total)
       where id = v_id;
    else
      -- Flat-stock path
      if v_prod.stock < v_qty then
        raise exception 'stock_conflict:%:%:%', v_id, v_prod.stock, v_qty;
      end if;
      update products
         set stock = v_prod.stock - v_qty
       where id = v_id;
    end if;
  end loop;
end;
$$;

grant execute on function public.decrement_stock(jsonb) to anon, authenticated;

-- -------------------------------------------------------------------------
-- 4) restock_items(p_items jsonb)
--    Inverse of decrement_stock — used when an order is cancelled.
-- -------------------------------------------------------------------------
create or replace function public.restock_items(p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  it          jsonb;
  v_id        text;
  v_qty       int;
  v_size      text;
  v_prod      products%rowtype;
  v_variants  jsonb;
  v_idx       int;
  v_vstock    int;
  v_new_vars  jsonb;
  v_total     int;
begin
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_id   := it->>'id';
    v_qty  := coalesce((it->>'qty')::int, 0);
    v_size := nullif(it->>'size', '');

    if v_id is null or v_qty <= 0 then
      continue;
    end if;

    select * into v_prod from products where id = v_id for update;
    if not found then
      continue;
    end if;

    v_variants := v_prod.data->'variants';

    if v_size is not null and jsonb_typeof(v_variants) = 'array' and jsonb_array_length(v_variants) > 0 then
      v_idx := null;
      for i in 0 .. jsonb_array_length(v_variants) - 1 loop
        if (v_variants->i->>'size') = v_size then
          v_idx := i;
          exit;
        end if;
      end loop;

      if v_idx is null then
        -- Append the missing size so the stock isn't lost
        v_new_vars := coalesce(v_variants, '[]'::jsonb)
          || jsonb_build_array(jsonb_build_object('size', v_size, 'stock', v_qty));
      else
        v_vstock := coalesce((v_variants->v_idx->>'stock')::int, 0);
        v_new_vars := jsonb_set(
          v_variants,
          array[v_idx::text, 'stock'],
          to_jsonb(v_vstock + v_qty),
          true
        );
      end if;

      select coalesce(sum((v->>'stock')::int), 0)
        into v_total
        from jsonb_array_elements(v_new_vars) as v;

      update products
         set data  = jsonb_set(v_prod.data, '{variants}', v_new_vars, true),
             stock = greatest(0, v_total)
       where id = v_id;
    else
      update products
         set stock = coalesce(v_prod.stock, 0) + v_qty
       where id = v_id;
    end if;
  end loop;
end;
$$;

grant execute on function public.restock_items(jsonb) to anon, authenticated, service_role;
