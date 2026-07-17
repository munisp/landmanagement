# API Authentication Guide

## Overview

The IDLR Property Title System provides a secure REST API for third-party integrations. This guide covers authentication, authorization, rate limiting, and common operations.

## Authentication Methods

### 1. OAuth 2.0 (Recommended for User-Facing Applications)

The platform uses Manus OAuth for user authentication.

**Authorization Flow:**

```
1. Redirect user to: https://api.manus.im/oauth/authorize?client_id=YOUR_CLIENT_ID&redirect_uri=YOUR_CALLBACK&response_type=code
2. User approves access
3. System redirects to: YOUR_CALLBACK?code=AUTHORIZATION_CODE
4. Exchange code for token: POST /api/oauth/token
5. Use token in subsequent requests: Authorization: Bearer TOKEN
```

**Example (Node.js):**

```javascript
const axios = require('axios');

// Step 1: Get authorization URL
const authUrl = `https://api.manus.im/oauth/authorize?` +
  `client_id=${CLIENT_ID}&` +
  `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
  `response_type=code`;

// Step 2: Handle callback and exchange code
async function handleCallback(code) {
  const response = await axios.post('https://api.manus.im/oauth/token', {
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code'
  });
  
  return response.data.access_token;
}

// Step 3: Make authenticated requests
async function searchParcels(token, query) {
  const response = await axios.get('https://idlr-pts.manus.space/api/trpc/parcels.search', {
    headers: {
      'Authorization': `Bearer ${token}`
    },
    params: { input: JSON.stringify({ query }) }
  });
  
  return response.data.result.data;
}
```

### 2. API Keys (Recommended for Server-to-Server)

API keys provide simple authentication for backend integrations.

**Generating an API Key:**

1. Log in to your dashboard
2. Navigate to Settings → API Keys
3. Click "Generate New Key"
4. Copy the key (shown once)
5. Store securely in environment variables

**Using API Keys:**

```bash
curl -H "X-API-Key: your_api_key_here" \
  https://idlr-pts.manus.space/api/trpc/parcels.search?input=%7B%22query%22%3A%22Lagos%22%7D
```

**Example (Python):**

```python
import requests

API_KEY = "your_api_key_here"
BASE_URL = "https://idlr-pts.manus.space/api/trpc"

headers = {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json"
}

# Search parcels
response = requests.get(
    f"{BASE_URL}/parcels.search",
    headers=headers,
    params={"input": '{"query": "Lagos"}'}
)

parcels = response.json()["result"]["data"]
print(f"Found {len(parcels)} parcels")
```

## Rate Limiting

API requests are rate-limited to ensure fair usage:

| Tier | Requests/Minute | Requests/Day |
|------|-----------------|--------------|
| Free | 60 | 1,000 |
| Basic | 300 | 10,000 |
| Professional | 1,000 | 100,000 |
| Enterprise | Custom | Custom |

**Rate Limit Headers:**

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1640995200
```

**Handling Rate Limits:**

```javascript
async function makeRequestWithRetry(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const response = await fetch(url, options);
    
    if (response.status === 429) {
      const resetTime = response.headers.get('X-RateLimit-Reset');
      const waitTime = (resetTime * 1000) - Date.now();
      console.log(`Rate limited. Waiting ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      continue;
    }
    
    return response;
  }
  
  throw new Error('Max retries exceeded');
}
```

## Common Operations

### 1. Search Parcels

**Endpoint:** `GET /api/trpc/parcels.search`

**Parameters:**
- `query` (string): Search term (parcel ID, address, owner name)
- `status` (string, optional): Filter by status (active, pending, disputed)
- `limit` (number, optional): Results per page (default: 20, max: 100)
- `offset` (number, optional): Pagination offset

**Example:**

```javascript
const response = await fetch(
  'https://idlr-pts.manus.space/api/trpc/parcels.search?' +
  'input=' + encodeURIComponent(JSON.stringify({
    query: 'Victoria Island',
    status: 'active',
    limit: 50
  })),
  {
    headers: {
      'X-API-Key': API_KEY
    }
  }
);

const data = await response.json();
const parcels = data.result.data;
```

### 2. Get Parcel Details

**Endpoint:** `GET /api/trpc/parcels.getById`

**Parameters:**
- `id` (string): Parcel ID

**Example:**

```python
import requests

response = requests.get(
    "https://idlr-pts.manus.space/api/trpc/parcels.getById",
    headers={"X-API-Key": API_KEY},
    params={"input": '{"id": "LOS-VI-001"}'}
)

parcel = response.json()["result"]["data"]
print(f"Owner: {parcel['ownerName']}")
print(f"Address: {parcel['address']}")
print(f"Area: {parcel['area']} sqm")
```

### 3. Initiate Transaction

**Endpoint:** `POST /api/trpc/transactions.create`

**Parameters:**
- `parcelId` (string): Parcel ID
- `type` (string): Transaction type (sale, transfer, mortgage, gift)
- `amount` (number): Transaction amount
- `buyerEmail` (string): Buyer's email
- `buyerName` (string): Buyer's name

**Example:**

```javascript
const response = await fetch(
  'https://idlr-pts.manus.space/api/trpc/transactions.create',
  {
    method: 'POST',
    headers: {
      'X-API-Key': API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      parcelId: 'LOS-VI-001',
      type: 'sale',
      amount: 50000000,
      buyerEmail: 'buyer@example.com',
      buyerName: 'John Doe'
    })
  }
);

const transaction = await response.json();
console.log(`Transaction ID: ${transaction.result.data.id}`);
```

### 4. Submit Verification Request

**Endpoint:** `POST /api/trpc/verification.submit`

**Parameters:**
- `parcelId` (string): Parcel ID
- `type` (string): Verification type (ownership, boundary, valuation)
- `documents` (array): Document URLs

**Example:**

```python
import requests

response = requests.post(
    "https://idlr-pts.manus.space/api/trpc/verification.submit",
    headers={"X-API-Key": API_KEY},
    json={
        "parcelId": "LOS-VI-001",
        "type": "ownership",
        "documents": [
            "https://storage.example.com/doc1.pdf",
            "https://storage.example.com/doc2.pdf"
        ]
    }
)

verification = response.json()["result"]["data"]
print(f"Request ID: {verification['id']}")
print(f"Status: {verification['status']}")
```

### 5. Get Transaction Status

**Endpoint:** `GET /api/trpc/transactions.getStatus`

**Parameters:**
- `id` (number): Transaction ID

**Example:**

```bash
curl -H "X-API-Key: your_api_key" \
  "https://idlr-pts.manus.space/api/trpc/transactions.getStatus?input=%7B%22id%22%3A123%7D"
```

### 6. Verify Blockchain Transaction

**Endpoint:** `GET /api/trpc/blockchain.verify`

**Parameters:**
- `transactionHash` (string): Blockchain transaction hash

**Example:**

```javascript
const response = await fetch(
  'https://idlr-pts.manus.space/api/trpc/blockchain.verify?' +
  'input=' + encodeURIComponent(JSON.stringify({
    transactionHash: '0x1234567890abcdef'
  })),
  {
    headers: {
      'X-API-Key': API_KEY
    }
  }
);

const verification = await response.json();
console.log(`Block: ${verification.result.data.blockNumber}`);
console.log(`Confirmations: ${verification.result.data.confirmations}`);
```

## Webhooks

Subscribe to real-time events via webhooks.

**Supported Events:**
- `transaction.created` - New transaction initiated
- `transaction.approved` - Transaction approved by registrar
- `transaction.completed` - Transaction completed and recorded on blockchain
- `transaction.rejected` - Transaction rejected
- `verification.submitted` - Verification request submitted
- `verification.approved` - Verification approved
- `verification.rejected` - Verification rejected

**Setting Up Webhooks:**

1. Navigate to Settings → Webhooks
2. Click "Add Webhook"
3. Enter your endpoint URL
4. Select events to subscribe to
5. Save and copy the signing secret

**Webhook Payload:**

```json
{
  "event": "transaction.completed",
  "timestamp": "2026-02-18T12:00:00Z",
  "data": {
    "id": 123,
    "parcelId": "LOS-VI-001",
    "type": "sale",
    "amount": 50000000,
    "blockchainHash": "0x1234567890abcdef"
  }
}
```

**Verifying Webhook Signatures:**

```javascript
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = hmac.update(payload).digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(digest)
  );
}

// Express.js example
app.post('/webhooks/idlr', express.raw({type: 'application/json'}), (req, res) => {
  const signature = req.headers['x-idlr-signature'];
  const isValid = verifyWebhookSignature(req.body, signature, WEBHOOK_SECRET);
  
  if (!isValid) {
    return res.status(401).send('Invalid signature');
  }
  
  const event = JSON.parse(req.body);
  console.log(`Received event: ${event.event}`);
  
  // Process event
  
  res.status(200).send('OK');
});
```

## Error Handling

**Error Response Format:**

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid API key",
    "details": {
      "timestamp": "2026-02-18T12:00:00Z"
    }
  }
}
```

**Common Error Codes:**

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `UNAUTHORIZED` | 401 | Invalid or missing authentication |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `RATE_LIMITED` | 429 | Too many requests |
| `VALIDATION_ERROR` | 400 | Invalid request parameters |
| `INTERNAL_ERROR` | 500 | Server error |

**Example Error Handling:**

```python
try:
    response = requests.get(url, headers=headers)
    response.raise_for_status()
    data = response.json()
except requests.exceptions.HTTPError as e:
    if e.response.status_code == 401:
        print("Authentication failed. Check your API key.")
    elif e.response.status_code == 429:
        print("Rate limit exceeded. Retry after:", e.response.headers.get('X-RateLimit-Reset'))
    else:
        print(f"HTTP error: {e}")
except requests.exceptions.RequestException as e:
    print(f"Request failed: {e}")
```

## Best Practices

1. **Store API keys securely** - Use environment variables, never commit to version control
2. **Implement exponential backoff** - Retry failed requests with increasing delays
3. **Cache responses** - Reduce API calls by caching frequently accessed data
4. **Use webhooks for real-time updates** - More efficient than polling
5. **Validate input** - Check parameters before making requests
6. **Monitor rate limits** - Track usage to avoid hitting limits
7. **Handle errors gracefully** - Implement proper error handling and logging
8. **Use HTTPS** - Always use secure connections
9. **Rotate API keys regularly** - Update keys periodically for security
10. **Test in sandbox** - Use test environment before production deployment

## SDK Libraries

Official SDKs are available for popular languages:

- **JavaScript/TypeScript**: `npm install @idlr/sdk`
- **Python**: `pip install idlr-sdk`
- **PHP**: `composer require idlr/sdk`
- **Java**: Maven/Gradle available
- **Ruby**: `gem install idlr-sdk`

**Example (JavaScript SDK):**

```javascript
const { IDLRClient } = require('@idlr/sdk');

const client = new IDLRClient({
  apiKey: process.env.IDLR_API_KEY
});

// Search parcels
const parcels = await client.parcels.search({ query: 'Lagos' });

// Get parcel details
const parcel = await client.parcels.getById('LOS-VI-001');

// Create transaction
const transaction = await client.transactions.create({
  parcelId: 'LOS-VI-001',
  type: 'sale',
  amount: 50000000
});
```

## Support

- **Documentation**: https://docs.idlr-pts.manus.space
- **API Status**: https://status.idlr-pts.manus.space
- **Support Email**: api-support@idlr-pts.gov.ng
- **Developer Forum**: https://forum.idlr-pts.manus.space

## Changelog

### v1.0.0 (2026-02-18)
- Initial API release
- OAuth 2.0 authentication
- API key authentication
- Rate limiting
- Webhook support
- Search, transaction, and verification endpoints
