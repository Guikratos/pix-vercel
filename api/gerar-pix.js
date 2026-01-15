const axios = require("axios");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método não permitido. Use POST." });
  }

  try {
    const value = 1999; // R$ 19,99 em centavos

    const response = await axios.post(
      "https://api.pushinpay.com.br/pix/cashIn",
      { value },
      {
        headers: {
          Authorization: `Bearer ${process.env.PUSHINPAY_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    return res.status(200).json({
      id: response.data.id,
      qr_code: response.data.qr_code,
      qr_code_base64: response.data.qr_code_base64
    });
  } catch (error) {
    console.error("Erro PushinPay:", error.response?.data || error.message);

    return res.status(500).json({
      error: "Erro ao gerar PIX",
      detail: error.response?.data || error.message
    });
  }
};
