import { createHmac, timingSafeEqual } from 'crypto';

// Salesteam signs every webhook POST. X-Salesteam-Timestamp holds Unix seconds
// and X-Salesteam-Signature holds "v1=" and the hex HMAC-SHA256 of
// `${timestamp}.${rawBody}`, made with the webhook's signing secret (whsec_…).
// A request signed more than 5 minutes away from now is refused, so a copied
// request can't be replayed later. This file has no other imports, so the
// tests load it directly.

/** How far the signed time may be from now, in seconds. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export type SignatureFailure =
	| 'no_secret'
	| 'missing_headers'
	| 'invalid_timestamp'
	| 'stale_timestamp'
	| 'invalid_signature';

export type SignatureCheck = { valid: true } | { valid: false; reason: SignatureFailure };

export interface SignedRequest {
	/** The webhook's signing secret, as POST /webhooks returned it. */
	secret: string | undefined;
	/** The request body exactly as it arrived, before any JSON parsing. */
	rawBody: string | Buffer;
	/** The X-Salesteam-Timestamp header. */
	timestamp: string | undefined;
	/** The X-Salesteam-Signature header. */
	signature: string | undefined;
	/** Now, in milliseconds. Tests pass a fixed time. */
	now?: number;
}

/** The X-Salesteam-Signature value Salesteam sends for this body. */
export function signSalesteamPayload(
	secret: string,
	timestamp: string,
	rawBody: string | Buffer,
): string {
	const hmac = createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody);
	return `v1=${hmac.digest('hex')}`;
}

/** Whether a request really comes from Salesteam, and if not, why. */
export function checkSalesteamSignature(request: SignedRequest): SignatureCheck {
	const { secret, rawBody, timestamp, signature, now = Date.now() } = request;
	if (!secret) return { valid: false, reason: 'no_secret' };
	if (!timestamp || !signature) return { valid: false, reason: 'missing_headers' };
	if (!/^\d{1,12}$/.test(timestamp)) return { valid: false, reason: 'invalid_timestamp' };
	if (!(Math.abs(now / 1000 - Number(timestamp)) < SIGNATURE_TOLERANCE_SECONDS)) {
		return { valid: false, reason: 'stale_timestamp' };
	}
	const expected = Buffer.from(signSalesteamPayload(secret, timestamp, rawBody));
	const given = Buffer.from(signature);
	// timingSafeEqual needs equal lengths; comparing lengths first reveals nothing about the secret.
	if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
		return { valid: false, reason: 'invalid_signature' };
	}
	return { valid: true };
}
