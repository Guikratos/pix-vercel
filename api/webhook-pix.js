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

async function redisGet(key) {
  const url = `${process.env.UPSTASH_REDIS_REST_URL}/get/${encodeURIComponent(
    key
  )}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
  });
  if (!r.ok) throw new Error(`Upstash GET failed: ${await r.text()}`);
  const data = await r.json();
  return data?.result ?? null;
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
  // debug
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, x-pushinpay-token"
  );

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method === "GET")
    return res.status(200).json({ ok: true, hint: "Webhook online. Use POST." });
  if (req.method !== "POST")
    return res.status(405).json({ error: "Use POST" });

  try {
    // Body pode chegar string
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (_) {}
    }
    body = body || {};

    // ✅ AUTH (aceita SECRET na URL OU header x-pushinpay-token)
    const secret = req.query?.secret;
    const pushToken = req.headers["x-pushinpay-token"];

    const okBySecret =
      secret && process.env.WEBHOOK_SECRET && secret === process.env.WEBHOOK_SECRET;

    const okByHeader =
      pushToken &&
      process.env.PUSHINPAY_WEBHOOK_TOKEN &&
      pushToken === process.env.PUSHINPAY_WEBHOOK_TOKEN;

    if (!okBySecret && !okByHeader) {
      await redisSet(
        "pix:last_webhook_unauthorized",
        JSON.stringify({
          query: req.query,
          hasSecret: !!secret,
          hasHeader: !!pushToken,
          headers: { "x-pushinpay-token": pushToken ? "present" : "missing" },
          body,
        })
      );
      return res.status(401).json({ error: "Webhook não autorizado" });
    }

    // ID bruto vindo do provedor
    const rawId = pickFirst(body, [
      "id",
      "transaction_id",
      "pix_id",
      "payment_id",
      "data.id",
      "data.transaction_id",
      "data.payment_id",
      "data.pix_id",
      "data.payment.id",
      "data.pix.id",
      "payment.id",
      "pix.id",
    ]);

    if (!rawId) {
      await redisSet("pix:last_webhook_no_id", JSON.stringify(body));
      return res.status(400).json({ error: "Webhook sem id" });
    }

    // ✅ resolve ID canônico via mapa
    const canonical = (await redisGet(`map:${rawId}`)) || String(rawId);

    // status
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

    // grava SEMPRE no canônico
    await redisSet(`pix:${canonical}:status`, finalStatus);
    await redisSet(`pix:${canonical}:payload`, JSON.stringify(body));
    await redisSet(
      `pix:last_webhook_ok`,
      JSON.stringify({ rawId, canonical, statusRaw, finalStatus })
    );

    console.log("WEBHOOK OK:", { rawId, canonical, statusRaw, finalStatus });

    return res.status(200).json({ ok: true, id: canonical, status: finalStatus });
  } catch (e) {
    console.error("Erro no webhook:", e);
    return res.status(500).json({ error: "Erro no webhook", detail: e.message });
  }
};
