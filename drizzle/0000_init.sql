CREATE TYPE "public"."anomaly_method" AS ENUM('rule', 'statistical', 'isolation_forest');--> statement-breakpoint
CREATE TYPE "public"."anomaly_priority" AS ENUM('High', 'Medium', 'Low');--> statement-breakpoint
CREATE TYPE "public"."anomaly_status" AS ENUM('Needs review', 'Investigating', 'Resolved', 'Dismissed');--> statement-breakpoint
CREATE TABLE "anomalies" (
	"anomaly_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" text NOT NULL,
	"method" "anomaly_method" NOT NULL,
	"category" text NOT NULL,
	"priority" "anomaly_priority" NOT NULL,
	"score" double precision,
	"evidence" jsonb NOT NULL,
	"status" "anomaly_status" DEFAULT 'Needs review' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "anomalies_evidence_is_object" CHECK (jsonb_typeof("anomalies"."evidence") = 'object')
);
--> statement-breakpoint
CREATE TABLE "anomaly_explanations" (
	"anomaly_id" uuid PRIMARY KEY NOT NULL,
	"explanation" text NOT NULL,
	"evidence_summary" text NOT NULL,
	"potential_impact" text NOT NULL,
	"recommended_actions" jsonb NOT NULL,
	"preventive_measure" text NOT NULL,
	"requires_human_review" boolean DEFAULT true NOT NULL,
	"model_id" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "anomaly_explanations_recommended_actions_is_array" CHECK (jsonb_typeof("anomaly_explanations"."recommended_actions") = 'array')
);
--> statement-breakpoint
CREATE TABLE "cost_centers" (
	"cost_center_id" text PRIMARY KEY NOT NULL,
	"department_id" text NOT NULL,
	"division_id" text NOT NULL,
	"cost_center_name" text NOT NULL,
	"site_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_exceptions" (
	"exception_id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"exception_type" text NOT NULL,
	"raised_at" timestamp NOT NULL,
	"resolved_at" timestamp,
	"resolver_employee_id" text NOT NULL,
	"resolution" text
);
--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"invoice_line_id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"line_no" integer NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric NOT NULL,
	"unit_price" numeric NOT NULL,
	"line_amount" numeric NOT NULL,
	"gl_account" text NOT NULL,
	"cost_center_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"invoice_id" text PRIMARY KEY NOT NULL,
	"supplier_id" text NOT NULL,
	"po_id" text,
	"currency" text NOT NULL,
	"invoice_date" date NOT NULL,
	"net_amount" numeric NOT NULL,
	"tax_amount" numeric NOT NULL,
	"gross_amount" numeric NOT NULL,
	"amount_usd" numeric NOT NULL,
	"invoice_number" text NOT NULL,
	"received_at" timestamp NOT NULL,
	"due_date" date NOT NULL,
	"approval_level" text NOT NULL,
	"channel" text NOT NULL,
	"ocr_confidence" numeric,
	"processor_employee_id" text NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opex_budget_vs_actual" (
	"opex_row_id" text PRIMARY KEY NOT NULL,
	"cost_center_id" text NOT NULL,
	"division_id" text NOT NULL,
	"month" date NOT NULL,
	"budget_php" numeric NOT NULL,
	"actual_php" numeric NOT NULL,
	"variance_php" numeric NOT NULL,
	"variance_pct" numeric NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"payment_id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"paid_at" timestamp NOT NULL,
	"amount" numeric NOT NULL,
	"currency" text NOT NULL,
	"method" text NOT NULL,
	"payment_run_id" text NOT NULL,
	"days_vs_due" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"po_id" text PRIMARY KEY NOT NULL,
	"supplier_id" text NOT NULL,
	"cost_center_id" text NOT NULL,
	"requester_employee_id" text NOT NULL,
	"approver_employee_id" text NOT NULL,
	"po_date" date NOT NULL,
	"currency" text NOT NULL,
	"po_amount" numeric NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_enrollment_requests" (
	"enrollment_request_id" text PRIMARY KEY NOT NULL,
	"supplier_id" text NOT NULL,
	"requested_by_employee_id" text NOT NULL,
	"submitted_at" timestamp NOT NULL,
	"documents_complete_first_pass" boolean NOT NULL,
	"tax_document_ok" boolean NOT NULL,
	"bank_details_ok" boolean NOT NULL,
	"sanctions_screen_ok" boolean NOT NULL,
	"turnaround_days" numeric NOT NULL,
	"decided_at" timestamp,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"supplier_id" text PRIMARY KEY NOT NULL,
	"entity_id" text NOT NULL,
	"supplier_name" text NOT NULL,
	"category" text NOT NULL,
	"country" text NOT NULL,
	"payment_terms_days" integer NOT NULL,
	"risk_tier" text NOT NULL,
	"preferred" boolean NOT NULL,
	"onboarded_date" date NOT NULL,
	"status" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_invoice_id_invoices_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("invoice_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anomaly_explanations" ADD CONSTRAINT "anomaly_explanations_anomaly_id_anomalies_anomaly_id_fk" FOREIGN KEY ("anomaly_id") REFERENCES "public"."anomalies"("anomaly_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_exceptions" ADD CONSTRAINT "invoice_exceptions_invoice_id_invoices_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("invoice_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("invoice_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_cost_center_id_cost_centers_cost_center_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("cost_center_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_supplier_id_suppliers_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("supplier_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_po_id_purchase_orders_po_id_fk" FOREIGN KEY ("po_id") REFERENCES "public"."purchase_orders"("po_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opex_budget_vs_actual" ADD CONSTRAINT "opex_budget_vs_actual_cost_center_id_cost_centers_cost_center_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("cost_center_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("invoice_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("supplier_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_cost_center_id_cost_centers_cost_center_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("cost_center_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_enrollment_requests" ADD CONSTRAINT "supplier_enrollment_requests_supplier_id_suppliers_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("supplier_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "anomalies_invoice_method_category_uq" ON "anomalies" USING btree ("invoice_id","method","category");--> statement-breakpoint
CREATE INDEX "anomalies_status_idx" ON "anomalies" USING btree ("status");--> statement-breakpoint
CREATE INDEX "anomalies_priority_idx" ON "anomalies" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "anomalies_category_idx" ON "anomalies" USING btree ("category");--> statement-breakpoint
CREATE INDEX "invoice_exceptions_invoice_id_idx" ON "invoice_exceptions" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoice_exceptions_exception_type_idx" ON "invoice_exceptions" USING btree ("exception_type");--> statement-breakpoint
CREATE INDEX "invoice_lines_invoice_id_idx" ON "invoice_lines" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoice_lines_cost_center_id_idx" ON "invoice_lines" USING btree ("cost_center_id");--> statement-breakpoint
CREATE INDEX "invoices_supplier_id_idx" ON "invoices" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "invoices_po_id_idx" ON "invoices" USING btree ("po_id");--> statement-breakpoint
CREATE INDEX "invoices_invoice_date_idx" ON "invoices" USING btree ("invoice_date");--> statement-breakpoint
CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status");--> statement-breakpoint
CREATE INDEX "opex_budget_vs_actual_cost_center_id_idx" ON "opex_budget_vs_actual" USING btree ("cost_center_id");--> statement-breakpoint
CREATE INDEX "payments_invoice_id_idx" ON "payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "purchase_orders_supplier_id_idx" ON "purchase_orders" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "purchase_orders_cost_center_id_idx" ON "purchase_orders" USING btree ("cost_center_id");--> statement-breakpoint
CREATE INDEX "supplier_enrollment_requests_supplier_id_idx" ON "supplier_enrollment_requests" USING btree ("supplier_id");