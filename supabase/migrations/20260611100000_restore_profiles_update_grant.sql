GRANT UPDATE ON public.profiles TO authenticated;

CREATE POLICY "update own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
