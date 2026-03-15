"""
Webhook signature verification helper for Dactyl webhooks.
"""
import hmac
import hashlib


def verify_dactyl_webhook(
    secret: str,
    raw_body: str | bytes,
    signature: str,
) -> bool:
    """
    Verify the X-Dactyl-Signature HMAC-SHA256 header on an incoming webhook.

    Args:
        secret:     The WEBHOOK_SIGNING_SECRET shared with Dactyl.
        raw_body:   The raw request body (str or bytes) before JSON parsing.
        signature:  The value of the X-Dactyl-Signature request header.

    Returns:
        True if the signature is valid, False otherwise.

    Example::

        from dactyl_sdk.webhook import verify_dactyl_webhook

        @app.post("/webhook")
        async def handle_webhook(request: Request):
            body = await request.body()
            sig = request.headers.get("x-dactyl-signature", "")
            if not verify_dactyl_webhook(WEBHOOK_SECRET, body, sig):
                raise HTTPException(status_code=401, detail="Bad signature")
            # process event…
    """
    try:
        body_bytes = raw_body.encode() if isinstance(raw_body, str) else raw_body
        expected = hmac.new(
            secret.encode(),
            body_bytes,
            hashlib.sha256,
        ).hexdigest()
        # Constant-time comparison
        return hmac.compare_digest(expected, signature)
    except Exception:
        return False
