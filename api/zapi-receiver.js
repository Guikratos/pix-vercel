export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  // segurança simples
  const secret = req.query.secret;
  if (!secret || secret !== process.env.ZAPI_WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const body = req.body || {};

  // Z-API varia payload, então cobrimos vários casos
  const phone =
    body.phone ||
    body.from ||
    body.sender ||
    body?.data?.phone ||
    body?.data?.from;

  const text =
    body.text ||
    body.message ||
    body.body ||
    body?.data?.text ||
    body?.data?.message;

  if (!phone || !text) {
    return res.status(200).json({ ok: true, ignored: true });
  }

  // espera: "codigo: ABC123"
  const match = String(text).match(/codigo:\s*([A-Za-z0-9\-_]+)/i);
  if (!match) {
    await enviarMensagem(phone, "Me envie assim: codigo: SEU_CODIGO");
    return res.status(200).json({ ok: true, no_code: true });
  }

  const codigo = match[1];

  // valida código no seu backend
  const r = await fetch(
    `${process.env.API_BASE}/api/validar-codigo?codigo=${encodeURIComponent(codigo)}`
  );
  const j = await r.json();

  if (j.ok) {
    await enviarMensagem(
      phone,
      `✅ Pagamento confirmado!\nAqui está seu acesso:\n${process.env.DRIVE_LINK}`
    );
  } else {
    await enviarMensagem(
      phone,
      "⚠️ Código inválido ou ainda não confirmado. Aguarde um pouco e tente novamente."
    );
  }

  return res.status(200).json({ ok: true });
}

async function enviarMensagem(phone, message) {
  const r = await fetch(`${process.env.ZAPI_BASE_URL}/send-text`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Client-Token": process.env.ZAPI_CLIENT_TOKEN,
    },
    body: JSON.stringify({ phone, message }),
  });

  if (!r.ok) throw new Error(await r.text());
}
