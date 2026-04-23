/* ---------- La Roselle — notify-new-order edge function ----------
 *
 * Triggered by a Supabase Database Webhook on INSERT into public.orders.
 * Sends an email to the shop admin via Resend.
 *
 * Required env vars (set via: supabase secrets set ...):
 *   RESEND_API_KEY  — Resend API key (if missing, function logs & returns 200)
 *   ADMIN_EMAIL     — recipient (e.g. owner@laroselle.ma)
 *   FROM_EMAIL      — verified Resend sender (e.g. "La Roselle <orders@laroselle.ma>")
 *   SITE_URL        — public site URL (for the admin link in the email)
 *
 * Deploy:
 *   supabase functions deploy notify-new-order --no-verify-jwt
 *
 * Wire webhook (Supabase dashboard → Database → Webhooks):
 *   Table: public.orders
 *   Events: INSERT
 *   Type: Supabase Edge Function
 *   Function: notify-new-order
 */

// deno-lint-ignore-file no-explicit-any

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const ADMIN_EMAIL    = Deno.env.get("ADMIN_EMAIL")    ?? "";
const FROM_EMAIL     = Deno.env.get("FROM_EMAIL")     ?? "La Roselle <onboarding@resend.dev>";
const SITE_URL       = Deno.env.get("SITE_URL")       ?? "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS }
  });
}

function escapeHtml(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMoney(amount: number, currency: string): string {
  const n = Number.isFinite(amount) ? amount : 0;
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${currency || ""}`.trim();
}

function pickName(name: any): string {
  if (!name) return "—";
  if (typeof name === "string") return name;
  return name.en || name.fr || name.ar || "—";
}

function renderItemsHtml(items: any[], currency: string): string {
  if (!Array.isArray(items) || items.length === 0) {
    return "<em>No items</em>";
  }
  const rows = items.map((it) => {
    const name = escapeHtml(pickName(it.name));
    const qty  = escapeHtml(it.qty ?? 1);
    const price = escapeHtml(formatMoney(Number(it.price) || 0, currency));
    const line  = escapeHtml(formatMoney((Number(it.price) || 0) * (Number(it.qty) || 0), currency));
    return `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;">${name}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center;">${qty}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">${price}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">${line}</td>
      </tr>`;
  }).join("");
  return `
    <table role="presentation" style="border-collapse:collapse;width:100%;font-family:Georgia,serif;font-size:14px;">
      <thead>
        <tr style="background:#f7f1ec;">
          <th style="padding:6px 10px;text-align:left;">Item</th>
          <th style="padding:6px 10px;text-align:center;">Qty</th>
          <th style="padding:6px 10px;text-align:right;">Price</th>
          <th style="padding:6px 10px;text-align:right;">Line</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

async function sendEmail(payload: Record<string, unknown>): Promise<{ ok: boolean; status: number; body: string }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type":  "application/json"
    },
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "method-not-allowed" }, 405);
  }

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid-json" }, 400);
  }

  // Supabase DB webhook shape: { type, table, record, old_record, schema }
  const record = body?.record ?? body?.new ?? body ?? {};
  const orderId  = record.id ?? record.order_id ?? "—";
  const items    = Array.isArray(record.items) ? record.items : [];
  const totals   = record.totals || {};
  const currency = totals.currency || record.currency || "MAD";
  const total    = Number(totals.total ?? record.total ?? 0);
  const customer = record.customer || {};
  const shipping = record.shipping || {};
  const createdAt = record.created_at || new Date().toISOString();

  if (!RESEND_API_KEY) {
    console.log("[notify-new-order] RESEND_API_KEY not set; skipping email for order", orderId);
    return json({ ok: true, skipped: true, reason: "missing-resend-key" }, 200);
  }
  if (!ADMIN_EMAIL) {
    console.log("[notify-new-order] ADMIN_EMAIL not set; skipping email for order", orderId);
    return json({ ok: true, skipped: true, reason: "missing-admin-email" }, 200);
  }

  const adminLink = SITE_URL
    ? `${SITE_URL.replace(/\/+$/, "")}/admin.html#orders/${encodeURIComponent(orderId)}`
    : "";

  const subject = `🌹 New La Roselle order — ${orderId} (${formatMoney(total, currency)})`;

  const html = `
    <div style="font-family:Georgia,serif;color:#2b1a13;max-width:640px;margin:0 auto;padding:24px;">
      <h2 style="margin:0 0 8px;color:#7a2c3b;">New order received</h2>
      <p style="margin:0 0 16px;color:#555;">Order <strong>${escapeHtml(orderId)}</strong> &middot; ${escapeHtml(new Date(createdAt).toLocaleString())}</p>

      <h3 style="margin:16px 0 6px;">Customer</h3>
      <p style="margin:0;line-height:1.5;">
        ${escapeHtml(customer.name || "—")}<br>
        ${escapeHtml(customer.email || "")} ${customer.phone ? "&middot; " + escapeHtml(customer.phone) : ""}
      </p>

      <h3 style="margin:16px 0 6px;">Shipping</h3>
      <p style="margin:0;line-height:1.5;">
        ${escapeHtml(shipping.address || "—")}<br>
        ${escapeHtml(shipping.city || "")} ${escapeHtml(shipping.postalCode || "")}<br>
        ${escapeHtml(shipping.country || "")}
      </p>

      <h3 style="margin:16px 0 6px;">Items</h3>
      ${renderItemsHtml(items, currency)}

      <p style="margin:16px 0 0;text-align:right;font-size:16px;">
        <strong>Total: ${escapeHtml(formatMoney(total, currency))}</strong>
      </p>

      ${adminLink ? `
        <p style="margin:24px 0 0;">
          <a href="${escapeHtml(adminLink)}"
             style="display:inline-block;background:#7a2c3b;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;">
            Open in admin
          </a>
        </p>` : ""}
    </div>`;

  const text = [
    `New La Roselle order ${orderId}`,
    `Placed: ${new Date(createdAt).toLocaleString()}`,
    ``,
    `Customer: ${customer.name || "—"} <${customer.email || ""}>`,
    `Phone: ${customer.phone || "—"}`,
    ``,
    `Shipping:`,
    `  ${shipping.address || "—"}`,
    `  ${shipping.city || ""} ${shipping.postalCode || ""}`,
    `  ${shipping.country || ""}`,
    ``,
    `Items:`,
    ...items.map((it: any) =>
      `  - ${pickName(it.name)} x${it.qty} @ ${formatMoney(Number(it.price) || 0, currency)}`
    ),
    ``,
    `Total: ${formatMoney(total, currency)}`,
    adminLink ? `\nAdmin: ${adminLink}` : ""
  ].join("\n");

  try {
    const result = await sendEmail({
      from:    FROM_EMAIL,
      to:      [ADMIN_EMAIL],
      subject,
      html,
      text,
      reply_to: customer.email || undefined
    });
    if (!result.ok) {
      console.error("[notify-new-order] Resend error", result.status, result.body);
      return json({ ok: false, status: result.status, body: result.body }, 500);
    }
    return json({ ok: true, orderId }, 200);
  } catch (err) {
    console.error("[notify-new-order] unexpected error", err);
    return json({ ok: false, error: String(err) }, 500);
  }
});
