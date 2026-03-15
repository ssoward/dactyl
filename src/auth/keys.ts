import { importPKCS8, importSPKI } from 'jose';
import type { KeyLike } from 'jose';
import { env } from '../env.js';

let _privateKey: KeyLike | null = null;
let _publicKey: KeyLike | null = null;

function parsePem(raw: string): string {
  // Support \n-escaped PEM strings stored in env vars
  return raw.replace(/\\n/g, '\n');
}

export async function getPrivateKey(): Promise<KeyLike> {
  if (!_privateKey) {
    _privateKey = await importPKCS8(parsePem(env.RS256_PRIVATE_KEY), 'RS256');
  }
  return _privateKey;
}

export async function getPublicKey(): Promise<KeyLike> {
  if (!_publicKey) {
    _publicKey = await importSPKI(parsePem(env.RS256_PUBLIC_KEY), 'RS256');
  }
  return _publicKey;
}
