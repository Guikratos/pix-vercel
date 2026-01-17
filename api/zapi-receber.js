export default async function handler(req, res) {
  // 1) Só POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  // 2) Secret na URL (proteção)
  const secret = req.query?.secret;
  if (!secret || secret !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: "secret inválido" });
  }

  try {
    const body = req.body || {};

    // 3) Tenta achar o texto recebido (o Z-API pode mandar com campos diferentes)
    const text =
      body.text ||
      body.body ||
      body.message ||
      body?.message?.text ||
      body?.text?.message ||
      "";

    // 4) Tenta achar o telefone de quem mandou
    const phoneRaw =
      body.phone ||
      body.from ||
      body.sender?.phone ||
      body?.message?.from ||
      body?.chatId ||
      "";

    const phone = String(phoneRaw).replace(/\D/g, ""); // só números

    if (!phone) {
      // Se não vier phone, devolve 200 pra Z-API não ficar tentando de novo
      return res.status(200).json({ ok: true, note: "sem phone no payload", body });
    }

    // 5) Resposta simples (só pra provar que o webhook + envio estão funcionando)
    const reply =
      `✅ Recebi sua mensagem!\n\n` +
      `Texto: "${text}"\n\n` +
      `Agora me envie seu código (ex: ABC123) no formato: codigo ABC123`;

    // 6) Envia msg usando a API do Z-API
    // IMPORTANTE: ZAPI_BASE_URL deve ser tipo:
    // https://api.z-api.io/instances/SEU_ID/token/SEU_TOKEN
    const url = `${process.env.ZAPI_BASE_URL}/send-text`;

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "client-token": process.env.ZAPI_CLIENT_TOKEN || "",
      },
      body: JSON.stringify({
        phone, // ex: 5527996941822
        message: reply,
      }),
    });

    const data = await resp.text();

    if (!resp.ok) {
      return res.status(200).json({
        ok: false,
        error: "Falha ao enviar no Z-API",
        status: resp.status,
        details: data,
      });
    }

    return res.status(200).json({ ok: true, sent: true });
  } catch (e) {
    return res.status(500).json({ error: "crash", detail: e?.message });
  }
}
