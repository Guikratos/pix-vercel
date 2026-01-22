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
  const url = `${process.env.UPSTASH_REDIS_REST_URL}/set/${encodeURIComponent(
    key
  )}/${encodeURIComponent(value)}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
  });
  if (!r.ok) throw new Error(`Upstash SET failed: ${await r.text()}`);
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
    // ✅ resolve ID canônico via mapa
    const canonical = (await redisGet(`map:${id}`)) || String(id);

    // 1) cache
    const cached = await redisGet(`pix:${canonical}:status`);
    if (cached === "paid") return res.status(200).json({ id: canonical, status: "paid" });
    if (cached === "canceled") return res.status(200).json({ id: canonical, status: "canceled" });

    // 2) fallback: tentar consultar PushinPay em múltiplos endpoints (porque varia)
    if (!process.env.PUSHINPAY_TOKEN) {
      return res.status(200).json({ id: canonical, status: cached || "pending" });
    }

    const endpoints = [
      `https://api.pushinpay.com.br/api/transaction/${encodeURIComponent(canonical)}`,
      `https://api.pushinpay.com.br/api/pix/cashIn/${encodeURIComponent(canonical)}`,
      `https://api.pushinpay.com.br/api/pix/cashIn/${encodeURIComponent(id)}`,
      `https://api.pushinpay.com.br/api/transaction/${encodeURIComponent(id)}`,
    ];

    let lastErr = null;

    for (const url of endpoints) {
      try {
        const r = await axios.get(url, {
          headers: {
            Authorization: `Bearer ${process.env.PUSHINPAY_TOKEN}`,
            Accept: "application/json",
          },
          timeout: 15000,
        });

        const data = r.data || {};
        const statusRaw = String(data?.status || data?.data?.status || "").toLowerCase();

        await redisSet(`pix:${canonical}:pushinpay_last`, JSON.stringify({ url, data }));

        if (statusRaw === "paid") {
          await redisSet(`pix:${canonical}:status`, "paid");
          return res.status(200).json({ id: canonical, status: "paid" });
        }
        if (statusRaw === "canceled") {
          await redisSet(`pix:${canonical}:status`, "canceled");
          return res.status(200).json({ id: canonical, status: "canceled" });
        }

        // se respondeu mas não está paid/canceled, segue como pending
        return res.status(200).json({ id: canonical, status: "pending" });
      } catch (e) {
        lastErr = e;
        // tenta o próximo endpoint
      }
    }

    // não derruba o front
    return res.status(200).json({
      id: canonical,
      status: "pending",
      detail: lastErr?.response?.data || lastErr?.message || "unknown",
    });
  } catch (e) {
    return res.status(200).json({
      id,
      status: "pending",
      detail: e.message,
    });
  }
};
