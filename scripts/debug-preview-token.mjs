import { sdk } from '../server/_core/sdk.ts';

const token = await sdk.createSessionToken('preview-admin-account', {
  name: 'Admin Preview User',
  expiresInMs: 60_000,
});

const payloadSegment = token.split('.')[1] || '';
const decoded = JSON.parse(Buffer.from(payloadSegment, 'base64url').toString('utf8'));
console.log(JSON.stringify({ token, decoded }, null, 2));
