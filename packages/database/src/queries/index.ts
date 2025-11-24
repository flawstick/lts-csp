import { desc, eq, and } from "drizzle-orm";
import { db } from "../index";
import {
  accounts,
  organisations,
  orgMembers,
  jurisdictions,
  tasks,
  jobs,
  globalAdmins,
} from "../schema";

// Organisation queries
export const orgQueries = {
  getAll: () => db.query.organisations.findMany({ orderBy: [desc(organisations.createdAt)] }),

  getById: (id: string) =>
    db.query.organisations.findFirst({ where: eq(organisations.id, id) }),

  getBySlug: (slug: string) =>
    db.query.organisations.findFirst({ where: eq(organisations.slug, slug) }),
};

// Account queries
export const accountQueries = {
  getByUserId: (userId: string) =>
    db.query.accounts.findFirst({ where: eq(accounts.userId, userId) }),

  getById: (id: string) =>
    db.query.accounts.findFirst({ where: eq(accounts.id, id) }),
};

// Org member queries
export const orgMemberQueries = {
  getByAccountId: (accountId: string) =>
    db.query.orgMembers.findMany({
      where: eq(orgMembers.accountId, accountId),
      with: { organisation: true },
    }),

  getByOrgId: (orgId: string) =>
    db.query.orgMembers.findMany({
      where: eq(orgMembers.orgId, orgId),
      with: { account: true },
    }),
};

// Jurisdiction queries
export const jurisdictionQueries = {
  getAll: () => db.query.jurisdictions.findMany({ orderBy: [jurisdictions.name] }),

  getByCode: (code: string) =>
    db.query.jurisdictions.findFirst({ where: eq(jurisdictions.code, code) }),
};

// Task queries
export const taskQueries = {
  getByOrgId: (orgId: string) =>
    db.query.tasks.findMany({
      where: eq(tasks.orgId, orgId),
      orderBy: [desc(tasks.createdAt)],
      with: { jurisdiction: true, jobs: true },
    }),

  getById: (id: string) =>
    db.query.tasks.findFirst({
      where: eq(tasks.id, id),
      with: { jurisdiction: true, jobs: true, organisation: true },
    }),
};

// Job queries
export const jobQueries = {
  getByTaskId: (taskId: string) =>
    db.query.jobs.findMany({
      where: eq(jobs.taskId, taskId),
      orderBy: [desc(jobs.jobNumber)],
    }),

  getById: (id: string) =>
    db.query.jobs.findFirst({
      where: eq(jobs.id, id),
      with: { task: true },
    }),

  getLatestByTaskId: (taskId: string) =>
    db.query.jobs.findFirst({
      where: eq(jobs.taskId, taskId),
      orderBy: [desc(jobs.jobNumber)],
    }),
};

// Global admin queries
export const globalAdminQueries = {
  isGlobalAdmin: async (accountId: string) => {
    const admin = await db.query.globalAdmins.findFirst({
      where: eq(globalAdmins.accountId, accountId),
    });
    return !!admin;
  },
};
