-- Cache auth.uid() once per statement instead of recalculating it for every
-- row evaluated by these existing RLS policies. Policy behavior is unchanged.
ALTER POLICY "agent_payments_agent" ON public."agent_online_payments"
  USING (((organization_id = organization_id()) AND ((user_role() = ANY (ARRAY['SUPER_ADMIN'::user_role, 'ADMIN'::user_role, 'FINANCE'::user_role])) OR (agent_account_id IN ( SELECT sales_agent_accounts.id
   FROM sales_agent_accounts
  WHERE (sales_agent_accounts.profile_id = (select auth.uid())))))));

ALTER POLICY "agent_payments_insert" ON public."agent_online_payments"
  WITH CHECK (((organization_id = organization_id()) AND ((user_role() = ANY (ARRAY['SUPER_ADMIN'::user_role, 'ADMIN'::user_role, 'FINANCE'::user_role])) OR ((agent_account_id IN ( SELECT sales_agent_accounts.id
   FROM sales_agent_accounts
  WHERE (sales_agent_accounts.profile_id = (select auth.uid())))) AND (created_by = (select auth.uid()))))));

ALTER POLICY "agent_payments_update" ON public."agent_online_payments"
  USING (((organization_id = organization_id()) AND ((user_role() = ANY (ARRAY['SUPER_ADMIN'::user_role, 'ADMIN'::user_role, 'FINANCE'::user_role])) OR (agent_account_id IN ( SELECT sales_agent_accounts.id
   FROM sales_agent_accounts
  WHERE (sales_agent_accounts.profile_id = (select auth.uid())))))));

ALTER POLICY "agent_outlet_subs_insert" ON public."agent_outlet_subscriptions"
  WITH CHECK (((organization_id = organization_id()) AND (outlet_id IN ( SELECT o.id
   FROM (agent_outlets o
     JOIN sales_agent_accounts a ON ((a.id = o.agent_account_id)))
  WHERE (a.profile_id = (select auth.uid()))))));

ALTER POLICY "agent_outlet_subs_select" ON public."agent_outlet_subscriptions"
  USING (((organization_id = organization_id()) AND ((user_role() = ANY (ARRAY['SUPER_ADMIN'::user_role, 'ADMIN'::user_role, 'OPERATION_MANAGER'::user_role, 'FINANCE'::user_role])) OR (outlet_id IN ( SELECT o.id
   FROM (agent_outlets o
     JOIN sales_agent_accounts a ON ((a.id = o.agent_account_id)))
  WHERE (a.profile_id = (select auth.uid())))))));

ALTER POLICY "agent_outlet_subs_update" ON public."agent_outlet_subscriptions"
  USING (((organization_id = organization_id()) AND ((user_role() = ANY (ARRAY['SUPER_ADMIN'::user_role, 'ADMIN'::user_role, 'FINANCE'::user_role])) OR (outlet_id IN ( SELECT o.id
   FROM (agent_outlets o
     JOIN sales_agent_accounts a ON ((a.id = o.agent_account_id)))
  WHERE (a.profile_id = (select auth.uid())))))));

ALTER POLICY "agent_outlets_agent" ON public."agent_outlets"
  USING (((organization_id = organization_id()) AND ((user_role() = ANY (ARRAY['SUPER_ADMIN'::user_role, 'ADMIN'::user_role, 'OPERATION_MANAGER'::user_role])) OR (agent_account_id IN ( SELECT sales_agent_accounts.id
   FROM sales_agent_accounts
  WHERE (sales_agent_accounts.profile_id = (select auth.uid())))))));

ALTER POLICY "agent_receipts_select" ON public."agent_payment_receipts"
  USING (((organization_id = organization_id()) AND ((user_role() = ANY (ARRAY['SUPER_ADMIN'::user_role, 'ADMIN'::user_role, 'FINANCE'::user_role, 'OPERATION_MANAGER'::user_role])) OR (payment_id IN ( SELECT p.id
   FROM (agent_online_payments p
     JOIN sales_agent_accounts a ON ((a.id = p.agent_account_id)))
  WHERE (a.profile_id = (select auth.uid())))))));

ALTER POLICY "agent_sales_staff_manage" ON public."agent_sales_staff"
  USING (((organization_id = organization_id()) AND ((user_role() = ANY (ARRAY['SUPER_ADMIN'::user_role, 'ADMIN'::user_role, 'OPERATION_MANAGER'::user_role, 'CEO_FACTORY'::user_role])) OR (agent_account_id IN ( SELECT sales_agent_accounts.id
   FROM sales_agent_accounts
  WHERE (sales_agent_accounts.profile_id = (select auth.uid())))))))
  WITH CHECK (((organization_id = organization_id()) AND ((user_role() = ANY (ARRAY['SUPER_ADMIN'::user_role, 'ADMIN'::user_role, 'OPERATION_MANAGER'::user_role, 'CEO_FACTORY'::user_role])) OR (agent_account_id IN ( SELECT sales_agent_accounts.id
   FROM sales_agent_accounts
  WHERE (sales_agent_accounts.profile_id = (select auth.uid())))))));

ALTER POLICY "agent_sales_staff_select" ON public."agent_sales_staff"
  USING (((organization_id = organization_id()) AND ((user_role() = ANY (ARRAY['SUPER_ADMIN'::user_role, 'ADMIN'::user_role, 'OPERATION_MANAGER'::user_role, 'HR'::user_role, 'FINANCE'::user_role, 'CEO_FACTORY'::user_role])) OR (agent_account_id IN ( SELECT sales_agent_accounts.id
   FROM sales_agent_accounts
  WHERE (sales_agent_accounts.profile_id = (select auth.uid())))))));

ALTER POLICY "agent_special_staff_assignments_read" ON public."agent_special_staff_assignments"
  USING (((organization_id = organization_id()) AND ((user_role() = ANY (ARRAY['SUPER_ADMIN'::user_role, 'ADMIN'::user_role, 'OPERATION_MANAGER'::user_role, 'HR'::user_role])) OR (profile_id = (select auth.uid())))));

ALTER POLICY "agent_orders_agent" ON public."agent_stock_orders"
  USING (((organization_id = organization_id()) AND ((user_role() = ANY (ARRAY['SUPER_ADMIN'::user_role, 'ADMIN'::user_role, 'OPERATION_MANAGER'::user_role, 'CEO_FACTORY'::user_role])) OR (agent_account_id IN ( SELECT sales_agent_accounts.id
   FROM sales_agent_accounts
  WHERE (sales_agent_accounts.profile_id = (select auth.uid())))))));

ALTER POLICY "approvals_access" ON public."approval_requests"
  USING (((organization_id = organization_id()) AND (is_admin() OR (requested_by = (select auth.uid())) OR (assigned_to = (select auth.uid())) OR ((branch_id IS NOT NULL) AND has_branch_access(branch_id)))));

ALTER POLICY "bookings_insert_scope" ON public."bookings"
  WITH CHECK (((organization_id = organization_id()) AND (created_by = (select auth.uid())) AND (user_role() = ANY (ARRAY['SUPER_ADMIN'::user_role, 'ADMIN'::user_role, 'OPERATION_MANAGER'::user_role, 'HR'::user_role, 'FINANCE'::user_role, 'CEO_FACTORY'::user_role, 'MAINTENANCE_MANAGER'::user_role, 'AREA_MANAGER'::user_role, 'STAFF'::user_role, 'SALES_AGENT'::user_role])) AND ((branch_id IS NULL) OR (user_role() = ANY (ARRAY['SUPER_ADMIN'::user_role, 'ADMIN'::user_role, 'OPERATION_MANAGER'::user_role, 'HR'::user_role, 'FINANCE'::user_role, 'CEO_FACTORY'::user_role, 'MAINTENANCE_MANAGER'::user_role])) OR has_branch_access(branch_id))));

ALTER POLICY "org_admin_branches_update" ON public."branches"
  USING (((organization_id = organization_id()) AND ((user_role() = ANY (ARRAY['SUPER_ADMIN'::user_role, 'ADMIN'::user_role, 'OPERATION_MANAGER'::user_role, 'CEO_FACTORY'::user_role])) OR ((user_role() = 'AREA_MANAGER'::user_role) AND (region_id = ( SELECT profiles.region_id
   FROM profiles
  WHERE (profiles.id = (select auth.uid()))))))))
  WITH CHECK ((organization_id = organization_id()));

ALTER POLICY "company_vehicle_assignments_read" ON public."company_vehicle_assignments"
  USING (((organization_id = organization_id()) AND ((user_role() = ANY (ARRAY['SUPER_ADMIN'::user_role, 'ADMIN'::user_role, 'OPERATION_MANAGER'::user_role, 'HR'::user_role, 'MAINTENANCE_MANAGER'::user_role])) OR (custodian_profile_id = (select auth.uid())))));

ALTER POLICY "company_vehicle_documents_read" ON public."company_vehicle_documents"
  USING (((organization_id = organization_id()) AND ((user_role() = ANY (ARRAY['SUPER_ADMIN'::user_role, 'ADMIN'::user_role, 'OPERATION_MANAGER'::user_role, 'HR'::user_role, 'MAINTENANCE_MANAGER'::user_role])) OR (EXISTS ( SELECT 1
   FROM vehicles v
  WHERE ((v.id = company_vehicle_documents.vehicle_id) AND (v.company_custodian_profile_id = (select auth.uid()))))))));

ALTER POLICY "company_vehicle_expenses_read" ON public."company_vehicle_expenses"
  USING (((organization_id = organization_id()) AND ((user_role() = ANY (ARRAY['SUPER_ADMIN'::user_role, 'ADMIN'::user_role, 'OPERATION_MANAGER'::user_role, 'FINANCE'::user_role, 'MAINTENANCE_MANAGER'::user_role])) OR (submitted_by = (select auth.uid())))));

ALTER POLICY "company_vehicle_incidents_read" ON public."company_vehicle_incidents"
  USING (((organization_id = organization_id()) AND ((user_role() = ANY (ARRAY['SUPER_ADMIN'::user_role, 'ADMIN'::user_role, 'OPERATION_MANAGER'::user_role, 'HR'::user_role, 'MAINTENANCE_MANAGER'::user_role])) OR (reported_by = (select auth.uid())))));

ALTER POLICY "company_vehicle_usage_read" ON public."company_vehicle_usage_logs"
  USING (((organization_id = organization_id()) AND ((user_role() = ANY (ARRAY['SUPER_ADMIN'::user_role, 'ADMIN'::user_role, 'OPERATION_MANAGER'::user_role, 'MAINTENANCE_MANAGER'::user_role])) OR (profile_id = (select auth.uid())))));

ALTER POLICY "delivery_legs_driver" ON public."delivery_legs"
  USING ((EXISTS ( SELECT 1
   FROM (delivery_orders d
     JOIN drivers dr ON ((dr.id = delivery_legs.driver_id)))
  WHERE ((d.id = delivery_legs.delivery_order_id) AND (d.organization_id = organization_id()) AND (is_admin() OR (dr.profile_id = (select auth.uid())) OR (user_role() = 'OPERATION_MANAGER'::user_role))))));

ALTER POLICY "factory_prod_days_manage" ON public."factory_production_days"
  USING ((EXISTS ( SELECT 1
   FROM factory_production_weeks w
  WHERE ((w.id = factory_production_days.week_id) AND (w.organization_id IN ( SELECT profiles.organization_id
           FROM profiles
          WHERE (profiles.id = (select auth.uid())))) AND can_manage_factory_production_schedule()))));

ALTER POLICY "factory_prod_days_select" ON public."factory_production_days"
  USING ((EXISTS ( SELECT 1
   FROM factory_production_weeks w
  WHERE ((w.id = factory_production_days.week_id) AND (w.organization_id IN ( SELECT profiles.organization_id
           FROM profiles
          WHERE (profiles.id = (select auth.uid()))))))));

ALTER POLICY "factory_prod_weeks_manage" ON public."factory_production_weeks"
  USING (((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.id = (select auth.uid())))) AND can_manage_factory_production_schedule()))
  WITH CHECK (((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.id = (select auth.uid())))) AND can_manage_factory_production_schedule()));

ALTER POLICY "factory_prod_weeks_select" ON public."factory_production_weeks"
  USING ((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.id = (select auth.uid())))));

ALTER POLICY "fleet_sessions_org_select" ON public."fleet_driver_sessions"
  USING (((organization_id = organization_id()) AND (is_admin() OR (user_role() = ANY (ARRAY['OPERATION_MANAGER'::user_role, 'AREA_MANAGER'::user_role])) OR (profile_id = (select auth.uid())))));

ALTER POLICY "fleet_location_observations_select" ON public."fleet_location_observations"
  USING (((organization_id = organization_id()) AND (is_admin() OR (user_role() = ANY (ARRAY['OPERATION_MANAGER'::user_role, 'AREA_MANAGER'::user_role])) OR (driver_id IN ( SELECT d.id
   FROM drivers d
  WHERE ((d.organization_id = organization_id()) AND (d.profile_id = (select auth.uid()))))))));

ALTER POLICY "fleet_navigation_events_org_select" ON public."fleet_navigation_events"
  USING (((organization_id = organization_id()) AND (is_admin() OR (user_role() = ANY (ARRAY['OPERATION_MANAGER'::user_role, 'AREA_MANAGER'::user_role])) OR (driver_id IN ( SELECT d.id
   FROM drivers d
  WHERE ((d.organization_id = organization_id()) AND (d.profile_id = (select auth.uid()))))))));

ALTER POLICY "hq_delivery_route_plans_manage" ON public."hq_delivery_route_plans"
  USING (((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.id = (select auth.uid())))) AND can_set_roti_production_date()))
  WITH CHECK (((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.id = (select auth.uid())))) AND can_set_roti_production_date()));

ALTER POLICY "hq_delivery_route_plans_select" ON public."hq_delivery_route_plans"
  USING ((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.id = (select auth.uid())))));

ALTER POLICY "hq_delivery_route_stop_items_select" ON public."hq_delivery_route_stop_items"
  USING ((EXISTS ( SELECT 1
   FROM (hq_delivery_route_stops s
     JOIN hq_delivery_route_plans p ON ((p.id = s.route_plan_id)))
  WHERE ((s.id = hq_delivery_route_stop_items.stop_id) AND (p.organization_id IN ( SELECT profiles.organization_id
           FROM profiles
          WHERE (profiles.id = (select auth.uid()))))))));

ALTER POLICY "hq_delivery_route_stops_select" ON public."hq_delivery_route_stops"
  USING ((EXISTS ( SELECT 1
   FROM hq_delivery_route_plans p
  WHERE ((p.id = hq_delivery_route_stops.route_plan_id) AND (p.organization_id IN ( SELECT profiles.organization_id
           FROM profiles
          WHERE (profiles.id = (select auth.uid()))))))));

ALTER POLICY "hq_factory_order_branch_items_insert" ON public."hq_factory_order_branch_items"
  WITH CHECK ((EXISTS ( SELECT 1
   FROM hq_factory_orders o
  WHERE ((o.id = hq_factory_order_branch_items.order_id) AND (o.organization_id IN ( SELECT profiles.organization_id
           FROM profiles
          WHERE (profiles.id = (select auth.uid())))) AND can_set_roti_production_date()))));

ALTER POLICY "hq_factory_order_branch_items_select" ON public."hq_factory_order_branch_items"
  USING ((EXISTS ( SELECT 1
   FROM hq_factory_orders o
  WHERE ((o.id = hq_factory_order_branch_items.order_id) AND (o.organization_id IN ( SELECT profiles.organization_id
           FROM profiles
          WHERE (profiles.id = (select auth.uid()))))))));

ALTER POLICY "hq_factory_order_items_insert" ON public."hq_factory_order_items"
  WITH CHECK ((EXISTS ( SELECT 1
   FROM hq_factory_orders o
  WHERE ((o.id = hq_factory_order_items.order_id) AND (o.organization_id IN ( SELECT profiles.organization_id
           FROM profiles
          WHERE (profiles.id = (select auth.uid())))) AND can_set_roti_production_date()))));

ALTER POLICY "hq_factory_order_items_select" ON public."hq_factory_order_items"
  USING ((EXISTS ( SELECT 1
   FROM hq_factory_orders o
  WHERE ((o.id = hq_factory_order_items.order_id) AND (o.organization_id IN ( SELECT profiles.organization_id
           FROM profiles
          WHERE (profiles.id = (select auth.uid()))))))));

ALTER POLICY "hq_factory_orders_insert" ON public."hq_factory_orders"
  WITH CHECK (((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.id = (select auth.uid())))) AND can_set_roti_production_date()));

ALTER POLICY "hq_factory_orders_select" ON public."hq_factory_orders"
  USING ((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.id = (select auth.uid())))));

ALTER POLICY "hq_factory_orders_update" ON public."hq_factory_orders"
  USING (((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.id = (select auth.uid())))) AND (can_manage_factory_production_schedule() OR can_set_roti_production_date())));

ALTER POLICY "hr_leave_balances_select" ON public."hr_leave_balances"
  USING (((organization_id = organization_id()) AND ((profile_id = (select auth.uid())) OR (user_role() = ANY (ARRAY['SUPER_ADMIN'::user_role, 'ADMIN'::user_role, 'HR'::user_role, 'OPERATION_MANAGER'::user_role])) OR (EXISTS ( SELECT 1
   FROM staff s
  WHERE ((s.id = hr_leave_balances.staff_id) AND (s.branch_id IS NOT NULL) AND has_branch_access(s.branch_id)))))));

ALTER POLICY "hr_leave_transactions_select" ON public."hr_leave_transactions"
  USING (((organization_id = organization_id()) AND ((profile_id = (select auth.uid())) OR (user_role() = ANY (ARRAY['SUPER_ADMIN'::user_role, 'ADMIN'::user_role, 'HR'::user_role, 'OPERATION_MANAGER'::user_role])) OR (EXISTS ( SELECT 1
   FROM staff s
  WHERE ((s.id = hr_leave_transactions.staff_id) AND (s.branch_id IS NOT NULL) AND has_branch_access(s.branch_id)))))));

ALTER POLICY "hr_service_requests_insert_own" ON public."hr_service_requests"
  WITH CHECK (((organization_id = organization_id()) AND (profile_id = (select auth.uid()))));

ALTER POLICY "hr_service_requests_select" ON public."hr_service_requests"
  USING (((organization_id = organization_id()) AND ((profile_id = (select auth.uid())) OR (user_role() = ANY (ARRAY['SUPER_ADMIN'::user_role, 'ADMIN'::user_role, 'HR'::user_role, 'OPERATION_MANAGER'::user_role])) OR ((branch_id IS NOT NULL) AND has_branch_access(branch_id)))));

ALTER POLICY "hr_service_requests_update" ON public."hr_service_requests"
  USING (((organization_id = organization_id()) AND (((profile_id = (select auth.uid())) AND (status = ANY (ARRAY['SUBMITTED'::text, 'IN_REVIEW'::text]))) OR (user_role() = ANY (ARRAY['SUPER_ADMIN'::user_role, 'ADMIN'::user_role, 'HR'::user_role, 'OPERATION_MANAGER'::user_role])) OR ((branch_id IS NOT NULL) AND has_branch_access(branch_id)))))
  WITH CHECK ((organization_id = organization_id()));

ALTER POLICY "legal_entity_documents_admin" ON public."legal_entity_documents"
  USING ((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE ((profiles.id = (select auth.uid())) AND (profiles.role = ANY (ARRAY['SUPER_ADMIN'::user_role, 'ADMIN'::user_role, 'HR'::user_role]))))))
  WITH CHECK ((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE ((profiles.id = (select auth.uid())) AND (profiles.role = ANY (ARRAY['SUPER_ADMIN'::user_role, 'ADMIN'::user_role, 'HR'::user_role]))))));

ALTER POLICY "legal_entity_documents_read" ON public."legal_entity_documents"
  USING ((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.id = (select auth.uid())))));

ALTER POLICY "maintenance_reports_select" ON public."maintenance_reports"
  USING (((organization_id = organization_id()) AND ((user_role() = ANY (ARRAY['SUPER_ADMIN'::user_role, 'ADMIN'::user_role, 'OPERATION_MANAGER'::user_role, 'MAINTENANCE_MANAGER'::user_role])) OR (reported_by = (select auth.uid())) OR (branch_id = user_branch_id()) OR (branch_id IN ( SELECT b.id
   FROM branches b
  WHERE (b.region_id = user_region_id()))))));

ALTER POLICY "notifications_own" ON public."notifications"
  USING ((recipient_id = (select auth.uid())));

ALTER POLICY "org_stock_planning_insert" ON public."org_stock_planning_settings"
  WITH CHECK (((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.id = (select auth.uid())))) AND (user_role() = ANY (ARRAY['SUPER_ADMIN'::user_role, 'ADMIN'::user_role, 'OPERATION_MANAGER'::user_role]))));

ALTER POLICY "org_stock_planning_read" ON public."org_stock_planning_settings"
  USING ((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.id = (select auth.uid())))));

ALTER POLICY "org_stock_planning_update" ON public."org_stock_planning_settings"
  USING (((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.id = (select auth.uid())))) AND (user_role() = ANY (ARRAY['SUPER_ADMIN'::user_role, 'ADMIN'::user_role, 'OPERATION_MANAGER'::user_role]))))
  WITH CHECK ((organization_id IN ( SELECT profiles.organization_id
   FROM profiles
  WHERE (profiles.id = (select auth.uid())))));

ALTER POLICY "profiles_select" ON public."profiles"
  USING (((id = (select auth.uid())) OR ((organization_id = organization_id()) AND is_admin())));

ALTER POLICY "profiles_update_own" ON public."profiles"
  USING ((id = (select auth.uid())))
  WITH CHECK ((id = (select auth.uid())));

ALTER POLICY "sales_agent_accounts_insert" ON public."sales_agent_accounts"
  WITH CHECK (((organization_id = organization_id()) AND ((user_role() = ANY (ARRAY['SUPER_ADMIN'::user_role, 'ADMIN'::user_role])) OR (profile_id = (select auth.uid())))));

ALTER POLICY "sales_agent_accounts_select" ON public."sales_agent_accounts"
  USING (((organization_id = organization_id()) AND ((user_role() = ANY (ARRAY['SUPER_ADMIN'::user_role, 'ADMIN'::user_role, 'OPERATION_MANAGER'::user_role, 'FINANCE'::user_role])) OR (profile_id = (select auth.uid())))));

ALTER POLICY "staff_payslips_own" ON public."staff_payslips"
  USING (((organization_id = organization_id()) AND ((profile_id = (select auth.uid())) OR (user_role() = ANY (ARRAY['SUPER_ADMIN'::user_role, 'ADMIN'::user_role, 'HR'::user_role, 'FINANCE'::user_role])))));

ALTER POLICY "roster_reminder_log_am" ON public."weekly_roster_reminder_log"
  USING (((organization_id = organization_id()) AND ((manager_profile_id = (select auth.uid())) OR (user_role() = ANY (ARRAY['SUPER_ADMIN'::user_role, 'ADMIN'::user_role, 'OPERATION_MANAGER'::user_role])))));

