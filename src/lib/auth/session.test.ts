import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";

const mocks = vi.hoisted(() => ({ cookies: vi.fn(), getIronSession: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("iron-session", () => ({ getIronSession: mocks.getIronSession }));

import { destroyAdminSession, writeAdminSession } from "./session";

describe("iron-session integration", () => {
  const originalSecret = process.env.SESSION_SECRET;
  const save = vi.fn(async () => undefined);
  const destroy = vi.fn(() => undefined);
  const fakeSession = { save, destroy };

  beforeEach(() => {
    process.env.SESSION_SECRET = randomBytes(32).toString("base64url");
    mocks.cookies.mockResolvedValue({});
    mocks.getIronSession.mockResolvedValue(fakeSession);
    save.mockClear();
    destroy.mockClear();
  });

  it("writes a versioned login session without saving after destroy", async () => {
    await writeAdminSession({ staffId: "staff-1", storeId: "store-1", role: "STAFF", sessionVersion: 7 });
    expect(fakeSession).toMatchObject({ staffId: "staff-1", storeId: "store-1", role: "STAFF", sessionVersion: 7 });
    expect(destroy).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledOnce();
  });

  it("logout destroys only the current session cookie", async () => {
    await destroyAdminSession();
    expect(destroy).toHaveBeenCalledOnce();
    expect(save).not.toHaveBeenCalled();
  });

  it("rejects missing session configuration without exposing its value", async () => {
    delete process.env.SESSION_SECRET;
    await expect(writeAdminSession({ staffId: "staff-1", storeId: "store-1", role: "OWNER", sessionVersion: 0 })).rejects.toThrow(/SESSION_SECRET/);
  });

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = originalSecret;
  });
});
