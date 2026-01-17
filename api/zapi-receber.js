export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido" });
  }

  try {
    const body = req.body;

    // Estrutura padrão Z-API
    const phone =
      body?.phone ||
      body?.from ||
      body?.data?.phone ||
      body?.data?.from;

    const message =
      body?.message ||
      body?.text ||
      body?.data?.message ||
      body?.data?.text;

    if (!phone || !message) {
      return res.status(200).json({ ok: true });
    }

    const code = message.trim();

    // 🔐 Valida o código PIX
    const validateResponse = await fetch(
      `${process.env.API_BASE_URL}/api/validar-codigo`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code }),
      }
    );

    const validation = await validateResponse.json();

    let replyMessage = "";

    if (validation.valid) {
      replyMessage =
        "✅ Pagamento confirmado!\n\n" +
        "Seu acesso foi liberado com sucesso.\n\n" +
        "🔓 Aqui está seu acesso exclusivo:\n" +
        "https://SEU-LINK-DE-ACESSO-AQUI";
    } else {
      replyMessage =
        "❌ Código inválido ou ainda não confirmado.\n\n" +
        "Verifique se copiou corretamente ou aguarde alguns segundos e tente novamente.";
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
