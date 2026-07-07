/**
 * Smartping WhatsApp integration — the provider (an AiSensy white-label at
 * backend.api-wa.co, with a Pinbot partner gateway) exposes THREE APIs; each
 * uses a DIFFERENT credential:
 *
 * 1. DIRECT API (backend.api-wa.co/direct-apis/t1, `Authorization: Bearer
 *    <Direct API key>`): GET /get-templates → the template list. Preferred
 *    fetch path — the Direct API key is generated in the Smartping panel.
 *    Env: SMARTPING_DIRECT_API_KEY.
 *
 * 2. PARTNER API (partnersv1.pinbot.ai, header `apikey: <WABA API key>`):
 *    template list (§30), getuserdetails (§34), and direct template send (§8).
 *    Env: PINBOT_API_KEY (+ optional numeric PINBOT_WABA_ID /
 *    PINBOT_PHONE_NUMBER_ID; auto-resolved via getuserdetails otherwise).
 *
 * 3. CAMPAIGN API (backend.api-wa.co/campaign/.../api/v2, apiKey JWT in the
 *    body): send-by-campaign-name — the send fallback when the Partner API
 *    isn't configured. Env: SMARTPING_API_KEY, SMARTPING_BASE_URL.
 *
 * Template fetch tries the Direct API first, then the Partner API — whichever
 * key the account actually has works.
 */

const env = (k: string) => (process.env[k] ?? "").trim();

const PARTNER_BASE = "https://partnersv1.pinbot.ai/v3";
const DIRECT_BASE = "https://backend.api-wa.co/direct-apis/t1";

/** Campaign (fallback send) API configured? */
export function whatsappConfigured(): boolean {
  return Boolean(env("SMARTPING_API_KEY") && env("SMARTPING_BASE_URL"));
}

/** Any template-fetch credential configured (Direct API key or Partner key)? */
export function partnerConfigured(): boolean {
  return Boolean(env("SMARTPING_DIRECT_API_KEY") || env("PINBOT_API_KEY"));
}

/** Partner (Pinbot) direct-send configured? */
export function partnerSendConfigured(): boolean {
  return Boolean(env("PINBOT_API_KEY"));
}

export type PartnerTemplate = {
  name: string;
  language: string | null;
  status: string; // APPROVED / PENDING / REJECTED
  body: string; // BODY component text ({{1}},{{2}},…)
  paramCount: number;
};

export type ListResult = { ok: true; templates: PartnerTemplate[] } | { ok: false; error: string };

function countParams(body: string): number {
  const nums = new Set<number>();
  for (const m of body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) nums.add(Number(m[1]));
  return nums.size;
}

/** A plausible Meta id (WABA / phone number id) — numeric, not a URL/JWT pasted by mistake. */
const isMetaId = (v: string) => /^\d{5,}$/.test(v);

// The account ids rarely change — cache the getuserdetails lookup per process.
let cachedIds: { wabaId: string; phoneNumberId: string } | null = null;

/**
 * Resolve the WABA id + phone_number_id. GET /v3/getuserdetails (§34) is the
 * source of truth — it returns the ids the KEY actually belongs to, so a stale
 * or mistyped env id can't point a valid key at the wrong WABA (which reads as
 * a confusing 401). Numeric env values are only a fallback when the lookup
 * itself fails; non-numeric env values (URLs/JWTs pasted by mistake) are ignored.
 */
export async function getAccountIds(): Promise<{ wabaId: string; phoneNumberId: string } | { error: string }> {
  if (cachedIds) return cachedIds;
  const envWaba = env("PINBOT_WABA_ID");
  const envPhone = env("PINBOT_PHONE_NUMBER_ID");

  try {
    const res = await fetch(`${PARTNER_BASE}/getuserdetails`, {
      method: "GET",
      headers: { Accept: "application/json", apikey: env("PINBOT_API_KEY") },
    });
    const text = await res.text().catch(() => "");
    if (res.ok) {
      const json = JSON.parse(text) as { data?: { whatsapp_business_account_id?: string; phone_number_id?: string }[] };
      const first = json?.data?.[0];
      const wabaId = first?.whatsapp_business_account_id ?? "";
      const phoneNumberId = first?.phone_number_id ?? "";
      if (wabaId && phoneNumberId) {
        cachedIds = { wabaId, phoneNumberId };
        return cachedIds;
      }
    }
    // Lookup failed or returned nothing — fall back to explicit numeric env ids.
    if (isMetaId(envWaba) && isMetaId(envPhone)) return { wabaId: envWaba, phoneNumberId: envPhone };
    return {
      error: `Partner API ${res.status}: ${text.slice(0, 200)} — check PINBOT_API_KEY (the WABA API key, not the campaign key)`,
    };
  } catch (e) {
    if (isMetaId(envWaba) && isMetaId(envPhone)) return { wabaId: envWaba, phoneNumberId: envPhone };
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Parse a Meta-style template array ({ name, language, status, components[] }). */
function parseMetaTemplates(rows: unknown[]): PartnerTemplate[] {
  const templates: PartnerTemplate[] = [];
  for (const raw of rows) {
    const t = (raw ?? {}) as Record<string, unknown>;
    const name = typeof t.name === "string" ? t.name : "";
    if (!name) continue;
    const components = Array.isArray(t.components) ? (t.components as Record<string, unknown>[]) : [];
    const bodyComp = components.find((c) => String(c.type ?? "").toUpperCase() === "BODY");
    const body = typeof bodyComp?.text === "string" ? bodyComp.text : "";
    templates.push({
      name,
      language: typeof t.language === "string" ? t.language : null,
      status: typeof t.status === "string" ? t.status : "",
      body,
      paramCount: countParams(body),
    });
  }
  return templates;
}

/** GET direct-apis/t1/get-templates — the AiSensy Direct API template list. */
async function listDirectTemplates(): Promise<ListResult> {
  try {
    const res = await fetch(`${DIRECT_BASE}/get-templates`, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${env("SMARTPING_DIRECT_API_KEY")}` },
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      return { ok: false, error: `Direct API ${res.status}: ${text.slice(0, 300)} — check SMARTPING_DIRECT_API_KEY` };
    }
    const json = (JSON.parse(text) ?? {}) as Record<string, unknown>;
    // Tolerate the common wrappings: bare array / {templates:[…]} / {data:[…]}.
    const rows: unknown[] = Array.isArray(json)
      ? (json as unknown[])
      : Array.isArray(json.templates)
        ? (json.templates as unknown[])
        : Array.isArray(json.data)
          ? (json.data as unknown[])
          : [];
    if (rows.length === 0 && !Array.isArray(json) && !Array.isArray(json.templates) && !Array.isArray(json.data)) {
      return { ok: false, error: `Direct API returned an unexpected shape: ${text.slice(0, 200)}` };
    }
    return { ok: true, templates: parseMetaTemplates(rows) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** GET /v3/{wabaId}/message_templates — the Partner doc's "Get all templates" (§30). */
async function listPinbotTemplates(): Promise<ListResult> {
  const ids = await getAccountIds();
  if ("error" in ids) return { ok: false, error: ids.error };

  try {
    const res = await fetch(`${PARTNER_BASE}/${ids.wabaId}/message_templates`, {
      method: "GET",
      headers: { Accept: "application/json", apikey: env("PINBOT_API_KEY") },
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      return { ok: false, error: `Partner API ${res.status}: ${text.slice(0, 300)}` };
    }
    const json = (JSON.parse(text) ?? {}) as { data?: unknown[] };
    // Pinbot signals failure inside a 200 body ({"code":100,"status":"Failed"}).
    if (!Array.isArray(json.data)) {
      return { ok: false, error: `Partner API rejected the request: ${text.slice(0, 200)}` };
    }
    return { ok: true, templates: parseMetaTemplates(json.data) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Fetch the template list with whichever credential the account has:
 *  Direct API key first, then the Pinbot Partner key. */
export async function listPartnerTemplates(): Promise<ListResult> {
  if (!partnerConfigured()) {
    return { ok: false, error: "Template fetch not configured (set SMARTPING_DIRECT_API_KEY or PINBOT_API_KEY)" };
  }
  if (env("SMARTPING_DIRECT_API_KEY")) {
    const direct = await listDirectTemplates();
    if (direct.ok || !env("PINBOT_API_KEY")) return direct;
    const pinbot = await listPinbotTemplates();
    return pinbot.ok ? pinbot : { ok: false, error: `${direct.error} | ${pinbot.error}` };
  }
  return listPinbotTemplates();
}

export type PartnerSendOutcome = { ok: true } | { ok: false; error: string };

/** POST /v3/{phone_number_id}/messages — the doc's "Send Text Template Message" (§8). */
export async function sendPartnerTemplate(p: {
  to: string; // MSISDN with country code, e.g. 91XXXXXXXXXX
  templateName: string;
  language: string;
  params: string[];
}): Promise<PartnerSendOutcome> {
  const ids = await getAccountIds();
  if ("error" in ids) return { ok: false, error: ids.error };
  try {
    const res = await fetch(`${PARTNER_BASE}/${ids.phoneNumberId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: env("PINBOT_API_KEY") },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: p.to,
        type: "template",
        template: {
          language: { code: p.language },
          name: p.templateName,
          ...(p.params.length > 0
            ? { components: [{ type: "body", parameters: p.params.map((text) => ({ type: "text", text })) }] }
            : {}),
        },
      }),
    });
    if (!res.ok) {
      const text = (await res.text().catch(() => "")).slice(0, 300);
      return { ok: false, error: `Partner API ${res.status}: ${text}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
