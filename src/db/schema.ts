import { sql } from 'drizzle-orm'
import { check, pgTable, text, timestamp, uuid, uniqueIndex } from 'drizzle-orm/pg-core'

import {
  TENANT_BOOTSTRAP_STATUS_VALUES,
  TENANT_STATUS_VALUES,
} from '@/lib/tenants/types'

export const tenants = pgTable(
  'tenant',
  {
    id: uuid('id').primaryKey().notNull(),
    slug: text('slug').notNull(),
    displayName: text('display_name').notNull(),
    status: text('status').$type<(typeof TENANT_STATUS_VALUES)[number]>().notNull(),
    medplumProjectId: text('medplum_project_id').notNull(),
    medplumOrganizationId: text('medplum_organization_id'),
    medplumClientId: text('medplum_client_id').notNull(),
    bootstrapStatus: text('bootstrap_status')
      .$type<(typeof TENANT_BOOTSTRAP_STATUS_VALUES)[number]>()
      .notNull(),
    lastProvisioningError: text('last_provisioning_error'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('tenant_slug_unique').on(table.slug),
    uniqueIndex('tenant_medplum_project_id_unique').on(table.medplumProjectId),
    uniqueIndex('tenant_medplum_client_id_unique').on(table.medplumClientId),
    check(
      'tenant_status_check',
      sql`${table.status} in ('active', 'disabled')`,
    ),
    check(
      'tenant_bootstrap_status_check',
      sql`${table.bootstrapStatus} in ('ready', 'pending-manual')`,
    ),
  ],
)
