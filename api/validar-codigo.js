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
  const code = (req.query?.code || "").toUpperCase().trim();
  if (!code) return res.status(400).json({ error: "Faltou code" });

  const id = await redisGet(`code:${code}`);
  if (!id) return res.status(404).json({ ok: false, error: "Código não encontrado" });

  const used = await redisGet(`code:${code}:used`);
  if (used === "1") return res.status(409).json({ ok: false, error: "Código já usado" });

  const status = await redisGet(`pix:${id}:status`);
  if (status !== "paid") return res.status(403).json({ ok: false, error: "Pagamento não confirmado" });

  // Marca como usado (uma vez)
  await redisSet(`code:${code}:used`, "1");

  return res.status(200).json({ ok: true, id, status: "paid" });
};
