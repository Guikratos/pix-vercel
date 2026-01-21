const axios = require("axios");

async function redisGet(key) {
  const url = `${process.env.UPSTASH_REDIS_REST_URL}/get/${encodeURIComponent(key)}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
  });
  if (!r.ok) throw new Error(`Upstash GET failed: ${await r.text()}`);
  const data = await r.json();
  return data?.result ?? null;
}

async function redisSet(key, value) {
  const url = `${process.env.UPSTASH_REDIS_REST_URL}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
  });
  if (!r.ok) throw new Error(`Upstash SET failed: ${await r.text()}`);
}

module.exports = async (req, res) => {
  // CORS (Bolt/qualquer domínio)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(204).end();

  const id = req.query?.id;
  if (!id) return res.status(400).json({ error: "Faltou id" });

  try {
    // 1) Se já estiver pago no Redis, retorna na hora
    const cached = await redisGet(`pix:${id}:status`);
    if (cached === "paid") return res.status(200).json({ id, status: "paid" });

    // 2) Consulta o status na PushinPay (endpoint correto)
    // Doc: GET /transaction/{id}
    const url = `https://api.pushinpay.com.br/api/transaction/${encodeURIComponent(id)}`;

    const r = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${process.env.PUSHINPAY_TOKEN}`,
        Accept: "application/json",
      },
      timeout: 15000,
    });

    // Status vem como created | paid | canceled (doc)
    const statusRaw = String(r.data?.status || "").toLowerCase();

    // Salva resposta pra debug (ajuda se algo mudar no retorno)
    await redisSet(`pix:${id}:pushinpay`, JSON.stringify(r.data));

    if (statusRaw === "paid") {
      await redisSet(`pix:${id}:status`, "paid");
      return res.status(200).json({ id, status: "paid" });
    }

    if (statusRaw === "canceled") {
      await redisSet(`pix:${id}:status`, "canceled");
      return res.status(200).json({ id, status: "canceled" });
    }

    return res.status(200).json({ id, status: "pending" });
  } catch (e) {
    // Não quebra o front — continua como pending
    return res.status(200).json({
      id,
      status: "pending",
      detail: e.response?.data || e.message,
    });
  }
};
