import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * saveRulesAction — the Notifications event-rule save path. Covers: upserting a
 * toggled-on rule (enabled + recipients + template), channel/template ownership
 * validation, unknown-event rejection, and malformed payloads. Auth/DB/audit are
 * mocked at the module boundary (same pattern as access-control.test.ts).
 */

const ruleUpsert = vi.fn();
const templateFindMany = vi.fn();
const writeAudit = vi.fn();

const txMock = { notificationRule: { upsert: ruleUpsert } };

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/session", () => ({
  requirePermission: async () => ({ id: "1", isSuperAdmin: true, permissions: new Set(), branchId: null }),
}));
vi.mock("@/lib/audit", () => ({ writeAudit: (...a: unknown[]) => writeAudit(...a) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    notificationTemplate: { findMany: (...a: unknown[]) => templateFindMany(...a), findUnique: vi.fn() },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(txMock),
  },
}));
vi.mock("@/lib/notifications/smartping", () => ({ listPartnerTemplates: vi.fn() }));

import { saveRulesAction } from "@/app/(app)/notifications/actions";

function form(channel: string, payload: unknown): FormData {
  const fd = new FormData();
  fd.set("channel", channel);
  fd.set("payload", typeof payload === "string" ? payload : JSON.stringify(payload));
  return fd;
}

const row = (over: Record<string, unknown> = {}) => ({
  eventCode: "coupon.utilized",
  enabled: true,
  recipients: { roles: [], vendor: false, requester: false, cardholder: true },
  frequency: "instant",
  templateId: "7",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  templateFindMany.mockResolvedValue([{ id: BigInt(7) }]); // template 7 belongs to the channel
  ruleUpsert.mockResolvedValue({});
});

describe("saveRulesAction", () => {
  it("persists a toggled-on rule (enabled, cardholder recipient, template)", async () => {
    const r = await saveRulesAction({}, form("whatsapp", [row()]));
    expect(r).toEqual({ success: true });

    expect(ruleUpsert).toHaveBeenCalledTimes(1);
    const call = ruleUpsert.mock.calls[0][0];
    expect(call.where).toEqual({ eventCode_channel: { eventCode: "coupon.utilized", channel: "whatsapp" } });
    for (const data of [call.create, call.update]) {
      expect(data.enabled ?? call.create.enabled).toBe(true);
    }
    expect(call.update.enabled).toBe(true);
    expect(call.update.recipients).toEqual({ roles: [], vendor: false, requester: false, cardholder: true });
    expect(call.update.templateId).toBe(BigInt(7));
    expect(writeAudit).toHaveBeenCalledTimes(1);
  });

  it("upserts every event in the payload (whole-grid save)", async () => {
    const r = await saveRulesAction(
      {},
      form("push", [
        row({ eventCode: "coupon.utilized", templateId: null }),
        row({ eventCode: "user.created", enabled: false, templateId: null }),
      ]),
    );
    expect(r).toEqual({ success: true });
    expect(ruleUpsert).toHaveBeenCalledTimes(2);
  });

  it("rejects a template that belongs to another channel", async () => {
    templateFindMany.mockResolvedValue([]); // template 7 is NOT a whatsapp template
    const r = await saveRulesAction({}, form("whatsapp", [row()]));
    expect(r).toEqual({ error: "A selected template does not belong to this channel." });
    expect(ruleUpsert).not.toHaveBeenCalled();
  });

  it("rejects unknown events and bad channels/payloads without writing", async () => {
    expect(await saveRulesAction({}, form("whatsapp", [row({ eventCode: "nope" })]))).toEqual({
      error: "Unknown event: nope",
    });
    expect(await saveRulesAction({}, form("carrier-pigeon", [row()]))).toEqual({ error: "Invalid channel." });
    expect(await saveRulesAction({}, form("whatsapp", "{bad json"))).toEqual({
      error: "Could not read the submitted rules.",
    });
    expect(ruleUpsert).not.toHaveBeenCalled();
  });
});
