const axios = require("axios");

module.exports = async (req, res) => {
  // ✅ CORS (tem que estar ANTES de qualquer return)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // ✅ Preflight
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // Só POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido. Use POST." });
  }

  try {
    if (!process.env.PUSHINPAY_TOKEN) {
      return res.status(500).json({
        error: "Variável PUSHINPAY_TOKEN não encontrada na Vercel",
      });
    }

    // aceita valor vindo do front, mas usa fallback 1999
    const valor = Number(req.body?.valor ?? 19.99);
    const value = Math.round(valor * 100); // centavos

    const payload = {
      value,
      split_rules: [],
      // ✅ webhook direto na geração (recomendado)
      webhook_url: `https://${req.headers.host}/api/webhook-pix?secret=${process.env.WEBHOOK_SECRET}`,
    };

    const response = await axios.post(
      "https://api.pushinpay.com.br/api/pix/cashIn",
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.PUSHINPAY_TOKEN}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      }
    );

    return res.status(200).json(response.data);
  } catch (error) {
    return res.status(500).json({
      error: "Erro ao gerar PIX",
      detail: error.response?.data || error.message,
    });
  }
};
