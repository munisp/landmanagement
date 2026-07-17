import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

/**
 * Load Testing Script for IDLR Property Title System
 * Tests system performance under various load conditions
 * 
 * Run with: k6 run tests/load/load-test.js
 */

// Custom metrics
const errorRate = new Rate('errors');
const apiResponseTime = new Trend('api_response_time');
const successfulRequests = new Counter('successful_requests');
const failedRequests = new Counter('failed_requests');

// Test configuration
export const options = {
  stages: [
    // Ramp-up: 0 to 100 users over 2 minutes
    { duration: '2m', target: 100 },
    
    // Steady state: 100 users for 5 minutes
    { duration: '5m', target: 100 },
    
    // Peak load: 100 to 500 users over 2 minutes
    { duration: '2m', target: 500 },
    
    // Peak steady state: 500 users for 5 minutes
    { duration: '5m', target: 500 },
    
    // Spike test: 500 to 1000 users over 1 minute
    { duration: '1m', target: 1000 },
    
    // Spike duration: 1000 users for 2 minutes
    { duration: '2m', target: 1000 },
    
    // Ramp-down: 1000 to 0 users over 2 minutes
    { duration: '2m', target: 0 },
  ],
  
  thresholds: {
    // 95% of requests should complete within 500ms
    'http_req_duration': ['p(95)<500'],
    
    // Error rate should be below 1%
    'errors': ['rate<0.01'],
    
    // 99% of requests should succeed
    'http_req_failed': ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'https://3000-i2kpd0epddc1drfazpruu-b4331c77.us2.manus.computer';

// Mock authentication token
const AUTH_TOKEN = 'mock_token_for_load_testing';

export function setup() {
  // Setup phase: create test data
  console.log('Setting up load test...');
  
  return {
    timestamp: new Date().toISOString(),
  };
}

export default function (data) {
  // Simulate realistic user behavior
  
  group('Home Page', () => {
    const res = http.get(`${BASE_URL}/`);
    
    check(res, {
      'home page status is 200': (r) => r.status === 200,
      'home page loads in <500ms': (r) => r.timings.duration < 500,
    }) || errorRate.add(1);
    
    apiResponseTime.add(res.timings.duration);
    
    if (res.status === 200) {
      successfulRequests.add(1);
    } else {
      failedRequests.add(1);
    }
    
    sleep(1);
  });
  
  group('Parcel Search API', () => {
    const params = {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json',
      },
    };
    
    const res = http.get(`${BASE_URL}/api/trpc/parcels.search?input={"state":"Lagos"}`, params);
    
    check(res, {
      'parcel search status is 200': (r) => r.status === 200,
      'parcel search returns data': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.result && body.result.data;
        } catch {
          return false;
        }
      },
      'parcel search completes in <1s': (r) => r.timings.duration < 1000,
    }) || errorRate.add(1);
    
    apiResponseTime.add(res.timings.duration);
    
    if (res.status === 200) {
      successfulRequests.add(1);
    } else {
      failedRequests.add(1);
    }
    
    sleep(2);
  });
  
  group('Transaction Initiation', () => {
    const payload = JSON.stringify({
      parcelId: `LOAD-TEST-${__VU}-${__ITER}`,
      type: 'transfer',
      recipient: 'Load Test Recipient',
      amount: 50000000,
    });
    
    const params = {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json',
      },
    };
    
    const res = http.post(`${BASE_URL}/api/trpc/transactions.initiate`, payload, params);
    
    check(res, {
      'transaction initiation status is 200 or 201': (r) => r.status === 200 || r.status === 201,
      'transaction initiation completes in <2s': (r) => r.timings.duration < 2000,
    }) || errorRate.add(1);
    
    apiResponseTime.add(res.timings.duration);
    
    if (res.status === 200 || res.status === 201) {
      successfulRequests.add(1);
    } else {
      failedRequests.add(1);
    }
    
    sleep(3);
  });
  
  group('Document Upload', () => {
    const payload = JSON.stringify({
      parcelId: `LOAD-TEST-${__VU}-${__ITER}`,
      type: 'title_deed',
      filename: 'load-test-document.pdf',
      url: 'https://example.com/mock-document.pdf',
    });
    
    const params = {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json',
      },
    };
    
    const res = http.post(`${BASE_URL}/api/trpc/documents.upload`, payload, params);
    
    check(res, {
      'document upload status is 200 or 201': (r) => r.status === 200 || r.status === 201,
      'document upload completes in <3s': (r) => r.timings.duration < 3000,
    }) || errorRate.add(1);
    
    apiResponseTime.add(res.timings.duration);
    
    if (res.status === 200 || res.status === 201) {
      successfulRequests.add(1);
    } else {
      failedRequests.add(1);
    }
    
    sleep(2);
  });
  
  group('Analytics Dashboard', () => {
    const params = {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json',
      },
    };
    
    const res = http.get(`${BASE_URL}/api/trpc/stats.overview`, params);
    
    check(res, {
      'analytics status is 200': (r) => r.status === 200,
      'analytics loads in <1.5s': (r) => r.timings.duration < 1500,
    }) || errorRate.add(1);
    
    apiResponseTime.add(res.timings.duration);
    
    if (res.status === 200) {
      successfulRequests.add(1);
    } else {
      failedRequests.add(1);
    }
    
    sleep(4);
  });
  
  group('Blockchain Verification', () => {
    const params = {
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json',
      },
    };
    
    const res = http.get(`${BASE_URL}/api/trpc/blockchain.verify?input={"parcelId":"LOAD-TEST-${__VU}"}`, params);
    
    check(res, {
      'blockchain verification status is 200': (r) => r.status === 200,
      'blockchain verification completes in <2s': (r) => r.timings.duration < 2000,
    }) || errorRate.add(1);
    
    apiResponseTime.add(res.timings.duration);
    
    if (res.status === 200) {
      successfulRequests.add(1);
    } else {
      failedRequests.add(1);
    }
    
    sleep(3);
  });
  
  // Random think time between 1-5 seconds
  sleep(Math.random() * 4 + 1);
}

export function teardown(data) {
  // Cleanup phase
  console.log('Load test completed at:', new Date().toISOString());
  console.log('Test started at:', data.timestamp);
}

/**
 * Load Test Scenarios:
 * 
 * 1. Smoke Test (quick validation):
 *    k6 run --vus 1 --duration 30s tests/load/load-test.js
 * 
 * 2. Average Load Test:
 *    k6 run --vus 100 --duration 5m tests/load/load-test.js
 * 
 * 3. Stress Test:
 *    k6 run --vus 500 --duration 10m tests/load/load-test.js
 * 
 * 4. Spike Test:
 *    k6 run --stage 1m:0,1m:1000,1m:0 tests/load/load-test.js
 * 
 * 5. Soak Test (endurance):
 *    k6 run --vus 100 --duration 4h tests/load/load-test.js
 */
