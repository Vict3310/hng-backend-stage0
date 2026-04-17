const axios = require("axios");

const baseURL = "http://localhost:3000";

async function testPostProfile(name) {
  try {
    const response = await axios.post(`${baseURL}/api/profiles`, { name });
    console.log("POST /api/profiles response:", response.data);
  } catch (error) {
    if (error.response) {
      console.error("POST /api/profiles error:", error.response.data);
    } else {
      console.error("POST /api/profiles error:", error.message);
    }
  }
}

async function testGetProfileById(id) {
  try {
    const response = await axios.get(`${baseURL}/api/profiles/${id}`);
    console.log(`GET /api/profiles/${id} response:`, response.data);
  } catch (error) {
    if (error.response) {
      console.error(`GET /api/profiles/${id} error:`, error.response.data);
    } else {
      console.error(`GET /api/profiles/${id} error:`, error.message);
    }
  }
}

async function testGetProfiles(queryParams = "") {
  try {
    const response = await axios.get(`${baseURL}/api/profiles${queryParams}`);
    console.log(`GET /api/profiles${queryParams} response:`, response.data);
  } catch (error) {
    if (error.response) {
      console.error(`GET /api/profiles${queryParams} error:`, error.response.data);
    } else {
      console.error(`GET /api/profiles${queryParams} error:`, error.message);
    }
  }
}

async function testDeleteProfile(id) {
  try {
    const response = await axios.delete(`${baseURL}/api/profiles/${id}`);
    console.log(`DELETE /api/profiles/${id} response status:`, response.status);
  } catch (error) {
    if (error.response) {
      console.error(`DELETE /api/profiles/${id} error:`, error.response.data);
    } else {
      console.error(`DELETE /api/profiles/${id} error:`, error.message);
    }
  }
}

async function runTests() {
  // Test POST to create a profile
  await testPostProfile("ella");

  // Test POST with the same name to check idempotency
  await testPostProfile("ella");

  // Test GET all profiles
  await testGetProfiles();

  // Test GET with query parameters
  await testGetProfiles("?gender=female&country_id=CM");

  // You can add more tests here as needed
}

runTests();
