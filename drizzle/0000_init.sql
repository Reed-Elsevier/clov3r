CREATE TABLE `anomalies` (
	`anomaly_id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`method` text NOT NULL,
	`category` text NOT NULL,
	`priority` text NOT NULL,
	`score` real,
	`evidence` text NOT NULL,
	`status` text DEFAULT 'Needs review' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`invoice_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "anomalies_evidence_is_object" CHECK(json_type("anomalies"."evidence") = 'object')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `anomalies_invoice_method_category_uq` ON `anomalies` (`invoice_id`,`method`,`category`);--> statement-breakpoint
CREATE INDEX `anomalies_status_idx` ON `anomalies` (`status`);--> statement-breakpoint
CREATE INDEX `anomalies_priority_idx` ON `anomalies` (`priority`);--> statement-breakpoint
CREATE INDEX `anomalies_category_idx` ON `anomalies` (`category`);--> statement-breakpoint
CREATE TABLE `anomaly_explanations` (
	`anomaly_id` text PRIMARY KEY NOT NULL,
	`explanation` text NOT NULL,
	`evidence_summary` text NOT NULL,
	`potential_impact` text NOT NULL,
	`recommended_actions` text NOT NULL,
	`preventive_measure` text NOT NULL,
	`requires_human_review` integer DEFAULT true NOT NULL,
	`model_id` text NOT NULL,
	`generated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`anomaly_id`) REFERENCES `anomalies`(`anomaly_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "anomaly_explanations_recommended_actions_is_array" CHECK(json_type("anomaly_explanations"."recommended_actions") = 'array')
);
--> statement-breakpoint
CREATE TABLE `cost_centers` (
	`cost_center_id` text PRIMARY KEY NOT NULL,
	`department_id` text NOT NULL,
	`division_id` text NOT NULL,
	`cost_center_name` text NOT NULL,
	`site_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `invoice_exceptions` (
	`exception_id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`exception_type` text NOT NULL,
	`raised_at` timestamp NOT NULL,
	`resolved_at` timestamp,
	`resolver_employee_id` text NOT NULL,
	`resolution` text,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`invoice_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `invoice_exceptions_invoice_id_idx` ON `invoice_exceptions` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `invoice_exceptions_exception_type_idx` ON `invoice_exceptions` (`exception_type`);--> statement-breakpoint
CREATE TABLE `invoice_lines` (
	`invoice_line_id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`line_no` integer NOT NULL,
	`description` text NOT NULL,
	`quantity` real NOT NULL,
	`unit_price` real NOT NULL,
	`line_amount` real NOT NULL,
	`gl_account` text NOT NULL,
	`cost_center_id` text NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`invoice_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cost_center_id`) REFERENCES `cost_centers`(`cost_center_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `invoice_lines_invoice_id_idx` ON `invoice_lines` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `invoice_lines_cost_center_id_idx` ON `invoice_lines` (`cost_center_id`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`invoice_id` text PRIMARY KEY NOT NULL,
	`supplier_id` text NOT NULL,
	`po_id` text,
	`currency` text NOT NULL,
	`invoice_date` date NOT NULL,
	`net_amount` real NOT NULL,
	`tax_amount` real NOT NULL,
	`gross_amount` real NOT NULL,
	`amount_usd` real NOT NULL,
	`invoice_number` text NOT NULL,
	`received_at` timestamp NOT NULL,
	`due_date` date NOT NULL,
	`approval_level` text NOT NULL,
	`channel` text NOT NULL,
	`ocr_confidence` real,
	`processor_employee_id` text NOT NULL,
	`status` text NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`supplier_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`po_id`) REFERENCES `purchase_orders`(`po_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `invoices_supplier_id_idx` ON `invoices` (`supplier_id`);--> statement-breakpoint
CREATE INDEX `invoices_po_id_idx` ON `invoices` (`po_id`);--> statement-breakpoint
CREATE INDEX `invoices_invoice_date_idx` ON `invoices` (`invoice_date`);--> statement-breakpoint
CREATE INDEX `invoices_status_idx` ON `invoices` (`status`);--> statement-breakpoint
CREATE TABLE `opex_budget_vs_actual` (
	`opex_row_id` text PRIMARY KEY NOT NULL,
	`cost_center_id` text NOT NULL,
	`division_id` text NOT NULL,
	`month` date NOT NULL,
	`budget_php` real NOT NULL,
	`actual_php` real NOT NULL,
	`variance_php` real NOT NULL,
	`variance_pct` real NOT NULL,
	FOREIGN KEY (`cost_center_id`) REFERENCES `cost_centers`(`cost_center_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `opex_budget_vs_actual_cost_center_id_idx` ON `opex_budget_vs_actual` (`cost_center_id`);--> statement-breakpoint
CREATE TABLE `payments` (
	`payment_id` text PRIMARY KEY NOT NULL,
	`invoice_id` text NOT NULL,
	`paid_at` timestamp NOT NULL,
	`amount` real NOT NULL,
	`currency` text NOT NULL,
	`method` text NOT NULL,
	`payment_run_id` text NOT NULL,
	`days_vs_due` integer NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`invoice_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `payments_invoice_id_idx` ON `payments` (`invoice_id`);--> statement-breakpoint
CREATE TABLE `purchase_orders` (
	`po_id` text PRIMARY KEY NOT NULL,
	`supplier_id` text NOT NULL,
	`cost_center_id` text NOT NULL,
	`requester_employee_id` text NOT NULL,
	`approver_employee_id` text NOT NULL,
	`po_date` date NOT NULL,
	`currency` text NOT NULL,
	`po_amount` real NOT NULL,
	`status` text NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`supplier_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cost_center_id`) REFERENCES `cost_centers`(`cost_center_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `purchase_orders_supplier_id_idx` ON `purchase_orders` (`supplier_id`);--> statement-breakpoint
CREATE INDEX `purchase_orders_cost_center_id_idx` ON `purchase_orders` (`cost_center_id`);--> statement-breakpoint
CREATE TABLE `supplier_enrollment_requests` (
	`enrollment_request_id` text PRIMARY KEY NOT NULL,
	`supplier_id` text NOT NULL,
	`requested_by_employee_id` text NOT NULL,
	`submitted_at` timestamp NOT NULL,
	`documents_complete_first_pass` integer NOT NULL,
	`tax_document_ok` integer NOT NULL,
	`bank_details_ok` integer NOT NULL,
	`sanctions_screen_ok` integer NOT NULL,
	`turnaround_days` real NOT NULL,
	`decided_at` timestamp,
	`status` text NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`supplier_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `supplier_enrollment_requests_supplier_id_idx` ON `supplier_enrollment_requests` (`supplier_id`);--> statement-breakpoint
CREATE TABLE `suppliers` (
	`supplier_id` text PRIMARY KEY NOT NULL,
	`entity_id` text NOT NULL,
	`supplier_name` text NOT NULL,
	`category` text NOT NULL,
	`country` text NOT NULL,
	`payment_terms_days` integer NOT NULL,
	`risk_tier` text NOT NULL,
	`preferred` integer NOT NULL,
	`onboarded_date` date NOT NULL,
	`status` text NOT NULL
);
