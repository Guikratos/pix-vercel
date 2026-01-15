const axios = require("axios");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido. Use POST." });
  }

  try {
    const value = 1999; // R$ 19,99 em centavos

    const response = await axios.post(
      "https://api.pushinpay.com.br/pix", // ✅ endpoint correto (Base URL do print)
      {
        value
        // opcional:
        // webhook_url: "https://SEU_DOMINIO.vercel.app/api/webhook-pix"
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PUSHINPAY_TOKEN}`,
          Accept: "application/json",
          "Content-Type": "application/json"
        }
      }
    );

    // A doc mostra campos como: id, qr_code, status, value, webhook_url, qr_code_base64 (etc)
    return res.status(200).json({
      id: response.data.id,
      status: response.data.status,
      value: response.data.value,
      qr_code: response.data.qr_code,
      qr_code_base64: response.data.qr_code_base64,
      webhook_url: response.data.webhook_url
    });
  } catch (error) {
    return res.status(500).json({
      error: "Erro ao gerar PIX",
      detail: error.response?.data || error.message
    });
  }
};
