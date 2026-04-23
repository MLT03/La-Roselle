/* ---------- La Roselle — notify-order-status edge function ----------
 *
 * Triggered by a Supabase Database Webhook on UPDATE of public.orders.
 * When the order status changes, emails the customer via Resend.
 *
 * Required env vars (supabase secrets set ...):
 *   RESEND_API_KEY  — Resend API key (if missing, returns 200 and skips)
 *   FROM_EMAIL      — verified Resend sender (e.g. "La Roselle <orders@laroselle.ma>")
 *   SITE_URL        — public site URL (used in the email footer)
 *
 * Deploy:
 *   supabase functions deploy notify-order-status --no-verify-jwt
 *
 * Wire webhook (Supabase dashboard → Database → Webhooks):
 *   Table: public.orders
 *   Events: UPDATE
 *   Type: Supabase Edge Function
 *   Function: notify-order-status
 */

// deno-lint-ignore-file no-explicit-any

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
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

type Lang = "en" | "fr" | "ar";

const STATUS_COPY: Record<string, Record<Lang, { subject: string; heading: string; body: string }>> = {
  accepted: {
    en: {
      subject: "Your La Roselle order has been accepted",
      heading: "Your order is confirmed",
      body: "Thank you! We've accepted your order and are preparing it for shipment. We'll send another update once it's on its way."
    },
    fr: {
      subject: "Votre commande La Roselle a été acceptée",
      heading: "Votre commande est confirmée",
      body: "Merci ! Nous avons accepté votre commande et la préparons pour l'expédition. Nous vous enverrons une mise à jour dès qu'elle sera en route."
    },
    ar: {
      subject: "تم قبول طلبك من لا روزيل",
      heading: "تم تأكيد طلبك",
      body: "شكراً لك! لقد قبلنا طلبك ونحن نحضّره للشحن. سنرسل لك تحديثاً آخر بمجرد أن يكون في الطريق."
    }
  },
  shipped: {
    en: {
      subject: "Your La Roselle order is on the way",
      heading: "Your order has shipped",
      body: "Good news — your order is now on its way to you. You'll receive it shortly."
    },
    fr: {
      subject: "Votre commande La Roselle est en route",
      heading: "Votre commande est expédiée",
      body: "Bonne nouvelle — votre commande est en route. Vous la recevrez très bientôt."
    },
    ar: {
      subject: "طلبك من لا روزيل في الطريق",
      heading: "تم شحن طلبك",
      body: "أخبار جيدة — طلبك الآن في طريقه إليك. ستستلمينه قريباً."
    }
  },
  completed: {
    en: {
      subject: "Your La Roselle order is complete",
      heading: "Order completed",
      body: "Your order has been delivered. Thank you for choosing La Roselle — we hope you love your products!"
    },
    fr: {
      subject: "Votre commande La Roselle est terminée",
      heading: "Commande livrée",
      body: "Votre commande a été livrée. Merci d'avoir choisi La Roselle — nous espérons que vous adorerez vos produits !"
    },
    ar: {
      subject: "تم إكمال طلبك من لا روزيل",
      heading: "تم تسليم الطلب",
      body: "تم تسليم طلبك. شكراً لاختيارك لا روزيل — نتمنى أن تحبي منتجاتك!"
    }
  },
  cancelled: {
    en: {
      subject: "Your La Roselle order has been cancelled",
      heading: "Order cancelled",
      body: "Your order has been cancelled. If this wasn't expected, please reach out to us and we'll help sort it out."
    },
    fr: {
      subject: "Votre commande La Roselle a été annulée",
      heading: "Commande annulée",
      body: "Votre commande a été annulée. Si ce n'était pas prévu, contactez-nous et nous vous aiderons."
    },
    ar: {
      subject: "تم إلغاء طلبك من لا روزيل",
      heading: "تم إلغاء الطلب",
      body: "تم إلغاء طلبك. إذا لم يكن هذا متوقعاً، يُرجى التواصل معنا وسنساعدك."
    }
  },
  pending: {
    en: {
      subject: "Your La Roselle order is being reviewed",
      heading: "Order received",
      body: "We've received your order and are reviewing it. You'll hear from us as soon as it's accepted."
    },
    fr: {
      subject: "Votre commande La Roselle est en cours de vérification",
      heading: "Commande reçue",
      body: "Nous avons bien reçu votre commande et nous la vérifions. Vous aurez un retour dès qu'elle sera acceptée."
    },
    ar: {
      subject: "طلبك من لا روزيل قيد المراجعة",
      heading: "تم استلام الطلب",
      body: "لقد استلمنا طلبك ونحن نراجعه. سنتواصل معك بمجرد قبوله."
    }
  }
};

function pickLang(raw: unknown): Lang {
  const s = String(raw || "").toLowerCase();
  if (s.startsWith("fr")) return "fr";
  if (s.startsWith("ar")) return "ar";
  return "en";
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

  const record     = body?.record     ?? body?.new ?? {};
  const oldRecord  = body?.old_record ?? body?.old ?? {};
  const newStatus  = record?.status ?? null;
  const oldStatus  = oldRecord?.status ?? null;

  if (!newStatus || newStatus === oldStatus) {
    return json({ ok: true, skipped: true, reason: "no-status-change" }, 200);
  }

  const data = record?.data ?? {};
  const customer = data?.customer ?? record?.customer ?? {};
  const toEmail  = (customer?.email || "").toString().trim();
  if (!toEmail) {
    console.log("[notify-order-status] no customer email, skipping");
    return json({ ok: true, skipped: true, reason: "missing-customer-email" }, 200);
  }
  if (!RESEND_API_KEY) {
    console.log("[notify-order-status] RESEND_API_KEY not set, skipping");
    return json({ ok: true, skipped: true, reason: "missing-resend-key" }, 200);
  }

  const copy = STATUS_COPY[newStatus];
  if (!copy) {
    return json({ ok: true, skipped: true, reason: "no-copy-for-status", status: newStatus }, 200);
  }

  const lang = pickLang(data?.lang || customer?.lang);
  const { subject, heading, body: bodyCopy } = copy[lang];

  const orderId = record?.id ?? "—";
  const cleanSite = SITE_URL.replace(/\/+$/, "");
  const lookupLink = cleanSite ? `${cleanSite}/#order-lookup` : "";

  const html = `
    <div style="font-family:Georgia,serif;color:#2b1a13;max-width:560px;margin:0 auto;padding:24px;">
      <h2 style="margin:0 0 8px;color:#7a2c3b;">${escapeHtml(heading)}</h2>
      <p style="margin:0 0 16px;color:#555;">${escapeHtml(lang === "fr" ? "Commande" : lang === "ar" ? "الطلب" : "Order")} <strong>${escapeHtml(orderId)}</strong></p>
      <p style="margin:0 0 16px;line-height:1.6;">${escapeHtml(bodyCopy)}</p>
      ${lookupLink ? `
        <p style="margin:24px 0 0;">
          <a href="${escapeHtml(lookupLink)}"
             style="display:inline-block;background:#7a2c3b;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;">
            ${escapeHtml(lang === "fr" ? "Voir ma commande" : lang === "ar" ? "عرض طلبي" : "View my order")}
          </a>
        </p>` : ""}
      <p style="margin:32px 0 0;color:#999;font-size:12px;">La Roselle</p>
    </div>`;

  const text = [
    heading,
    "",
    `${lang === "fr" ? "Commande" : lang === "ar" ? "الطلب" : "Order"}: ${orderId}`,
    "",
    bodyCopy,
    lookupLink ? `\n${lang === "fr" ? "Voir" : lang === "ar" ? "عرض" : "View"}: ${lookupLink}` : "",
    "",
    "La Roselle"
  ].join("\n");

  try {
    const result = await sendEmail({
      from:    FROM_EMAIL,
      to:      [toEmail],
      subject,
      html,
      text
    });
    if (!result.ok) {
      console.error("[notify-order-status] Resend error", result.status, result.body);
      return json({ ok: false, status: result.status, body: result.body }, 500);
    }
    return json({ ok: true, orderId, status: newStatus, lang }, 200);
  } catch (err) {
    console.error("[notify-order-status] unexpected error", err);
    return json({ ok: false, error: String(err) }, 500);
  }
});
