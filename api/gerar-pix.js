const axios = require("axios");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Método não permitido. Use POST."
    });
  }

  try {
    const response = await axios.post(
      "https://api.pushinpay.com.br/api/pix/cashIn",
      {
        value: 1999, // R$ 19,99 em centavos
        split_rules: []
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PUSHINPAY_TOKEN}`,
          Accept: "application/json",
          "Content-Type": "application/json"
        }
      }
    );

    return res.status(200).json({
      id: response.data.id,
      status: response.data.status,
      value: response.data.value,
      qr_code: response.data.qr_code,
      qr_code_base64: response.data.qr_code_base64
    });
  } catch (error) {
    return res.status(500).json({
      error: "Erro ao gerar PIX",
      detail: error.response?.data || error.message
    });
  }
};
