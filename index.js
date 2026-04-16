const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000; // Render prefers 10000

app.use(cors());

app.get('/api/classify', async (req, res) => {
    const { name } = req.query;

    // 1. Validation (400)
    if (!name || name.trim() === "") {
        return res.status(400).json({ status: "error", message: "name query parameter is required" });
    }

    // 2. Validation (422) - Regex to allow only letters
    if (!/^[a-zA-Z]+$/.test(name)) {
        return res.status(422).json({ status: "error", message: "name must be a valid string containing only letters" });
    }

    try {
        // 3. External API with a 4-second timeout to prevent 502s
        const response = await axios.get(`https://api.genderize.io?name=${name}`, { timeout: 4000 });
        
        const { gender, probability, count } = response.data;

        // 4. Edge Case: No prediction (Nonsense names)
        if (!gender || count === 0) {
            return res.status(200).json({ 
                status: "error", 
                message: "No prediction available for the provided name" 
            });
        }

        // 5. Confidence Logic
        const is_confident = (probability >= 0.7 && count >= 100);

        // 6. Success Response
        return res.status(200).json({
            status: "success",
            data: {
                name: name,
                gender: gender,
                probability: probability,
                sample_size: count,
                is_confident: is_confident,
                processed_at: new Date().toISOString()
            }
        });

    } catch (error) {
        // If external API fails, we send a cleaner error
        return res.status(502).json({ 
            status: "error", 
            message: "External service unavailable" 
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});