const axios = require("axios");

module.exports = async (req, res) => {
  // CORS básico (ajuda depois com bol.new)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Preflight
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
        error: "Variável PUSHINPAY_TOKEN não encontrada na Vercel"
      });
    }

    const payload = {
      value: 1999, // R$ 19,99 em centavos
      split_rules: []
      // opcional:
      // webhook_url: "https://SEU_DOMINIO.vercel.app/api/webhook-pix"
    };

    const response = await axios.post(
      "https://api.pushinpay.com.br/api/pix/cashIn",
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.PUSHINPAY_TOKEN}`,
          Accept: "application/json",
          "Content-Type": "application/json"
        }
      }
    );

    // Retorna direto o que a PushinPay mandar (mais fácil validar)
    return res.status(200).json(response.data);
  } catch (error) {
    return res.status(500).json({
      error: "Erro ao gerar PIX",
      detail: error.response?.data || error.message
    });
  }
};
