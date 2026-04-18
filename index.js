const express = require('express');
const axios = require('axios'); // use axios instead of node-fetch for consistency
const { v7: uuidv7 } = require('uuid');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors()); // This sets Access-Control-Allow-Origin: *

// Initialize SQLite Database in-memory or file. We use a file to ensure it's there.
const db = new sqlite3.Database('./profiles.db', (err) => {
    if (err) {
        console.error('Could not connect to database', err);
    } else {
        console.log('Connected to SQLite database');
    }
});

db.serialize(() => {
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
});

// Helper functions
function classifyAgeGroup(age) {
    if (age === null || age === undefined) return null;
    if (age >= 0 && age <= 12) return 'child';
    if (age >= 13 && age <= 19) return 'teenager';
    if (age >= 20 && age <= 59) return 'adult';
    if (age >= 60) return 'senior';
    return null;
}

// 1. POST /api/profiles
app.post('/api/profiles', async (req, res) => {
    const { name } = req.body;

    if (name === undefined || name === null || (typeof name === 'string' && name.trim() === '')) {
        return res.status(400).json({ status: 'error', message: 'Missing or empty name' });
    }

    if (typeof name !== 'string' || !/^[a-zA-Z\s]+$/.test(name.trim())) {
        return res.status(422).json({ status: 'error', message: 'Invalid name' });
    }

    const cleanName = name.trim().toLowerCase();

    // Check Idempotency
    db.get('SELECT * FROM profiles WHERE name = ?', [cleanName], async (err, row) => {
        if (err) {
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
            // Concurrent API fetching for speed
            const [genderizeRes, agifyRes, nationalizeRes] = await Promise.allSettled([
                axios.get(`https://api.genderize.io?name=${cleanName}`, { timeout: 8000 }),
                axios.get(`https://api.agify.io?name=${cleanName}`, { timeout: 8000 }),
                axios.get(`https://api.nationalize.io?name=${cleanName}`, { timeout: 8000 })
            ]);

            // Validate Genderize
            if (genderizeRes.status === 'rejected' || !genderizeRes.value.data || genderizeRes.value.data.gender === null || genderizeRes.value.data.count === 0) {
                return res.status(502).json({ status: '502', message: 'Genderize returned an invalid response' });
            }

            // Validate Agify
            if (agifyRes.status === 'rejected' || !agifyRes.value.data || agifyRes.value.data.age === null) {
                return res.status(502).json({ status: '502', message: 'Agify returned an invalid response' });
            }

            // Validate Nationalize
            if (nationalizeRes.status === 'rejected' || !nationalizeRes.value.data || !nationalizeRes.value.data.country || nationalizeRes.value.data.country.length === 0) {
                return res.status(502).json({ status: '502', message: 'Nationalize returned an invalid response' });
            }

            const genderData = genderizeRes.value.data;
            const agifyData = agifyRes.value.data;
            const nationalizeData = nationalizeRes.value.data;

            const ageGroup = classifyAgeGroup(agifyData.age);
            const topCountry = nationalizeData.country.reduce((prev, current) => (prev.probability > current.probability) ? prev : current);

            const id = uuidv7();
            const createdAt = new Date().toISOString();

            const newProfile = {
                id: id,
                name: cleanName,
                gender: genderData.gender,
                gender_probability: genderData.probability,
                sample_size: genderData.count,
                age: agifyData.age,
                age_group: ageGroup,
                country_id: topCountry.country_id,
                country_probability: topCountry.probability,
                created_at: createdAt
            };

            const insertQuery = `INSERT INTO profiles (id, name, gender, gender_probability, sample_size, age, age_group, country_id, country_probability, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

            db.run(insertQuery, [
                newProfile.id, newProfile.name, newProfile.gender, newProfile.gender_probability, newProfile.sample_size,
                newProfile.age, newProfile.age_group, newProfile.country_id, newProfile.country_probability, newProfile.created_at
            ], function (err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        // Edge case where concurrent reqs bypass the initial select
                        db.get('SELECT * FROM profiles WHERE name = ?', [cleanName], (err2, row2) => {
                            return res.status(200).json({ status: 'success', message: 'Profile already exists', data: row2 });
                        });
                        return;
                    }
                    return res.status(500).json({ status: 'error', message: 'Database error' });
                }

                return res.status(201).json({
                    status: 'success',
                    data: newProfile
                });
            });

        } catch (error) {
            return res.status(500).json({ status: 'error', message: 'Internal server error while processing request' });
        }
    });
});

// 2. GET /api/profiles/:id
app.get('/api/profiles/:id', (req, res) => {
    const { id } = req.params;
    db.get('SELECT * FROM profiles WHERE id = ?', [id], (err, row) => {
        if (err) return res.status(500).json({ status: 'error', message: 'Internal server error' });
        if (!row) return res.status(404).json({ status: 'error', message: 'Profile not found' });
        return res.status(200).json({ status: 'success', data: row });
    });
});

// 3. GET /api/profiles
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
        if (err) return res.status(500).json({ status: 'error', message: 'Internal server error' });
        return res.status(200).json({
            status: 'success',
            count: rows.length,
            data: rows
        });
    });
});

// 4. DELETE /api/profiles/:id
app.delete('/api/profiles/:id', (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM profiles WHERE id = ?', [id], function (err) {
        if (err) return res.status(500).json({ status: 'error', message: 'Internal server error' });
        if (this.changes === 0) {
            return res.status(404).json({ status: 'error', message: 'Profile not found' });
        }
        return res.status(204).send();
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});