export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false });
    }

    const body = req.body;

    // Z-API pode mandar message como string ou objeto
    const message =
      typeof body?.message === "string"
        ? body.message
        : body?.message?.text || "";

    const phone = body?.phone || body?.from || "";

    console.log("Mensagem recebida:", message);
    console.log("Telefone:", phone);

    if (!message) {
      return res.status(200).json({ ok: true });
    }

    // Exemplo simples de resposta automática
    if (message.toLowerCase().includes("teste")) {
      await fetch(`${process.env.ZAPI_BASE_URL}/send-text`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "client-token": process.env.ZAPI_CLIENT_TOKEN,
        },
        body: JSON.stringify({
          phone,
          message: "✅ Recebi sua mensagem com sucesso!",
        }),
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Erro no zapi-receive:", err);
    return res.status(200).json({ ok: true });
  }
}
