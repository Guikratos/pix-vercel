function randomCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

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
  // CORS (Bolt/qualquer domínio)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(204).end();

  const id = req.query?.id;
  if (!id) return res.status(400).json({ error: "Faltou id" });

  try {
    // Só gera código se status = paid
    const statusRaw = await redisGet(`pix:${id}:status`);
    const status = String(statusRaw || "").toLowerCase().trim();

    if (status !== "paid") {
      return res.status(403).json({
        error: "Ainda não pago",
        id,
        status: status || "pending",
      });
    }

    // Se já tem código, retorna
    const existing = await redisGet(`pix:${id}:code`);
    if (existing) return res.status(200).json({ id, code: existing });

    // Gera novo e salva (com proteção simples contra colisão)
    for (let tries = 0; tries < 10; tries++) {
      const candidate = randomCode(6);

      // se já existe esse código, tenta outro
      const exists = await redisGet(`code:${candidate}`);
      if (exists) continue;

      await redisSet(`pix:${id}:code`, candidate);
      await redisSet(`pix:${id}:code_created_at`, String(Date.now()));
      await redisSet(`code:${candidate}`, id);
      await redisSet(`code:${candidate}:used`, "0");

      return res.status(200).json({ id, code: candidate });
    }

    return res.status(500).json({ error: "Falha ao gerar código (colisão)" });
  } catch (e) {
    return res.status(500).json({
      error: "Erro ao gerar código",
      detail: e.message,
    });
  }
};
