const express = require('express');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const sqlite3 = require('sqlite3').verbose();
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Middleware to handle CORS
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    next();
});

// Initialize SQLite database
const db = new sqlite3.Database('./profiles.db', (err) => {
    if (err) {
        console.error('Could not connect to database', err);
    } else {
        console.log('Connected to SQLite database');
    }
});

// Create profiles table if not exists
db.run(`CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    name TEXT UNIQUE,
    gender TEXT,
    gender_probability REAL,
    sample_size INTEGER,
    age INTEGER,
    age_group TEXT,
    country_id TEXT,
    country_probability REAL,
    created_at TEXT
)`);

// Helper function to classify age group
function classifyAgeGroup(age) {
    if (age === null || age === undefined) return null;
    if (age >= 0 && age <= 12) return 'child';
    if (age >= 13 && age <= 19) return 'teenager';
    if (age >= 20 && age <= 59) return 'adult';
    if (age >= 60) return 'senior';
    return null;
}

// POST /api/profiles
app.post('/api/profiles', async (req, res) => {
    const { name } = req.body;

    // Input validation
    if (!name || typeof name !== 'string' || name.trim() === '') {
        return res.status(!name ? 400 : 422).json({
            status: 'error',
            message: !name ? 'Missing or empty name' : 'Invalid name type'
        });
    }

    const trimmedName = name.trim().toLowerCase();

    // Check if profile already exists (idempotency)
    db.get('SELECT * FROM profiles WHERE name = ?', [trimmedName], async (err, row) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ status: 'error', message: 'Internal server error' });
        }
        if (row) {
            return res.status(200).json({
                status: 'success',
                message: 'Profile already exists',
                data: row
            });
        }

        try {
            // Fetch data from external APIs
            const apiKey = 'c79d4d961dcd40e0f1293bad29f42544';

            const genderizeRes = await fetch(`https://api.genderize.io?name=${trimmedName}&apikey=${apiKey}`);
            const genderizeData = await genderizeRes.json();

            if (genderizeData.gender === null || genderizeData.count === 0) {
                return res.status(502).json({
                    status: '502',
                    message: 'Genderize returned an invalid response'
                });
            }

            const agifyRes = await fetch(`https://api.agify.io?name=${trimmedName}`);
            const agifyData = await agifyRes.json();

            if (agifyData.age === null) {
                return res.status(502).json({
                    status: '502',
                    message: 'Agify returned an invalid response'
                });
            }

            const nationalizeRes = await fetch(`https://api.nationalize.io?name=${trimmedName}`);
            const nationalizeData = await nationalizeRes.json();

            if (!nationalizeData.country || nationalizeData.country.length === 0) {
                return res.status(502).json({
                    status: '502',
                    message: 'Nationalize returned an invalid response'
                });
            }

            // Process data
            const ageGroup = classifyAgeGroup(agifyData.age);
            const country = nationalizeData.country.reduce((max, c) => c.probability > max.probability ? c : max, nationalizeData.country[0]);

const id = generateUUID();
            const createdAt = new Date().toISOString();

            // Store in database
            const insertQuery = `INSERT INTO profiles (id, name, gender, gender_probability, sample_size, age, age_group, country_id, country_probability, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

            db.run(insertQuery, [
                id,
                trimmedName,
                genderizeData.gender,
                genderizeData.probability,
                genderizeData.count,
                agifyData.age,
                ageGroup,
                country.country_id,
                country.probability,
                createdAt
            ], function (insertErr) {
                if (insertErr) {
                    console.error('Database insert error:', insertErr);
                    return res.status(500).json({ status: 'error', message: 'Internal server error' });
                }
                return res.status(201).json({
                    status: 'success',
                    data: {
                        id,
                        name: trimmedName,
                        gender: genderizeData.gender,
                        gender_probability: genderizeData.probability,
                        sample_size: genderizeData.count,
                        age: agifyData.age,
                        age_group: ageGroup,
                        country_id: country.country_id,
                        country_probability: country.probability,
                        created_at: createdAt
                    }
                });
            });
        } catch (error) {
            console.error('API integration error:', error);
            return res.status(500).json({ status: 'error', message: 'Internal server error' });
        }
    });
});

// GET /api/profiles/:id
app.get('/api/profiles/:id', (req, res) => {
    const { id } = req.params;

    db.get('SELECT * FROM profiles WHERE id = ?', [id], (err, row) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ status: 'error', message: 'Internal server error' });
        }
        if (!row) {
            return res.status(404).json({ status: 'error', message: 'Profile not found' });
        }
        return res.status(200).json({ status: 'success', data: row });
    });
});

// GET /api/profiles
app.get('/api/profiles', (req, res) => {
    const { gender, country_id, age_group } = req.query;

    let query = 'SELECT id, name, gender, age, age_group, country_id FROM profiles';
    const conditions = [];
    const params = [];

    if (gender) {
        conditions.push('LOWER(gender) = LOWER(?)');
        params.push(gender);
    }
    if (country_id) {
        conditions.push('LOWER(country_id) = LOWER(?)');
        params.push(country_id);
    }
    if (age_group) {
        conditions.push('LOWER(age_group) = LOWER(?)');
        params.push(age_group);
    }

    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }

    db.all(query, params, (err, rows) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ status: 'error', message: 'Internal server error' });
        }
        return res.status(200).json({ status: 'success', count: rows.length, data: rows });
    });
});

// DELETE /api/profiles/:id
app.delete('/api/profiles/:id', (req, res) => {
    const { id } = req.params;

    db.run('DELETE FROM profiles WHERE id = ?', [id], function (err) {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ status: 'error', message: 'Internal server error' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ status: 'error', message: 'Profile not found' });
        }
        return res.status(204).send();
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});