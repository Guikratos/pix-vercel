const axios = require("axios");

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

async function redisSet(key, value) {
  const url = `${process.env.UPSTASH_REDIS_REST_URL}/set/${encodeURIComponent(
    key
  )}/${encodeURIComponent(value)}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
  });
  if (!r.ok) throw new Error(`Upstash SET failed: ${await r.text()}`);
}

function normalizeStatus(raw) {
  const s = String(raw || "").toLowerCase();

  const paid = new Set([
    "paid",
    "approved",
    "confirmed",
    "completed",
    "success",
    "succeeded",
    "paid_out",
    "settled",
  ]);

  const pending = new Set(["created", "pending", "waiting", "processing"]);

  const canceled = new Set(["canceled", "cancelled", "refused", "expired"]);

  if (paid.has(s)) return "paid";
  if (canceled.has(s)) return "canceled";
  if (pending.has(s) || !s) return "pending";
  return s; // fallback
}

module.exports = async (req, res) => {
  // CORS (Bolt/qualquer domínio)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  if (req.method === "OPTIONS") return res.status(204).end();

  const id = req.query?.id;
  if (!id) return res.status(400).json({ error: "Faltou id" });

  try {
    // ✅ 1) cache no Redis (retorna o que tiver salvo)
    const cached = await redisGet(`pix:${id}:status`);
    if (cached) {
      const norm = normalizeStatus(cached);
      // se já tem paid/canceled/pending no redis, devolve direto
      if (norm === "paid" || norm === "canceled") {
        return res.status(200).json({ id, status: norm });
      }
      // se for pending, ainda assim vamos tentar consultar a PushinPay
      // (pra acelerar a virada pra paid)
    }

    // ✅ 2) Consulta o status na PushinPay
    if (!process.env.PUSHINPAY_TOKEN) {
      return res.status(500).json({
        id,
        status: cached ? normalizeStatus(cached) : "pending",
        error: "Env PUSHINPAY_TOKEN não definida na Vercel",
      });
    }

    const url = `https://api.pushinpay.com.br/api/transaction/${encodeURIComponent(
      id
    )}`;

    const r = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${process.env.PUSHINPAY_TOKEN}`,
        Accept: "application/json",
      },
      timeout: 15000,
    });

    // salva resposta pra debug (pra você inspecionar no Upstash)
    await redisSet(`pix:${id}:pushinpay`, JSON.stringify(r.data));

    // tenta status em vários lugares (pra não quebrar se mudarem o formato)
    const statusRaw =
      r.data?.status ??
      r.data?.payment_status ??
      r.data?.data?.status ??
      r.data?.data?.payment_status;

    const status = normalizeStatus(statusRaw);

    // ✅ 3) Persistir no Redis (principalmente quando virar paid/canceled)
    await redisSet(`pix:${id}:status`, status);

    return res.status(200).json({ id, status });
  } catch (e) {
    // Não quebra o front — retorna pending, mas com detalhe pra debug
    return res.status(200).json({
      id,
      status: "pending",
      detail: e.response?.data || e.message,
    });
  }
};
