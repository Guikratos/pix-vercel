// /api/gerar-pix.js
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

    if (!process.env.APP_URL) {
      return res.status(500).json({
        error: "Variável APP_URL não encontrada na Vercel (ex: https://pix-vercel-henna.vercel.app)",
      });
    }

    // ✅ para garantir que o webhook sempre seja aceito
    if (!process.env.WEBHOOK_SECRET) {
      return res.status(500).json({
        error: "Variável WEBHOOK_SECRET não encontrada na Vercel",
      });
    }

    // Às vezes o body chega como string
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (_) {}
    }
    body = body || {};

    // valor vindo do front -> centavos
    const valor = Number(body?.valor ?? 19.99);
    const value = Math.round(valor * 100);

    // remove barra no final do APP_URL se tiver
    const appUrl = String(process.env.APP_URL).replace(/\/$/, "");

    const payload = {
      value,
      split_rules: [],
      // ✅ GARANTE autenticação pelo secret (mesmo se não vier header)
      webhook_url: `${appUrl}/api/webhook-pix?secret=${encodeURIComponent(process.env.WEBHOOK_SECRET)}`,
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
