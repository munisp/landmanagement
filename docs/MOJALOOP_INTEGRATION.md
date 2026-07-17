# Mojaloop Payment Integration Guide

## Overview

The IDLR-PTS platform integrates with **Mojaloop**, an open-source payment platform designed for financial inclusion in emerging markets. Mojaloop enables instant, interoperable digital payments across different Financial Service Providers (FSPs) in Africa.

## Architecture

### Components Implemented

1. **Mojaloop Client Service** (`server/mojaloopClient.ts`)
   - SDK-like interface for Mojaloop API interactions
   - Handles party lookups, quote requests, and transfer operations
   - Implements ILP (Interledger Protocol) packet generation
   - Automatic event logging for audit trails

2. **Payment Service** (`server/mojaloopPaymentService.ts`)
   - High-level business logic for property payments
   - Orchestrates complete payment flow: quote → transfer → completion
   - Payment status tracking and history
   - Reconciliation with blockchain escrow contracts

3. **Database Schema**
   - `mojaloop_transactions`: Main payment transaction records
   - `mojaloop_payment_events`: Audit log of all payment events
   - `mojaloop_fsp_config`: FSP connection configuration

### Payment Flow

```
1. Initiate Payment
   ↓
2. Request Quote from Mojaloop
   ↓
3. Receive Quote (amount + fees)
   ↓
4. User Approves Quote
   ↓
5. Prepare Transfer
   ↓
6. Commit Transfer (with fulfilment)
   ↓
7. Payment Completed
   ↓
8. Reconcile with Blockchain Escrow
```

## Database Schema

### mojaloop_transactions

Tracks all payment transactions through the Mojaloop network.

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL | Primary key |
| `transaction_id` | VARCHAR(128) | Unique Mojaloop transaction ID |
| `transfer_id` | VARCHAR(128) | Mojaloop transfer ID |
| `quote_id` | VARCHAR(128) | Mojaloop quote ID |
| `user_id` | INTEGER | User initiating payment |
| `property_id` | VARCHAR(64) | Related property/parcel ID |
| `escrow_contract_address` | VARCHAR(128) | Related smart contract |
| `amount` | REAL | Payment amount |
| `currency` | VARCHAR(3) | Currency code (ISO 4217) |
| `payer_fsp_id` | VARCHAR(64) | Payer's FSP ID |
| `payer_party_id_type` | VARCHAR(32) | MSISDN, ACCOUNT_ID, etc. |
| `payer_party_identifier` | VARCHAR(128) | Phone number or account ID |
| `payee_fsp_id` | VARCHAR(64) | Payee's FSP ID |
| `payee_party_id_type` | VARCHAR(32) | Party identifier type |
| `payee_party_identifier` | VARCHAR(128) | Payee identifier |
| `status` | ENUM | pending, quote_received, reserved, committed, completed, failed, rejected |
| `quote_amount` | REAL | Quoted amount (with fees) |
| `quote_fees` | REAL | Transaction fees |
| `transfer_condition` | TEXT | Cryptographic condition |
| `transfer_fulfilment` | TEXT | Cryptographic fulfilment |
| `transaction_type` | ENUM | transfer, property_purchase, registration_fee, survey_fee |
| `blockchain_tx_hash` | VARCHAR(128) | Related blockchain transaction |

### mojaloop_payment_events

Audit log of all payment lifecycle events.

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL | Primary key |
| `transaction_id` | VARCHAR(128) | Reference to transaction |
| `event_type` | VARCHAR(64) | QUOTE_REQUEST, TRANSFER_PREPARE, etc. |
| `event_status` | VARCHAR(32) | SUCCESS, FAILED, PENDING |
| `request_payload` | TEXT | JSON request payload |
| `response_payload` | TEXT | JSON response payload |
| `error_code` | VARCHAR(64) | Error code if failed |
| `fsp_id` | VARCHAR(64) | FSP that triggered event |

### mojaloop_fsp_config

FSP connection configuration.

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL | Primary key |
| `fsp_id` | VARCHAR(64) | FSP identifier |
| `fsp_name` | VARCHAR(255) | Human-readable name |
| `api_base_url` | VARCHAR(512) | FSP API endpoint |
| `api_version` | VARCHAR(16) | Mojaloop API version |
| `auth_token` | TEXT | API authentication token |
| `supported_currencies` | TEXT | Comma-separated currencies |
| `is_active` | BOOLEAN | Active status |

## API Usage

### Initialize Payment

```typescript
import { initiatePropertyPayment } from './server/mojaloopPaymentService';

const result = await initiatePropertyPayment({
  userId: 123,
  amount: '1000.00',
  currency: 'NGN',
  payerMsisdn: '+2348012345678',
  payeeMsisdn: '+2348087654321',
  propertyId: 'PROP-001',
  purpose: 'Property purchase payment',
  note: 'Payment for Plot 123 in Lagos',
});

console.log('Transaction ID:', result.transactionId);
console.log('Quoted Amount:', result.quotedAmount);
console.log('Fees:', result.fees);
```

### Execute Payment

```typescript
import { executePayment } from './server/mojaloopPaymentService';

const result = await executePayment(transactionId);

console.log('Transfer ID:', result.transferId);
console.log('Status:', result.status);
```

### Check Payment Status

```typescript
import { getPaymentStatus } from './server/mojaloopPaymentService';

const status = await getPaymentStatus(transactionId);

console.log('Status:', status.status);
console.log('Amount:', status.amount);
console.log('Completed:', status.completedAt);
```

### Get Payment History

```typescript
import { getUserPaymentHistory } from './server/mojaloopPaymentService';

const history = await getUserPaymentHistory(userId, 10);

history.forEach(payment => {
  console.log(`${payment.transactionId}: ${payment.amount} ${payment.currency} - ${payment.status}`);
});
```

## Configuration

### Setting Up FSP Connection

Before using Mojaloop payments, you must configure at least one FSP connection:

```sql
INSERT INTO mojaloop_fsp_config (
  fsp_id,
  fsp_name,
  api_base_url,
  api_version,
  auth_type,
  auth_token,
  supported_currencies,
  is_active,
  is_default
) VALUES (
  'my-fsp',
  'My Financial Service Provider',
  'https://api.myfsp.com/mojaloop',
  '1.1',
  'BEARER',
  'your-api-token-here',
  'NGN,USD,KES',
  true,
  true
);
```

### Environment Variables

No additional environment variables required - all configuration is stored in the database.

## Testing

Comprehensive test suite available in `server/mojaloopPayment.test.ts`:

```bash
pnpm test server/mojaloopPayment.test.ts
```

### Test Coverage

- ✅ Payment transaction creation
- ✅ Payment status retrieval
- ✅ Payment history tracking
- ✅ Payment cancellation
- ✅ Blockchain reconciliation
- ✅ Error handling
- ✅ Amount tracking
- ✅ Status validation

## Security

### ILP (Interledger Protocol)

All transfers use cryptographic conditions and fulfilments:

1. **Condition**: SHA-256 hash of the fulfilment
2. **Fulfilment**: 32-byte random value
3. **Transfer**: Only completes when correct fulfilment is provided

### Authentication

- FSP API calls use Bearer token authentication
- Tokens stored encrypted in database
- Support for mutual TLS (certificate-based auth)

### Audit Trail

Every payment operation is logged in `mojaloop_payment_events`:
- Request/response payloads
- Timestamps
- Error details
- FSP identifiers

## Integration with Blockchain Escrow

Payments can be reconciled with blockchain escrow contracts:

```typescript
import { reconcilePaymentWithEscrow } from './server/mojaloopPaymentService';

await reconcilePaymentWithEscrow(
  transactionId,
  blockchainTxHash
);
```

This links the Mojaloop payment with the on-chain escrow transaction for complete audit trail.

## Mojaloop Network Deployment

### Sandbox Environment

For testing, use the Mojaloop sandbox:

```
API Base URL: https://sandbox.mojaloop.io/api
API Version: 1.1
```

### Production Deployment

For production use, you need to:

1. **Register as an FSP** with your national Mojaloop hub
2. **Obtain API credentials** from the hub operator
3. **Configure your FSP** in the `mojaloop_fsp_config` table
4. **Test connectivity** with party lookups and small transfers
5. **Go live** after successful testing

### National Mojaloop Hubs

Several African countries have deployed Mojaloop hubs:

- **Tanzania**: Tanzania Instant Payment System (TIPS)
- **Rwanda**: Rwanda Integrated Payment Processing System (RIPPS)
- **Ghana**: Ghana Interbank Payment and Settlement Systems (GhIPSS)
- **Kenya**: Kenya Electronic Payment and Settlement System (KEPSS)

Contact your country's central bank or payment system operator for integration details.

## Error Handling

### Common Errors

| Error Code | Description | Resolution |
|------------|-------------|------------|
| `PARTY_NOT_FOUND` | Payee not found in network | Verify phone number/account ID |
| `QUOTE_EXPIRED` | Quote validity period passed | Request new quote |
| `INSUFFICIENT_FUNDS` | Payer has insufficient balance | Request user to fund account |
| `TRANSFER_FAILED` | Transfer could not be completed | Check error description for details |
| `FSP_UNREACHABLE` | Cannot connect to FSP | Check network connectivity |

### Retry Logic

The client automatically retries failed requests with exponential backoff. Payment events are logged even for failed attempts.

## Performance Considerations

### Quote Expiration

Quotes typically expire after 5 minutes. Execute transfers promptly after receiving quotes.

### Timeouts

- Party lookup: 10 seconds
- Quote request: 30 seconds
- Transfer prepare: 30 seconds
- Transfer commit: 30 seconds

### Rate Limits

Respect FSP rate limits (typically 100 requests/minute). The client handles rate limiting automatically.

## Monitoring

### Key Metrics

Monitor these metrics for payment health:

- **Quote success rate**: Should be > 95%
- **Transfer success rate**: Should be > 98%
- **Average quote time**: Should be < 2 seconds
- **Average transfer time**: Should be < 5 seconds
- **Failed payment rate**: Should be < 2%

### Alerts

Set up alerts for:

- Failed payment rate > 5%
- Quote expiration rate > 10%
- FSP connectivity issues
- Unusual transaction amounts

## Roadmap

### Phase 1 (Completed ✓)

- [x] Mojaloop client service
- [x] Payment service with business logic
- [x] Database schema
- [x] Payment status tracking
- [x] Payment history
- [x] Blockchain reconciliation
- [x] Comprehensive tests

### Phase 2 (Pending)

- [ ] tRPC procedures for frontend integration
- [ ] Payment UI components
- [ ] Webhook receivers for async notifications
- [ ] Payment notifications (email/SMS)
- [ ] Escrow contract integration
- [ ] Multi-currency support
- [ ] Refund handling

### Phase 3 (Future)

- [ ] Recurring payments
- [ ] Payment scheduling
- [ ] Bulk payments
- [ ] Payment analytics dashboard
- [ ] Fraud detection
- [ ] Compliance reporting

## Support

For Mojaloop-specific questions:

- **Documentation**: https://docs.mojaloop.io
- **Community Slack**: https://mojaloop.io/slack
- **GitHub**: https://github.com/mojaloop

For IDLR-PTS integration support:

- Check the test suite for usage examples
- Review the code comments in service files
- Consult the API documentation above

## License

Mojaloop is licensed under Apache License 2.0. The IDLR-PTS integration code follows the same license.
