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
     OR COALESCE(NEW.request_key,'') <> COALESCE(OLD.request_key,'')
     OR COALESCE(NEW.created_at, OLD.created_at) <> OLD.created_at THEN
    RAISE EXCEPTION 'Order records are immutable except for status';
  END IF;

  -- An unclaimed guest order may be linked to an account exactly once.
  IF COALESCE(NEW.customer_id::text,'') <> COALESCE(OLD.customer_id::text,'')
     AND OLD.customer_id IS NOT NULL THEN
    RAISE EXCEPTION 'Order already belongs to a customer';
  END IF;

  IF NEW.payment_status <> OLD.payment_status THEN
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
          CASE WHEN _customer_id IS NULL THEN md5(_o.tracking_token) ELSE NULL END,
          _rating::smallint, _text,
          NULLIF(trim(left(coalesce(_display_name, _o.customer_name, ''), 40)), ''))
  RETURNING id INTO _id;
  RETURN _id;
END; $function$;

REVOKE ALL ON FUNCTION public.submit_review(uuid, text, integer, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_review(uuid, text, integer, text, uuid, text) TO service_role;