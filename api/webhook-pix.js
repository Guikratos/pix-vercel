// /api/webhook-pix.js
// Salva no Upstash (Redis) via REST

async function redisSet(key, value) {
  const url = `${process.env.UPSTASH_REDIS_REST_URL}/set/${encodeURIComponent(
    key
  )}/${encodeURIComponent(value)}`;

  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
    },
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
  // CORS (debug / chamadas cross-domain não devem quebrar)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, x-pushinpay-token"
  );

  if (req.method === "OPTIONS") return res.status(204).end();

  // GET só pra você testar se está online
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, hint: "Webhook online. Use POST." });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  try {
    // ✅ 1) valida header x-pushinpay-token (segurança da PushinPay)
    // Node normaliza headers para lowercase
    const pushToken = req.headers["x-pushinpay-token"];
    if (!process.env.PUSHINPAY_WEBHOOK_TOKEN) {
      await redisSet(
        "pix:last_webhook_missing_env_push_token",
        JSON.stringify({ msg: "Env PUSHINPAY_WEBHOOK_TOKEN não definida" })
      );
      return res.status(500).json({
        error: "Env PUSHINPAY_WEBHOOK_TOKEN não definida na Vercel",
      });
    }

    if (!pushToken || pushToken !== process.env.PUSHINPAY_WEBHOOK_TOKEN) {
      await redisSet(
        "pix:last_webhook_invalid_push_token",
        JSON.stringify({
          received: pushToken ? "present" : "missing",
          headerKeys: Object.keys(req.headers || {}),
        })
      );
      return res.status(401).json({ error: "Token PushinPay inválido" });
    }

    // ✅ 2) valida secret na URL (camada extra)
    const secret = req.query?.secret;
    if (!process.env.WEBHOOK_SECRET) {
      await redisSet(
        "pix:last_webhook_missing_env_secret",
        JSON.stringify({ msg: "Env WEBHOOK_SECRET não definida" })
      );
      return res.status(500).json({
        error: "Env WEBHOOK_SECRET não definida na Vercel",
      });
    }

    if (!secret || secret !== process.env.WEBHOOK_SECRET) {
      await redisSet(
        "pix:last_webhook_invalid_secret",
        JSON.stringify({ query: req.query })
      );
      return res.status(401).json({ error: "Webhook secret inválido" });
    }

    // Body pode chegar string
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (_) {}
    }
    body = body || {};

    // Logs úteis
    console.log("WEBHOOK QUERY:", req.query);
    console.log("WEBHOOK BODY:", JSON.stringify(body));

    // Tenta achar ID
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

    // Tenta achar status
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

    // Normaliza status (inclui os que a PushinPay costuma usar)
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

    const pendingStatuses = new Set(["created", "pending", "waiting", "processing"]);

    const canceledStatuses = new Set(["canceled", "cancelled", "refused", "expired"]);

    let finalStatus = "unknown";
    if (paidStatuses.has(statusRaw)) finalStatus = "paid";
    else if (pendingStatuses.has(statusRaw)) finalStatus = "pending";
    else if (canceledStatuses.has(statusRaw)) finalStatus = "canceled";
    else finalStatus = statusRaw || "unknown";

    // Salva status + payload
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
