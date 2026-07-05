-- Allow POS/Inventory screens to read stock count item lines for counts in
-- the same legal organization. Without this, pending MID_SHIFT counts can be
-- saved but their item quantities cannot be displayed back to the kiosk.
DO $$
BEGIN
 IF NOT EXISTS (
 SELECT 1
 FROM pg_policies
 WHERE schemaname = 'public'
 AND tablename = 'stock_count_items'
 AND policyname = 'stock_count_items_org'
 ) THEN
 CREATE POLICY stock_count_items_org ON stock_count_items
 FOR ALL
 USING (
 EXISTS (
 SELECT 1
 FROM stock_counts sc
 WHERE sc.id = stock_count_items.count_id
 AND sc.organization_id = public.organization_id()
 )
 )
 WITH CHECK (
 EXISTS (
 SELECT 1
 FROM stock_counts sc
 WHERE sc.id = stock_count_items.count_id
 AND sc.organization_id = public.organization_id()
 )
 );
 END IF;
END $$;
