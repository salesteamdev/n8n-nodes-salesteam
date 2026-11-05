// The trigger's signature check, loaded straight from the TypeScript source:
// node --experimental-strip-types --test test/signature.test.mjs
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';

import {
	checkSalesteamSignature,
	SIGNATURE_TOLERANCE_SECONDS,
	signSalesteamPayload,
} from '../nodes/SalesteamTrigger/signature.ts';

const secret = 'whsec_n8nTestSecret0123456789abcdefABCDEF';
const now = Date.UTC(2026, 9, 31, 12, 0, 0);
const timestamp = String(Math.floor(now / 1000));

// A lead.replied event shaped like Salesteam's samplePayload, with non-ASCII text
// so the check covers the UTF-8 bytes on the wire.
const body = JSON.stringify({
	id: 'evt_sample_lead_replied',
	type: 'lead.replied',
	occurredAt: '2026-10-29T14:05:00.000Z',
	workspace: { id: 'ws_5f2a9c0e7b14d3a6c8e1f027', name: 'Acme outbound' },
	lead: {
		id: 'lead_sample',
		fullName: 'Jamie Lee',
		company: 'Example Co',
		email: 'jamie@example.co',
		tags: [],
	},
	campaign: { id: 'camp_sample', name: 'EU founders' },
	sender: { id: 'sender_sample', name: 'Alex Morgan' },
	message: {
		id: 'msg_sample',
		text: 'Thanks for reaching out — let’s talk next week. Café at 10?',
		direction: 'inbound',
		sentAt: '2026-10-29T14:05:00.000Z',
	},
	conversation: {
		id: 'conv_sample',
		channel: 'linkedin',
		link: 'https://app.salesteam.dev/inbox?conversation=conv_sample',
	},
	link: 'https://app.salesteam.dev/inbox?conversation=conv_sample',
});

// How Salesteam signs a delivery (webhookRequest in lib/server/integrations.ts).
function salesteamSignature(signingSecret, signedAt, rawBody) {
	return `v1=${createHmac('sha256', signingSecret).update(`${signedAt}.${rawBody}`).digest('hex')}`;
}

const signature = salesteamSignature(secret, timestamp, body);

test('a genuine signed body passes', () => {
	assert.deepEqual(checkSalesteamSignature({ secret, rawBody: body, timestamp, signature, now }), {
		valid: true,
	});
	// n8n hands the body over as the raw bytes it received.
	assert.deepEqual(
		checkSalesteamSignature({
			secret,
			rawBody: Buffer.from(body, 'utf8'),
			timestamp,
			signature,
			now,
		}),
		{ valid: true },
	);
});

test('the helper signs exactly like Salesteam', () => {
	assert.equal(signSalesteamPayload(secret, timestamp, body), signature);
	assert.equal(signSalesteamPayload(secret, timestamp, Buffer.from(body, 'utf8')), signature);
});

test('a changed body fails', () => {
	const changed = body.replace('Jamie Lee', 'Jamie Lea');
	assert.notEqual(changed, body);
	assert.deepEqual(
		checkSalesteamSignature({ secret, rawBody: changed, timestamp, signature, now }),
		{
			valid: false,
			reason: 'invalid_signature',
		},
	);
	// Same data, different bytes (parsed and pretty-printed again) is not what Salesteam signed.
	const reformatted = JSON.stringify(JSON.parse(body), null, 2);
	assert.deepEqual(
		checkSalesteamSignature({ secret, rawBody: reformatted, timestamp, signature, now }),
		{
			valid: false,
			reason: 'invalid_signature',
		},
	);
});

test('a wrong secret fails', () => {
	assert.deepEqual(
		checkSalesteamSignature({
			secret: 'whsec_someOtherWebhooksSecret000000000000',
			rawBody: body,
			timestamp,
			signature,
			now,
		}),
		{ valid: false, reason: 'invalid_signature' },
	);
	const signedElsewhere = salesteamSignature(
		'whsec_someOtherWebhooksSecret000000000000',
		timestamp,
		body,
	);
	assert.deepEqual(
		checkSalesteamSignature({ secret, rawBody: body, timestamp, signature: signedElsewhere, now }),
		{
			valid: false,
			reason: 'invalid_signature',
		},
	);
});

test('a stale timestamp fails, even with a valid signature for it', () => {
	const old = String(Math.floor(now / 1000) - SIGNATURE_TOLERANCE_SECONDS - 1);
	const replayed = salesteamSignature(secret, old, body);
	assert.deepEqual(
		checkSalesteamSignature({ secret, rawBody: body, timestamp: old, signature: replayed, now }),
		{
			valid: false,
			reason: 'stale_timestamp',
		},
	);
	// Exactly 5 minutes old is already refused, as in Salesteam's own example; just under passes.
	const edge = String(Math.floor(now / 1000) - SIGNATURE_TOLERANCE_SECONDS);
	assert.equal(
		checkSalesteamSignature({
			secret,
			rawBody: body,
			timestamp: edge,
			signature: salesteamSignature(secret, edge, body),
			now,
		}).valid,
		false,
	);
	const recent = String(Math.floor(now / 1000) - SIGNATURE_TOLERANCE_SECONDS + 1);
	assert.equal(
		checkSalesteamSignature({
			secret,
			rawBody: body,
			timestamp: recent,
			signature: salesteamSignature(secret, recent, body),
			now,
		}).valid,
		true,
	);
	// A time far ahead (a wrong clock) is refused too.
	const ahead = String(Math.floor(now / 1000) + 600);
	assert.deepEqual(
		checkSalesteamSignature({
			secret,
			rawBody: body,
			timestamp: ahead,
			signature: salesteamSignature(secret, ahead, body),
			now,
		}),
		{ valid: false, reason: 'stale_timestamp' },
	);
});

test('a fresh timestamp can’t be pasted onto an old signature', () => {
	const old = String(Math.floor(now / 1000) - 3600);
	const oldSignature = salesteamSignature(secret, old, body);
	assert.deepEqual(
		checkSalesteamSignature({ secret, rawBody: body, timestamp, signature: oldSignature, now }),
		{
			valid: false,
			reason: 'invalid_signature',
		},
	);
});

test('no saved secret refuses every request', () => {
	assert.deepEqual(
		checkSalesteamSignature({ secret: undefined, rawBody: body, timestamp, signature, now }),
		{
			valid: false,
			reason: 'no_secret',
		},
	);
	assert.deepEqual(
		checkSalesteamSignature({ secret: '', rawBody: body, timestamp, signature, now }),
		{
			valid: false,
			reason: 'no_secret',
		},
	);
});

test('missing or malformed headers fail', () => {
	assert.deepEqual(
		checkSalesteamSignature({ secret, rawBody: body, timestamp: undefined, signature, now }),
		{
			valid: false,
			reason: 'missing_headers',
		},
	);
	assert.deepEqual(
		checkSalesteamSignature({ secret, rawBody: body, timestamp, signature: undefined, now }),
		{
			valid: false,
			reason: 'missing_headers',
		},
	);
	assert.deepEqual(
		checkSalesteamSignature({ secret, rawBody: body, timestamp: '1.7e9', signature, now }),
		{
			valid: false,
			reason: 'invalid_timestamp',
		},
	);
	assert.deepEqual(
		checkSalesteamSignature({
			secret,
			rawBody: body,
			timestamp,
			signature: signature.slice(3),
			now,
		}),
		{
			valid: false,
			reason: 'invalid_signature',
		},
	);
	assert.deepEqual(
		checkSalesteamSignature({
			secret,
			rawBody: body,
			timestamp,
			signature: signature.toUpperCase(),
			now,
		}),
		{
			valid: false,
			reason: 'invalid_signature',
		},
	);
});
