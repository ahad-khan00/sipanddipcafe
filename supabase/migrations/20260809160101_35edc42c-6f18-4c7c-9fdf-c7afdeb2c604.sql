-- ============ ENUMS ============
CREATE TYPE public.order_status AS ENUM ('NEW','ACCEPTED','PREPARING','READY','COMPLETED','CANCELLED');
CREATE TYPE public.cafe_role AS ENUM ('owner','staff');

-- ============ CAFES ============
CREATE TABLE public.cafes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  slug text UNIQUE,
  description text,
  currency text NOT NULL DEFAULT 'USD' CHECK (length(currency) = 3),
  tax_rate numeric(5,4) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 0.5),
  order_seq integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.cafe_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.cafe_role NOT NULL DEFAULT 'owner',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cafe_id, user_id)
);
CREATE INDEX cafe_members_user_idx ON public.cafe_members(user_id);

-- membership helper (security definer, avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.is_cafe_member(_cafe_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.cafe_members m WHERE m.cafe_id = _cafe_id AND m.user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.has_cafe_role(_cafe_id uuid, _user_id uuid, _role public.cafe_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.cafe_members m WHERE m.cafe_id = _cafe_id AND m.user_id = _user_id AND m.role = _role);
$$;

-- ============ TABLES (physical cafe tables) ============
CREATE TABLE public.cafe_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  table_number text NOT NULL CHECK (length(trim(table_number)) BETWEEN 1 AND 20),
  qr_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cafe_id, table_number)
);
CREATE INDEX cafe_tables_cafe_idx ON public.cafe_tables(cafe_id);

-- ============ MENU ============
CREATE TABLE public.menu_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX menu_categories_cafe_idx ON public.menu_categories(cafe_id, sort_order);

CREATE TABLE public.menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  category_id uuid REFERENCES public.menu_categories(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  description text CHECK (description IS NULL OR length(description) <= 500),
  price_cents integer NOT NULL CHECK (price_cents >= 0 AND price_cents <= 1000000),
  image_url text,
  available boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX menu_items_cafe_idx ON public.menu_items(cafe_id, category_id, sort_order);

-- ============ ORDERS ============
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES public.cafe_tables(id) ON DELETE RESTRICT,
  order_number integer NOT NULL,
  status public.order_status NOT NULL DEFAULT 'NEW',
  customer_name text CHECK (customer_name IS NULL OR length(customer_name) <= 80),
  customer_phone text CHECK (customer_phone IS NULL OR length(customer_phone) <= 30),
  notes text CHECK (notes IS NULL OR length(notes) <= 500),
  subtotal_cents integer NOT NULL CHECK (subtotal_cents >= 0),
  tax_cents integer NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  total_cents integer NOT NULL CHECK (total_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cafe_id, order_number)
);
CREATE INDEX orders_cafe_status_idx ON public.orders(cafe_id, status, created_at DESC);
CREATE INDEX orders_table_created_idx ON public.orders(table_id, created_at DESC);

CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  menu_item_id uuid REFERENCES public.menu_items(id) ON DELETE SET NULL,
  item_name text NOT NULL,
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0),
  quantity integer NOT NULL CHECK (quantity > 0 AND quantity <= 50),
  line_total_cents integer NOT NULL CHECK (line_total_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_items_order_idx ON public.order_items(order_id);

-- ============ TIMESTAMP TRIGGER ============
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER cafes_touch BEFORE UPDATE ON public.cafes FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER menu_items_touch BEFORE UPDATE ON public.menu_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ ORDER IMMUTABILITY + STATUS TRANSITIONS ============
CREATE OR REPLACE FUNCTION public.guard_order_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  -- financial + identity fields are immutable once created
  IF NEW.cafe_id <> OLD.cafe_id
     OR NEW.table_id <> OLD.table_id
     OR NEW.order_number <> OLD.order_number
     OR NEW.subtotal_cents <> OLD.subtotal_cents
     OR NEW.tax_cents <> OLD.tax_cents
     OR NEW.total_cents <> OLD.total_cents
     OR COALESCE(NEW.created_at, OLD.created_at) <> OLD.created_at THEN
    RAISE EXCEPTION 'Order records are immutable except for status';
  END IF;

  IF NEW.status <> OLD.status THEN
    IF OLD.status IN ('COMPLETED','CANCELLED') THEN
      RAISE EXCEPTION 'Order is already finalised';
    END IF;
    IF NEW.status = 'CANCELLED' THEN
      RETURN NEW;
    END IF;
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
END; $$;

CREATE TRIGGER orders_guard BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.guard_order_update();

-- order_items are append-only via the trusted RPC
CREATE OR REPLACE FUNCTION public.block_order_item_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Order items are immutable'; END; $$;

CREATE TRIGGER order_items_immutable BEFORE UPDATE OR DELETE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.block_order_item_change();

-- ============ GRANTS ============
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cafes TO authenticated;
GRANT ALL ON public.cafes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cafe_members TO authenticated;
GRANT ALL ON public.cafe_members TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cafe_tables TO authenticated;
GRANT ALL ON public.cafe_tables TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_categories TO authenticated;
GRANT ALL ON public.menu_categories TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_items TO authenticated;
GRANT ALL ON public.menu_items TO service_role;
GRANT SELECT, UPDATE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
GRANT SELECT ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;

-- ============ RLS ============
ALTER TABLE public.cafes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cafe_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cafe_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- cafes
CREATE POLICY cafes_member_select ON public.cafes FOR SELECT TO authenticated
  USING (public.is_cafe_member(id, auth.uid()));
CREATE POLICY cafes_owner_update ON public.cafes FOR UPDATE TO authenticated
  USING (public.has_cafe_role(id, auth.uid(), 'owner'))
  WITH CHECK (public.has_cafe_role(id, auth.uid(), 'owner'));

-- cafe_members: users see their own memberships; owners see the whole team
CREATE POLICY members_self_select ON public.cafe_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_cafe_role(cafe_id, auth.uid(), 'owner'));
CREATE POLICY members_owner_manage ON public.cafe_members FOR INSERT TO authenticated
  WITH CHECK (public.has_cafe_role(cafe_id, auth.uid(), 'owner'));
CREATE POLICY members_owner_delete ON public.cafe_members FOR DELETE TO authenticated
  USING (public.has_cafe_role(cafe_id, auth.uid(), 'owner') AND user_id <> auth.uid());

-- cafe_tables
CREATE POLICY tables_member_all ON public.cafe_tables FOR ALL TO authenticated
  USING (public.is_cafe_member(cafe_id, auth.uid()))
  WITH CHECK (public.is_cafe_member(cafe_id, auth.uid()));

-- menu
CREATE POLICY categories_member_all ON public.menu_categories FOR ALL TO authenticated
  USING (public.is_cafe_member(cafe_id, auth.uid()))
  WITH CHECK (public.is_cafe_member(cafe_id, auth.uid()));
CREATE POLICY items_member_all ON public.menu_items FOR ALL TO authenticated
  USING (public.is_cafe_member(cafe_id, auth.uid()))
  WITH CHECK (public.is_cafe_member(cafe_id, auth.uid()));

-- orders: members read + update status only (guarded by trigger). No client inserts.
CREATE POLICY orders_member_select ON public.orders FOR SELECT TO authenticated
  USING (public.is_cafe_member(cafe_id, auth.uid()));
CREATE POLICY orders_member_update ON public.orders FOR UPDATE TO authenticated
  USING (public.is_cafe_member(cafe_id, auth.uid()))
  WITH CHECK (public.is_cafe_member(cafe_id, auth.uid()));

CREATE POLICY order_items_member_select ON public.order_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id AND public.is_cafe_member(o.cafe_id, auth.uid())
  ));

-- ============ CAFE BOOTSTRAP RPC ============
CREATE OR REPLACE FUNCTION public.create_cafe_for_current_user(_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _cafe_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF EXISTS (SELECT 1 FROM public.cafe_members WHERE user_id = _uid) THEN
    RAISE EXCEPTION 'User already belongs to a cafe';
  END IF;
  IF _name IS NULL OR length(trim(_name)) = 0 THEN RAISE EXCEPTION 'Cafe name required'; END IF;

  INSERT INTO public.cafes (name) VALUES (trim(left(_name, 120))) RETURNING id INTO _cafe_id;
  INSERT INTO public.cafe_members (cafe_id, user_id, role) VALUES (_cafe_id, _uid, 'owner');
  RETURN _cafe_id;
END; $$;

REVOKE ALL ON FUNCTION public.create_cafe_for_current_user(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_cafe_for_current_user(text) TO authenticated;

-- ============ TRUSTED ORDER PLACEMENT RPC (server-role only) ============
CREATE OR REPLACE FUNCTION public.place_order(
  _table_token text,
  _customer_name text,
  _customer_phone text,
  _notes text,
  _items jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
BEGIN
  SELECT * INTO _table FROM public.cafe_tables WHERE qr_token = _table_token AND active = true;
  IF _table.id IS NULL THEN RAISE EXCEPTION 'INVALID_TABLE'; END IF;

  SELECT * INTO _cafe FROM public.cafes WHERE id = _table.cafe_id;

  -- spam guard: max 6 orders per table per minute
  SELECT count(*) INTO _recent FROM public.orders
    WHERE table_id = _table.id AND created_at > now() - interval '1 minute';
  IF _recent >= 6 THEN RAISE EXCEPTION 'RATE_LIMITED'; END IF;

  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'EMPTY_CART';
  END IF;
  IF jsonb_array_length(_items) > 40 THEN RAISE EXCEPTION 'CART_TOO_LARGE'; END IF;

  -- reserve an order number atomically
  UPDATE public.cafes SET order_seq = order_seq + 1 WHERE id = _cafe.id RETURNING order_seq INTO _number;

  INSERT INTO public.orders (cafe_id, table_id, order_number, customer_name, customer_phone, notes,
                             subtotal_cents, tax_cents, total_cents)
  VALUES (_cafe.id, _table.id, _number,
          NULLIF(trim(left(coalesce(_customer_name,''), 80)), ''),
          NULLIF(trim(left(coalesce(_customer_phone,''), 30)), ''),
          NULLIF(trim(left(coalesce(_notes,''), 500)), ''),
          0, 0, 0)
  RETURNING id INTO _order_id;

  FOR _item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    _qty := COALESCE((_item->>'quantity')::int, 0);
    IF _qty < 1 OR _qty > 50 THEN RAISE EXCEPTION 'INVALID_QUANTITY'; END IF;

    SELECT * INTO _mi FROM public.menu_items
      WHERE id = (_item->>'menu_item_id')::uuid
        AND cafe_id = _cafe.id
        AND active = true
        AND available = true
      FOR SHARE;
    IF _mi.id IS NULL THEN RAISE EXCEPTION 'ITEM_UNAVAILABLE'; END IF;

    INSERT INTO public.order_items (order_id, menu_item_id, item_name, unit_price_cents, quantity, line_total_cents)
    VALUES (_order_id, _mi.id, _mi.name, _mi.price_cents, _qty, _mi.price_cents * _qty);

    _subtotal := _subtotal + (_mi.price_cents * _qty);
    _count := _count + 1;
  END LOOP;

  IF _count = 0 THEN RAISE EXCEPTION 'EMPTY_CART'; END IF;

  _tax := round(_subtotal * _cafe.tax_rate);

  UPDATE public.orders SET subtotal_cents = _subtotal, tax_cents = _tax, total_cents = _subtotal + _tax
    WHERE id = _order_id;

  RETURN _order_id;
END; $$;

REVOKE ALL ON FUNCTION public.place_order(text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_order(text, text, text, text, jsonb) TO service_role;

-- realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
