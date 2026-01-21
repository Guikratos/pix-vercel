const axios = require("axios");

async function redisGet(key) {
  const url = `${process.env.UPSTASH_REDIS_REST_URL}/get/${encodeURIComponent(key)}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` }
  });
  if (!r.ok) throw new Error(await r.text());
  const data = await r.json();
  return data?.result ?? null;
}

async function redisSet(key, value) {
  const url = `${process.env.UPSTASH_REDIS_REST_URL}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` }
  });
  if (!r.ok) throw new Error(await r.text());
}

function normalizeStatus(s) {
  const statusRaw = String(s || "").toLowerCase();
  const paidStatuses = new Set([
    "paid", "approved", "confirmed", "completed", "success", "succeeded", "settled"
  ]);
  return paidStatuses.has(statusRaw) ? "paid" : (statusRaw || "pending");
}

module.exports = async (req, res) => {
  // CORS (pra rodar no bolt/qualquer domínio)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(204).end();

  const id = req.query?.id;
  if (!id) return res.status(400).json({ error: "Faltou id" });

  try {
    // 1) cache no Redis
    const cached = await redisGet(`pix:${id}:status`);
    if (cached === "paid") return res.status(200).json({ id, status: "paid" });

    // 2) consulta PushinPay (tenta dois formatos)
    const urlA = `https://api.pushinpay.com.br/api/pix/cashIn/${id}`;
    const urlB = `https://api.pushinpay.com.br/api/pix/cashIn?id=${encodeURIComponent(id)}`;

    let data = null;
    try {
      const rA = await axios.get(urlA, {
        headers: { Authorization: `Bearer ${process.env.PUSHINPAY_TOKEN}`, Accept: "application/json" }
      });
      data = rA.data;
    } catch (e) {
      const rB = await axios.get(urlB, {
        headers: { Authorization: `Bearer ${process.env.PUSHINPAY_TOKEN}`, Accept: "application/json" }
      });
      data = rB.data;
    }

    // salva resposta pra debug
    await redisSet(`pix:${id}:pushinpay`, JSON.stringify(data));

    // tenta achar status em vários lugares
    const status =
      normalizeStatus(data?.status) ||
      normalizeStatus(data?.payment_status) ||
      normalizeStatus(data?.data?.status) ||
      normalizeStatus(data?.data?.payment_status);

    if (status === "paid") {
      await redisSet(`pix:${id}:status`, "paid");
    }

    return res.status(200).json({ id, status });
  } catch (e) {
    return res.status(200).json({ id, status: "pending", detail: e.message });
  }
};
