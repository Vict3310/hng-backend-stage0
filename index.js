const express = require('express');
const axios = require('axios');
const { v7: uuidv7 } = require('uuid');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

// Initialize SQLite Database
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
        age INTEGER,
        age_group TEXT,
        country_id TEXT,
        country_name TEXT,
        country_probability REAL,
        created_at TEXT
    )`);
});

// Seed Database
async function seedDatabase() {
    const seedFilePath = path.join(__dirname, 'seed_profiles.json');
    if (fs.existsSync(seedFilePath)) {
        try {
            const data = JSON.parse(fs.readFileSync(seedFilePath, 'utf8'));
            const profiles = data.profiles || [];
            console.log(`Seeding ${profiles.length} profiles...`);

            const insertStmt = db.prepare(`INSERT OR IGNORE INTO profiles 
                (id, name, gender, gender_probability, age, age_group, country_id, country_name, country_probability, created_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

            profiles.forEach(p => {
                insertStmt.run(
                    uuidv7(),
                    p.name,
                    p.gender,
                    p.gender_probability,
                    p.age,
                    p.age_group,
                    p.country_id,
                    p.country_name,
                    p.country_probability,
                    new Date().toISOString()
                );
            });
            insertStmt.finalize();
            console.log('Seeding completed.');
        } catch (error) {
            console.error('Error seeding database:', error);
        }
    } else {
        console.log('seed_profiles.json not found, skipping seeding.');
    }
}

seedDatabase();

// Helper functions
function classifyAgeGroup(age) {
    if (age === null || age === undefined) return null;
    if (age >= 0 && age <= 12) return 'child';
    if (age >= 13 && age <= 19) return 'teenager';
    if (age >= 20 && age <= 59) return 'adult';
    if (age >= 60) return 'senior';
    return null;
}

// 1. Get All Profiles GET /api/profiles
app.get('/api/profiles', (req, res) => {
    let {
        gender, age_group, country_id, min_age, max_age,
        min_gender_probability, min_country_probability,
        sort_by, order, page, limit
    } = req.query;

    // Defaults
    page = parseInt(page) || 1;
    limit = parseInt(limit) || 10;
    if (limit > 50) limit = 50;
    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM profiles';
    let countQuery = 'SELECT COUNT(*) as total FROM profiles';
    const conditions = [];
    const params = [];

    if (gender) {
        conditions.push('gender = ?');
        params.push(gender.toLowerCase());
    }
    if (age_group) {
        conditions.push('age_group = ?');
        params.push(age_group.toLowerCase());
    }
    if (country_id) {
        conditions.push('country_id = ?');
        params.push(country_id.toUpperCase());
    }
    if (min_age) {
        conditions.push('age >= ?');
        params.push(parseInt(min_age));
    }
    if (max_age) {
        conditions.push('age <= ?');
        params.push(parseInt(max_age));
    }
    if (min_gender_probability) {
        conditions.push('gender_probability >= ?');
        params.push(parseFloat(min_gender_probability));
    }
    if (min_country_probability) {
        conditions.push('country_probability >= ?');
        params.push(parseFloat(min_country_probability));
    }

    if (conditions.length > 0) {
        const whereClause = ' WHERE ' + conditions.join(' AND ');
        query += whereClause;
        countQuery += whereClause;
    }

    // Sorting
    const allowedSortFields = ['age', 'created_at', 'gender_probability'];
    if (sort_by && allowedSortFields.includes(sort_by)) {
        const sortOrder = (order && order.toLowerCase() === 'desc') ? 'DESC' : 'ASC';
        query += ` ORDER BY ${sort_by} ${sortOrder}`;
    }

    // Pagination
    query += ` LIMIT ? OFFSET ?`;
    const queryParams = [...params, limit, offset];

    db.get(countQuery, params, (err, countRow) => {
        if (err) return res.status(500).json({ status: 'error', message: 'Database error' });
        
        db.all(query, queryParams, (err, rows) => {
            if (err) return res.status(500).json({ status: 'error', message: 'Database error' });
            
            res.status(200).json({
                status: 'success',
                page: page,
                limit: limit,
                total: countRow.total,
                data: rows
            });
        });
    });
});

// 2. Natural Language Query GET /api/profiles/search
app.get('/api/profiles/search', (req, res) => {
    const { q, page, limit } = req.query;

    if (!q) {
        return res.status(400).json({ status: 'error', message: 'Missing or empty parameter' });
    }

    const queryText = q.toLowerCase();
    const filters = {};

    // Parsing Logic
    if (queryText.includes('young')) {
        filters.min_age = 16;
        filters.max_age = 24;
    }
    
    // Gender
    if (/\bfemales?\b/.test(queryText)) {
        filters.gender = 'female';
    } else if (/\bmales?\b/.test(queryText)) {
        filters.gender = 'male';
    }

    // Age groups
    if (/\bchildren\b|\bchild\b/.test(queryText)) filters.age_group = 'child';
    if (/\bteenagers?\b/.test(queryText)) filters.age_group = 'teenager';
    if (/\badults?\b/.test(queryText)) filters.age_group = 'adult';
    if (/\bseniors?\b/.test(queryText)) filters.age_group = 'senior';

    // "above X"
    const aboveMatch = queryText.match(/\babove (\d+)\b/);
    if (aboveMatch) {
        filters.min_age = parseInt(aboveMatch[1]) + 1;
    }

    // "below X"
    const belowMatch = queryText.match(/\bbelow (\d+)\b/);
    if (belowMatch) {
        filters.max_age = parseInt(belowMatch[1]) - 1;
    }

    // Location
    const countryMapping = {
        'nigeria': 'NG', 'kenya': 'KE', 'angola': 'AO', 'ghana': 'GH',
        'benin': 'BJ', 'tanzania': 'TZ', 'uganda': 'UG', 'sudan': 'SD',
        'ethiopia': 'ET', 'morocco': 'MA', 'mali': 'ML', 'senegal': 'SN',
        'kenya': 'KE', 'south africa': 'ZA', 'cameroon': 'CM'
    };
    for (const [name, id] of Object.entries(countryMapping)) {
        if (queryText.includes(name)) {
            filters.country_id = id;
            break;
        }
    }

    // If we couldn't parse anything meaningful, return error
    if (Object.keys(filters).length === 0) {
        return res.status(400).json({ status: 'error', message: 'Unable to interpret query' });
    }

    // Redirect to the main GET /api/profiles logic by appending filters to req.query
    req.query = { ...req.query, ...filters };
    
    // Call the same logic as GET /api/profiles
    // We can extract it to a function, but for now we'll just re-implement or forward.
    // Let's refactor GET /api/profiles to a helper.
    return getAllProfiles(req, res);
});

// Refactored Get All Profiles logic
function getAllProfiles(req, res) {
    let {
        gender, age_group, country_id, min_age, max_age,
        min_gender_probability, min_country_probability,
        sort_by, order, page, limit
    } = req.query;

    // Validation
    const numericParams = { min_age, max_age, min_gender_probability, min_country_probability, page, limit };
    for (const [key, value] of Object.entries(numericParams)) {
        if (value !== undefined && isNaN(parseFloat(value))) {
            return res.status(422).json({ status: 'error', message: `Invalid parameter type for ${key}` });
        }
    }

    page = parseInt(page) || 1;
    limit = parseInt(limit) || 10;
    if (limit > 50) limit = 50;
    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM profiles';
    let countQuery = 'SELECT COUNT(*) as total FROM profiles';
    const conditions = [];
    const params = [];

    if (gender) {
        conditions.push('gender = ?');
        params.push(gender.toLowerCase());
    }
    if (age_group) {
        conditions.push('age_group = ?');
        params.push(age_group.toLowerCase());
    }
    if (country_id) {
        conditions.push('country_id = ?');
        params.push(country_id.toUpperCase());
    }
    if (min_age) {
        conditions.push('age >= ?');
        params.push(parseInt(min_age));
    }
    if (max_age) {
        conditions.push('age <= ?');
        params.push(parseInt(max_age));
    }
    if (min_gender_probability) {
        conditions.push('gender_probability >= ?');
        params.push(parseFloat(min_gender_probability));
    }
    if (min_country_probability) {
        conditions.push('country_probability >= ?');
        params.push(parseFloat(min_country_probability));
    }

    if (conditions.length > 0) {
        const whereClause = ' WHERE ' + conditions.join(' AND ');
        query += whereClause;
        countQuery += whereClause;
    }

    const allowedSortFields = ['age', 'created_at', 'gender_probability'];
    if (sort_by && allowedSortFields.includes(sort_by)) {
        const sortOrder = (order && order.toLowerCase() === 'desc') ? 'DESC' : 'ASC';
        query += ` ORDER BY ${sort_by} ${sortOrder}`;
    }

    query += ` LIMIT ? OFFSET ?`;
    const queryParams = [...params, limit, offset];

    db.get(countQuery, params, (err, countRow) => {
        if (err) return res.status(500).json({ status: 'error', message: 'Database error' });
        
        db.all(query, queryParams, (err, rows) => {
            if (err) return res.status(500).json({ status: 'error', message: 'Database error' });
            
            res.status(200).json({
                status: 'success',
                page: page,
                limit: limit,
                total: countRow ? countRow.total : 0,
                data: rows
            });
        });
    });
}

// Update the actual route to use the helper
app.get('/api/profiles', getAllProfiles);

// Other endpoints (legacy or updated)
app.post('/api/profiles', async (req, res) => {
    // Keep this for manual additions if needed, but update schema
    const { name } = req.body;
    if (!name) return res.status(400).json({ status: 'error', message: 'Missing or empty parameter' });
    
    // Minimal implementation for now, primarily use seeding
    res.status(501).json({ status: 'error', message: 'Not implemented for Stage 2, use seeding.' });
});

app.get('/api/profiles/:id', (req, res) => {
    const { id } = req.params;
    db.get('SELECT * FROM profiles WHERE id = ?', [id], (err, row) => {
        if (err) return res.status(500).json({ status: 'error', message: 'Database error' });
        if (!row) return res.status(404).json({ status: 'error', message: 'Profile not found' });
        res.status(200).json({ status: 'success', data: row });
    });
});

app.delete('/api/profiles/:id', (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM profiles WHERE id = ?', [id], function (err) {
        if (err) return res.status(500).json({ status: 'error', message: 'Database error' });
        if (this.changes === 0) return res.status(404).json({ status: 'error', message: 'Profile not found' });
        res.status(204).send();
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});