#!/usr/bin/env tsx
/**
 * Generate an RS256 keypair for JWT signing.
 * Outputs .env-ready lines with escaped newlines.
 */

import crypto from 'node:crypto';

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

function toEnvValue(pem: string): string {
  // Replace literal newlines with \n for single-line env var storage
  return pem.replace(/\n/g, '\\n');
}

console.log('# Add these to your .env file:\n');
console.log(`RS256_PRIVATE_KEY="${toEnvValue(privateKey)}"`);
console.log(`RS256_PUBLIC_KEY="${toEnvValue(publicKey)}"`);
