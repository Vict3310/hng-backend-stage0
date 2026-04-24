# HNG Stage 2 - Intelligence Query Engine

An advanced demographic intelligence API for Insighta Labs that supports filtering, sorting, pagination, and natural language queries.

## API Endpoints

### 1. Get All Profiles
`GET /api/profiles`

Supports advanced filtering, sorting, and pagination.

**Query Parameters:**
- `gender`: male | female
- `age_group`: child | teenager | adult | senior
- `country_id`: 2-letter ISO code (e.g., NG, KE)
- `min_age` / `max_age`: Integer
- `min_gender_probability` / `min_country_probability`: Float (0.0 to 1.0)
- `sort_by`: age | created_at | gender_probability
- `order`: asc | desc
- `page`: Default 1
- `limit`: Default 10 (Max 50)

### 2. Natural Language Query
`GET /api/profiles/search?q=<query>`

Example: `/api/profiles/search?q=young males from nigeria`

#### Parsing Approach
The system uses rule-based parsing (regex and keyword matching) to translate plain English into structured filters:
- **Age Mapping**: "young" is mapped to ages 16–24.
- **Gender Mapping**: Keywords like "male", "males", "female", "females" are used to set the `gender` filter.
- **Age Groups**: Keywords like "child", "teenager", "adult", "senior" are mapped to the `age_group` filter.
- **Range Filters**: "above X" maps to `min_age = X + 1`, and "below X" maps to `max_age = X - 1`.
- **Location**: "from [country name]" maps the country name to its corresponding `country_id` using a predefined mapping.

#### Limitations & Edge Cases
- **Complex Conjunctions**: The parser might struggle with complex "and/or" logic (e.g., "male and female teenagers"). It currently prioritizes the last mentioned gender or age constraint.
- **Unknown Countries**: Only a subset of major country names is currently mapped. Queries with unmapped countries will skip the location filter.
- **Ambiguous Terms**: Terms like "middle-aged" or "toddler" are not currently supported as they aren't part of the core requirement.
- **Noise Words**: Filler words are ignored, but unexpected sentence structures might result in an "Unable to interpret query" error.

## Database Schema
The database uses SQLite with the following structure:
- `id`: UUID v7 (Primary Key)
- `name`: UNIQUE string
- `gender`: male | female
- `gender_probability`: Float
- `age`: Integer
- `age_group`: child | teenager | adult | senior
- `country_id`: ISO code
- `country_name`: Full country name
- `country_probability`: Float
- `created_at`: ISO 8601 Timestamp

## Tech Stack
- **Runtime**: Node.js
- **Framework**: Express
- **Database**: SQLite3
- **Utilities**: uuid (v7), axios, cors

## Setup & Run
1. `npm install`
2. Ensure `seed_profiles.json` is present in the root directory.
3. `npm start` (The server will automatically seed the database on startup).
