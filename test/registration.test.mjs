// When the trigger keeps, replaces or forgets its Salesteam webhook.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
	forgetWebhook,
	isCurrent,
	isPublicHttpsUrl,
	readSavedWebhook,
	sameSet,
	saveWebhook,
	textList,
	webhookName,
} from '../nodes/SalesteamTrigger/registration.ts';

const url = 'https://acme.app.n8n.cloud/webhook/0b7c1f44-3a52-4e0e-9a51-6f1f2d1c9e10/webhook';
const wanted = { url, events: ['lead.replied', 'meeting.booked'], campaignIds: ['camp_1'] };
const saved = { id: 'int_abc', secret: 'whsec_abc', url };
const listed = {
	id: 'int_abc',
	events: ['meeting.booked', 'lead.replied'],
	campaignIds: ['camp_1'],
	enabled: true,
};

test('static data round trip', () => {
	const data = {};
	assert.equal(readSavedWebhook(data), undefined);
	saveWebhook(data, saved);
	assert.deepEqual(data, { webhookId: 'int_abc', webhookUrl: url, webhookSecret: 'whsec_abc' });
	assert.deepEqual(readSavedWebhook(data), saved);
	forgetWebhook(data);
	assert.deepEqual(data, {});
	// Saved without a secret: readable, but not current.
	saveWebhook(data, { id: 'int_abc', url });
	assert.deepEqual(readSavedWebhook(data), { id: 'int_abc', url });
	assert.equal(readSavedWebhook({ webhookId: '' }), undefined);
});

test('a matching webhook is kept, in any event order', () => {
	assert.equal(isCurrent(listed, saved, wanted), true);
});

test('changed events, changed campaigns, a paused webhook or no secret mean replace', () => {
	assert.equal(isCurrent({ ...listed, events: ['lead.replied'] }, saved, wanted), false);
	assert.equal(
		isCurrent({ ...listed, events: [...listed.events, 'lead.tagged'] }, saved, wanted),
		false,
	);
	assert.equal(isCurrent({ ...listed, campaignIds: [] }, saved, wanted), false);
	assert.equal(isCurrent({ ...listed, enabled: false }, saved, wanted), false);
	assert.equal(isCurrent(listed, { id: 'int_abc', url }, wanted), false);
});

test('sameSet compares strings as sets', () => {
	assert.equal(sameSet(['a', 'b'], ['b', 'a']), true);
	assert.equal(sameSet([], []), true);
	assert.equal(sameSet(undefined, []), true);
	assert.equal(sameSet(['a'], ['a', 'b']), false);
	assert.equal(sameSet('a', ['a']), false);
});

test('textList takes arrays and comma-separated text', () => {
	assert.deepEqual(textList(['lead.replied', ' meeting.booked ', 'lead.replied', '']), [
		'lead.replied',
		'meeting.booked',
	]);
	assert.deepEqual(textList('camp_1, camp_2,,camp_1'), ['camp_1', 'camp_2']);
	assert.deepEqual(textList(undefined), []);
	assert.deepEqual(textList([null, { id: 1 }, 'x']), ['x']);
});

test('webhook names name the workflow and fit Salesteam’s 60 characters', () => {
	assert.equal(webhookName('Replies to Slack', false), 'n8n · Replies to Slack');
	assert.equal(webhookName('Replies to Slack', true), 'n8n test · Replies to Slack');
	assert.equal(webhookName('   ', false), 'n8n');
	assert.equal(webhookName(undefined, true), 'n8n test');
	const long = webhookName(
		'A very long workflow name that keeps going and going past the limit',
		false,
	);
	assert.ok(long.length <= 60 && long.length >= 55, `${long.length} characters`);
	assert.ok(long.startsWith('n8n · A very long workflow name'));
	assert.ok(long.endsWith('…') && !long.endsWith(' …'));
	assert.equal(webhookName('x'.repeat(54), false).length, 60);
	// An emoji at the cut is dropped whole, never split into half a character.
	const emoji = webhookName(`${'x'.repeat(52)}🙂🙂🙂`, false);
	assert.ok(emoji.length <= 60);
	assert.equal(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(emoji), false);
});

test('only public https addresses count as reachable for Salesteam', () => {
	assert.equal(isPublicHttpsUrl(url), true);
	assert.equal(isPublicHttpsUrl('https://n8n.example.com/webhook-test/abc/webhook'), true);
	assert.equal(isPublicHttpsUrl('http://localhost:5678/webhook/abc/webhook'), false);
	assert.equal(isPublicHttpsUrl('http://n8n.example.com/webhook/abc/webhook'), false);
	assert.equal(isPublicHttpsUrl('https://localhost/webhook/abc'), false);
	assert.equal(isPublicHttpsUrl('https://192.168.1.20/webhook/abc'), false);
	assert.equal(isPublicHttpsUrl('https://n8n.local/webhook/abc'), false);
	assert.equal(isPublicHttpsUrl('https://n8n/webhook/abc'), false);
	assert.equal(isPublicHttpsUrl('not a url'), false);
});
