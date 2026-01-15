async function redisGet(key) {
  const url = `${process.env.UPSTASH_REDIS_REST_URL}/get/${encodeURIComponent(
    key
  )}`;

  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`
    }
  });

  if (!r.ok) throw new Error(`Upstash GET failed: ${await r.text()}`);

  const data = await r.json();
  return data?.result ?? null;
}

module.exports = async (req, res) => {
  const id = req.query?.id;
  if (!id) return res.status(400).json({ error: "Faltou id" });

  try {
    const status = await redisGet(`pix:${id}:status`);
    return res.status(200).json({ id, status: status || "pending" });
  } catch (e) {
    return res.status(500).json({
      error: "Erro ao consultar status",
      detail: e.message
    });
  }
};
