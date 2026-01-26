// /api/status-pix.js
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

async function pushinpayGetTransaction(id) {
  const base = "https://api.pushinpay.com.br";
  const candidates = [
    `${base}/transaction/${encodeURIComponent(id)}`,       // ✅ sem /api
    `${base}/api/transaction/${encodeURIComponent(id)}`,   // fallback com /api
  ];

  let lastErr = null;

  for (const url of candidates) {
    try {
      const r = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${process.env.PUSHINPAY_TOKEN}`,
          Accept: "application/json",
        },
        timeout: 15000,
      });
      return { url, data: r.data };
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr || new Error("Falha ao consultar PushinPay");
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(204).end();

  const id = req.query?.id;
  if (!id) return res.status(400).json({ error: "Faltou id" });

  try {
    // 1) cache
    const cached = await redisGet(`pix:${id}:status`);
    if (cached === "paid") return res.status(200).json({ id, status: "paid" });

    // 2) consulta PushinPay (endpoint correto)
    const tx = await pushinpayGetTransaction(id);

    await redisSet(`pix:${id}:pushinpay`, JSON.stringify({ from: tx.url, data: tx.data }));

    const statusRaw = String(tx.data?.status || "").toLowerCase();

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
    // não quebra o front
    return res.status(200).json({
      id,
      status: "pending",
      detail: e.response?.data || e.message,
    });
  }
};
