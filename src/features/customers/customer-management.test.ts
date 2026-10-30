import { describe, expect, it, vi } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";
import { buildCustomerSearchWhere, getCustomerDetails, MAX_CUSTOMER_SEARCH_LENGTH, normalizeCustomerSearchTerm } from "./customer-search";
import { createCustomer, deactivateCustomer, getPublicProfileById, projectPublicProfile, updateCustomer } from "./customer-service";
import { customerCreateSchema, customerUpdateSchema } from "./schemas";

function createMemoryDatabase(initial: { customer?: Record<string, unknown>; profile?: Record<string, unknown> } = {}) {
  const state: { customer?: Record<string, unknown>; profile?: Record<string, unknown>; audits: Record<string, unknown>[] } = {
    customer: initial.customer ? { ...initial.customer } : undefined,
    profile: initial.profile ? { ...initial.profile } : undefined,
    audits: [],
  };
  const auditLog = { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { state.audits.push(data); return data; }) };
  const customer = {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const nested = data.publicProfile as { create?: Record<string, unknown> } | undefined;
      state.customer = { id: "customer-1", ...data };
      if (nested?.create) state.profile = { id: "profile-1", customerId: "customer-1", ...nested.create };
      return { id: "customer-1" };
    }),
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      if (!state.customer || state.customer.id !== where.id || state.customer.storeId !== where.storeId) return null;
      if (where.isActive === true && state.customer.isActive !== true) return null;
      return { id: state.customer.id, publicProfile: state.profile ? { id: state.profile.id, nickname: state.profile.nickname } : null };
    }),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { Object.assign(state.customer ?? {}, data); return state.customer; }),
  };
  const publicProfile = {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { state.profile = { id: "profile-1", ...data }; return state.profile; }),
    update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => { Object.assign(state.profile ?? {}, data); return state.profile; }),
    findFirst: vi.fn(async ({ where, select }: { where: Record<string, unknown>; select: Record<string, boolean> }) => {
      if (!state.profile || state.profile.publicId !== where.publicId || state.profile.rankingOptIn !== true || state.profile.profileVisible !== true || state.customer?.isActive !== true) return null;
      return Object.fromEntries(Object.keys(select).map((key) => [key, state.profile?.[key]]));
    }),
  };
  const db = { $transaction: async <T>(callback: (tx: unknown) => Promise<T>) => callback({ customer, publicProfile, auditLog, $queryRaw: vi.fn(async () => [{ id: "store-a" }]) }), publicProfile };
  return { db: db as unknown as Pick<PrismaClient, "$transaction"> & Pick<PrismaClient, "publicProfile">, state, customer, publicProfile, auditLog };
}

const createInput = customerCreateSchema.parse({ customerCode: " C-01 ", internalName: "山田 花子", note: "メモ", rankingOptIn: true, nickname: "はな", profileVisible: false });
const updateInput = (overrides: Partial<Record<string, unknown>> = {}) => customerUpdateSchema.parse({ customerCode: "C-01", internalName: "山田 花子 更新", note: "変更メモ", rankingOptIn: false, nickname: "", profileVisible: false, ...overrides });

describe("Sprint 2 customer management", () => {
  it("scopes customer search to the current store and excludes inactive records by default", () => {
    const where = buildCustomerSearchWhere("store-a", " hana ");
    expect(where.storeId).toBe("store-a");
    expect(where.isActive).toBe(true);
    expect(where.OR).toHaveLength(3);
    expect(buildCustomerSearchWhere("store-b", "", true)).toEqual({ storeId: "store-b" });
  });

  it("caps overly long customer search terms server-side", () => {
    const query = "a".repeat(MAX_CUSTOMER_SEARCH_LENGTH + 50);
    expect(normalizeCustomerSearchTerm(query)).toHaveLength(MAX_CUSTOMER_SEARCH_LENGTH);
    expect(buildCustomerSearchWhere("store-a", query).OR?.[0]).toEqual({ customerCode: { contains: "a".repeat(MAX_CUSTOMER_SEARCH_LENGTH), mode: "insensitive" } });
  });

  it("creates a customer and a separate public profile with an audit event in the transaction", async () => {
    const memory = createMemoryDatabase();
    const id = await createCustomer(memory.db, createInput, { storeId: "store-a", staffId: "staff-a" });
    expect(id).toBe("customer-1");
    expect(memory.state.customer).toMatchObject({ storeId: "store-a", customerCode: "C-01", internalName: "山田 花子" });
    expect(memory.state.profile).toMatchObject({ customerId: "customer-1", nickname: "はな", rankingOptIn: true, profileVisible: false });
    expect(memory.state.audits.map((row) => row.action)).toEqual(["CUSTOMER_CREATE", "PUBLIC_PROFILE_UPDATE"]);
  });

  it("relies on the composite store/customer-code uniqueness constraint to reject duplicates", async () => {
    const memory = createMemoryDatabase();
    memory.customer.create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "test" }));
    await expect(createCustomer(memory.db, createInput, { storeId: "store-a", staffId: "staff-a" })).rejects.toMatchObject({ code: "P2002" });
  });

  it("updates only a customer found with the authenticated storeId and turns profile participation off without deleting it", async () => {
    const memory = createMemoryDatabase({ customer: { id: "customer-1", storeId: "store-a", isActive: true }, profile: { id: "profile-1", customerId: "customer-1", nickname: "はな", rankingOptIn: true, profileVisible: true } });
    const updated = await updateCustomer(memory.db, "customer-1", updateInput(), { storeId: "store-a", staffId: "staff-a" });
    expect(updated).toBe(true);
    expect(memory.customer.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "customer-1", storeId: "store-a" } }));
    expect(memory.state.profile).toMatchObject({ nickname: "はな", rankingOptIn: false, profileVisible: false });
    expect(memory.state.audits.map((row) => row.action)).toContain("PUBLIC_PROFILE_UPDATE");
  });

  it("cannot find a customer belonging to another store", async () => {
    const memory = createMemoryDatabase({ customer: { id: "customer-1", storeId: "store-b", isActive: true } });
    await expect(updateCustomer(memory.db, "customer-1", updateInput(), { storeId: "store-a", staffId: "staff-a" })).resolves.toBe(false);
    expect(memory.customer.update).not.toHaveBeenCalled();
  });

  it("scopes detail retrieval by both customer id and authenticated storeId", async () => {
    const memory = createMemoryDatabase({ customer: { id: "customer-1", storeId: "store-b", isActive: true } });
    await expect(getCustomerDetails(memory as never, "store-a", "customer-1")).resolves.toBeNull();
    expect(memory.customer.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "customer-1", storeId: "store-a" } }));
  });

  it("deactivates instead of deleting and writes the deactivation audit event", async () => {
    const memory = createMemoryDatabase({ customer: { id: "customer-1", storeId: "store-a", isActive: true } });
    await expect(deactivateCustomer(memory.db, "customer-1", { storeId: "store-a", staffId: "staff-a" })).resolves.toBe(true);
    expect(memory.state.customer?.isActive).toBe(false);
    expect(memory.state.audits.at(-1)?.action).toBe("CUSTOMER_DEACTIVATE");
  });

  it("does not create a public profile when rankingOptIn is off", async () => {
    const memory = createMemoryDatabase();
    const input = customerCreateSchema.parse({ customerCode: "C-02", internalName: "佐藤", note: "", rankingOptIn: false, nickname: "", profileVisible: false });
    await createCustomer(memory.db, input, { storeId: "store-a", staffId: "staff-a" });
    expect(memory.publicProfile.create).not.toHaveBeenCalled();
    expect(memory.state.profile).toBeUndefined();
  });

  it("returns only approved public fields and requires opt-in, visibility, and active customer", async () => {
    const profile = { publicId: "public-1", nickname: "はな", avatarUrl: null, customer: { internalName: "本名", note: "秘匿", storeId: "store-a" }, accounting: { balance: 1200 } };
    const dto = projectPublicProfile(profile);
    expect(dto).toEqual({ publicId: "public-1", nickname: "はな", avatarUrl: null });
    expect(Object.keys(dto).sort()).toEqual(["avatarUrl", "nickname", "publicId"]);

    const memory = createMemoryDatabase({ customer: { id: "customer-1", storeId: "store-a", isActive: true }, profile: { id: "profile-1", publicId: "public-1", nickname: "はな", avatarUrl: null, rankingOptIn: true, profileVisible: true } });
    await expect(getPublicProfileById(memory.db, "public-1")).resolves.toEqual(dto);
    memory.state.profile!.profileVisible = false;
    await expect(getPublicProfileById(memory.db, "public-1")).resolves.toBeNull();
    memory.state.profile!.profileVisible = true;
    memory.state.profile!.rankingOptIn = false;
    await expect(getPublicProfileById(memory.db, "public-1")).resolves.toBeNull();
    memory.state.profile!.rankingOptIn = true;
    memory.state.customer!.isActive = false;
    await expect(getPublicProfileById(memory.db, "public-1")).resolves.toBeNull();
  });
});
