/**
 * Load Test: Property Registration
 * 
 * Tests the property registration workflow under load.
 * Simulates multiple users registering properties simultaneously.
 * 
 * Run with: k6 run tests/load/property-registration.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const registrationDuration = new Trend('registration_duration');

// Test configuration
export const options = {
  stages: [
    { duration: '1m', target: 20 },   // Ramp up to 20 users over 1 minute
    { duration: '3m', target: 20 },   // Stay at 20 users for 3 minutes
    { duration: '1m', target: 50 },   // Ramp up to 50 users
    { duration: '3m', target: 50 },   // Stay at 50 users for 3 minutes
    { duration: '1m', target: 100 },  // Ramp up to 100 users
    { duration: '5m', target: 100 },  // Stay at 100 users for 5 minutes
    { duration: '2m', target: 0 },    // Ramp down to 0 users
  ],
  thresholds: {
    'http_req_duration': ['p(95)<2000'], // 95% of requests must complete below 2s
    'http_req_failed': ['rate<0.05'],    // Error rate must be below 5%
    'errors': ['rate<0.05'],             // Custom error rate below 5%
  },
};

// Base URL from environment or default
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API_TOKEN = __ENV.API_TOKEN || '';

/**
 * Generate random property data
 */
function generatePropertyData() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  
  return {
    title: `Test Property ${timestamp}-${random}`,
    description: `Load test property created at ${new Date().toISOString()}`,
    address: `${random} Test Street, Test City`,
    parcelNumber: `PARCEL-${timestamp}-${random}`,
    size: Math.floor(Math.random() * 10000) + 100, // 100-10100 sqm
    price: Math.floor(Math.random() * 1000000) + 50000, // $50k-$1.05M
    propertyType: ['residential', 'commercial', 'agricultural', 'industrial'][Math.floor(Math.random() * 4)],
    coordinates: {
      latitude: 6.5244 + (Math.random() - 0.5) * 0.1, // Around Lagos, Nigeria
      longitude: 3.3792 + (Math.random() - 0.5) * 0.1,
    },
  };
}

/**
 * Main test scenario
 */
export default function () {
  const propertyData = generatePropertyData();
  
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_TOKEN}`,
    },
  };

  // Test 1: Register property
  const registerStart = Date.now();
  const registerRes = http.post(
    `${BASE_URL}/api/trpc/property.create`,
    JSON.stringify(propertyData),
    params
  );

  const registerSuccess = check(registerRes, {
    'property registration status is 200': (r) => r.status === 200,
    'property registration response time < 2s': (r) => r.timings.duration < 2000,
    'property registration has result': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body && body.result && body.result.data;
      } catch (e) {
        return false;
      }
    },
  });

  if (!registerSuccess) {
    errorRate.add(1);
  } else {
    errorRate.add(0);
    registrationDuration.add(Date.now() - registerStart);
  }

  // Extract property ID for subsequent tests
  let propertyId;
  try {
    const body = JSON.parse(registerRes.body);
    propertyId = body.result?.data?.id;
  } catch (e) {
    console.error('Failed to parse property registration response');
  }

  sleep(1);

  // Test 2: Fetch property details (if registration succeeded)
  if (propertyId) {
    const fetchRes = http.get(
      `${BASE_URL}/api/trpc/property.getById?input=${encodeURIComponent(JSON.stringify({ id: propertyId }))}`,
      params
    );

    check(fetchRes, {
      'property fetch status is 200': (r) => r.status === 200,
      'property fetch response time < 500ms': (r) => r.timings.duration < 500,
      'property fetch has data': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body && body.result && body.result.data;
        } catch {
          return false;
        }
      },
    });

    sleep(0.5);
  }

  // Test 3: List properties
  const listRes = http.get(
    `${BASE_URL}/api/trpc/property.list?input=${encodeURIComponent(JSON.stringify({ limit: 10, offset: 0 }))}`,
    params
  );

  check(listRes, {
    'property list status is 200': (r) => r.status === 200,
    'property list response time < 1s': (r) => r.timings.duration < 1000,
    'property list has data': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body && body.result && body.result.data && Array.isArray(body.result.data.properties);
      } catch (e) {
        return false;
      }
    },
  });

  sleep(1);
}

/**
 * Setup function - runs once before the test
 */
export function setup() {
  console.log('Starting property registration load test');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Target: 100 concurrent users`);
  console.log(`Duration: ~16 minutes`);
}

/**
 * Teardown function - runs once after the test
 */
export function teardown(data) {
  console.log('Load test completed');
}
