// The built nodes (dist/, from npm run build) against an in-memory Salesteam
// API: webhook registration, the signature check, requests, pages, retries and
// errors. Skipped until the package is built and n8n-workflow is installed
// (npm install). SALESTEAM_N8N_DIST points at another build folder.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = process.env.SALESTEAM_N8N_DIST
	? resolve(process.env.SALESTEAM_N8N_DIST)
	: resolve(here, '../dist');
const actionFile = join(dist, 'nodes/Salesteam/Salesteam.node.js');
const triggerFile = join(dist, 'nodes/SalesteamTrigger/SalesteamTrigger.node.js');

function skipReason() {
	if (!existsSync(actionFile) || !existsSync(triggerFile))
		return `no build in ${dist} (run npm run build)`;
	try {
		createRequire(actionFile).resolve('n8n-workflow');
	} catch {
		return 'n8n-workflow isn’t installed (run npm install)';
	}
	return false;
}
const skip = skipReason();
const load = () => {
	const require = createRequire(import.meta.url);
	return {
		Salesteam: require(actionFile).Salesteam,
		SalesteamTrigger: require(triggerFile).SalesteamTrigger,
	};
};

// ---- an in-memory Salesteam

const NODE = {
	id: 'node_1',
	name: 'Salesteam',
	type: 'n8n-nodes-salesteam.salesteam',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};
const TRIGGER_NODE = {
	...NODE,
	name: 'Salesteam Trigger',
	type: 'n8n-nodes-salesteam.salesteamTrigger',
};
const quiet = { error() {}, warn() {}, info() {}, debug() {} };
const JAMIE = 'https://www.linkedin.com/in/jamie-lee-example';

class FakeSalesteam {
	constructor() {
		this.calls = [];
		this.queued = [];
		this.webhooks = new Map();
		this.nextId = 1;
		this.conversations = Array.from({ length: 230 }, (_, n) => ({
			id: `conv_${n}`,
			messageCount: 1,
		}));
	}

	answer(statusCode, body, headers = {}) {
		return { statusCode, headers: { 'x-request-id': 'req_test', ...headers }, body };
	}

	error(statusCode, code, message, headers) {
		return this.answer(statusCode, { error: { code, message, requestId: 'req_test' } }, headers);
	}

	async handle(credential, options) {
		assert.equal(credential, 'salesteamApi');
		assert.equal(options.returnFullResponse, true);
		assert.equal(options.ignoreHttpStatusErrors, true);
		const url = new URL(options.url);
		assert.equal(url.origin, 'https://app.salesteam.dev');
		const call = {
			method: options.method,
			path: url.pathname.replace(/^\/api\/v1/, ''),
			qs: options.qs ?? {},
			body: options.body,
			headers: options.headers ?? {},
		};
		this.calls.push(call);
		return this.queued.length ? this.queued.shift() : this.route(call);
	}

	route({ method, path, qs, body }) {
		let match;
		if (method === 'GET' && path === '/campaigns') {
			return this.answer(200, {
				data: [
					{ id: 'camp_b', name: 'US agencies', status: 'paused', leads: { total: 1 } },
					{ id: 'camp_a', name: 'EU founders', status: 'active', leads: { total: 120 } },
				],
				nextCursor: null,
			});
		}
		if (method === 'GET' && (match = path.match(/^\/campaigns\/([^/]+)$/))) {
			if (match[1] !== 'camp_a')
				return this.error(404, 'not_found', 'This campaign wasn’t found in this workspace.');
			return this.answer(200, { data: { id: 'camp_a', name: 'EU founders', status: 'active' } });
		}
		if (method === 'POST' && (match = path.match(/^\/campaigns\/([^/]+)\/leads$/))) {
			if (match[1] !== 'camp_a')
				return this.error(404, 'not_found', 'This campaign wasn’t found in this workspace.');
			return this.answer(200, {
				data: {
					campaign: { id: 'camp_a', name: 'EU founders', status: 'active' },
					added: 1,
					updated: 0,
					skipped: 0,
					results: [
						{
							index: 0,
							linkedinUrl: body.leads[0].linkedinUrl,
							status: 'added',
							leadId: 'lead_1',
							enrolled: true,
						},
					],
				},
			});
		}
		if (
			method === 'POST' &&
			(match = path.match(/^\/campaigns\/([^/]+)\/leads\/(stop|pause|resume)$/))
		) {
			if (body.email === 'shared@example.co') {
				return this.error(
					409,
					'ambiguous_email',
					'Several people in this workspace have this email. Send their linkedinUrl instead.',
				);
			}
			const status = { stop: 'stopped', pause: 'paused', resume: 'active' }[match[2]];
			return this.answer(200, {
				data: {
					lead: { id: 'lead_1', fullName: 'Jamie Lee', linkedinUrl: JAMIE },
					campaign: { id: match[1], name: 'EU founders' },
					status,
					changed: true,
				},
			});
		}
		if (method === 'GET' && path === '/leads') {
			const found = qs.email === 'jamie@example.co' || qs.linkedinUrl === JAMIE;
			return this.answer(200, {
				data: found ? [{ id: 'lead_1', fullName: 'Jamie Lee' }] : [],
				nextCursor: null,
			});
		}
		if (method === 'POST' && (path === '/leads/tags' || path === '/leads/tags/remove')) {
			return this.answer(200, {
				data: { leadId: 'lead_1', tags: path.endsWith('/remove') ? [] : body.tags },
			});
		}
		if (method === 'GET' && path === '/conversations') {
			const limit = Number(qs.limit ?? 50),
				start = qs.cursor ? Number(qs.cursor) : 0;
			const next = start + limit < this.conversations.length ? String(start + limit) : null;
			return this.answer(200, {
				data: this.conversations.slice(start, start + limit),
				nextCursor: next,
			});
		}
		if (method === 'GET' && path === '/webhooks') {
			const data = [...this.webhooks.values()].map(
				({ secret: _secret, url: _url, ...webhook }) => ({ ...webhook, url: 'masked' }),
			);
			return this.answer(200, { data, nextCursor: null });
		}
		if (method === 'POST' && path === '/webhooks') {
			if (!body.url.startsWith('https://'))
				return this.error(400, 'invalid_request', 'Use an https:// webhook address.');
			const id = `int_${this.nextId++}`;
			const webhook = {
				id,
				name: body.name,
				url: body.url,
				events: body.events,
				campaignIds: body.campaignIds ?? [],
				enabled: true,
				secret: `whsec_${id}_secret`,
			};
			this.webhooks.set(id, webhook);
			return this.answer(201, { data: { ...webhook, url: 'masked' } });
		}
		if (method === 'DELETE' && (match = path.match(/^\/webhooks\/([^/]+)$/))) {
			if (!this.webhooks.delete(match[1]))
				return this.error(404, 'not_found', 'This webhook was already removed.');
			return this.answer(200, { data: { id: match[1], deleted: true } });
		}
		if (method === 'POST' && (match = path.match(/^\/webhooks\/([^/]+)\/test$/))) {
			return this.answer(200, {
				data: {
					sent: true,
					message: `Sample ${body.event} sent.`,
					delivery: { id: 'dlv_1', status: 'sent' },
				},
			});
		}
		return this.error(404, 'not_found', 'This API path doesn’t exist. See the API reference.');
	}
}

function executeContext(api, items, { continueOnFail = false } = {}) {
	return {
		getInputData: () => items.map(() => ({ json: {} })),
		getNodeParameter(name, index, fallback) {
			const value = items[index][name];
			if (value !== undefined) return value;
			if (fallback !== undefined) return fallback;
			throw new Error(`No parameter ${name}`);
		},
		continueOnFail: () => continueOnFail,
		getNode: () => NODE,
		getMode: () => 'manual',
		logger: quiet,
		helpers: {
			httpRequestWithAuthentication: (credential, options) => api.handle(credential, options),
			returnJsonArray: (data) => (Array.isArray(data) ? data : [data]).map((json) => ({ json })),
		},
	};
}

function hookContext(api, { events, campaignIds = [], url, staticData, mode = 'trigger' }) {
	return {
		getNode: () => TRIGGER_NODE,
		getNodeParameter: (name, fallback) => ({ events, campaignIds })[name] ?? fallback,
		getNodeWebhookUrl: () => url,
		getWorkflowStaticData: () => staticData,
		getWorkflow: () => ({ id: 'wf_1', name: 'Replies to Slack', active: true }),
		getMode: () => mode,
		getActivationMode: () => 'activate',
		logger: quiet,
		helpers: {
			httpRequestWithAuthentication: (credential, options) => api.handle(credential, options),
		},
	};
}

function webhookContext({ staticData, rawBody, headers, mode = 'webhook' }) {
	const response = {
		statusCode: 200,
		body: undefined,
		status(code) {
			this.statusCode = code;
			return this;
		},
		json(value) {
			this.body = value;
			return this;
		},
	};
	return {
		response,
		context: {
			getHeaderData: () => headers,
			getBodyData: () => JSON.parse(rawBody),
			getRequestObject: () => ({
				headers,
				body: JSON.parse(rawBody),
				rawBody: Buffer.from(rawBody, 'utf8'),
			}),
			getResponseObject: () => response,
			getWorkflowStaticData: () => staticData,
			getNodeWebhookUrl: () => URL_A,
			getMode: () => mode,
			getNode: () => TRIGGER_NODE,
			logger: quiet,
			helpers: {
				returnJsonArray: (data) => (Array.isArray(data) ? data : [data]).map((json) => ({ json })),
			},
		},
	};
}

function signed(secret, event, at = Math.floor(Date.now() / 1000)) {
	const rawBody = JSON.stringify(event);
	const timestamp = String(at);
	const signature = `v1=${createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')}`;
	return {
		rawBody,
		headers: {
			'x-salesteam-event': event.type,
			'x-salesteam-delivery': event.id,
			'x-salesteam-timestamp': timestamp,
			'x-salesteam-signature': signature,
		},
	};
}

const URL_A = 'https://acme.app.n8n.cloud/webhook/6f1f2d1c-3a52-4e0e-9a51-0b7c1f443a52/webhook';
const URL_B = 'https://n8n.acme.example/webhook/6f1f2d1c-3a52-4e0e-9a51-0b7c1f443a52/webhook';
const EVENTS = ['lead.replied', 'meeting.booked'];

async function rejection(promise) {
	try {
		await promise;
	} catch (error) {
		return error;
	}
	assert.fail('expected an error');
}

// ---- trigger

test('trigger: activation registers one webhook and keeps its secret', { skip }, async () => {
	const { SalesteamTrigger } = load();
	const methods = new SalesteamTrigger().webhookMethods.default;
	const api = new FakeSalesteam(),
		staticData = {};
	const hooks = hookContext(api, {
		events: EVENTS,
		campaignIds: ['camp_a'],
		url: URL_A,
		staticData,
	});

	assert.equal(await methods.checkExists.call(hooks), false);
	assert.equal(await methods.create.call(hooks), true);
	const post = api.calls.find((call) => call.method === 'POST');
	assert.deepEqual(post.body, {
		url: URL_A,
		events: EVENTS,
		name: 'n8n · Replies to Slack',
		campaignIds: ['camp_a'],
	});
	assert.match(post.headers['Idempotency-Key'], /^[0-9a-f-]{36}$/);
	assert.deepEqual(staticData, {
		webhookId: 'int_1',
		webhookUrl: URL_A,
		webhookSecret: 'whsec_int_1_secret',
	});

	api.calls.length = 0;
	assert.equal(await methods.checkExists.call(hooks), true);
	assert.deepEqual(
		api.calls.map((call) => `${call.method} ${call.path}`),
		['GET /webhooks'],
	);
});

test(
	'trigger: changed events replace the webhook; another address leaves it alone',
	{ skip },
	async () => {
		const { SalesteamTrigger } = load();
		const methods = new SalesteamTrigger().webhookMethods.default;
		const api = new FakeSalesteam(),
			staticData = {};
		await methods.create.call(hookContext(api, { events: EVENTS, url: URL_A, staticData }));

		// Same address, other events: the old webhook goes.
		assert.equal(
			await methods.checkExists.call(
				hookContext(api, { events: ['lead.replied'], url: URL_A, staticData }),
			),
			false,
		);
		assert.equal(api.webhooks.size, 0);
		assert.deepEqual(staticData, {});

		// Saved for another address (say, static data copied from another workflow): left alone.
		await methods.create.call(hookContext(api, { events: EVENTS, url: URL_A, staticData }));
		api.calls.length = 0;
		assert.equal(
			await methods.checkExists.call(hookContext(api, { events: EVENTS, url: URL_B, staticData })),
			false,
		);
		assert.equal(api.calls.length, 0);
		assert.equal(api.webhooks.size, 1);
		assert.deepEqual(staticData, {});

		// Removed in Salesteam: registered again on the next activation.
		staticData.webhookId = 'int_gone';
		staticData.webhookUrl = URL_A;
		staticData.webhookSecret = 'whsec_gone';
		assert.equal(
			await methods.checkExists.call(hookContext(api, { events: EVENTS, url: URL_A, staticData })),
			false,
		);
		assert.deepEqual(staticData, {});
	},
);

test('trigger: a webhook saved without a secret is replaced', { skip }, async () => {
	const { SalesteamTrigger } = load();
	const methods = new SalesteamTrigger().webhookMethods.default;
	const api = new FakeSalesteam(),
		staticData = {};
	await methods.create.call(hookContext(api, { events: EVENTS, url: URL_A, staticData }));
	delete staticData.webhookSecret;
	assert.equal(
		await methods.checkExists.call(hookContext(api, { events: EVENTS, url: URL_A, staticData })),
		false,
	);
	assert.equal(api.webhooks.size, 0);
});

test(
	'trigger: deactivation removes the webhook, and one already gone is fine',
	{ skip },
	async () => {
		const { SalesteamTrigger } = load();
		const methods = new SalesteamTrigger().webhookMethods.default;
		const api = new FakeSalesteam(),
			staticData = {};
		const hooks = hookContext(api, { events: EVENTS, url: URL_A, staticData });
		await methods.create.call(hooks);
		assert.equal(await methods.delete.call(hooks), true);
		assert.equal(api.webhooks.size, 0);
		assert.deepEqual(staticData, {});

		Object.assign(staticData, {
			webhookId: 'int_gone',
			webhookUrl: URL_A,
			webhookSecret: 'whsec_gone',
		});
		assert.equal(await methods.delete.call(hooks), true);
		assert.deepEqual(staticData, {});

		api.queued.push(
			api.error(500, 'server_error', 'Something went wrong on Salesteam’s side.'),
			api.error(500, 'server_error', 'x'),
			api.error(500, 'server_error', 'x'),
		);
		Object.assign(staticData, { webhookId: 'int_x', webhookUrl: URL_A, webhookSecret: 'whsec_x' });
		const error = await rejection(methods.delete.call(hooks));
		assert.equal(error.httpCode, '500');
	},
);

test('trigger: a local n8n address gets the https explanation', { skip }, async () => {
	const { SalesteamTrigger } = load();
	const methods = new SalesteamTrigger().webhookMethods.default;
	const api = new FakeSalesteam();
	const error = await rejection(
		methods.create.call(
			hookContext(api, {
				events: EVENTS,
				url: 'http://localhost:5678/webhook/abc/webhook',
				staticData: {},
			}),
		),
	);
	assert.equal(error.message, 'Use an https:// webhook address.');
	assert.match(error.description, /WEBHOOK_URL/);
});

test(
	'trigger: signed events start the workflow; anything else is refused with 401',
	{ skip },
	async () => {
		const { SalesteamTrigger } = load();
		const trigger = new SalesteamTrigger();
		const staticData = {
			webhookId: 'int_1',
			webhookUrl: URL_A,
			webhookSecret: 'whsec_int_1_secret',
		};
		const event = {
			id: 'evt_1',
			type: 'lead.replied',
			lead: { fullName: 'Jamie Lee' },
			message: { text: 'Let’s talk — Tuesday?' },
		};

		const good = signed('whsec_int_1_secret', event);
		const accepted = await trigger.webhook.call(webhookContext({ staticData, ...good }).context);
		assert.deepEqual(accepted.workflowData, [[{ json: event }]]);

		const tampered = webhookContext({
			staticData,
			...good,
			rawBody: good.rawBody.replace('Jamie', 'Jamey'),
		});
		assert.deepEqual(await trigger.webhook.call(tampered.context), { noWebhookResponse: true });
		assert.equal(tampered.response.statusCode, 401);

		const stale = webhookContext({
			staticData,
			...signed('whsec_int_1_secret', event, Math.floor(Date.now() / 1000) - 3600),
		});
		assert.deepEqual(await trigger.webhook.call(stale.context), { noWebhookResponse: true });
		assert.equal(stale.response.statusCode, 401);

		const noSecret = webhookContext({ staticData: { webhookId: 'int_1' }, ...good });
		assert.deepEqual(await trigger.webhook.call(noSecret.context), { noWebhookResponse: true });
		assert.equal(noSecret.response.statusCode, 401);
	},
);

test('trigger: test pings run only while the editor listens', { skip }, async () => {
	const { SalesteamTrigger } = load();
	const trigger = new SalesteamTrigger();
	const staticData = { webhookId: 'int_1', webhookUrl: URL_A, webhookSecret: 'whsec_int_1_secret' };
	const ping = signed('whsec_int_1_secret', { id: 'evt_test_1', type: 'test.ping', lead: null });
	const active = await trigger.webhook.call(webhookContext({ staticData, ...ping }).context);
	assert.equal(active.workflowData, undefined);
	assert.deepEqual(active.webhookResponse, { received: true });
	const listening = await trigger.webhook.call(
		webhookContext({ staticData, ...ping, mode: 'manual' }).context,
	);
	assert.equal(listening.workflowData[0][0].json.type, 'test.ping');
});

// ---- action node

test('action: add lead sends one lead and returns its result', { skip }, async () => {
	const { Salesteam } = load();
	const api = new FakeSalesteam();
	const [[out]] = await new Salesteam().execute.call(
		executeContext(api, [
			{
				resource: 'campaign',
				operation: 'addLead',
				campaignId: 'camp_a',
				linkedinUrl: ` ${JAMIE} `,
				additionalFields: {
					firstName: 'Jamie',
					email: 'jamie@example.co',
					customFields: {
						field: [
							{ name: 'source', value: 'Webinar' },
							{ name: 'empty', value: '' },
						],
					},
				},
			},
		]),
	);
	const call = api.calls[0];
	assert.equal(`${call.method} ${call.path}`, 'POST /campaigns/camp_a/leads');
	assert.deepEqual(call.body, {
		leads: [
			{
				linkedinUrl: JAMIE,
				firstName: 'Jamie',
				email: 'jamie@example.co',
				customFields: { source: 'Webinar' },
			},
		],
	});
	assert.ok(call.headers['Idempotency-Key']);
	assert.deepEqual(out.json, {
		linkedinUrl: JAMIE,
		status: 'added',
		leadId: 'lead_1',
		enrolled: true,
		campaign: { id: 'camp_a', name: 'EU founders', status: 'active' },
	});
	assert.deepEqual(out.pairedItem, { item: 0 });
});

test('action: stop by email; an ambiguous email shows Salesteam’s message', { skip }, async () => {
	const { Salesteam } = load();
	const api = new FakeSalesteam();
	const items = [
		{
			resource: 'campaign',
			operation: 'stopLead',
			campaignId: 'camp_a',
			identifyBy: 'email',
			email: 'jamie@example.co',
		},
		{
			resource: 'campaign',
			operation: 'pauseLead',
			campaignId: 'camp_a',
			identifyBy: 'email',
			email: 'shared@example.co',
		},
	];
	const [out] = await new Salesteam().execute.call(
		executeContext(api, items, { continueOnFail: true }),
	);
	assert.deepEqual(api.calls[0].body, { email: 'jamie@example.co' });
	assert.equal(api.calls[0].path, '/campaigns/camp_a/leads/stop');
	assert.equal(out[0].json.status, 'stopped');
	assert.equal(
		out[1].json.error,
		'Several people in this workspace have this email. Send their linkedinUrl instead.',
	);
	assert.match(out[1].json.description, /ambiguous_email/);

	const error = await rejection(
		new Salesteam().execute.call(executeContext(new FakeSalesteam(), [items[1]])),
	);
	assert.equal(error.httpCode, '409');
	assert.equal(
		error.message,
		'Several people in this workspace have this email. Send their linkedinUrl instead.',
	);
});

test('action: tags and find use LinkedIn URL, email or lead ID', { skip }, async () => {
	const { Salesteam } = load();
	const api = new FakeSalesteam();
	const [out] = await new Salesteam().execute.call(
		executeContext(api, [
			{
				resource: 'lead',
				operation: 'addTags',
				identifyBy: 'leadId',
				leadId: 'lead_1',
				tags: ['Hot lead', 'Webinar'],
			},
			{
				resource: 'lead',
				operation: 'removeTags',
				identifyBy: 'linkedinUrl',
				linkedinUrl: JAMIE,
				tags: 'Hot lead, Webinar',
			},
			{ resource: 'lead', operation: 'find', findBy: 'email', email: 'jamie@example.co' },
			{
				resource: 'lead',
				operation: 'find',
				findBy: 'linkedinUrl',
				linkedinUrl: 'https://www.linkedin.com/in/nobody',
			},
		]),
	);
	assert.deepEqual(api.calls[0].body, { leadId: 'lead_1', tags: ['Hot lead', 'Webinar'] });
	assert.deepEqual(api.calls[1].body, { linkedinUrl: JAMIE, tags: ['Hot lead', 'Webinar'] });
	assert.equal(api.calls[1].path, '/leads/tags/remove');
	assert.deepEqual(api.calls[2].qs, { email: 'jamie@example.co' });
	// Two tag answers, one match, nothing for the person nobody has.
	assert.deepEqual(
		out.map((item) => item.pairedItem.item),
		[0, 1, 2],
	);
	assert.equal(out[2].json.id, 'lead_1');
});

test('action: Get Many conversations follows nextCursor up to the limit', { skip }, async () => {
	const { Salesteam } = load();
	const api = new FakeSalesteam();
	const [limited] = await new Salesteam().execute.call(
		executeContext(api, [
			{
				resource: 'conversation',
				operation: 'getAll',
				returnAll: false,
				limit: 150,
				filters: { campaignId: 'camp_a' },
			},
		]),
	);
	assert.equal(limited.length, 150);
	assert.deepEqual(
		api.calls.map((call) => call.qs),
		[
			{ campaignId: 'camp_a', limit: 100 },
			{ campaignId: 'camp_a', limit: 50, cursor: '100' },
		],
	);

	api.calls.length = 0;
	const [all] = await new Salesteam().execute.call(
		executeContext(api, [
			{ resource: 'conversation', operation: 'getAll', returnAll: true, filters: {} },
		]),
	);
	assert.equal(all.length, 230);
	assert.equal(api.calls.length, 3);
});

test(
	'action: a busy workspace is tried again with the same Idempotency-Key',
	{ skip },
	async () => {
		const { Salesteam } = load();
		const api = new FakeSalesteam();
		api.queued.push(
			api.error(409, 'workspace_busy', 'Another change to this workspace is still finishing.', {
				'retry-after': '1',
			}),
		);
		const [[out]] = await new Salesteam().execute.call(
			executeContext(api, [
				{
					resource: 'campaign',
					operation: 'resumeLead',
					campaignId: 'camp_a',
					identifyBy: 'linkedinUrl',
					linkedinUrl: JAMIE,
				},
			]),
		);
		assert.equal(out.json.status, 'active');
		assert.equal(api.calls.length, 2);
		assert.equal(api.calls[0].headers['Idempotency-Key'], api.calls[1].headers['Idempotency-Key']);
	},
);

test('action: errors carry Salesteam’s message, code and request ID', { skip }, async () => {
	const { Salesteam } = load();
	const notFound = await rejection(
		new Salesteam().execute.call(
			executeContext(new FakeSalesteam(), [
				{ resource: 'campaign', operation: 'get', campaignId: 'camp_zz' },
			]),
		),
	);
	assert.equal(notFound.message, 'This campaign wasn’t found in this workspace.');
	const missing = await rejection(
		new Salesteam().execute.call(
			executeContext(new FakeSalesteam(), [
				{ resource: 'campaign', operation: 'addLead', campaignId: 'camp_zz', linkedinUrl: JAMIE },
			]),
		),
	);
	assert.equal(missing.message, 'This campaign wasn’t found in this workspace.');
	assert.equal(missing.httpCode, '404');
	assert.match(missing.description, /not_found/);
	assert.match(missing.description, /req_test/);

	// A long rate-limit wait isn't held: it fails at once, saying when to try again.
	const api = new FakeSalesteam();
	api.queued.push(
		api.error(
			429,
			'rate_limited',
			'This key made more than 300 requests this minute. Wait and try again.',
			{ 'retry-after': '120' },
		),
	);
	const limited = await rejection(
		new Salesteam().execute.call(
			executeContext(api, [{ resource: 'list', operation: 'getAll', returnAll: true }]),
		),
	);
	assert.equal(limited.httpCode, '429');
	assert.equal(api.calls.length, 1);
	if (limited.failure !== undefined)
		assert.deepEqual(limited.failure, { cause: 'rate-limited', retryAfterMs: 120000 });

	const empty = await rejection(
		new Salesteam().execute.call(
			executeContext(new FakeSalesteam(), [{ resource: 'lead', operation: 'get', leadId: '  ' }]),
		),
	);
	assert.equal(empty.message, "'Lead ID' is empty");
});

test('action: test event and dropdowns', { skip }, async () => {
	const { Salesteam } = load();
	const api = new FakeSalesteam();
	const [[sent]] = await new Salesteam().execute.call(
		executeContext(api, [
			{ resource: 'webhook', operation: 'sendTest', webhookId: 'int_1', event: 'meeting.booked' },
		]),
	);
	assert.deepEqual(api.calls[0].body, { event: 'meeting.booked' });
	assert.equal(sent.json.sent, true);

	const campaigns = await new Salesteam().methods.loadOptions.getCampaigns.call(
		executeContext(api, [{}]),
	);
	assert.deepEqual(campaigns, [
		{ name: 'EU founders', value: 'camp_a', description: 'Active · 120 leads' },
		{ name: 'US agencies', value: 'camp_b', description: 'Paused · 1 lead' },
	]);
});
