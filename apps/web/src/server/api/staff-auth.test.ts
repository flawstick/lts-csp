import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireStaffAccount } from "./staff-auth";

const { getUser, findAccount, findGlobalAdmin } = vi.hoisted(() => ({
  getUser: vi.fn(),
  findAccount: vi.fn(),
  findGlobalAdmin: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("drizzle-orm", () => ({
  eq: (column: string, value: string) => ({ column, value }),
}));
vi.mock("@repo/database", () => ({
  accounts: { userId: "user_id" },
  globalAdmins: { accountId: "account_id" },
  db: {
    query: {
      accounts: { findFirst: findAccount },
      globalAdmins: { findFirst: findGlobalAdmin },
    },
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser } }),
}));

const portalAccount = { id: "account-1", accountType: "portal" };

describe("requireStaffAccount", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    findAccount.mockResolvedValue(portalAccount);
  });

  it("allows a portal account that already has the global admin role", async () => {
    findGlobalAdmin.mockResolvedValue({ id: "admin-1" });
    await expect(requireStaffAccount()).resolves.toBe(portalAccount);
    expect(findGlobalAdmin).toHaveBeenCalledWith({
      where: { column: "account_id", value: portalAccount.id },
      columns: { id: true },
    });
  });

  it("rejects an ordinary portal account", async () => {
    await expect(requireStaffAccount()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("allows an internal account without requiring a global admin role", async () => {
    const internalAccount = { ...portalAccount, accountType: "internal" };
    findAccount.mockResolvedValue(internalAccount);
    await expect(requireStaffAccount()).resolves.toBe(internalAccount);
    expect(findGlobalAdmin).not.toHaveBeenCalled();
  });
});
