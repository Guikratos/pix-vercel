// /api/webhook-pix.js

async function redisSet(key, value) {
  const url = `${process.env.UPSTASH_REDIS_REST_URL}/set/${encodeURIComponent(
    key
  )}/${encodeURIComponent(value)}`;

  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
  });

  if (!r.ok) throw new Error(`Upstash SET failed: ${await r.text()}`);
}

function pickFirst(obj, paths) {
  for (const p of paths) {
    const parts = p.split(".");
    let cur = obj;
    let ok = true;
    for (const part of parts) {
      if (cur && Object.prototype.hasOwnProperty.call(cur, part)) cur = cur[part];
      else { ok = false; break; }
    }
    if (ok && cur != null && cur !== "") return cur;
  }
  return null;
}

module.exports = async (req, res) => {
  // CORS (debug)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-pushinpay-token");

  if (req.method === "OPTIONS") return res.status(204).end();

  // GET só pra testar se está online
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, hint: "Webhook online. Use POST." });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  try {
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch (_) {}
    }
    body = body || {};

    // autenticação por header
    const pushToken = req.headers["x-pushinpay-token"];
    if (!pushToken || pushToken !== process.env.PUSHINPAY_WEBHOOK_TOKEN) {
      await redisSet(
        "pix:last_webhook_unauthorized",
        JSON.stringify({ hasHeader: !!pushToken, body })
      );
      return res.status(401).json({ error: "Token PushinPay inválido" });
    }

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
      await redisSet("pix:last_webhook_no_id", JSON.stringify(body));
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

    const finalStatus = paidStatuses.has(statusRaw) ? "paid" : (statusRaw || "unknown");

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
