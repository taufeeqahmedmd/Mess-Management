"use client";

import { useEffect, useState, type ReactNode } from "react";
import { publicCodeSchema } from "@/lib/public-schema";
import { Logo } from "@/components/shell/icons";
import type { PublicBalance, PublicRechargeOptions } from "@/services/public-lookup";

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Meal icon paths + tile accent, keyed by meal name (falls back for others).
const MEAL_ICON: Record<string, ReactNode> = {
  Breakfast: <><path d="M4 3v7a2 2 0 0 0 2 2v9M8 3v7M6 3v7" /><path d="M17 3c-2 2-3 4.5-3 7a3 3 0 0 0 3 3v8" /></>,
  Lunch: <path d="M3 11h18M5 11a7 7 0 0 1 14 0M12 3v2M3 15h18v1a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3Z" />,
  Snacks: <path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4ZM6 1v3M10 1v3M14 1v3" />,
  Dinner: <><path d="M12 2a7 7 0 0 0-7 7c0 3 2 5 2 8h10c0-3 2-5 2-8a7 7 0 0 0-7-7ZM9 21h6" /></>,
};
const TILE: Record<string, string> = { Breakfast: "c-bf", Lunch: "c-ln", Snacks: "c-sn", Dinner: "c-dn" };
const mealIcon = (name: string) => MEAL_ICON[name] ?? <circle cx="12" cy="12" r="8" />;

export function LookupClient() {
  const [code, setCode] = useState("");
  const [balance, setBalance] = useState<PublicBalance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [mode, setMode] = useState<"view" | "recharge">("view");
  const [options, setOptions] = useState<PublicRechargeOptions | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [optLoading, setOptLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payMsg, setPayMsg] = useState<string | null>(null);
  const [payerPhone, setPayerPhone] = useState("");
  const [payerEmail, setPayerEmail] = useState("");

  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    // Sync the toggle icon to the theme the pre-paint script already applied on <html>.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
  }, []);
  function toggleTheme() {
    const el = document.documentElement;
    const dark = el.getAttribute("data-theme") === "dark";
    if (dark) el.removeAttribute("data-theme");
    else el.setAttribute("data-theme", "dark");
    try {
      localStorage.setItem("theme", dark ? "light" : "dark");
    } catch {
      /* ignore */
    }
    setIsDark(!dark);
  }

  const setQty = (id: string, n: number) => setCounts((c) => ({ ...c, [id]: Math.max(0, n) }));
  const rechargeTotal = options ? options.meals.reduce((s, m) => s + Number.parseFloat(m.price) * (counts[m.id] ?? 0), 0) : 0;
  const rechargeCount = Object.values(counts).reduce((s, n) => s + n, 0);
  const couponTotal = balance ? balance.coupons.reduce((s, c) => s + c.count, 0) : 0;

  async function runLookup(raw: string) {
    const parsed = publicCodeSchema.safeParse(raw);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a valid ID.");
      return;
    }
    setLoading(true);
    setError(null);
    setBalance(null);
    setMode("view");
    setOptions(null);
    setPayMsg(null);
    try {
      const res = await fetch(`/api/public/balance?code=${encodeURIComponent(parsed.data)}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error ?? "Something went wrong. Please try again.");
        return;
      }
      setBalance(body as PublicBalance);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  function onLookup(e: React.FormEvent) {
    e.preventDefault();
    void runLookup(code);
  }

  // Returning from the Jodo payment page: ?paid=1&code=… (verified + credited in
  // the callback) or ?pay=pending|error. Show a banner and auto-refresh the balance.
  const [notice, setNotice] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const paid = q.get("paid");
    const pay = q.get("pay");
    const c = q.get("code") ?? "";
    if (!paid && !pay) return;
    /* eslint-disable react-hooks/set-state-in-effect -- one-time sync of the payment return from the URL */
    if (paid === "1") {
      setNotice({ tone: "ok", text: "Payment successful — your coupons have been added to your account." });
      if (c) {
        setCode(c);
        void runLookup(c);
      }
    } else if (pay === "pending") {
      setNotice({ tone: "warn", text: "We haven't received confirmation of your payment yet. If it was debited, your coupons will appear shortly." });
      if (c) setCode(c);
    } else {
      setNotice({ tone: "warn", text: "Something went wrong with that payment. Please try again." });
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    // Clean the query so a refresh doesn't repeat the banner.
    window.history.replaceState(null, "", "/top-up");
  }, []);

  async function startRecharge() {
    if (!balance) return;
    setOptLoading(true);
    setError(null);
    setPayMsg(null);
    try {
      const res = await fetch(`/api/public/recharge-options?code=${encodeURIComponent(balance.code)}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error ?? "Couldn't load top-up options.");
        return;
      }
      setOptions(body as PublicRechargeOptions);
      setCounts({});
      setMode("recharge");
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setOptLoading(false);
    }
  }

  async function onPay() {
    if (!balance || !options || rechargeCount <= 0) return;
    setError(null);
    setPayMsg(null);
    const phone = payerPhone.trim();
    const email = payerEmail.trim();
    if (!options.hasPhone && !/^\d{10}$/.test(phone)) {
      setError("Enter a valid 10-digit phone number.");
      return;
    }
    if (!options.hasEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Enter a valid email address.");
      return;
    }
    setPaying(true);
    try {
      const items = options.meals.map((m) => ({ mealId: m.id, qty: counts[m.id] ?? 0 })).filter((i) => i.qty > 0);
      const res = await fetch("/api/public/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: balance.code, phone, email, items }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error ?? "Couldn't start payment. Please try again.");
        return;
      }
      if (body.paymentUrl) {
        window.location.assign(body.paymentUrl as string);
        return;
      }
      setPayMsg(`Payment order created for ${inr(rechargeTotal)}. Complete it on the payment gateway; your coupons are credited once payment is confirmed.`);
    } catch {
      setError("Couldn't reach the payment gateway. Please try again.");
    } finally {
      setPaying(false);
    }
  }

  const statusLabel = balance ? (balance.status === "active" ? "Active" : balance.status === "suspended" ? "Suspended" : "Inactive") : "";

  return (
    <div className="tpg">
      <style>{CSS}</style>

      <div className="top">
        <Logo className="h-[30px] w-auto shrink-0" />
        <div>
          <div className="brand-name">Mess Management</div>
          <div className="brand-sub">K-innovative Hub</div>
        </div>
        <button className="theme" onClick={toggleTheme} aria-label="Toggle theme" type="button">
          {isDark ? (
            <svg fill="none" viewBox="0 0 24 24" strokeWidth={2}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></svg>
          ) : (
            <svg fill="none" viewBox="0 0 24 24" strokeWidth={2}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
          )}
        </button>
      </div>
      <div className="tricolour" />

      <div className="wrap">
        <div className="head">
          <h1>Check your <span className="sanskrit">balance</span></h1>
          <p>Enter your ID to view your wallet, meal coupons, and top up.</p>
        </div>

        {notice ? <div className={`banner ${notice.tone}`} role="status">{notice.text}</div> : null}

        {/* lookup */}
        <form className="card" onSubmit={onLookup}>
          <label className="lbl" htmlFor="idInput">Admission / Employee ID</label>
          <div className="lookup">
            <div className="inp">
              <svg viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h4" /></svg>
              <input id="idInput" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. STU001" autoComplete="off" />
            </div>
            <button className="btn" type="submit" disabled={loading}>
              <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
              {loading ? "Looking up…" : "Look up"}
            </button>
          </div>
          {error && !balance ? <p className="err">{error}</p> : null}
        </form>

        {/* balance */}
        {balance && mode === "view" ? (
          <div className="card">
            <div className="wcard">
              <div className="wc-top">
                <div className="wc-holder">
                  <div className="h-name">{balance.name}</div>
                  <div className="h-meta">{balance.category} · <span className="mono">{balance.code}</span></div>
                </div>
                <span className="wc-live"><i />{statusLabel}</span>
              </div>
              <div className="wc-bal">
                <div className="b-col">
                  <div className="b-lab">Wallet balance</div>
                  <div className="b-val">₹{balance.wallet}</div>
                </div>
                <div className="b-col">
                  <div className="b-lab">Coupons</div>
                  <div className="b-val">{couponTotal}<span className="b-unit">total</span></div>
                </div>
              </div>
              {balance.phone || balance.email ? (
                <div className="wc-contact">
                  {balance.phone ? (
                    <span className="cc">
                      <svg viewBox="0 0 24 24"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.4 2.1L8.1 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.6 2Z" /></svg>
                      <span className="mono">{balance.phone}</span>
                    </span>
                  ) : null}
                  {balance.email ? (
                    <span className="cc">
                      <svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z" /><path d="M22 6l-10 7L2 6" /></svg>
                      <span>{balance.email}</span>
                    </span>
                  ) : null}
                </div>
              ) : null}

              <div className="wc-foot">
                <div>
                  <div className="v-lab">Valid till</div>
                  <div className="v-val">{balance.validity.expiresOn ?? "No expiry"}</div>
                </div>
                <span className="wc-chip" />
              </div>
            </div>

            {balance.validity.expired ? (
              <p className="err" style={{ marginTop: 14 }}>Your validity has expired. Please contact the mess office.</p>
            ) : null}

            {balance.coupons.length > 0 ? (
              <div className="coup-grid">
                {balance.coupons.map((c) => (
                  <div key={c.meal} className={`ctile ${TILE[c.meal] ?? "c-dn"}`}>
                    <span className="ci"><svg viewBox="0 0 24 24">{mealIcon(c.meal)}</svg></span>
                    <div className="cv">{c.count}</div>
                    <div className="cl">{c.meal}</div>
                  </div>
                ))}
              </div>
            ) : null}

            {balance.status === "active" && !balance.validity.expired ? (
              <button className="btn block" type="button" style={{ marginTop: 18 }} onClick={startRecharge} disabled={optLoading}>
                <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
                {optLoading ? "Loading…" : "Top up coupons"}
              </button>
            ) : null}
          </div>
        ) : null}

        {/* top-up */}
        {balance && mode === "recharge" && options ? (
          <div className="card">
            <div className="rc-head">
              <h2>Top up coupons</h2>
              <button className="btn-ghost" type="button" onClick={() => { setMode("view"); setError(null); setPayMsg(null); }}>
                <svg viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>Back
              </button>
            </div>

            {options.meals.length === 0 ? (
              <p className="err">No meal rates are configured for your category yet. Please contact the mess office.</p>
            ) : (
              <>
                <div>
                  {options.meals.map((m) => {
                    const n = counts[m.id] ?? 0;
                    const amt = Number.parseFloat(m.price) * n;
                    return (
                      <div key={m.id} className={`meal${n > 0 ? " active" : ""}`}>
                        <span className="mi"><svg viewBox="0 0 24 24">{mealIcon(m.name)}</svg></span>
                        <div>
                          <div className="mname">{m.name}</div>
                          <div className="mrate">{inr(Number.parseFloat(m.price))} each</div>
                        </div>
                        <div className="stepper">
                          <button type="button" aria-label={`Decrease ${m.name}`} disabled={n <= 0} onClick={() => setQty(m.id, n - 1)}>
                            <svg viewBox="0 0 24 24"><path d="M5 12h14" /></svg>
                          </button>
                          <input type="number" min={0} value={n} aria-label={`${m.name} coupons`} onChange={(e) => setQty(m.id, Number.parseInt(e.target.value || "0", 10) || 0)} />
                          <button type="button" aria-label={`Increase ${m.name}`} onClick={() => setQty(m.id, n + 1)}>
                            <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
                          </button>
                        </div>
                        <div className={`mamt${amt === 0 ? " zero" : ""}`}>{inr(amt)}</div>
                      </div>
                    );
                  })}
                </div>

                {!options.hasPhone || !options.hasEmail ? (
                  <div className="contact">
                    {!options.hasPhone ? (
                      <div>
                        <label className="lbl" htmlFor="payPhone">Phone (for payment)</label>
                        <input id="payPhone" className="tinp mono" type="tel" inputMode="numeric" maxLength={10} value={payerPhone} onChange={(e) => setPayerPhone(e.target.value.replace(/\D/g, ""))} placeholder="10-digit mobile" />
                      </div>
                    ) : null}
                    {!options.hasEmail ? (
                      <div>
                        <label className="lbl" htmlFor="payEmail">Email (for receipt)</label>
                        <input id="payEmail" className="tinp" type="email" value={payerEmail} onChange={(e) => setPayerEmail(e.target.value)} placeholder="you@example.com" />
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="pay-note" style={{ textAlign: "left", marginTop: 12 }}>Using your registered mobile &amp; email for the receipt.</p>
                )}

                {error ? <p className="err">{error}</p> : null}
                {payMsg ? <p className="ok">{payMsg}</p> : null}

                <div className="summary">
                  <div className="s-meta">
                    <div className="s-c">{rechargeCount} coupon{rechargeCount === 1 ? "" : "s"}</div>
                    <div className="s-v">{inr(rechargeTotal)}</div>
                  </div>
                  <button className="btn" type="button" onClick={onPay} disabled={rechargeCount <= 0 || paying}>
                    {paying ? "Starting…" : rechargeTotal > 0 ? `Pay ${inr(rechargeTotal)}` : "Pay"}
                  </button>
                </div>
                <div className="pay-note">Secure payment · Coupons are added to your account after payment is confirmed.</div>
              </>
            )}
          </div>
        ) : null}

        <div className="foot">Powered by K-innovative Hub</div>
      </div>
    </div>
  );
}

const CSS = `
.tpg{
  --saffron:#FF9933; --saffron-deep:#E07B1F; --saffron-tint:#FFF3E6; --saffron-tint-2:#FDE7CC;
  --green:#138808; --green-deep:#0E6606; --green-tint:#E8F4E6; --green-tint-2:#D6ECD2;
  --navy:#0A2472; --ink:#1C1A17; --muted:#7C766C; --faint:#A8A096;
  --line:#ECE7DD; --line-2:#E2DCD0; --bg:#FBF8F2; --card:#FFFFFF;
  --chakra:#0A2472; --navy-ico-bg:#E6EAF6; --navy-text:#0A2472; --th-bg:#FCFAF5;
  --shadow:0 1px 2px rgba(28,26,23,.04), 0 4px 16px rgba(28,26,23,.05);
  --danger:#C2402E; --danger-tint:#FBEAE6;
  font-family:var(--font-spline-sans),var(--font-inter),system-ui,sans-serif;
  color:var(--ink);font-size:14px;line-height:1.45;min-height:100vh;
  background:
    radial-gradient(55% 45% at 100% 0%, color-mix(in srgb,var(--green-tint) 60%, transparent), transparent 70%),
    radial-gradient(65% 50% at 0% 0%, color-mix(in srgb,var(--saffron-tint) 75%, transparent), transparent 70%),
    var(--bg);
}
html[data-theme="dark"] .tpg{
  --saffron:#FFA94D; --saffron-deep:#FFBE6B; --saffron-tint:#2A2016; --saffron-tint-2:#3A2A18;
  --green:#3FBF3F; --green-deep:#5FD15F; --green-tint:#16240F; --green-tint-2:#1E3415;
  --navy:#6E8BFF; --chakra:#9DB2FF; --navy-ico-bg:#1E2540; --navy-text:#9DB2FF;
  --ink:#F3EEE4; --muted:#A39C90; --faint:#7E776B; --line:#2C2823; --line-2:#37322B;
  --bg:#161310; --card:#211D18; --th-bg:#1C1915;
  --shadow:0 1px 2px rgba(0,0,0,.3), 0 6px 20px rgba(0,0,0,.35);
  --danger:#FF8A75; --danger-tint:#33201B;
}
.tpg .top{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:11px;padding:15px 22px;background:color-mix(in srgb,var(--bg) 82%, transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}
.tpg .brand-name{font-weight:700;font-size:15.5px;letter-spacing:-.2px}
.tpg .brand-sub{font-size:9.5px;color:var(--faint);font-weight:600;letter-spacing:.6px;text-transform:uppercase}
.tpg .theme{margin-left:auto;width:34px;height:34px;border-radius:50%;border:1px solid var(--line-2);background:var(--card);display:grid;place-items:center;cursor:pointer}
.tpg .theme svg{width:16px;height:16px;stroke:var(--muted)}
.tpg .tricolour{height:3px;background:linear-gradient(to right,var(--saffron) 0 33.3%,#fff 33.3% 66.6%,var(--green) 66.6% 100%)}
.tpg .wrap{max-width:600px;margin:0 auto;padding:36px 20px 72px}
.tpg .head{text-align:center;margin-bottom:26px}
.tpg .head h1{font-size:31px;font-weight:700;letter-spacing:-.8px}
.tpg .head .sanskrit{font-family:var(--font-tiro-marathi),serif;color:var(--saffron-deep);font-weight:400}
.tpg .head p{color:var(--muted);font-size:13.5px;margin-top:8px}
.tpg .card{background:var(--card);border:1px solid var(--line);border-radius:22px;box-shadow:var(--shadow);padding:24px}
.tpg .card + .card{margin-top:18px}
.tpg .lbl{font-size:10.5px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;color:var(--faint);margin-bottom:9px;display:block}
.tpg .lookup{display:flex;gap:10px}
.tpg .lookup .inp{flex:1;position:relative}
.tpg .lookup .inp svg{position:absolute;left:14px;top:50%;transform:translateY(-50%);width:16px;height:16px;stroke:var(--faint);stroke-width:2;fill:none;pointer-events:none}
.tpg .lookup input{width:100%;padding:14px 15px 14px 42px;border-radius:13px;border:1px solid var(--line-2);background:var(--card);font-size:15.5px;font-family:var(--font-jetbrains-mono),monospace;color:var(--ink);text-transform:uppercase;letter-spacing:.5px}
.tpg .lookup input::placeholder{color:var(--faint);text-transform:none;letter-spacing:0;font-family:var(--font-spline-sans),sans-serif}
.tpg .lookup input:focus{outline:none;border-color:var(--saffron);box-shadow:0 0 0 3px var(--saffron-tint)}
.tpg .btn{background:var(--saffron);color:#fff;border:none;border-radius:13px;padding:0 22px;font-weight:600;font-size:14px;cursor:pointer;font-family:inherit;box-shadow:0 2px 8px rgba(224,123,31,.32);white-space:nowrap;display:inline-flex;align-items:center;justify-content:center;gap:8px;transition:background .15s,transform .1s}
.tpg .btn:hover{background:var(--saffron-deep)}
.tpg .btn:active{transform:scale(.98)}
.tpg .btn svg{width:16px;height:16px;stroke:currentColor;stroke-width:2.4;fill:none}
.tpg .btn.block{width:100%;padding:15px;font-size:15.5px;border-radius:15px}
.tpg .btn:disabled{opacity:.45;cursor:default;box-shadow:none}
.tpg .btn-ghost{background:none;border:none;display:inline-flex;align-items:center;gap:6px;font-family:inherit;font-size:13px;font-weight:600;color:var(--muted);cursor:pointer;padding:7px 11px;border-radius:9px}
.tpg .btn-ghost:hover{background:var(--th-bg);color:var(--ink)}
.tpg .btn-ghost svg{width:15px;height:15px;stroke:currentColor;stroke-width:2;fill:none}
.tpg .banner{border-radius:13px;padding:12px 15px;font-size:13.5px;font-weight:500;margin-bottom:16px}
.tpg .banner.ok{background:var(--green-tint);color:var(--green-deep);border:1px solid var(--green-tint-2)}
.tpg .banner.warn{background:var(--saffron-tint);color:var(--saffron-deep);border:1px solid var(--saffron-tint-2)}
.tpg .err{margin-top:12px;font-size:13px;font-weight:500;color:var(--danger);background:var(--danger-tint);border-radius:10px;padding:9px 12px}
.tpg .ok{margin-top:12px;font-size:13px;font-weight:500;color:var(--green-deep);background:var(--green-tint);border-radius:10px;padding:9px 12px}
.tpg .wcard{position:relative;border-radius:20px;overflow:hidden;background:linear-gradient(135deg,var(--navy) 0%,#2A4BB0 70%,#3A63D8 110%);color:#fff;padding:22px 24px;box-shadow:0 14px 34px -14px rgba(10,36,114,.55)}
.tpg .wcard::before{content:"";position:absolute;inset:0;background:radial-gradient(90% 130% at 100% -20%, rgba(255,255,255,.22), transparent 55%)}
.tpg .wcard::after{content:"";position:absolute;width:180px;height:180px;border-radius:50%;border:1.5px solid rgba(255,255,255,.12);right:-50px;bottom:-90px}
.tpg .wc-top{display:flex;align-items:flex-start;position:relative;z-index:1}
.tpg .wc-holder .h-name{font-size:17px;font-weight:700;letter-spacing:-.2px}
.tpg .wc-holder .h-meta{font-size:11.5px;opacity:.75;margin-top:3px}
.tpg .wc-holder .h-meta .mono{font-family:var(--font-jetbrains-mono),monospace}
.tpg .wc-live{margin-left:auto;display:inline-flex;align-items:center;gap:6px;font-size:10.5px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.2);border-radius:30px;padding:4px 11px;backdrop-filter:blur(4px)}
.tpg .wc-live i{width:6px;height:6px;border-radius:50%;background:#6BE86B;box-shadow:0 0 0 3px rgba(107,232,107,.25)}
.tpg .wc-bal{position:relative;z-index:1;margin-top:20px;display:flex;gap:0;align-items:stretch}
.tpg .wc-bal .b-col{flex:1}
.tpg .wc-bal .b-col + .b-col{border-left:1px solid rgba(255,255,255,.18);padding-left:20px;margin-left:20px}
.tpg .wc-bal .b-lab{font-size:10.5px;font-weight:600;letter-spacing:.8px;text-transform:uppercase;opacity:.65}
.tpg .wc-bal .b-val{font-size:32px;font-weight:700;letter-spacing:-1.4px;font-variant-numeric:tabular-nums;margin-top:4px}
.tpg .wc-bal .b-val .b-unit{font-size:13px;font-weight:500;opacity:.65;letter-spacing:0;margin-left:5px}
.tpg .wc-contact{position:relative;z-index:1;display:flex;gap:18px;flex-wrap:wrap;margin-top:16px}
.tpg .wc-contact .cc{display:inline-flex;align-items:center;gap:7px;font-size:12px;opacity:.85}
.tpg .wc-contact .cc svg{width:13px;height:13px;stroke:currentColor;stroke-width:2;fill:none;opacity:.7;flex:none}
.tpg .wc-contact .cc .mono{font-family:var(--font-jetbrains-mono),monospace;font-size:11.5px}
.tpg .wc-foot{position:relative;z-index:1;display:flex;align-items:flex-end;margin-top:16px}
.tpg .wc-foot .v-lab{font-size:10.5px;opacity:.6}
.tpg .wc-foot .v-val{font-family:var(--font-jetbrains-mono),monospace;font-size:12px;margin-top:2px}
.tpg .wc-chip{margin-left:auto;width:36px;height:26px;border-radius:6px;background:linear-gradient(135deg,rgba(255,255,255,.85),rgba(255,255,255,.55))}
.tpg .coup-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:11px;margin-top:16px}
.tpg .ctile{border-radius:15px;padding:13px 8px 12px;border:1px solid var(--line);text-align:center}
.tpg .ctile .ci{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;margin:0 auto 9px}
.tpg .ctile .ci svg{width:16px;height:16px;stroke-width:1.9;fill:none}
.tpg .ctile .cv{font-size:21px;font-weight:700;letter-spacing:-.6px;font-variant-numeric:tabular-nums;line-height:1}
.tpg .ctile .cl{font-size:10.5px;color:var(--muted);margin-top:4px}
.tpg .c-bf{background:linear-gradient(165deg,var(--saffron-tint) 0%,var(--card) 80%);border-color:var(--saffron-tint-2)}
.tpg .c-bf .ci{background:var(--saffron-tint-2);color:var(--saffron-deep)} .tpg .c-bf .cv{color:var(--saffron-deep)}
.tpg .c-ln{background:linear-gradient(165deg,var(--green-tint) 0%,var(--card) 80%);border-color:var(--green-tint-2)}
.tpg .c-ln .ci{background:var(--green-tint-2);color:var(--green-deep)} .tpg .c-ln .cv{color:var(--green-deep)}
.tpg .c-sn{background:linear-gradient(165deg,var(--navy-ico-bg) 0%,var(--card) 80%);border-color:var(--navy-ico-bg)}
.tpg .c-sn .ci{background:var(--navy-ico-bg);color:var(--navy-text)} .tpg .c-sn .cv{color:var(--navy-text)}
.tpg .c-dn .ci{background:var(--th-bg);color:var(--muted)}
.tpg .rc-head{display:flex;align-items:center;margin-bottom:18px}
.tpg .rc-head h2{font-size:17.5px;font-weight:700;letter-spacing:-.3px}
.tpg .rc-head .btn-ghost{margin-left:auto}
.tpg .meal{display:flex;align-items:center;gap:13px;border:1px solid var(--line);border-radius:16px;padding:13px 15px;margin-bottom:11px;transition:border-color .18s,background .18s,box-shadow .18s}
.tpg .meal.active{border-color:var(--saffron-tint-2);background:var(--saffron-tint);box-shadow:0 4px 14px -8px rgba(224,123,31,.4)}
.tpg .meal .mi{width:38px;height:38px;border-radius:11px;background:var(--th-bg);display:grid;place-items:center;flex:none;transition:background .18s}
.tpg .meal .mi svg{width:19px;height:19px;stroke:var(--muted);stroke-width:1.8;fill:none;transition:stroke .18s}
.tpg .meal.active .mi{background:var(--saffron-tint-2)}
.tpg .meal.active .mi svg{stroke:var(--saffron-deep)}
.tpg .meal .mname{font-weight:600;font-size:14px}
.tpg .meal .mrate{font-size:11px;color:var(--faint);font-family:var(--font-jetbrains-mono),monospace;margin-top:2px}
.tpg .meal .mamt{font-family:var(--font-jetbrains-mono),monospace;font-size:13.5px;font-weight:600;color:var(--saffron-deep);min-width:66px;text-align:right}
.tpg .meal .mamt.zero{color:var(--faint);font-weight:400}
.tpg .stepper{display:flex;align-items:center;margin-left:auto;border:1px solid var(--line-2);border-radius:12px;overflow:hidden;background:var(--card)}
.tpg .stepper button{width:38px;height:40px;border:none;background:var(--card);display:grid;place-items:center;cursor:pointer;color:var(--muted);transition:background .12s,color .12s}
.tpg .stepper button:hover:not(:disabled){background:var(--saffron-tint);color:var(--saffron-deep)}
.tpg .stepper button:disabled{opacity:.3;cursor:default}
.tpg .stepper button svg{width:15px;height:15px;stroke:currentColor;stroke-width:2.6;fill:none}
.tpg .stepper input{width:46px;height:40px;border:none;border-left:1px solid var(--line);border-right:1px solid var(--line);text-align:center;font-family:var(--font-jetbrains-mono),monospace;font-size:15px;font-weight:600;color:var(--ink);background:var(--card);-moz-appearance:textfield}
.tpg .stepper input::-webkit-outer-spin-button,.tpg .stepper input::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.tpg .stepper input:focus{outline:none;background:var(--saffron-tint)}
.tpg .contact{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:6px}
.tpg .contact .tinp{width:100%;padding:12px 13px;border-radius:12px;border:1px solid var(--line-2);background:var(--card);font-size:14px;color:var(--ink)}
.tpg .contact .tinp.mono{font-family:var(--font-jetbrains-mono),monospace}
.tpg .contact .tinp:focus{outline:none;border-color:var(--saffron);box-shadow:0 0 0 3px var(--saffron-tint)}
.tpg .summary{position:sticky;bottom:14px;z-index:4;display:flex;align-items:center;gap:14px;background:var(--ink);color:var(--card);border-radius:17px;padding:13px 15px 13px 20px;box-shadow:0 16px 34px -12px rgba(28,26,23,.5);margin-top:18px}
html[data-theme="dark"] .tpg .summary{background:#2E2922;color:var(--ink)}
.tpg .summary .s-meta .s-c{font-size:11px;opacity:.65}
.tpg .summary .s-meta .s-v{font-size:19px;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:-.5px;margin-top:1px}
.tpg .summary .btn{margin-left:auto;padding:12px 26px;border-radius:12px;font-size:14.5px}
.tpg .pay-note{font-size:11.5px;color:var(--faint);text-align:center;margin-top:14px;line-height:1.5}
.tpg .foot{text-align:center;font-size:11.5px;color:var(--faint);margin-top:28px}
@media (max-width:600px){.tpg .coup-grid{grid-template-columns:repeat(2,1fr)}.tpg .head h1{font-size:26px}.tpg .wc-bal .b-val{font-size:30px}.tpg .contact{grid-template-columns:1fr}}
@media (max-width:520px){
  .tpg .meal{display:grid;grid-template-columns:auto 1fr auto;grid-template-areas:"icon name amt" "icon step step";column-gap:12px;row-gap:10px;align-items:center}
  .tpg .meal .mi{grid-area:icon}
  .tpg .meal > div:nth-child(2){grid-area:name;min-width:0}
  .tpg .meal .mname,.tpg .meal .mrate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .tpg .meal .mamt{grid-area:amt;justify-self:end;min-width:0}
  .tpg .meal .stepper{grid-area:step;justify-self:start;margin-left:0}
}
`;
