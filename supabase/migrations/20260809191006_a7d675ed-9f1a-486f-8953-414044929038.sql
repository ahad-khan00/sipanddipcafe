CREATE OR REPLACE FUNCTION public.place_order(_table_token text, _customer_name text, _customer_phone text, _notes text, _items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _table public.cafe_tables;
  _cafe public.cafes;
  _order_id uuid;
  _number integer;
  _subtotal integer := 0;
  _tax integer := 0;
  _recent integer;
  _item jsonb;
  _mi public.menu_items;
  _qty integer;
  _count integer := 0;
  _lines jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO _table FROM public.cafe_tables WHERE qr_token = _table_token AND active = true;
  IF _table.id IS NULL THEN RAISE EXCEPTION 'INVALID_TABLE'; END IF;

  SELECT * INTO _cafe FROM public.cafes WHERE id = _table.cafe_id;

  SELECT count(*) INTO _recent FROM public.orders
    WHERE table_id = _table.id AND created_at > now() - interval '1 minute';
  IF _recent >= 6 THEN RAISE EXCEPTION 'RATE_LIMITED'; END IF;

  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'EMPTY_CART';
  END IF;
  IF jsonb_array_length(_items) > 40 THEN RAISE EXCEPTION 'CART_TOO_LARGE'; END IF;

  -- Resolve trusted prices and totals BEFORE creating the order row, so the
  -- order is inserted already-final (order rows are immutable except status).
  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _qty := COALESCE((_item->>'quantity')::int, 0);
    IF _qty < 1 OR _qty > 50 THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF;

    SELECT * INTO _mi FROM public.menu_items
      WHERE id = (_item->>'menu_item_id')::uuid
        AND cafe_id = _table.cafe_id
        AND active = true
        AND available = true
      FOR SHARE;
    IF _mi.id IS NULL THEN RAISE EXCEPTION 'ITEM_UNAVAILABLE'; END IF;

    _lines := _lines || jsonb_build_object(
      'menu_item_id', _mi.id,
      'item_name', _mi.name,
      'unit_price_cents', _mi.price_cents,
      'quantity', _qty,
      'line_total_cents', _mi.price_cents * _qty
    );
    _subtotal := _subtotal + (_mi.price_cents * _qty);
    _count := _count + 1;
  END LOOP;

  IF _count = 0 THEN RAISE EXCEPTION 'EMPTY_CART'; END IF;

  _tax := round(_subtotal * COALESCE(_cafe.tax_rate, 0));

  UPDATE public.cafes SET order_seq = order_seq + 1 WHERE id = _cafe.id RETURNING order_seq INTO _number;

  INSERT INTO public.orders (cafe_id, table_id, order_number, customer_name, customer_phone, notes,
                             subtotal_cents, tax_cents, total_cents)
  VALUES (_cafe.id, _table.id, _number,
          NULLIF(trim(left(coalesce(_customer_name,''), 80)), ''),
          NULLIF(trim(left(coalesce(_customer_phone,''), 30)), ''),
          NULLIF(trim(left(coalesce(_notes,''), 500)), ''),
          _subtotal, _tax, _subtotal + _tax)
  RETURNING id INTO _order_id;

  INSERT INTO public.order_items (order_id, menu_item_id, item_name, unit_price_cents, quantity, line_total_cents)
  SELECT _order_id,
         (l->>'menu_item_id')::uuid,
         l->>'item_name',
         (l->>'unit_price_cents')::int,
         (l->>'quantity')::int,
         (l->>'line_total_cents')::int
  FROM jsonb_array_elements(_lines) AS l;

  RETURN _order_id;
END; $function$;

REVOKE ALL ON FUNCTION public.place_order(text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_order(text, text, text, text, jsonb) TO service_role;