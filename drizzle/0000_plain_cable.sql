CREATE TABLE "tenant" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"status" text NOT NULL,
	"medplum_project_id" text NOT NULL,
	"medplum_organization_id" text,
	"medplum_client_id" text NOT NULL,
	"bootstrap_status" text NOT NULL,
	"last_provisioning_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_status_check" CHECK ("tenant"."status" in ('active', 'disabled')),
	CONSTRAINT "tenant_bootstrap_status_check" CHECK ("tenant"."bootstrap_status" in ('ready', 'pending-manual'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_slug_unique" ON "tenant" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_medplum_project_id_unique" ON "tenant" USING btree ("medplum_project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_medplum_client_id_unique" ON "tenant" USING btree ("medplum_client_id");