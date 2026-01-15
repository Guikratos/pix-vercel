// Salva no Upstash (Redis) via REST
async function redisSet(key, value) {
  const url = `${process.env.UPSTASH_REDIS_REST_URL}/set/${encodeURIComponent(
    key
  )}/${encodeURIComponent(value)}`;

  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`
    }
  });

  if (!r.ok) throw new Error(`Upstash SET failed: ${await r.text()}`);
}

module.exports = async (req, res) => {
  // Só POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  try {
    // Segurança simples: secret na URL (funciona com qualquer provedor)
    const secret = req.query?.secret;
    if (!secret || secret !== process.env.WEBHOOK_SECRET) {
      return res.status(401).json({ error: "Webhook secret inválido" });
    }

    const body = req.body || {};

    // Campos comuns (podem variar)
    const id =
      body.id ||
      body.transaction_id ||
      body.pix_id ||
      body.payment_id ||
      body.data?.id;

    const statusRaw = String(
      body.status || body.payment_status || body.data?.status || ""
    ).toLowerCase();

    if (!id) {
      await redisSet("pix:last_webhook_payload", JSON.stringify(body));
      return res.status(400).json({ error: "Webhook sem id", body });
    }

    // Normaliza status pago
    const paidStatuses = new Set([
      "paid",
      "approved",
      "confirmed",
      "completed",
      "success",
      "succeeded"
    ]);

    const finalStatus = paidStatuses.has(statusRaw)
      ? "paid"
      : statusRaw || "unknown";

    // Salva status + payload (debug)
    await redisSet(`pix:${id}:status`, finalStatus);
    await redisSet(`pix:${id}:payload`, JSON.stringify(body));

    return res.status(200).json({ ok: true, id, status: finalStatus });
  } catch (e) {
    return res.status(500).json({ error: "Erro no webhook", detail: e.message });
  }
};
