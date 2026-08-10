-- ============ 1. ORDERS: tip, payment, tracking token, customer link ============
DO $$ BEGIN
  CREATE TYPE public.payment_status AS ENUM ('PENDING','PAID','FAILED','REFUNDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_method AS ENUM ('ONLINE','CAFE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tip_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_method public.payment_method NOT NULL DEFAULT 'CAFE',
  ADD COLUMN IF NOT EXISTS payment_status public.payment_status NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS customer_id uuid,
  ADD COLUMN IF NOT EXISTS tracking_token text NOT NULL DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  ADD COLUMN IF NOT EXISTS request_key text;

CREATE UNIQUE INDEX IF NOT EXISTS orders_tracking_token_key ON public.orders (tracking_token);
CREATE UNIQUE INDEX IF NOT EXISTS orders_request_key_uniq ON public.orders (table_id, request_key) WHERE request_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_customer_idx ON public.orders (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_cafe_created_idx ON public.orders (cafe_id, created_at DESC);

ALTER TABLE public.cafes ALTER COLUMN currency SET DEFAULT 'INR';

-- Signed-in customers may read their own orders (guests use the tracking token
-- through a server function instead).
DROP POLICY IF EXISTS orders_customer_select ON public.orders;
CREATE POLICY orders_customer_select ON public.orders
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid());

DROP POLICY IF EXISTS order_items_customer_select ON public.order_items;
CREATE POLICY order_items_customer_select ON public.order_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_items.order_id AND o.customer_id = auth.uid()));

-- Guard: keep money/identity immutable, allow the documented status +
-- payment transitions only.
CREATE OR REPLACE FUNCTION public.guard_order_update()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  NEW.updated_at = now();
  IF NEW.cafe_id <> OLD.cafe_id
     OR NEW.table_id <> OLD.table_id
     OR NEW.order_number <> OLD.order_number
     OR NEW.subtotal_cents <> OLD.subtotal_cents
     OR NEW.tax_cents <> OLD.tax_cents
     OR NEW.tip_cents <> OLD.tip_cents
     OR NEW.total_cents <> OLD.total_cents
     OR NEW.payment_method <> OLD.payment_method
     OR NEW.tracking_token <> OLD.tracking_token
     OR COALESCE(NEW.customer_id::text,'') <> COALESCE(OLD.customer_id::text,'')
     OR COALESCE(NEW.request_key,'') <> COALESCE(OLD.request_key,'')
     OR COALESCE(NEW.created_at, OLD.created_at) <> OLD.created_at THEN
    RAISE EXCEPTION 'Order records are immutable except for status';
  END IF;

  IF NEW.payment_status <> OLD.payment_status THEN
    -- Cafe staff may only settle a pay-at-cafe order in person; every other
    -- payment transition must come from the verified server-side payment code.
    IF auth.uid() IS NOT NULL AND NOT (
      OLD.payment_method = 'CAFE' AND OLD.payment_status = 'PENDING' AND NEW.payment_status = 'PAID'
    ) THEN
      RAISE EXCEPTION 'Payment status is set by the payment provider';
    END IF;
    IF NEW.payment_status = 'PAID' AND NEW.paid_at IS NULL THEN NEW.paid_at = now(); END IF;
  END IF;

  IF NEW.status <> OLD.status THEN
    IF OLD.status IN ('COMPLETED','CANCELLED') THEN
      RAISE EXCEPTION 'Order is already finalised';
    END IF;
    IF NEW.status = 'CANCELLED' THEN RETURN NEW; END IF;
    IF NOT (
      (OLD.status = 'NEW' AND NEW.status = 'ACCEPTED')
      OR (OLD.status = 'ACCEPTED' AND NEW.status = 'PREPARING')
      OR (OLD.status = 'PREPARING' AND NEW.status = 'READY')
      OR (OLD.status = 'READY' AND NEW.status = 'COMPLETED')
    ) THEN
      RAISE EXCEPTION 'Invalid status transition % -> %', OLD.status, NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END; $function$;

-- ============ 2. CUSTOMER PROFILES ============
CREATE TABLE IF NOT EXISTS public.customer_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.customer_profiles TO authenticated;
GRANT ALL ON public.customer_profiles TO service_role;
ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customer_profiles_self ON public.customer_profiles;
CREATE POLICY customer_profiles_self ON public.customer_profiles
  FOR ALL TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
DROP TRIGGER IF EXISTS customer_profiles_touch ON public.customer_profiles;
CREATE TRIGGER customer_profiles_touch BEFORE UPDATE ON public.customer_profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ 3. PAYMENTS ============
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'razorpay',
  provider_order_id text NOT NULL,
  provider_payment_id text,
  status public.payment_status NOT NULL DEFAULT 'PENDING',
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'INR',
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_order_uniq ON public.payments (provider, provider_order_id);
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_payment_uniq ON public.payments (provider, provider_payment_id) WHERE provider_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payments_order_idx ON public.payments (order_id);

-- Staff read-only; all writes happen server-side with the service role.
GRANT SELECT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payments_member_select ON public.payments;
CREATE POLICY payments_member_select ON public.payments
  FOR SELECT TO authenticated USING (public.is_cafe_member(cafe_id, auth.uid()));
DROP TRIGGER IF EXISTS payments_touch ON public.payments;
CREATE TRIGGER payments_touch BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ 4. REVIEWS (rating + optional text, one per order) ============
CREATE TABLE IF NOT EXISTS public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  customer_id uuid,
  guest_ref text,
  rating smallint NOT NULL,
  comment text,
  display_name text,
  hidden boolean NOT NULL DEFAULT false,
  flagged boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reviews_cafe_idx ON public.reviews (cafe_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.validate_review()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.rating < 1 OR NEW.rating > 5 THEN RAISE EXCEPTION 'INVALID_RATING'; END IF;
  IF NEW.comment IS NOT NULL AND (length(NEW.comment) < 5 OR length(NEW.comment) > 500) THEN
    RAISE EXCEPTION 'INVALID_REVIEW_LENGTH';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    -- Owners moderate visibility only; the customer's words are immutable.
    IF NEW.rating <> OLD.rating
       OR COALESCE(NEW.comment,'') <> COALESCE(OLD.comment,'')
       OR NEW.cafe_id <> OLD.cafe_id
       OR NEW.order_id <> OLD.order_id
       OR COALESCE(NEW.display_name,'') <> COALESCE(OLD.display_name,'')
       OR COALESCE(NEW.customer_id::text,'') <> COALESCE(OLD.customer_id::text,'') THEN
      RAISE EXCEPTION 'Reviews cannot be edited, only hidden or flagged';
    END IF;
    NEW.updated_at = now();
  END IF;
  RETURN NEW;
END; $function$;

DROP TRIGGER IF EXISTS reviews_validate ON public.reviews;
CREATE TRIGGER reviews_validate BEFORE INSERT OR UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.validate_review();

GRANT SELECT ON public.reviews TO anon, authenticated;
GRANT UPDATE (hidden, flagged) ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reviews_public_select ON public.reviews;
CREATE POLICY reviews_public_select ON public.reviews
  FOR SELECT TO anon, authenticated USING (hidden = false);

DROP POLICY IF EXISTS reviews_member_select ON public.reviews;
CREATE POLICY reviews_member_select ON public.reviews
  FOR SELECT TO authenticated USING (public.is_cafe_member(cafe_id, auth.uid()));

DROP POLICY IF EXISTS reviews_member_moderate ON public.reviews;
CREATE POLICY reviews_member_moderate ON public.reviews
  FOR UPDATE TO authenticated
  USING (public.is_cafe_member(cafe_id, auth.uid()))
  WITH CHECK (public.is_cafe_member(cafe_id, auth.uid()));

-- ============ 5. place_order with server-calculated tip + payment ============
DROP FUNCTION IF EXISTS public.place_order(text, text, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.place_order(
  _table_token text,
  _customer_name text,
  _customer_phone text,
  _notes text,
  _items jsonb,
  _tip_cents integer DEFAULT 0,
  _payment_method text DEFAULT 'CAFE',
  _customer_id uuid DEFAULT NULL,
  _request_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  _table public.cafe_tables;
  _cafe public.cafes;
  _order_id uuid;
  _token text;
  _number integer;
  _subtotal integer := 0;
  _tax integer := 0;
  _tip integer := GREATEST(0, COALESCE(_tip_cents, 0));
  _recent integer;
  _item jsonb;
  _mi public.menu_items;
  _qty integer;
  _count integer := 0;
  _lines jsonb := '[]'::jsonb;
  _existing public.orders;
BEGIN
  SELECT * INTO _table FROM public.cafe_tables WHERE qr_token = _table_token AND active = true;
  IF _table.id IS NULL THEN RAISE EXCEPTION 'INVALID_TABLE'; END IF;

  -- Idempotency: the same client request key never creates a second order.
  IF _request_key IS NOT NULL THEN
    SELECT * INTO _existing FROM public.orders
      WHERE table_id = _table.id AND request_key = _request_key;
    IF _existing.id IS NOT NULL THEN
      RETURN jsonb_build_object('order_id', _existing.id, 'tracking_token', _existing.tracking_token, 'total_cents', _existing.total_cents, 'duplicate', true);
    END IF;
  END IF;

  SELECT * INTO _cafe FROM public.cafes WHERE id = _table.cafe_id;

  SELECT count(*) INTO _recent FROM public.orders
    WHERE table_id = _table.id AND created_at > now() - interval '1 minute';
  IF _recent >= 6 THEN RAISE EXCEPTION 'RATE_LIMITED'; END IF;

  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'EMPTY_CART';
  END IF;
  IF jsonb_array_length(_items) > 40 THEN RAISE EXCEPTION 'CART_TOO_LARGE'; END IF;
  IF _payment_method NOT IN ('ONLINE','CAFE') THEN RAISE EXCEPTION 'INVALID_PAYMENT_METHOD'; END IF;

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

  -- Tip sanity: never negative, never more than the food itself plus a small
  -- floor, and hard-capped so a manipulated client cannot inflate a charge.
  IF _tip > LEAST(500000, GREATEST(20000, _subtotal * 2)) THEN RAISE EXCEPTION 'INVALID_TIP'; END IF;

  UPDATE public.cafes SET order_seq = order_seq + 1 WHERE id = _cafe.id RETURNING order_seq INTO _number;

  INSERT INTO public.orders (cafe_id, table_id, order_number, customer_name, customer_phone, notes,
                             subtotal_cents, tax_cents, tip_cents, total_cents,
                             payment_method, payment_status, customer_id, request_key)
  VALUES (_cafe.id, _table.id, _number,
          NULLIF(trim(left(coalesce(_customer_name,''), 80)), ''),
          NULLIF(trim(left(coalesce(_customer_phone,''), 30)), ''),
          NULLIF(trim(left(coalesce(_notes,''), 500)), ''),
          _subtotal, _tax, _tip, _subtotal + _tax + _tip,
          _payment_method::public.payment_method, 'PENDING', _customer_id, _request_key)
  RETURNING id, tracking_token INTO _order_id, _token;

  INSERT INTO public.order_items (order_id, menu_item_id, item_name, unit_price_cents, quantity, line_total_cents)
  SELECT _order_id,
         (l->>'menu_item_id')::uuid,
         l->>'item_name',
         (l->>'unit_price_cents')::int,
         (l->>'quantity')::int,
         (l->>'line_total_cents')::int
  FROM jsonb_array_elements(_lines) AS l;

  RETURN jsonb_build_object('order_id', _order_id, 'tracking_token', _token,
                            'total_cents', _subtotal + _tax + _tip, 'duplicate', false);
END; $function$;

REVOKE ALL ON FUNCTION public.place_order(text, text, text, text, jsonb, integer, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_order(text, text, text, text, jsonb, integer, text, uuid, text) TO service_role;

-- ============ 6. Review submission with eligibility checks ============
CREATE OR REPLACE FUNCTION public.submit_review(
  _order_id uuid,
  _tracking_token text,
  _rating integer,
  _comment text DEFAULT NULL,
  _customer_id uuid DEFAULT NULL,
  _display_name text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE _o public.orders; _id uuid; _text text;
BEGIN
  SELECT * INTO _o FROM public.orders WHERE id = _order_id;
  IF _o.id IS NULL THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;

  -- Eligibility: must hold the order's secret tracking token, or own it.
  IF NOT (_o.tracking_token = _tracking_token OR (_customer_id IS NOT NULL AND _o.customer_id = _customer_id)) THEN
    RAISE EXCEPTION 'NOT_ELIGIBLE';
  END IF;
  IF _o.status <> 'COMPLETED' THEN RAISE EXCEPTION 'ORDER_NOT_COMPLETED'; END IF;
  IF EXISTS (SELECT 1 FROM public.reviews WHERE order_id = _order_id) THEN
    RAISE EXCEPTION 'ALREADY_REVIEWED';
  END IF;

  _text := NULLIF(trim(left(coalesce(_comment,''), 500)), '');

  INSERT INTO public.reviews (cafe_id, order_id, customer_id, guest_ref, rating, comment, display_name)
  VALUES (_o.cafe_id, _o.id, _customer_id,
          CASE WHEN _customer_id IS NULL THEN left(encode(digest(_o.tracking_token, 'sha256'), 'hex'), 32) ELSE NULL END,
          _rating::smallint, _text,
          NULLIF(trim(left(coalesce(_display_name, _o.customer_name, ''), 40)), ''))
  RETURNING id INTO _id;
  RETURN _id;
END; $function$;

REVOKE ALL ON FUNCTION public.submit_review(uuid, text, integer, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_review(uuid, text, integer, text, uuid, text) TO service_role;

-- ============ 7. Public rating summary (safe aggregate only) ============
CREATE OR REPLACE FUNCTION public.cafe_rating_summary(_cafe_id uuid)
RETURNS TABLE (average numeric, total bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT round(avg(rating)::numeric, 1), count(*)
  FROM public.reviews WHERE cafe_id = _cafe_id AND hidden = false;
$function$;
GRANT EXECUTE ON FUNCTION public.cafe_rating_summary(uuid) TO anon, authenticated, service_role;
