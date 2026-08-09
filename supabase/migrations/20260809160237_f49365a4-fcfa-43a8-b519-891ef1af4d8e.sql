CREATE POLICY "menu_images_member_read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'menu-images' AND public.is_cafe_member(((storage.foldername(name))[1])::uuid, auth.uid()));

CREATE POLICY "menu_images_member_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'menu-images' AND public.is_cafe_member(((storage.foldername(name))[1])::uuid, auth.uid()));

CREATE POLICY "menu_images_member_update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'menu-images' AND public.is_cafe_member(((storage.foldername(name))[1])::uuid, auth.uid()))
WITH CHECK (bucket_id = 'menu-images' AND public.is_cafe_member(((storage.foldername(name))[1])::uuid, auth.uid()));

CREATE POLICY "menu_images_member_delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'menu-images' AND public.is_cafe_member(((storage.foldername(name))[1])::uuid, auth.uid()));