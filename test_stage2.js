const axios = require('axios');

const baseURL = 'http://localhost:3000';

async function testEndpoint(url, description) {
    try {
        const response = await axios.get(url);
        console.log(`\n--- ${description} ---`);
        console.log(`URL: ${url}`);
        console.log(`Status: ${response.status}`);
        console.log(`Total: ${response.data.total}`);
        console.log(`Data (first item):`, response.data.data ? response.data.data[0] : 'No data');
    } catch (error) {
        console.error(`\n--- ${description} ERROR ---`);
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error(`Message:`, error.response.data);
        } else {
            console.error(`Message: ${error.message}`);
        }
    }
}

async function runTests() {
    console.log('Starting Stage 2 Tests...');

    // 1. Test basic get
    await testEndpoint(`${baseURL}/api/profiles`, 'Get All Profiles');

    // 2. Test filtering
    await testEndpoint(`${baseURL}/api/profiles?gender=female&age_group=senior`, 'Filter by Gender & Age Group');

    // 3. Test min/max age
    await testEndpoint(`${baseURL}/api/profiles?min_age=30&max_age=40`, 'Filter by Age Range (30-40)');

    // 4. Test sorting
    await testEndpoint(`${baseURL}/api/profiles?sort_by=age&order=desc`, 'Sort by Age Descending');

    // 5. Test pagination
    await testEndpoint(`${baseURL}/api/profiles?page=2&limit=5`, 'Pagination (Page 2, Limit 5)');

    // 6. Test Natural Language search
    await testEndpoint(`${baseURL}/api/profiles/search?q=young males from nigeria`, 'NL Search: young males from nigeria');
    await testEndpoint(`${baseURL}/api/profiles/search?q=females above 30`, 'NL Search: females above 30');
    await testEndpoint(`${baseURL}/api/profiles/search?q=adults from kenya`, 'NL Search: adults from kenya');

    // 7. Test invalid query
    await testEndpoint(`${baseURL}/api/profiles/search?q=xyz123`, 'NL Search: invalid query');

    console.log('\nTests completed.');
}

runTests();
