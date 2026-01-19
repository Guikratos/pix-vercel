const axios = require("axios");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido. Use POST." });
  }

  try {
    if (!process.env.PUSHINPAY_TOKEN) {
      return res.status(500).json({
        error: "Variável PUSHINPAY_TOKEN não encontrada na Vercel",
      });
    }

    if (!process.env.WEBHOOK_SECRET) {
      return res.status(500).json({
        error: "Variável WEBHOOK_SECRET não encontrada na Vercel",
      });
    }

    const payload = {
      value: 1999,
      split_rules: [],
      webhook_url: `https://${req.headers.host}/api/webhook-pix?secret=${encodeURIComponent(
        process.env.WEBHOOK_SECRET
      )}`,
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
