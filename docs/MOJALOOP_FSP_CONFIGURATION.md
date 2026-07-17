# Mojaloop Financial Service Provider (FSP) Configuration Guide

**Author:** Manus AI  
**Last Updated:** February 20, 2026  
**Version:** 1.0

---

## Executive Summary

This comprehensive guide provides detailed instructions for configuring and integrating your IDLR-PTS platform with a Mojaloop Financial Service Provider (FSP) to enable real-time payment processing for property transactions across Africa. Mojaloop is an open-source instant payment platform designed specifically for emerging markets, supporting interoperable digital financial services at national scale.

The integration enables secure, transparent property transaction payments with automatic escrow management through Polygon blockchain smart contracts, creating an end-to-end solution from payment initiation to blockchain-verified property title transfer.

---

## Table of Contents

1. [Understanding Mojaloop Architecture](#understanding-mojaloop-architecture)
2. [FSP Registration Process](#fsp-registration-process)
3. [Environment Configuration](#environment-configuration)
4. [API Endpoint Setup](#api-endpoint-setup)
5. [Authentication & Security](#authentication--security)
6. [Testing & Validation](#testing--validation)
7. [Production Deployment](#production-deployment)
8. [Monitoring & Troubleshooting](#monitoring--troubleshooting)
9. [Compliance & Regulatory Requirements](#compliance--regulatory-requirements)

---

## Understanding Mojaloop Architecture

Mojaloop operates as a national-level payment switch connecting multiple Financial Service Providers (FSPs) through a central hub. The architecture consists of several key components that work together to enable instant, interoperable payments.

### Core Components

**Mojaloop Hub** serves as the central clearing and settlement system, routing transactions between participating FSPs while maintaining a central ledger for all payment activities. The hub ensures atomicity of transactions through a two-phase commit protocol, guaranteeing that funds are either successfully transferred or fully rolled back.

**Account Lookup Service (ALS)** provides directory services for locating account holders across different FSPs. When a payment is initiated, the ALS queries all participating FSPs to identify which institution holds the recipient's account, enabling seamless cross-FSP transactions.

**Central Ledger** maintains the authoritative record of all transactions and FSP positions within the system. It tracks net settlement positions for each FSP and coordinates the actual movement of funds through the central bank or designated settlement institution.

**FSP Adapters** are the integration points where your IDLR-PTS platform connects to the Mojaloop network. These adapters translate between your internal APIs and the standardized Mojaloop protocol, handling message formatting, cryptographic operations, and state management.

### Transaction Flow

A typical Mojaloop transaction proceeds through several distinct phases, each with specific responsibilities and validation requirements. Understanding this flow is essential for proper integration and error handling.

**Discovery Phase** begins when a payer initiates a transaction by providing the payee's identifier (phone number, account number, or other supported identifier type). The system queries the Account Lookup Service to determine which FSP holds the payee's account, establishing the routing path for the transaction.

**Agreement Phase** involves requesting a quote from the payee's FSP to determine the exact amount that will be received, including any fees or foreign exchange conversions. The quote includes an expiration time and cryptographic conditions that must be fulfilled for the transaction to complete. Both parties review and accept the terms before proceeding.

**Transfer Phase** executes the actual movement of funds through a two-phase commit protocol. The payer's FSP first reserves the funds (prepare phase), then the Mojaloop hub coordinates with both FSPs to either commit the transaction (if all conditions are met) or abort and release the reserved funds (if any validation fails).

**Settlement Phase** occurs periodically (typically daily or in real-time for high-value transactions) when FSPs reconcile their net positions with the central bank or settlement institution. This ensures that the digital ledger positions maintained by Mojaloop are backed by actual funds movement in the traditional banking system.

### Integration Points

Your IDLR-PTS platform integrates with Mojaloop through several standardized API endpoints that must be implemented on both sides of the connection.

**Outbound APIs** are called by your platform to initiate transactions, request quotes, and query transaction status. These APIs follow the Mojaloop specification for request formatting, including required headers, cryptographic signatures, and idempotency keys.

**Inbound APIs** must be implemented by your platform to receive callbacks from the Mojaloop hub, including quote responses, transfer notifications, and error messages. Your platform must respond to these callbacks within strict time limits (typically 30 seconds) to avoid transaction timeouts.

**Webhook Endpoints** provide asynchronous notifications for transaction state changes, allowing your platform to update user interfaces and trigger business logic (such as releasing escrow funds) when payments complete successfully or fail.

---

## FSP Registration Process

Becoming a registered Financial Service Provider within a Mojaloop network requires coordination with the national payment system operator and completion of several technical and regulatory requirements.

### Prerequisites

Before beginning the registration process, ensure your organization meets the fundamental requirements for FSP participation. You must hold appropriate financial services licenses in your operating jurisdiction, as Mojaloop networks are typically regulated at the national level by central banks or designated payment system operators.

Technical infrastructure requirements include maintaining highly available systems with 99.9% uptime SLA, implementing robust security controls including HSM-based cryptographic key management, and demonstrating capacity to handle peak transaction volumes for your expected user base. Most Mojaloop networks require FSPs to process at least 100 transactions per second during peak periods.

Operational capabilities must include 24/7 monitoring and support, established incident response procedures, and participation in network-wide testing and disaster recovery exercises. You will need dedicated technical staff familiar with the Mojaloop protocol and able to troubleshoot integration issues in real-time.

### Registration Steps

**Step 1: Contact National Payment System Operator**

Identify the organization operating the Mojaloop hub in your target country. This is typically the central bank, a designated payment system operator, or a consortium of financial institutions. Submit a formal expression of interest including your business case, expected transaction volumes, and technical readiness assessment.

**Step 2: Complete Regulatory Review**

The payment system operator will review your financial services licenses, capital adequacy, and compliance with national payment system regulations. This process typically takes 2-4 months and may require submission of detailed business plans, financial statements, and risk management frameworks.

**Step 3: Technical Onboarding**

Once regulatory approval is granted, you will receive access to the Mojaloop sandbox environment for integration development and testing. The payment system operator will provide:

- FSP identifier (DFSP ID) uniquely identifying your institution within the network
- API endpoint URLs for sandbox and production environments
- Technical documentation including API specifications and integration guides
- Cryptographic certificates for mutual TLS authentication
- Access to monitoring dashboards and transaction logs

**Step 4: Integration Development**

Implement the required Mojaloop APIs in your IDLR-PTS platform using the provided specifications. The platform already includes a complete Mojaloop client implementation in `server/mojaloopClient.ts` and payment service in `server/mojaloopPaymentService.ts`, significantly reducing development time.

Configure the environment variables documented in the next section, pointing to the sandbox environment URLs provided by your payment system operator. Implement the required webhook endpoints to receive transaction callbacks.

**Step 5: Certification Testing**

Complete the mandatory certification test suite provided by the payment system operator. This typically includes:

- Successful payment scenarios (various amounts, currencies, identifier types)
- Error handling (insufficient funds, invalid accounts, timeout scenarios)
- Security testing (signature validation, certificate handling, replay attack prevention)
- Performance testing (sustained throughput, peak load handling)
- Disaster recovery testing (failover procedures, data reconciliation)

Certification usually requires achieving 100% pass rate on all test scenarios over a sustained period (typically 2-4 weeks of continuous testing).

**Step 6: Production Migration**

After successful certification, schedule a production cutover date with the payment system operator. Update environment variables to point to production endpoints, install production cryptographic certificates, and complete final security audits.

The payment system operator will typically require a phased rollout, starting with a small percentage of transactions and gradually increasing as system stability is demonstrated. Full production status is usually granted after 30 days of successful operation.

---

## Environment Configuration

The IDLR-PTS platform requires several environment variables to be configured for Mojaloop integration. These variables control connection endpoints, authentication credentials, and operational parameters.

### Required Environment Variables

Add the following variables to your production environment. Never commit these values to source control; use your deployment platform's secret management system or a secure environment variable management solution.

```bash
# Mojaloop FSP Configuration
MOJALOOP_FSP_ID=your-fsp-identifier
MOJALOOP_API_URL=https://api.mojaloop.example.com
MOJALOOP_API_KEY=your-api-key-here
MOJALOOP_WEBHOOK_SECRET=your-webhook-signing-secret

# FSP Details
MOJALOOP_FSP_NAME="Your Organization Name"
MOJALOOP_CURRENCY=USD
MOJALOOP_DEFAULT_FEE_PERCENTAGE=1.5

# TLS Certificate Paths (for mutual TLS)
MOJALOOP_CLIENT_CERT_PATH=/path/to/client-cert.pem
MOJALOOP_CLIENT_KEY_PATH=/path/to/client-key.pem
MOJALOOP_CA_CERT_PATH=/path/to/ca-cert.pem

# Timeout Configuration (milliseconds)
MOJALOOP_REQUEST_TIMEOUT=30000
MOJALOOP_QUOTE_EXPIRY=60000

# Retry Configuration
MOJALOOP_MAX_RETRIES=3
MOJALOOP_RETRY_DELAY=1000
```

### Variable Descriptions

**MOJALOOP_FSP_ID** is your unique identifier within the Mojaloop network, assigned during the registration process. This identifier appears in all transaction messages and is used by the Account Lookup Service to route transactions to your platform.

**MOJALOOP_API_URL** points to the base URL of the Mojaloop hub API. This will be different for sandbox and production environments. Ensure you update this variable when migrating from testing to production.

**MOJALOOP_API_KEY** authenticates your platform to the Mojaloop hub. This key should be rotated regularly (recommended every 90 days) and stored securely using your platform's secret management system. The key provides full access to initiate transactions and query account information.

**MOJALOOP_WEBHOOK_SECRET** is used to verify the authenticity of webhook callbacks from the Mojaloop hub. Your platform validates the HMAC signature on incoming webhooks using this secret, preventing spoofed transaction notifications.

**MOJALOOP_FSP_NAME** is the human-readable name of your organization displayed to users during transaction confirmation. Keep this concise and recognizable to your customers.

**MOJALOOP_CURRENCY** specifies the default currency for transactions. While Mojaloop supports multi-currency transactions with automatic conversion, most FSPs operate primarily in their local currency.

**MOJALOOP_DEFAULT_FEE_PERCENTAGE** sets the transaction fee charged to payers. This fee is added to the transaction amount and collected by your FSP. Fees must comply with national payment system regulations, which often cap maximum fees for small-value transactions.

**TLS Certificate Paths** point to the cryptographic certificates used for mutual TLS authentication with the Mojaloop hub. These certificates are provided during the registration process and must be kept secure. Certificate expiration typically occurs annually and requires renewal through the payment system operator.

**Timeout Configuration** controls how long your platform waits for responses from the Mojaloop hub before considering a request failed. The default 30-second timeout aligns with Mojaloop specifications, but may need adjustment based on network conditions.

**Retry Configuration** determines how your platform handles transient failures when communicating with the Mojaloop hub. The default configuration retries failed requests up to 3 times with exponential backoff, balancing reliability against the risk of duplicate transactions.

### Configuration Validation

After setting environment variables, use the provided validation script to verify connectivity and authentication:

```bash
cd /home/ubuntu/idlr-pts-platform
npx tsx scripts/validate-mojaloop-config.ts
```

This script performs the following checks:

- Validates all required environment variables are present
- Tests connectivity to the Mojaloop API endpoint
- Verifies API key authentication
- Checks TLS certificate validity and expiration dates
- Confirms webhook endpoint accessibility
- Validates currency and fee configuration

Address any errors reported by the validation script before proceeding to production deployment.

---

## API Endpoint Setup

Your IDLR-PTS platform must implement several API endpoints to receive callbacks and webhooks from the Mojaloop hub. These endpoints are already implemented in the codebase but require proper configuration and security hardening for production use.

### Webhook Endpoints

The platform exposes webhook endpoints at `/api/mojaloop/webhooks/*` to receive transaction notifications from the Mojaloop hub. These endpoints are implemented in `server/routers.ts` under the `mojaloopPayments` router.

**Quote Response Webhook** (`POST /api/mojaloop/webhooks/quotes`) receives quote responses from the payee's FSP, including the exact amount to be received and any applicable fees. The endpoint validates the quote signature, checks expiration time, and updates the transaction record in the database.

**Transfer Notification Webhook** (`POST /api/mojaloop/webhooks/transfers`) receives notifications when transfers complete successfully or fail. The endpoint processes the notification, updates transaction status, and triggers escrow contract interactions (release funds on success, refund on failure).

**Error Notification Webhook** (`POST /api/mojaloop/webhooks/errors`) receives error notifications for failed transactions, including detailed error codes and descriptions. The endpoint logs errors for monitoring and notifies users of transaction failures.

### Webhook Security

All webhook endpoints implement HMAC signature validation to prevent spoofed notifications. The validation process follows these steps:

1. Extract the `X-Mojaloop-Signature` header from the incoming request
2. Compute HMAC-SHA256 of the request body using `MOJALOOP_WEBHOOK_SECRET`
3. Compare computed signature with provided signature using constant-time comparison
4. Reject requests with invalid or missing signatures

Additionally, webhooks implement replay attack prevention by tracking processed transaction IDs and rejecting duplicate notifications. The platform maintains a 24-hour window of processed transaction IDs in Redis cache.

### Public Endpoint Configuration

Webhook endpoints must be publicly accessible from the internet for the Mojaloop hub to deliver notifications. Configure your firewall and load balancer to allow inbound HTTPS traffic on port 443 from the Mojaloop hub's IP addresses (provided by your payment system operator).

If your platform runs behind a reverse proxy or API gateway, ensure the following headers are properly forwarded to your application:

- `X-Forwarded-For` (client IP address)
- `X-Forwarded-Proto` (original protocol, should be https)
- `X-Mojaloop-Signature` (webhook signature)
- `X-Mojaloop-Transaction-ID` (transaction identifier)

### Endpoint Monitoring

Implement monitoring for webhook endpoints to detect and respond to issues quickly. Key metrics to track include:

- **Endpoint availability** - Alert if webhook endpoints return 5xx errors or become unreachable
- **Response time** - Mojaloop requires webhook responses within 30 seconds; alert if p95 latency exceeds 10 seconds
- **Signature validation failures** - High rates of signature failures may indicate configuration issues or security attacks
- **Transaction processing errors** - Track errors in business logic after successful webhook delivery

Configure alerts to notify your operations team immediately when webhook endpoints experience issues, as transaction failures directly impact user experience and revenue.

---

## Authentication & Security

Mojaloop implements multiple layers of security to protect transaction data and prevent unauthorized access. Your platform must correctly implement all security mechanisms to participate in the network.

### Mutual TLS Authentication

All communication with the Mojaloop hub uses mutual TLS (mTLS), where both client and server present certificates to authenticate each other. This prevents man-in-the-middle attacks and ensures only authorized FSPs can access the network.

**Certificate Management** requires storing your client certificate and private key securely, typically in a Hardware Security Module (HSM) or secure key management service. Never store private keys in source control or unencrypted configuration files.

Certificate renewal must occur before expiration (typically annually). The payment system operator will provide new certificates 30 days before expiration. Plan a maintenance window to install new certificates and restart services with zero downtime using rolling deployments.

**Certificate Validation** on incoming connections verifies that the Mojaloop hub presents a valid certificate signed by the trusted Certificate Authority. Your platform should reject connections with expired, self-signed, or untrusted certificates.

### API Key Authentication

In addition to mTLS, API requests include an API key in the `Authorization` header using the Bearer token scheme:

```
Authorization: Bearer your-api-key-here
```

API keys should be rotated regularly (every 90 days recommended) and immediately if compromise is suspected. The payment system operator provides a key rotation API that generates new keys while keeping old keys valid for a grace period (typically 24 hours) to allow zero-downtime rotation.

### Request Signing

Critical requests (transfers, quotes) include cryptographic signatures to ensure message integrity and non-repudiation. The Mojaloop protocol uses JWS (JSON Web Signature) with RS256 algorithm.

**Signing Process:**

1. Serialize the request body to canonical JSON (sorted keys, no whitespace)
2. Compute SHA-256 hash of the canonical JSON
3. Sign the hash using your RSA private key
4. Base64-encode the signature and include in `X-Mojaloop-Signature` header

**Signature Verification** on incoming webhooks follows the reverse process, using the Mojaloop hub's public key to verify signatures. Reject any requests with invalid or missing signatures.

### Idempotency

Mojaloop requires all state-changing requests to include an idempotency key in the `X-Idempotency-Key` header. This prevents duplicate transactions if requests are retried due to network issues.

Your platform must:

- Generate unique idempotency keys for each transaction (UUID v4 recommended)
- Store idempotency keys with transaction records
- Return cached responses for duplicate requests with the same idempotency key
- Maintain idempotency keys for at least 24 hours

### Data Encryption

All transaction data transmitted over the network is encrypted using TLS 1.3. Additionally, sensitive fields (account numbers, personal information) should be encrypted at rest in your database using AES-256-GCM with unique keys per record.

Implement field-level encryption for:

- Bank account numbers
- Phone numbers
- Email addresses
- Personal identification numbers
- Transaction amounts (in some jurisdictions)

### Security Audit Requirements

Most Mojaloop networks require annual security audits by approved third-party auditors. Audits typically cover:

- Penetration testing of all API endpoints
- Code review of security-critical components
- Infrastructure security assessment
- Compliance with PCI-DSS (if handling card data)
- Incident response capability testing

Budget for audit costs (typically $50,000-$150,000 annually) and allocate time for remediation of any findings before audit certification.

---

## Testing & Validation

Thorough testing is essential before deploying Mojaloop integration to production. The platform includes comprehensive test suites and integration with sandbox environments.

### Sandbox Environment

The payment system operator provides a sandbox environment that simulates the full Mojaloop network without moving real money. Use the sandbox for all development and testing activities.

**Sandbox Configuration:**

```bash
# Update environment variables for sandbox
MOJALOOP_API_URL=https://sandbox-api.mojaloop.example.com
MOJALOOP_FSP_ID=sandbox-fsp-001
MOJALOOP_API_KEY=sandbox-api-key
```

The sandbox typically includes several test FSPs with known account identifiers that you can use as transaction recipients. The payment system operator provides a list of test accounts and their expected behaviors (successful payment, insufficient funds, invalid account, etc.).

### Unit Tests

The platform includes unit tests for all Mojaloop integration components. Run tests before deploying any changes:

```bash
cd /home/ubuntu/idlr-pts-platform
pnpm test server/mojaloopClient.test.ts
pnpm test server/mojaloopPaymentService.test.ts
pnpm test server/smartContractIntegration.test.ts
```

All tests should pass with 100% success rate. Investigate and fix any failures before proceeding.

### Integration Tests

Integration tests verify end-to-end transaction flows in the sandbox environment:

```bash
# Run integration test suite
pnpm test:integration mojaloop
```

Integration tests cover:

- Successful payment from initiation to completion
- Quote request and response handling
- Transfer execution and confirmation
- Error scenarios (insufficient funds, invalid account, timeout)
- Webhook delivery and processing
- Escrow contract integration
- Transaction reconciliation

### Performance Testing

Before production deployment, conduct performance testing to ensure your platform can handle expected transaction volumes:

```bash
# Run load test (requires k6 or similar tool)
k6 run tests/load/mojaloop-payment-flow.js
```

Performance targets:

- **Throughput:** Minimum 100 transactions per second sustained
- **Latency:** p95 < 2 seconds for payment initiation
- **Error rate:** < 0.1% under normal load
- **Availability:** 99.9% uptime (< 8.76 hours downtime per year)

### Certification Testing

The payment system operator requires passing their certification test suite before granting production access. Certification typically takes 2-4 weeks and includes:

- **Functional tests:** 200+ test cases covering all transaction scenarios
- **Security tests:** Penetration testing, certificate validation, signature verification
- **Performance tests:** Sustained load at 150% of declared capacity
- **Disaster recovery:** Failover procedures, data reconciliation after outages

Work closely with the payment system operator's technical team during certification. They will provide detailed test reports and guidance for resolving any failures.

---

## Production Deployment

After successful certification, deploy your Mojaloop integration to production following these best practices.

### Pre-Deployment Checklist

Before deploying to production, verify:

- [ ] All certification tests passed with 100% success rate
- [ ] Production environment variables configured and validated
- [ ] TLS certificates installed and verified (check expiration dates)
- [ ] Webhook endpoints publicly accessible and responding correctly
- [ ] Monitoring and alerting configured for all critical metrics
- [ ] Incident response procedures documented and team trained
- [ ] Rollback plan prepared in case of issues
- [ ] Change management approval obtained
- [ ] Customer communication prepared for any service impact

### Deployment Process

**Step 1: Schedule Maintenance Window**

Coordinate with the payment system operator to schedule your production cutover. Most networks prefer deployments during low-traffic periods (typically weekends or late night hours in your timezone).

**Step 2: Update Environment Configuration**

Update environment variables to point to production endpoints:

```bash
MOJALOOP_API_URL=https://api.mojaloop.example.com
MOJALOOP_FSP_ID=your-production-fsp-id
MOJALOOP_API_KEY=your-production-api-key
```

Verify configuration using the validation script:

```bash
npx tsx scripts/validate-mojaloop-config.ts --environment=production
```

**Step 3: Deploy Application**

Deploy your application using your standard deployment process (CI/CD pipeline, container orchestration, etc.). Ensure zero-downtime deployment using rolling updates or blue-green deployment strategies.

**Step 4: Smoke Testing**

After deployment, conduct smoke tests to verify basic functionality:

1. Initiate a small test transaction (minimum amount)
2. Verify quote request and response
3. Execute transfer and confirm completion
4. Check webhook delivery and processing
5. Verify escrow contract interaction
6. Confirm transaction appears in user interface

**Step 5: Phased Rollout**

Most payment system operators require a phased rollout for new FSPs:

- **Week 1:** 10% of transactions routed through Mojaloop (90% through legacy system)
- **Week 2:** 25% of transactions
- **Week 3:** 50% of transactions
- **Week 4:** 100% of transactions

Monitor error rates, latency, and user feedback closely during each phase. Be prepared to roll back if issues arise.

### Post-Deployment Monitoring

After production deployment, monitor these key metrics continuously:

**Transaction Metrics:**
- Total transaction volume (count and value)
- Success rate (target: > 99%)
- Average transaction time (target: < 3 seconds)
- Quote acceptance rate
- Transfer completion rate

**System Metrics:**
- API endpoint availability (target: 99.9%)
- Webhook processing latency (target: < 1 second)
- Database query performance
- Cache hit rate
- Error rate by type

**Business Metrics:**
- Revenue from transaction fees
- Customer satisfaction scores
- Support ticket volume
- Fraud detection alerts
- Regulatory compliance status

### Incident Response

Establish clear incident response procedures for Mojaloop-related issues:

**Severity 1 (Critical):** Complete service outage, no transactions processing
- Response time: 15 minutes
- Resolution target: 1 hour
- Escalation: Immediately notify payment system operator

**Severity 2 (High):** Partial service degradation, elevated error rates
- Response time: 30 minutes
- Resolution target: 4 hours
- Escalation: Notify payment system operator within 1 hour

**Severity 3 (Medium):** Individual transaction failures, performance degradation
- Response time: 2 hours
- Resolution target: 24 hours
- Escalation: Daily summary to payment system operator

Maintain a 24/7 on-call rotation for Severity 1 and 2 incidents. Ensure on-call engineers have access to production systems, documentation, and direct contact information for the payment system operator's support team.

---

## Monitoring & Troubleshooting

Effective monitoring and troubleshooting capabilities are essential for maintaining high availability and quickly resolving issues.

### Monitoring Dashboard

The platform includes a built-in monitoring dashboard accessible at `/admin/mojaloop-monitoring` (requires admin role). The dashboard displays:

**Real-Time Metrics:**
- Current transaction volume (last 5 minutes)
- Success rate trend (last hour)
- Average latency by transaction phase
- Active transactions in progress
- Webhook queue depth

**Historical Metrics:**
- Daily transaction volume (last 30 days)
- Success rate over time
- Latency percentiles (p50, p95, p99)
- Error rate by error code
- Revenue from transaction fees

**System Health:**
- API endpoint status (up/down)
- Database connection pool utilization
- Cache hit rate
- Queue processing rate
- Certificate expiration dates

### Log Aggregation

All Mojaloop-related logs are structured JSON and tagged with `service:mojaloop` for easy filtering. Logs are stored in `.manus-logs/` directory and should be forwarded to your centralized log aggregation system (ELK, Splunk, Datadog, etc.).

**Key Log Events:**
- `mojaloop.payment.initiated` - Payment request received from user
- `mojaloop.quote.requested` - Quote requested from payee FSP
- `mojaloop.quote.received` - Quote response received
- `mojaloop.transfer.prepared` - Transfer prepared (funds reserved)
- `mojaloop.transfer.committed` - Transfer committed (funds moved)
- `mojaloop.transfer.failed` - Transfer failed (funds released)
- `mojaloop.webhook.received` - Webhook notification received
- `mojaloop.error` - Error occurred during processing

Each log event includes:
- Transaction ID (for correlation)
- Timestamp (ISO 8601 format)
- User ID (if applicable)
- Amount and currency
- FSP IDs (payer and payee)
- Error code and message (for failures)
- Processing duration

### Common Issues and Solutions

**Issue: "FSP not found" errors**

**Symptoms:** Transactions fail immediately with error code "FSP_NOT_FOUND"

**Cause:** The payee's identifier is not registered with any FSP in the Mojaloop network

**Solution:** Verify the payee's identifier is correct and the payee has an account with a participating FSP. Check the Account Lookup Service logs to confirm the lookup was attempted.

---

**Issue: Quote request timeout**

**Symptoms:** Transactions fail after 30 seconds with "QUOTE_TIMEOUT" error

**Cause:** Payee's FSP did not respond to quote request within timeout period

**Solution:** Check network connectivity to Mojaloop hub. Verify payee's FSP is operational (contact payment system operator). Consider increasing `MOJALOOP_REQUEST_TIMEOUT` if network latency is consistently high.

---

**Issue: Transfer fails with "INSUFFICIENT_FUNDS"**

**Symptoms:** Transfer preparation succeeds but commit fails with insufficient funds error

**Cause:** Payer's account balance dropped between quote and transfer execution

**Solution:** This is expected behavior for legitimate insufficient funds scenarios. Notify user to add funds and retry. If occurring frequently, consider implementing balance checks before initiating quotes.

---

**Issue: Webhook signature validation fails**

**Symptoms:** Webhook endpoints return 401 Unauthorized, transactions appear stuck in "pending" state

**Cause:** `MOJALOOP_WEBHOOK_SECRET` is incorrect or webhook signature calculation is wrong

**Solution:** Verify webhook secret matches value provided by payment system operator. Check webhook signature calculation implementation. Enable debug logging to see computed vs. provided signatures.

---

**Issue: High latency on transfer execution**

**Symptoms:** Transfers take > 10 seconds to complete, users complain of slow payments

**Cause:** Database queries, external API calls, or blockchain interactions are slow

**Solution:** Review database query performance (add indexes if needed). Implement caching for frequently accessed data. Consider async processing for blockchain interactions (don't block transfer completion on escrow contract calls).

---

**Issue: Certificate expiration errors**

**Symptoms:** All API requests fail with TLS handshake errors

**Cause:** Client certificate has expired

**Solution:** Install new certificate provided by payment system operator. Implement monitoring to alert 30 days before certificate expiration. Set up automated certificate renewal if supported.

### Support Escalation

For issues that cannot be resolved using this guide:

1. **Check platform logs** in `.manus-logs/` directory for detailed error messages
2. **Review Mojaloop documentation** at https://docs.mojaloop.io
3. **Contact payment system operator** support team (contact details provided during registration)
4. **Open support ticket** with Manus platform support at https://help.manus.im

When opening support tickets, include:
- Transaction ID (if applicable)
- Timestamp of issue
- Error messages from logs
- Steps to reproduce
- Environment (sandbox vs. production)

---

## Compliance & Regulatory Requirements

Operating as an FSP within a Mojaloop network requires compliance with various financial regulations and payment system rules.

### Know Your Customer (KYC)

Most jurisdictions require FSPs to verify customer identities before allowing transactions. The IDLR-PTS platform includes KYC verification workflows in the user registration process.

**KYC Requirements:**
- Government-issued ID verification (passport, national ID, driver's license)
- Proof of address (utility bill, bank statement)
- Biometric verification (facial recognition, fingerprint)
- Sanctions screening (check against OFAC, UN, EU sanctions lists)

Implement risk-based KYC with different verification levels:
- **Basic:** Small transactions (< $100), limited verification
- **Standard:** Medium transactions (< $10,000), full ID verification
- **Enhanced:** Large transactions (> $10,000), additional documentation and source of funds verification

### Anti-Money Laundering (AML)

Implement transaction monitoring to detect suspicious activity patterns:

- **Structuring:** Multiple transactions just below reporting thresholds
- **Rapid movement:** Funds received and immediately transferred to multiple accounts
- **High-risk countries:** Transactions involving sanctioned jurisdictions
- **Unusual patterns:** Transactions inconsistent with customer profile

The platform includes AML monitoring in `server/amlMonitoring.ts` with configurable rules and thresholds. Review and adjust rules based on your risk appetite and regulatory requirements.

### Transaction Reporting

Most jurisdictions require reporting of:
- **Large transactions:** Typically > $10,000 (varies by country)
- **Suspicious transactions:** Any transaction that appears unusual or potentially illegal
- **Cross-border transactions:** Transactions involving foreign FSPs or currencies

Implement automated reporting to regulatory authorities using their prescribed formats (typically XML or CSV files submitted via secure portal).

### Data Protection

Comply with data protection regulations (GDPR, CCPA, local privacy laws):

- **Data minimization:** Collect only necessary customer data
- **Purpose limitation:** Use data only for stated purposes
- **Storage limitation:** Delete data after retention period expires
- **Security:** Encrypt sensitive data at rest and in transit
- **User rights:** Implement processes for data access, correction, and deletion requests

### Audit Trail

Maintain comprehensive audit logs for all transactions and system access:

- **Transaction logs:** Complete record of all payment activities
- **Access logs:** Who accessed what data and when
- **Configuration changes:** All changes to system settings
- **Security events:** Failed login attempts, permission changes

Retain audit logs for minimum 7 years (varies by jurisdiction). Implement tamper-proof logging using blockchain or write-once storage.

### Regulatory Reporting

Prepare for regular reporting to:
- **Central bank:** Monthly transaction statistics, system availability
- **Payment system operator:** Daily reconciliation, incident reports
- **Tax authorities:** Transaction volumes for tax assessment
- **Financial intelligence unit:** Suspicious transaction reports

Automate report generation where possible to reduce manual effort and errors.

---

## Next Steps

After completing Mojaloop FSP configuration:

1. **Deploy Smart Contracts** - Follow `docs/SMART_CONTRACT_DEPLOYMENT.md` to deploy escrow contracts to Polygon Mumbai, enabling automatic escrow management for property transactions.

2. **Complete Certification** - Work with payment system operator to complete certification testing and obtain production approval.

3. **Launch Marketing Campaign** - Announce Mojaloop payment support to your users, highlighting instant payments and lower transaction fees compared to traditional banking.

4. **Monitor and Optimize** - Continuously monitor transaction metrics and optimize for performance, cost, and user experience.

---

## References

- [Mojaloop Technical Documentation](https://docs.mojaloop.io)
- [Mojaloop API Specification](https://github.com/mojaloop/mojaloop-specification)
- [Level One Project](https://leveloneproject.org) - Mojaloop's parent initiative
- [GSMA Mobile Money API](https://www.gsma.com/mobilefordevelopment/mobile-money/mobile-money-api/) - Related standards

---

**Document Version:** 1.0  
**Last Updated:** February 20, 2026  
**Author:** Manus AI  
**Contact:** https://help.manus.im
