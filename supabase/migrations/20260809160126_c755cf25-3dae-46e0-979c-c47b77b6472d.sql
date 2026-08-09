REVOKE ALL ON FUNCTION public.is_cafe_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_cafe_role(uuid, uuid, public.cafe_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_cafe_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_cafe_role(uuid, uuid, public.cafe_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_order_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.block_order_item_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_cafe_for_current_user(text) FROM anon;
REVOKE ALL ON FUNCTION public.place_order(text, text, text, text, jsonb) FROM anon, authenticated;