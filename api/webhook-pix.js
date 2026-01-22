// /api/webhook-pix.js

async function redisSet(key, value) {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    throw new Error("Upstash envs faltando (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN)");
  }

  const url = `${process.env.UPSTASH_REDIS_REST_URL}/set/${encodeURIComponent(
    key
  )}/${encodeURIComponent(value)}`;

  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
  });

  if (!r.ok) throw new Error(`Upstash SET failed: ${await r.text()}`);
}

// Não deixa falhar o webhook por causa de log/debug
async function safeRedisSet(key, value) {
  try {
    await redisSet(key, value);
  } catch (e) {
    console.log("safeRedisSet falhou:", e?.message || e);
  }
}

function pickFirst(obj, paths) {
  for (const p of paths) {
    const parts = p.split(".");
    let cur = obj;
    let ok = true;

    for (const part of parts) {
      if (cur && Object.prototype.hasOwnProperty.call(cur, part)) cur = cur[part];
      else {
        ok = false;
        break;
      }
    }
    if (ok && cur != null && cur !== "") return cur;
  }
  return null;
}

module.exports = async (req, res) => {
  // (Opcional) CORS pra debug no browser
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-pushinpay-token");

  if (req.method === "OPTIONS") return res.status(204).end();

  // GET só pra teste rápido
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, hint: "Webhook online. Use POST." });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  try {
    // Body pode chegar string
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (_) {}
    }
    body = body || {};

    // Logs (ajudam MUITO no Vercel)
    console.log("WEBHOOK QUERY:", req.query);
    console.log("WEBHOOK HEADERS (keys):", Object.keys(req.headers || {}));
    console.log("WEBHOOK BODY:", JSON.stringify(body));

    // =========================
    // AUTH: secret (query) OU token (header)
    // =========================
    const secret = req.query?.secret;

    // ✅ IMPORTANTE: em Node/Vercel os headers ficam em lowercase
    const pushToken = req.headers?.["x-pushinpay-token"];

    const okBySecret =
      !!secret && !!process.env.WEBHOOK_SECRET && secret === process.env.WEBHOOK_SECRET;

    const okByHeader =
      !!pushToken &&
      !!process.env.PUSHINPAY_WEBHOOK_TOKEN &&
      pushToken === process.env.PUSHINPAY_WEBHOOK_TOKEN;

    if (!okBySecret && !okByHeader) {
      await safeRedisSet(
        "pix:last_webhook_unauthorized",
        JSON.stringify({
          query: req.query,
          hasSecret: !!secret,
          hasHeader: !!pushToken,
          // não salva tudo se quiser, mas aqui ajuda pra debug
          body,
        })
      );
      return res.status(401).json({ error: "Webhook não autorizado" });
    }

    // =========================
    // Extrair ID
    // =========================
    const id = pickFirst(body, [
      "id",
      "transaction_id",
      "pix_id",
      "payment_id",
      "data.id",
      "data.payment_id",
      "data.transaction_id",
      "data.payment.id",
      "data.pix.id",
      "payment.id",
      "pix.id",
    ]);

    // =========================
    // Extrair status
    // =========================
    const statusRaw = String(
      pickFirst(body, [
        "status",
        "payment_status",
        "data.status",
        "data.payment_status",
        "data.payment.status",
        "payment.status",
        "pix.status",
      ]) || ""
    ).toLowerCase();

    if (!id) {
      await safeRedisSet("pix:last_webhook_no_id", JSON.stringify(body));
      return res.status(400).json({ error: "Webhook sem id" });
    }

    const paidStatuses = new Set([
      "paid",
      "approved",
      "confirmed",
      "completed",
      "success",
      "succeeded",
      "paid_out",
      "settled",
    ]);

    const finalStatus = paidStatuses.has(statusRaw) ? "paid" : statusRaw || "unknown";

    // Salva status + payload (debug)
    await redisSet(`pix:${id}:status`, finalStatus);
    await redisSet(`pix:${id}:payload`, JSON.stringify(body));
    await redisSet(`pix:last_webhook_ok`, JSON.stringify({ id, status: finalStatus }));

    console.log("WEBHOOK OK:", { id, statusRaw, finalStatus });

    return res.status(200).json({ ok: true, id, status: finalStatus });
  } catch (e) {
    console.error("Erro no webhook:", e);
    return res.status(500).json({ error: "Erro no webhook", detail: e.message });
  }
};
