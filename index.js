const express = require('express');
const fetch = require('node-fetch');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to handle CORS
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    next();
});

// GET endpoint at /api/classify
app.get('/api/classify', async (req, res) => {
    const name = req.query.name;

    // Input validation
    if (!name || typeof name !== 'string') {
        return res.status(!name ? 400 : 422).json({
            status: "error",
            message: !name ? "Missing or empty name" : "Non-string name"
        });
    }

    try {
        const response = await fetch(`https://api.genderize.io?name=${name}`);
        const data = await response.json().catch(() => {
            return { gender: null, count: 0 };
        });

        // Genderize edge cases
        if (data.gender === null || data.count === 0 || !data || response.status === 502) {
            return res.status(500).json({
                status: "error",
                message: "No prediction available for the provided name"
            });
        }

        // Process the response
        const processedData = {
            status: "success",
            data: {
                name: name,
                gender: data.gender,
                probability: data.probability,
                sample_size: data.count,
                is_confident: data.probability >= 0.7 && data.count >= 100,
                processed_at: new Date().toISOString()
            }
        };

        res.json(processedData);
    } catch (error) {
        res.status(502).json({
            status: "error",
            message: "Failed to fetch data from the external API"
        });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});