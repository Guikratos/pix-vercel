// /api/gerar-pix.js
const axios = require("axios");

async function redisSet(key, value) {
  const url = `${process.env.UPSTASH_REDIS_REST_URL}/set/${encodeURIComponent(
    key
  )}/${encodeURIComponent(value)}`;

  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
  });

  if (!r.ok) throw new Error(`Upstash SET failed: ${await r.text()}`);
}

module.exports = async (req, res) => {
  // CORS (Bolt/qualquer domínio)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Método não permitido. Use POST." });

  try {
    if (!process.env.PUSHINPAY_TOKEN) {
      return res.status(500).json({
        error: "Variável PUSHINPAY_TOKEN não encontrada na Vercel",
      });
    }
    if (!process.env.APP_URL) {
      return res.status(500).json({
        error:
          "Variável APP_URL não encontrada na Vercel (ex: https://pix-vercel-henna.vercel.app)",
      });
    }
    if (!process.env.WEBHOOK_SECRET) {
      return res.status(500).json({
        error: "Variável WEBHOOK_SECRET não encontrada na Vercel",
      });
    }

    // Body pode chegar string
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (_) {}
    }
    body = body || {};

    // valor em reais -> centavos
    const valor = Number(body?.valor ?? 19.99);
    const value = Math.round(valor * 100);

    // ✅ webhook com secret (evita 401)
    const webhook_url = `${process.env.APP_URL}/api/webhook-pix?secret=${encodeURIComponent(
      process.env.WEBHOOK_SECRET
    )}`;

    const payload = {
      value,
      split_rules: [],
      webhook_url,
    };

    console.log("GERAR PIX payload:", payload);

    const response = await axios.post(
      "https://api.pushinpay.com.br/api/pix/cashIn",
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.PUSHINPAY_TOKEN}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    const data = response.data || {};
    console.log("GERAR PIX response:", data);

    // ✅ Pega TODOS os IDs possíveis e cria um "mapa" no Redis:
    // canonicalId = o que seu front vai usar como ?id=
    const canonicalId =
      data.id || data.transaction_id || data.pix_id || data.payment_id;

    if (!canonicalId) {
      // salva resposta pra debug
      await redisSet("pix:last_generate_no_id", JSON.stringify(data));
      return res.status(500).json({
        error: "PushinPay não retornou um id reconhecido",
        data,
      });
    }

    // IDs candidatos pra mapear (qualquer um desses pode aparecer no webhook/status)
    const candidates = [
      data.id,
      data.transaction_id,
      data.pix_id,
      data.payment_id,
      data.data?.id,
      data.data?.transaction_id,
      data.data?.payment_id,
      data.data?.pix_id,
    ].filter(Boolean);

    // Mapa: map:<candidate> => canonicalId
    for (const c of new Set(candidates)) {
      await redisSet(`map:${c}`, String(canonicalId));
    }

    // status inicial
    await redisSet(`pix:${canonicalId}:status`, "pending");
    await redisSet(`pix:${canonicalId}:generate_payload`, JSON.stringify(payload));
    await redisSet(`pix:${canonicalId}:generate_response`, JSON.stringify(data));

    // devolve pro front
    return res.status(200).json(data);
  } catch (error) {
    console.error("Erro ao gerar PIX:", error.response?.data || error.message);
    return res.status(500).json({
      error: "Erro ao gerar PIX",
      detail: error.response?.data || error.message,
    });
  }
};
