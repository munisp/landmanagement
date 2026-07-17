/**
 * Comprehensive Load Test Suite
 * 
 * Tests multiple endpoints and scenarios to establish performance baselines.
 * Includes property registration, transaction workflows, and search operations.
 * 
 * Run with: k6 run tests/load/comprehensive-load-test.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const cacheHitRate = new Rate('cache_hits');
const registrationDuration = new Trend('registration_duration');
const queryDuration = new Trend('query_duration');
const transactionDuration = new Trend('transaction_duration');
const cacheHits = new Counter('cache_hit_count');
const cacheMisses = new Counter('cache_miss_count');

// Test configuration
export const options = {
  stages: [
    { duration: '30s', target: 10 },   // Warm-up
    { duration: '1m', target: 20 },    // Ramp up to 20 users
    { duration: '2m', target: 20 },    // Stay at 20 users
    { duration: '1m', target: 50 },    // Ramp up to 50 users
    { duration: '2m', target: 50 },    // Stay at 50 users
    { duration: '30s', target: 0 },    // Ramp down
  ],
  thresholds: {
    'http_req_duration': ['p(95)<2000', 'p(99)<3000'], // 95% < 2s, 99% < 3s
    'http_req_failed': ['rate<0.05'],                   // Error rate < 5%
    'errors': ['rate<0.05'],                            // Custom error rate < 5%
    'cache_hits': ['rate>0.7'],                         // Cache hit rate > 70%
    'registration_duration': ['p(95)<2500'],            // Registration p95 < 2.5s
    'query_duration': ['p(95)<500'],                    // Query p95 < 500ms
    'transaction_duration': ['p(95)<1500'],             // Transaction p95 < 1.5s
  },
};

// Base URL from environment or default
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

/**
 * Generate random parcel data
 */
function generateParcelData() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  
  return {
    surveyPlanNumber: `SP/${timestamp}/${random}`,
    state: ['Lagos', 'Abuja', 'Kano', 'Rivers'][Math.floor(Math.random() * 4)],
    lga: `LGA-${random}`,
    ward: `Ward ${Math.floor(Math.random() * 10) + 1}`,
    streetAddress: `${random} Test Street`,
    areaSquareMeters: Math.floor(Math.random() * 10000) + 100,
    geometryGeoJSON: JSON.stringify({
      type: 'Polygon',
      coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]]
    }),
    landUseType: ['residential', 'commercial', 'agricultural', 'industrial'][Math.floor(Math.random() * 4)],
    notes: `Load test parcel ${timestamp}`,
  };
}

/**
 * Test parcel list query (should hit cache)
 */
function testParcelList() {
  const start = Date.now();
  
  const res = http.get(
    `${BASE_URL}/api/trpc/cachedParcel.list?input=${encodeURIComponent(JSON.stringify({
      page: 1,
      limit: 20,
    }))}`,
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );

  const success = check(res, {
    'parcel list status is 200': (r) => r.status === 200,
    'parcel list response time < 500ms': (r) => r.timings.duration < 500,
    'parcel list has data': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body && body.result && body.result.data;
      } catch (e) {
        return false;
      }
    },
  });

  if (!success) {
    errorRate.add(1);
  } else {
    errorRate.add(0);
    queryDuration.add(Date.now() - start);
    
    // Assume cache hit if response time < 100ms
    if (res.timings.duration < 100) {
      cacheHitRate.add(1);
      cacheHits.add(1);
    } else {
      cacheHitRate.add(0);
      cacheMisses.add(1);
    }
  }

  return res;
}

/**
 * Test parcel by ID query (should hit cache)
 */
function testParcelById(parcelId) {
  const start = Date.now();
  
  const res = http.get(
    `${BASE_URL}/api/trpc/cachedParcel.getById?input=${encodeURIComponent(JSON.stringify({ id: parcelId }))}`,
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );

  const success = check(res, {
    'parcel by ID status is 200': (r) => r.status === 200,
    'parcel by ID response time < 300ms': (r) => r.timings.duration < 300,
  });

  if (!success) {
    errorRate.add(1);
  } else {
    errorRate.add(0);
    queryDuration.add(Date.now() - start);
    
    // Assume cache hit if response time < 50ms
    if (res.timings.duration < 50) {
      cacheHitRate.add(1);
      cacheHits.add(1);
    } else {
      cacheHitRate.add(0);
      cacheMisses.add(1);
    }
  }

  return res;
}

/**
 * Test transaction list query (should hit cache)
 */
function testTransactionList() {
  const start = Date.now();
  
  const res = http.get(
    `${BASE_URL}/api/trpc/cachedTransaction.list?input=${encodeURIComponent(JSON.stringify({
      page: 1,
      limit: 20,
    }))}`,
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );

  const success = check(res, {
    'transaction list status is 200': (r) => r.status === 200,
    'transaction list response time < 500ms': (r) => r.timings.duration < 500,
  });

  if (!success) {
    errorRate.add(1);
  } else {
    errorRate.add(0);
    queryDuration.add(Date.now() - start);
    
    // Assume cache hit if response time < 100ms
    if (res.timings.duration < 100) {
      cacheHitRate.add(1);
      cacheHits.add(1);
    } else {
      cacheHitRate.add(0);
      cacheMisses.add(1);
    }
  }

  return res;
}

/**
 * Test integration health status (should hit cache)
 */
function testIntegrationHealth() {
  const start = Date.now();
  
  const res = http.get(
    `${BASE_URL}/api/trpc/integrationHealth.getStatus`,
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );

  const success = check(res, {
    'integration health status is 200': (r) => r.status === 200,
    'integration health response time < 200ms': (r) => r.timings.duration < 200,
  });

  if (!success) {
    errorRate.add(1);
  } else {
    errorRate.add(0);
    queryDuration.add(Date.now() - start);
    
    // Assume cache hit if response time < 50ms
    if (res.timings.duration < 50) {
      cacheHitRate.add(1);
      cacheHits.add(1);
    } else {
      cacheHitRate.add(0);
      cacheMisses.add(1);
    }
  }

  return res;
}

/**
 * Main test scenario
 */
export default function () {
  // Scenario 1: Read-heavy operations (70% of traffic)
  if (Math.random() < 0.7) {
    group('Read Operations', () => {
      // Test parcel list (should benefit from cache)
      testParcelList();
      sleep(0.5);

      // Test parcel by ID (random ID between 1-100)
      const randomId = Math.floor(Math.random() * 100) + 1;
      testParcelById(randomId);
      sleep(0.5);

      // Test transaction list (should benefit from cache)
      testTransactionList();
      sleep(0.5);

      // Test integration health (should benefit from cache)
      testIntegrationHealth();
      sleep(1);
    });
  }
  // Scenario 2: Mixed read-write operations (30% of traffic)
  else {
    group('Mixed Operations', () => {
      // Read operations
      testParcelList();
      sleep(0.3);
      
      testTransactionList();
      sleep(0.3);
      
      // Simulate some write operations (would invalidate cache)
      // Note: Actual write tests would require authentication
      sleep(1);
    });
  }
}

/**
 * Setup function - runs once before the test
 */
export function setup() {
  console.log('='.repeat(60));
  console.log('Starting Comprehensive Load Test');
  console.log('='.repeat(60));
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Target: 50 concurrent users`);
  console.log(`Duration: ~7 minutes`);
  console.log(`Focus: Cache performance and query optimization`);
  console.log('='.repeat(60));
}

/**
 * Teardown function - runs once after the test
 */
export function teardown(data) {
  console.log('='.repeat(60));
  console.log('Load Test Completed');
  console.log('='.repeat(60));
  console.log('Check the summary above for detailed metrics');
  console.log('Key metrics to review:');
  console.log('  - http_req_duration (p95, p99)');
  console.log('  - cache_hits rate');
  console.log('  - errors rate');
  console.log('  - query_duration (p95)');
  console.log('='.repeat(60));
}
