import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verify the X-Dactyl-Signature HMAC-SHA256 header on an incoming webhook.
 *
 * @param secret   - The WEBHOOK_SIGNING_SECRET shared with Dactyl (hex string).
 * @param rawBody  - The raw request body as a string or Buffer (before JSON parse).
 * @param signature - The value of the X-Dactyl-Signature header.
 * @returns true if the signature is valid, false otherwise.
 *
 * @example
 * ```ts
 * app.post('/webhook', (req, res) => {
 *   const valid = verifyDactylWebhook(
 *     process.env.WEBHOOK_SECRET!,
 *     req.rawBody,
 *     req.headers['x-dactyl-signature'] as string,
 *   );
 *   if (!valid) return res.status(401).send('Bad signature');
 *   // process event…
 * });
 * ```
 */
export function verifyDactylWebhook(
  secret: string,
  rawBody: string | Buffer,
  signature: string,
): boolean {
  try {
    const body = typeof rawBody === 'string' ? Buffer.from(rawBody) : rawBody;
    const expected = createHmac('sha256', secret).update(body).digest('hex');
    const expectedBuf = Buffer.from(expected, 'utf8');
    const signatureBuf = Buffer.from(signature, 'utf8');
    // Lengths must match for timingSafeEqual
    if (expectedBuf.length !== signatureBuf.length) {
      return false;
    }
    return timingSafeEqual(expectedBuf, signatureBuf);
  } catch {
    return false;
  }
}
