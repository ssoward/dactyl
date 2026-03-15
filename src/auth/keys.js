import { importPKCS8, importSPKI } from 'jose';
import { env } from '../env.js';
let _privateKey = null;
let _publicKey = null;
function parsePem(raw) {
    // Support \n-escaped PEM strings stored in env vars
    return raw.replace(/\\n/g, '\n');
}
export async function getPrivateKey() {
    if (!_privateKey) {
        _privateKey = await importPKCS8(parsePem(env.RS256_PRIVATE_KEY), 'RS256');
    }
    return _privateKey;
}
export async function getPublicKey() {
    if (!_publicKey) {
        _publicKey = await importSPKI(parsePem(env.RS256_PUBLIC_KEY), 'RS256');
    }
    return _publicKey;
}
//# sourceMappingURL=keys.js.map