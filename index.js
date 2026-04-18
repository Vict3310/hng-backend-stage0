const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

app.get('/api/classify', async (req, res) => {
    const { name } = req.query;

    // 400 - Missing or empty name
    if (!name || name.trim() === '') {
        return res.status(400).json({
            status: 'error',
            message: 'name query parameter is required'
        });
    }

    // 422 - Name must contain only letters
    if (!/^[a-zA-Z]+$/.test(name.trim())) {
        return res.status(422).json({
            status: 'error',
            message: 'name must be a valid string containing only letters'
        });
    }

    const cleanName = name.trim();

    try {
        const response = await axios.get(`https://api.genderize.io?name=${cleanName}`, {
            timeout: 8000
        });

        const { gender, probability, count } = response.data;

        // No prediction available (nonsense/unknown name)
        if (!gender || count === 0) {
            return res.status(200).json({
                status: 'success',
                data: {
                    name: cleanName,
                    gender: null,
                    probability: null,
                    sample_size: count || 0,
                    is_confident: false,
                    processed_at: new Date().toISOString()
                }
            });
        }

        // Confidence: probability >= 0.7 AND sample_size >= 100
        const is_confident = probability >= 0.7 && count >= 100;

        return res.status(200).json({
            status: 'success',
            data: {
                name: cleanName,
                gender: gender,
                probability: probability,
                sample_size: count,
                is_confident: is_confident,
                processed_at: new Date().toISOString()
            }
        });

    } catch (error) {
        return res.status(502).json({
            status: 'error',
            message: 'External service unavailable'
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});