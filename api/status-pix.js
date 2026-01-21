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
  // (Opcional) CORS pra facilitar debug no browser
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(204).end();

  // Aceita GET só pra teste/validação (não grava nada)
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, hint: "Webhook online. Use POST." });
  }

  // Aceita POST do provedor
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  try {
    // ✅ 1) Validação do header da PushinPay (x-pushinpay-token)
    // Node/Vercel normaliza headers para minúsculo
    const pushToken = req.headers["x-pushinpay-token"];
    if (!pushToken || pushToken !== process.env.PUSHINPAY_WEBHOOK_TOKEN) {
      // salva tentativa (sem gravar status do pix)
      await redisSet(
        "pix:last_webhook_invalid_push_token",
        JSON.stringify({
          received: pushToken ? "present" : "missing",
          headers: Object.keys(req.headers || {}),
        })
      );
      return res.status(401).json({ error: "Token PushinPay inválido" });
    }

    // Body pode chegar string
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (_) {}
    }
    body = body || {};

    // Logs pra você enxergar o payload real
    console.log("WEBHOOK QUERY:", req.query);
    console.log("WEBHOOK BODY:", JSON.stringify(body));

    // ✅ 2) Validação do secret na URL (extra)
    const secret = req.query?.secret;
    if (!secret || secret !== process.env.WEBHOOK_SECRET) {
      // salva payload pra debug mesmo se secret falhar (não grava status)
      await redisSet(
        "pix:last_webhook_invalid_secret",
        JSON.stringify({ query: req.query, body })
      );
      return res.status(401).json({ error: "Webhook secret inválido" });
    }

    // Tenta achar ID em vários formatos
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

    // Tenta achar status em vários formatos
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

    // Normaliza status pago
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

    const finalStatus = paidStatuses.has(statusRaw)
      ? "paid"
      : statusRaw || "unknown";

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
