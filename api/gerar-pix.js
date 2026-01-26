// /api/gerar-pix.js
const axios = require("axios");

module.exports = async (req, res) => {
  // CORS (Bolt/qualquer domínio)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido. Use POST." });
  }

  try {
    if (!process.env.PUSHINPAY_TOKEN) {
      return res.status(500).json({ error: "PUSHINPAY_TOKEN não encontrado na Vercel" });
    }
    if (!process.env.APP_URL) {
      return res.status(500).json({
        error: "APP_URL não encontrado na Vercel (ex: https://pix-vercel-henna.vercel.app)",
      });
    }

    // body pode vir string
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch (_) {}
    }
    body = body || {};

    const valor = Number(body?.valor ?? 19.99);
    const value = Math.round(valor * 100);

    const payload = {
      value,
      split_rules: [],
      webhook_url: `${process.env.APP_URL}/api/webhook-pix`,
    };

    console.log("GERAR PIX payload:", payload);

    const response = await axios.post(
      "https://api.pushinpay.com.br/api/pix/cashIn",
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.PUSHINPAY_TOKEN}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );

    console.log("GERAR PIX response:", response.data);

    return res.status(200).json(response.data);
  } catch (error) {
    console.error("Erro ao gerar PIX:", error.response?.data || error.message);
    return res.status(500).json({
      error: "Erro ao gerar PIX",
      detail: error.response?.data || error.message,
    });
  }
};
