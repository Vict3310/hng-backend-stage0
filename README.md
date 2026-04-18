# HNG Stage 0 - Name Classifier API

A simple Node.js API that classifies gender based on a name using the Genderize API.

## API Endpoint

`GET /api/classify?name=<name>`

## Response Format

```json
{
  "status": "success",
  "data": {
    "name": "john",
    "gender": "male",
    "probability": 1,
    "sample_size": 2692560,
    "is_confident": true,
    "processed_at": "2026-04-18T03:00:00.000Z"
  }
}
```

## Tech Stack

- Node.js
- Express
- Axios (External API requests)
- CORS

## How to Run Locally

1. Clone the repo
2. Run `npm install`
3. Run `npm start`
