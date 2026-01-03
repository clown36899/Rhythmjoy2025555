-- Enable RLS just in case
ALTER TABLE public.board_categories ENABLE ROW LEVEL SECURITY;

-- Allow read access for everyone (so users can see boards)
CREATE POLICY "Enable read access for all users"
ON public.board_categories
FOR SELECT
USING (true);

-- Allow update access for admins only
CREATE POLICY "Enable update for admins"
ON public.board_categories
FOR UPDATE
USING (public.is_admin());

-- Allow insert/delete for admins only (optional but good practice)
CREATE POLICY "Enable insert for admins"
ON public.board_categories
FOR INSERT
WITH CHECK (public.is_admin());

CREATE POLICY "Enable delete for admins"
ON public.board_categories
FOR DELETE
USING (public.is_admin());
