export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  try {
    // Às vezes o body chega como string
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch (_) {}
    }

    // --- extrair phone (vários formatos possíveis) ---
    const rawPhone =
      body?.phone ??
      body?.from ??
      body?.data?.phone ??
      body?.data?.from ??
      body?.sender?.phone ??
      body?.message?.phone ??
      "";

    // normaliza para somente dígitos (remove +, @c.us etc)
    const phone = String(rawPhone).replace(/\D/g, "");

    // --- extrair message (vários formatos possíveis) ---
    const rawMsg =
      body?.message ??
      body?.text ??
      body?.data?.message ??
      body?.data?.text ??
      body?.data?.body ??
      body?.data?.message?.text ??
      body?.message?.text ??
      body?.messages?.[0]?.text ??
      body?.messages?.[0]?.message ??
      "";

    // transforma em string com segurança
    let message = "";
    if (typeof rawMsg === "string") message = rawMsg;
    else if (rawMsg && typeof rawMsg === "object") {
      // tenta achar texto dentro do objeto
      message = String(
        rawMsg.text ?? rawMsg.body ?? rawMsg.message ?? rawMsg.caption ?? ""
      );
    } else {
      message = String(rawMsg ?? "");
    }

    // se não tiver phone ou msg, só responde ok pra Z-API não ficar insistindo
    if (!phone || !message) {
      return res.status(200).json({ ok: true });
    }

    const code = message.trim();
    if (!code) return res.status(200).json({ ok: true });

    // 🔐 Valida o código PIX (sua API na Vercel)
    const validateResponse = await fetch(
      `${process.env.API_BASE_URL}/api/validar-codigo`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      }
    );

    const validation = await validateResponse.json().catch(() => ({}));

    let replyMessage = "";
    if (validation?.valid) {
      replyMessage =
        "✅ Pagamento confirmado!\n\n" +
        "Seu acesso foi liberado com sucesso.\n\n" +
        "🔓 Aqui está seu acesso exclusivo:\n" +
        (process.env.ACCESS_LINK || "https://SEU-LINK-DE-ACESSO-AQUI");
    } else {
      replyMessage =
        "❌ Código inválido ou ainda não confirmado.\n\n" +
        "Confira se digitou/copiou certinho e tente novamente em alguns segundos.";
    }

    // 📲 Envia resposta pelo Z-API
    await fetch(`${process.env.ZAPI_BASE_URL}/send-text`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "client-token": process.env.ZAPI_CLIENT_TOKEN,
      },
      body: JSON.stringify({
        phone,
        message: replyMessage,
      }),
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Erro no zapi-receber:", err);
    return res.status(200).json({ ok: true });
  }
}
