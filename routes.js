const express = require('express');
const axios = require('axios');
const router = express.Router();

router.post('/submit', async (req, res) => {
    const { userId, cocktailName, probability } = req.body;

    const formUrl = "https://docs.google.com/forms/d/e/1FAIpQLSd_CrHBSjGD64DgThdFicrvaNsEiAA4LIhGsyF2XI6vTzgv4A/formResponse";
    const formData = new URLSearchParams({
        "entry.2132530962": userId,
        "entry.5840647": cocktailName || "無",
        "entry.297429417": probability || "0.00"
    });

    try {
        await axios.post(formUrl, formData, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        res.json({ success: true });
    } catch (error) {
        console.error("Google 表單提交失敗:", error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;