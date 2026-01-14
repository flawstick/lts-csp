import {
  pgTableCreator,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  integer,
  boolean,
  index,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/**
 * Multi-project schema prefix
 * @see https://orm.drizzle.team/docs/goodies#multi-project-schema
 */
export const createTable = pgTableCreator((name) => `lts_${name}`);

// ============================================================================
// ENUMS
// ============================================================================

export const orgMemberRoleEnum = pgEnum("org_member_role", [
  "owner",
  "admin",
  "member",
]);

export const taskStatusEnum = pgEnum("task_status", [
  "pending",
  "in_progress",
  "completed",
  "failed",
  "cancelled",
]);

export const jobStatusEnum = pgEnum("job_status", [
  "pending",
  "queued",
  "running",
  "paused",
  "completed",
  "failed",
  "cancelled",
]);

export const taxSyncJobStatusEnum = pgEnum("tax_sync_job_status", [
  "pending",
  "running",
  "completed",
  "failed",
]);

export const taskTypeEnum = pgEnum("task_type", [
  "tax_return",
  "validation",
  "submission",
  "amendment",
  "inquiry",
]);

export const taxReturnStatusEnum = pgEnum("tax_return_status", [
  "pending",
  "in_progress",
  "completed",
  "failed",
  "review_required",
]);

// ============================================================================
// ACCOUNTS - Extends Supabase auth.users
// ============================================================================

export const accounts = createTable(
  "account",
  (d) => ({
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().unique(), // References auth.users(id)
    fullName: varchar("full_name", { length: 256 }),
    avatarUrl: text("avatar_url"),
    phone: varchar({ length: 32 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).$onUpdate(
      () => new Date()
    ),
  }),
  (t) => [
    uniqueIndex("lts_account_user_id_idx").on(t.userId),
  ]
);

// ============================================================================
// GLOBAL ADMINS - Super admins bypass all permissions
// ============================================================================

export const globalAdmins = createTable(
  "global_admin",
  (d) => ({
    id: uuid().primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .unique()
      .references(() => accounts.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdBy: uuid("created_by").references(() => accounts.id),
  }),
  (t) => [
    uniqueIndex("lts_global_admin_account_idx").on(t.accountId),
  ]
);

// ============================================================================
// ORGANISATIONS
// ============================================================================

export const organisations = createTable(
  "organisation",
  (d) => ({
    id: uuid().primaryKey().defaultRandom(),
    name: varchar({ length: 256 }).notNull(),
    slug: varchar({ length: 128 }).notNull().unique(),
    logoUrl: text("logo_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).$onUpdate(
      () => new Date()
    ),
  }),
  (t) => [
    uniqueIndex("lts_organisation_slug_idx").on(t.slug),
  ]
);

// ============================================================================
// JURISDICTIONS - Tax jurisdictions (Guernsey, Jersey, etc.)
// ============================================================================

export const jurisdictions = createTable(
  "jurisdiction",
  (d) => ({
    id: uuid().primaryKey().defaultRandom(),
    code: varchar({ length: 8 }).notNull().unique(), // e.g., "GG", "JE", "IM"
    name: varchar({ length: 128 }).notNull(), // e.g., "Guernsey"
    country: varchar({ length: 128 }), // e.g., "United Kingdom"
    portalUrl: text("portal_url"), // e.g., "https://eforms.gov.gg"
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).$onUpdate(
      () => new Date()
    ),
  }),
  (t) => [
    uniqueIndex("lts_jurisdiction_code_idx").on(t.code),
  ]
);

// ============================================================================
// ORG SETTINGS - Per-organisation configuration
// ============================================================================

export const orgSettings = createTable(
  "org_setting",
  (d) => ({
    id: uuid().primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .unique()
      .references(() => organisations.id, { onDelete: "cascade" }),
    defaultAiModel: varchar("default_ai_model", { length: 128 }),
    webhookUrl: text("webhook_url"),
    settings: jsonb().$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).$onUpdate(
      () => new Date()
    ),
  }),
  (t) => [
    uniqueIndex("lts_org_setting_org_idx").on(t.orgId),
  ]
);

// ============================================================================
// JURISDICTION SETTINGS - Per-jurisdiction (optionally per-org) configuration
// ============================================================================

export const jurisdictionSettings = createTable(
  "jurisdiction_setting",
  (d) => ({
    id: uuid().primaryKey().defaultRandom(),
    jurisdictionId: uuid("jurisdiction_id")
      .notNull()
      .references(() => jurisdictions.id, { onDelete: "cascade" }),
    orgId: uuid("org_id").references(() => organisations.id, {
      onDelete: "cascade",
    }),
    portalCredentialsEncrypted: text("portal_credentials_encrypted"), // Encrypted JSON
    settings: jsonb().$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).$onUpdate(
      () => new Date()
    ),
  }),
  (t) => [
    index("lts_jurisdiction_setting_jurisdiction_idx").on(t.jurisdictionId),
    index("lts_jurisdiction_setting_org_idx").on(t.orgId),
    uniqueIndex("lts_jurisdiction_setting_unique_idx").on(t.jurisdictionId, t.orgId),
  ]
);

// ============================================================================
// ORG MEMBERS - User membership in organisations
// ============================================================================

export const orgMembers = createTable(
  "org_member",
  (d) => ({
    id: uuid().primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    role: orgMemberRoleEnum().notNull().default("member"), // owner/admin bypass permissions
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).$onUpdate(
      () => new Date()
    ),
  }),
  (t) => [
    index("lts_org_member_org_idx").on(t.orgId),
    index("lts_org_member_account_idx").on(t.accountId),
    uniqueIndex("lts_org_member_unique_idx").on(t.orgId, t.accountId),
  ]
);

// ============================================================================
// ORG MEMBER PERMISSIONS - Granular permissions (bypassed by admin/owner/global_admin)
// ============================================================================

export const orgMemberPermissions = createTable(
  "org_member_permission",
  (d) => ({
    id: uuid().primaryKey().defaultRandom(),
    orgMemberId: uuid("org_member_id")
      .notNull()
      .references(() => orgMembers.id, { onDelete: "cascade" }),
    permission: varchar({ length: 64 }).notNull(), // e.g., 'tasks:create', 'jobs:run'
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  }),
  (t) => [
    index("lts_org_member_permission_member_idx").on(t.orgMemberId),
    uniqueIndex("lts_org_member_permission_unique_idx").on(t.orgMemberId, t.permission),
  ]
);

// ============================================================================
// TAX RETURNS - Tax returns to be processed
// ============================================================================

export const taxReturns = createTable(
  "tax_return",
  (d) => ({
    id: uuid().primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    jurisdictionId: uuid("jurisdiction_id")
      .notNull()
      .references(() => jurisdictions.id),
    entityName: varchar("entity_name", { length: 256 }).notNull(),
    taxYear: integer("tax_year").notNull(),
    status: taxReturnStatusEnum().notNull().default("pending"),
    externalId: varchar("external_id", { length: 128 }), // For sync source
    link: text("link"), // Direct URL to the tax return page
    pdfUrl: text("pdf_url"), // Link to instruction PDF
    files: jsonb("files").$type<Array<{
      url: string;
      name: string;
      size: number;
      type: string;
      uploadedAt: string;
    }>>(), // Attached files (Vercel Blob URLs)
    metadata: jsonb().$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).$onUpdate(
      () => new Date()
    ),
  }),
  (t) => [
    index("lts_tax_return_org_idx").on(t.orgId),
    uniqueIndex("lts_tax_return_external_id_idx").on(t.externalId),
  ]
);

// ============================================================================
// TASKS - Automation tasks to be completed
// ============================================================================

export const tasks = createTable(
  "task",
  (d) => ({
    id: uuid().primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    jurisdictionId: uuid("jurisdiction_id")
      .notNull()
      .references(() => jurisdictions.id),
    taxReturnId: uuid("tax_return_id").references(() => taxReturns.id),
    name: varchar({ length: 256 }).notNull(),
    description: text(),
    taskType: taskTypeEnum("task_type").notNull().default("tax_return"),
    status: taskStatusEnum().notNull().default("pending"),
    pdfUrls: jsonb("pdf_urls").$type<string[]>(), // Vercel Blob URLs
    metadata: jsonb().$type<Record<string, unknown>>(), // Additional task data
    createdBy: uuid("created_by").references(() => accounts.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).$onUpdate(
      () => new Date()
    ),
  }),
  (t) => [
    index("lts_task_org_idx").on(t.orgId),
    index("lts_task_jurisdiction_idx").on(t.jurisdictionId),
    index("lts_task_tax_return_idx").on(t.taxReturnId),
    index("lts_task_status_idx").on(t.status),
    index("lts_task_created_by_idx").on(t.createdBy),
  ]
);

// ============================================================================
// JOBS - Individual task execution attempts
// ============================================================================

export const jobs = createTable(
  "job",
  (d) => ({
    id: uuid().primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    jobNumber: integer("job_number").notNull(), // Sequential per task (1, 2, 3...)
    status: jobStatusEnum().notNull().default("pending"),
    aiModel: varchar("ai_model", { length: 128 }), // AI gateway model to use
    credentialsSnapshot: text("credentials_snapshot"), // Encrypted credentials for this job
    ecsTaskArn: varchar("ecs_task_arn", { length: 512 }),
    cloudwatchLogGroup: varchar("cloudwatch_log_group", { length: 256 }),
    cloudwatchLogStream: varchar("cloudwatch_log_stream", { length: 512 }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    resultData: jsonb("result_data").$type<Record<string, unknown>>(),
    createdBy: uuid("created_by").references(() => accounts.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).$onUpdate(
      () => new Date()
    ),
  }),
  (t) => [
    index("lts_job_task_idx").on(t.taskId),
    index("lts_job_status_idx").on(t.status),
    uniqueIndex("lts_job_task_number_idx").on(t.taskId, t.jobNumber),
  ]
);

// ============================================================================
// TAX SYNC JOBS - Track tax return sync executions
// ============================================================================

export const taxSyncJobs = createTable(
  "tax_sync_job",
  (d) => ({
    id: uuid().primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    jurisdictionId: uuid("jurisdiction_id")
      .notNull()
      .references(() => jurisdictions.id),
    status: taxSyncJobStatusEnum().notNull().default("pending"),
    ecsTaskArn: varchar("ecs_task_arn", { length: 512 }),
    cloudwatchLogGroup: varchar("cloudwatch_log_group", { length: 256 }),
    cloudwatchLogStream: varchar("cloudwatch_log_stream", { length: 512 }),
    returnsFound: integer("returns_found"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    createdBy: uuid("created_by").references(() => accounts.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  }),
  (t) => [
    index("lts_tax_sync_job_org_idx").on(t.orgId),
    index("lts_tax_sync_job_status_idx").on(t.status),
  ]
);

// ============================================================================
// SUBSTANCE FORMS - Guernsey Economic Substance Register (matching actual form)
// ============================================================================

export const substanceForms = createTable(
  "substance_form",
  (d) => ({
    id: uuid().primaryKey().defaultRandom(),
    taxReturnId: uuid("tax_return_id")
      .notNull()
      .unique()
      .references(() => taxReturns.id, { onDelete: "cascade" }),

    // =========================================================================
    // SECTION 1: BACKGROUND
    // =========================================================================
    entityName: varchar("entity_name", { length: 256 }),
    entityType: varchar("entity_type", { length: 64 }), // "Company" | "Partnership"
    accountingPeriodStart: varchar("accounting_period_start", { length: 16 }), // YYYY-MM-DD
    accountingPeriodEnd: varchar("accounting_period_end", { length: 16 }),
    isCollectiveInvestmentVehicle: varchar("is_civ", { length: 8 }), // "Yes" | "No"

    // =========================================================================
    // SECTION 2: COMPANY INFORMATION
    // =========================================================================
    companyNumber: varchar("company_number", { length: 64 }),
    taxReferenceNumber: varchar("tax_reference_number", { length: 64 }),
    registeredAddress: text("registered_address"),
    principalPlaceOfBusiness: text("principal_place_of_business"),

    // =========================================================================
    // SECTION 3: PARTNERSHIP INFORMATION
    // =========================================================================
    partnershipName: varchar("partnership_name", { length: 256 }),
    partnershipNumber: varchar("partnership_number", { length: 64 }),

    // =========================================================================
    // SECTION 4: FINANCIAL STATEMENTS
    // =========================================================================
    areFinancialStatementsConsolidated: varchar("fin_stmt_consolidated", { length: 8 }),
    accountsPreparerName: varchar("accounts_preparer_name", { length: 256 }),
    accountsPreparerQualification: varchar("accounts_preparer_qual", { length: 128 }), // ACCA, ICAEW, etc.

    // =========================================================================
    // SECTION 5: FINANCIAL INSTITUTIONS (FATCA/CRS)
    // =========================================================================
    isGuernseyFiFatca: varchar("is_gsy_fi_fatca", { length: 8 }),
    isGuernseyFiCrs: varchar("is_gsy_fi_crs", { length: 8 }),

    // =========================================================================
    // SECTION 6: RELEVANT ACTIVITIES
    // =========================================================================
    relevantActivity: varchar("relevant_activity", { length: 128 }), // Single dropdown selection
    hasMultipleRelevantActivities: varchar("has_multiple_activities", { length: 8 }),

    // =========================================================================
    // SECTION 7: CIGA
    // =========================================================================
    cigaPerformed: text("ciga_performed"),
    cigaDetails: text("ciga_details"), // Board minutes CIGA info

    // =========================================================================
    // SECTION 8: EMPLOYEES (FTE Calculation)
    // =========================================================================
    employees: jsonb("employees").$type<Array<{
      name?: string;
      qualifiedForReporting?: boolean;
      unitsOnCompany?: number;
      totalUnits?: number;
      fteFraction?: number;
      qualifiedFteFraction?: number;
    }>>(),
    totalFte: integer("total_fte"),
    totalQualifiedFte: integer("total_qualified_fte"),

    // =========================================================================
    // SECTION 9: OUTSOURCING
    // =========================================================================
    hasCigaOutsourcing: varchar("has_ciga_outsourcing", { length: 8 }), // "Yes" | "No" | "N/A"
    outsourcingDetails: text("outsourcing_details"),

    // =========================================================================
    // SECTION 10: BENEFICIAL OWNERSHIP
    // =========================================================================
    immediateParents: jsonb("immediate_parents").$type<Array<{
      name?: string;
      countryOfTaxResidence?: string;
      tin?: string;
      tinCountry?: string;
      registeredAddress?: string;
    }>>(),
    ultimateParents: jsonb("ultimate_parents").$type<Array<{
      name?: string;
      countryOfTaxResidence?: string;
      tin?: string;
      tinCountry?: string;
      registeredAddress?: string;
    }>>(),
    ultimateBeneficialOwners: jsonb("ubos").$type<Array<{
      name?: string;
      dateOfBirth?: string;
      placeOfBirth?: string;
      nationality?: string;
      countryOfTaxResidence?: string;
      tin?: string;
      tinCountry?: string;
      address?: string;
    }>>(),

    // =========================================================================
    // SECTION 11: DIRECTED AND MANAGED IN GUERNSEY
    // =========================================================================
    allBoardMeetingsInGuernsey: varchar("all_meetings_in_gsy", { length: 8 }),
    totalBoardMeetings: integer("total_board_meetings"),
    boardMeetingsInGuernsey: integer("board_meetings_in_gsy"),
    adequateMeetingFrequency: varchar("adequate_meeting_freq", { length: 8 }),
    enoughDirectorsPresent: varchar("enough_directors_present", { length: 8 }),
    directorsHaveExpertise: varchar("directors_have_expertise", { length: 8 }),
    strategicDecisionsMadeInGuernsey: varchar("strategic_decisions_gsy", { length: 8 }),
    recordsMaintainedInGuernsey: varchar("records_maintained_gsy", { length: 8 }),
    boardMeetingLocation: varchar("board_meeting_location", { length: 256 }),
    directors: jsonb("directors").$type<Array<{
      name?: string;
      initials?: string;
    }>>(),
    boardMeetings: jsonb("board_meetings").$type<Array<{
      date?: string;
      attendees?: string;
      allPresentInGuernsey?: boolean;
      agendaPoints?: string;
    }>>(),

    // =========================================================================
    // SECTION 12: DECLARATION
    // =========================================================================
    preparedBy: varchar("prepared_by", { length: 256 }),
    preparedDate: varchar("prepared_date", { length: 16 }),
    managerSignOff: varchar("manager_sign_off", { length: 256 }),
    managerSignOffDate: varchar("manager_sign_off_date", { length: 16 }),

    // =========================================================================
    // STATUS TRACKING
    // =========================================================================
    isComplete: boolean("is_complete").default(false),
    missingFields: jsonb("missing_fields").$type<string[]>(),
    aiExtractedAt: timestamp("ai_extracted_at", { withTimezone: true }),
    lastEditedAt: timestamp("last_edited_at", { withTimezone: true }),
    lastEditedBy: uuid("last_edited_by").references(() => accounts.id),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).$onUpdate(
      () => new Date()
    ),
  }),
  (t) => [
    uniqueIndex("lts_substance_form_tax_return_idx").on(t.taxReturnId),
    index("lts_substance_form_complete_idx").on(t.isComplete),
  ]
);

// ============================================================================
// RELATIONS
// ============================================================================

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  globalAdmin: one(globalAdmins, {
    fields: [accounts.id],
    references: [globalAdmins.accountId],
  }),
  orgMembers: many(orgMembers),
  createdTasks: many(tasks),
  createdJobs: many(jobs),
}));

export const globalAdminsRelations = relations(globalAdmins, ({ one }) => ({
  account: one(accounts, {
    fields: [globalAdmins.accountId],
    references: [accounts.id],
  }),
  createdByAccount: one(accounts, {
    fields: [globalAdmins.createdBy],
    references: [accounts.id],
  }),
}));

export const organisationsRelations = relations(organisations, ({ one, many }) => ({
  settings: one(orgSettings, {
    fields: [organisations.id],
    references: [orgSettings.orgId],
  }),
  members: many(orgMembers),
  tasks: many(tasks),
  taxReturns: many(taxReturns),
  jurisdictionSettings: many(jurisdictionSettings),
}));

export const jurisdictionsRelations = relations(jurisdictions, ({ many }) => ({
  settings: many(jurisdictionSettings),
  tasks: many(tasks),
  taxReturns: many(taxReturns),
}));

export const orgSettingsRelations = relations(orgSettings, ({ one }) => ({
  organisation: one(organisations, {
    fields: [orgSettings.orgId],
    references: [organisations.id],
  }),
}));

export const jurisdictionSettingsRelations = relations(
  jurisdictionSettings,
  ({ one }) => ({
    jurisdiction: one(jurisdictions, {
      fields: [jurisdictionSettings.jurisdictionId],
      references: [jurisdictions.id],
    }),
    organisation: one(organisations, {
      fields: [jurisdictionSettings.orgId],
      references: [organisations.id],
    }),
  })
);

export const orgMembersRelations = relations(orgMembers, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [orgMembers.orgId],
    references: [organisations.id],
  }),
  account: one(accounts, {
    fields: [orgMembers.accountId],
    references: [accounts.id],
  }),
  permissions: many(orgMemberPermissions),
}));

export const orgMemberPermissionsRelations = relations(
  orgMemberPermissions,
  ({ one }) => ({
    orgMember: one(orgMembers, {
      fields: [orgMemberPermissions.orgMemberId],
      references: [orgMembers.id],
    }),
  })
);

export const taxReturnsRelations = relations(taxReturns, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [taxReturns.orgId],
    references: [organisations.id],
  }),
  jurisdiction: one(jurisdictions, {
    fields: [taxReturns.jurisdictionId],
    references: [jurisdictions.id],
  }),
  tasks: many(tasks),
  substanceForm: one(substanceForms, {
    fields: [taxReturns.id],
    references: [substanceForms.taxReturnId],
  }),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [tasks.orgId],
    references: [organisations.id],
  }),
  jurisdiction: one(jurisdictions, {
    fields: [tasks.jurisdictionId],
    references: [jurisdictions.id],
  }),
  taxReturn: one(taxReturns, {
    fields: [tasks.taxReturnId],
    references: [taxReturns.id],
  }),
  createdByAccount: one(accounts, {
    fields: [tasks.createdBy],
    references: [accounts.id],
  }),
  jobs: many(jobs),
}));

export const jobsRelations = relations(jobs, ({ one }) => ({
  task: one(tasks, {
    fields: [jobs.taskId],
    references: [tasks.id],
  }),
  createdByAccount: one(accounts, {
    fields: [jobs.createdBy],
    references: [accounts.id],
  }),
}));

export const taxSyncJobsRelations = relations(taxSyncJobs, ({ one }) => ({
  organisation: one(organisations, {
    fields: [taxSyncJobs.orgId],
    references: [organisations.id],
  }),
  jurisdiction: one(jurisdictions, {
    fields: [taxSyncJobs.jurisdictionId],
    references: [jurisdictions.id],
  }),
  createdByAccount: one(accounts, {
    fields: [taxSyncJobs.createdBy],
    references: [accounts.id],
  }),
}));

export const substanceFormsRelations = relations(substanceForms, ({ one }) => ({
  taxReturn: one(taxReturns, {
    fields: [substanceForms.taxReturnId],
    references: [taxReturns.id],
  }),
  lastEditedByAccount: one(accounts, {
    fields: [substanceForms.lastEditedBy],
    references: [accounts.id],
  }),
}));

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;

export type GlobalAdmin = typeof globalAdmins.$inferSelect;
export type NewGlobalAdmin = typeof globalAdmins.$inferInsert;

export type Organisation = typeof organisations.$inferSelect;
export type NewOrganisation = typeof organisations.$inferInsert;

export type Jurisdiction = typeof jurisdictions.$inferSelect;
export type NewJurisdiction = typeof jurisdictions.$inferInsert;

export type OrgSetting = typeof orgSettings.$inferSelect;
export type NewOrgSetting = typeof orgSettings.$inferInsert;

export type JurisdictionSetting = typeof jurisdictionSettings.$inferSelect;
export type NewJurisdictionSetting = typeof jurisdictionSettings.$inferInsert;

export type OrgMember = typeof orgMembers.$inferSelect;
export type NewOrgMember = typeof orgMembers.$inferInsert;

export type OrgMemberPermission = typeof orgMemberPermissions.$inferSelect;
export type NewOrgMemberPermission = typeof orgMemberPermissions.$inferInsert;

export type TaxReturn = typeof taxReturns.$inferSelect;
export type NewTaxReturn = typeof taxReturns.$inferInsert;

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;

export type TaxSyncJob = typeof taxSyncJobs.$inferSelect;
export type NewTaxSyncJob = typeof taxSyncJobs.$inferInsert;

export type SubstanceForm = typeof substanceForms.$inferSelect;
export type NewSubstanceForm = typeof substanceForms.$inferInsert;
