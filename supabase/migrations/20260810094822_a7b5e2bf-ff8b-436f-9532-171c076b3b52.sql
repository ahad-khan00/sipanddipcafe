REVOKE ALL ON FUNCTION public.cafe_rating_summary(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cafe_rating_summary(uuid) TO service_role;