// /api/codigo-pix.js
function randomCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

async function redisGet(key) {
  const url = `${process.env.UPSTASH_REDIS_REST_URL}/get/${encodeURIComponent(key)}`;
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` }
  });
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

module.exports = async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(204).end();

  const id = req.query?.id;
  if (!id) return res.status(400).json({ error: "Faltou id" });

  const status = await redisGet(`pix:${id}:status`);
  if (status !== "paid") return res.status(403).json({ error: "Ainda não pago", status });

  let code = await redisGet(`pix:${id}:code`);
  if (code) return res.status(200).json({ id, code });

  for (let tries = 0; tries < 5; tries++) {
    const candidate = randomCode(6);
    const exists = await redisGet(`code:${candidate}`);
    if (!exists) {
      await redisSet(`pix:${id}:code`, candidate);
      await redisSet(`code:${candidate}`, id);
      await redisSet(`code:${candidate}:used`, "0");
      return res.status(200).json({ id, code: candidate });
    }
  }

  return res.status(500).json({ error: "Falha ao gerar código" });
};
