const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Requirement: CORS header must be *
app.use(cors());

app.get('/api/classify', async (req, res) => {
    const { name } = req.query;

    // 1. Input Validation
    if (name === undefined || name === "") {
        return res.status(400).json({ status: "error", message: "name query parameter is required" });
    }
    
    if (typeof name !== 'string' || !isNaN(name)) {
        return res.status(422).json({ status: "error", message: "name must be a valid string" });
    }

    try {
        // 2. External API Call
        const response = await axios.get(`https://api.genderize.io?name=${name}`);
        const { gender, probability, count } = response.data;

        // 3. Genderize Edge Case: No prediction
        if (!gender || count === 0) {
            return res.status(200).json({ 
                status: "error", 
                message: "No prediction available for the provided name" 
            });
        }

        // 4. Confidence Logic
        // probability >= 0.7 AND sample_size >= 100
        const is_confident = (probability >= 0.7 && count >= 100);

        // 5. Success Response
        return res.status(200).json({
            status: "success",
            data: {
                name: name,
                gender: gender,
                probability: probability,
                sample_size: count, // Renamed count to sample_size
                is_confident: is_confident,
                processed_at: new Date().toISOString() // ISO 8601 UTC
            }
        });

    } catch (error) {
        // 6. Error Handling
        return res.status(502).json({ status: "error", message: "External API error" });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});