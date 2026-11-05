import { randomUUID } from 'crypto';
import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	IN8nHttpFullResponse,
	INode,
	INodePropertyOptions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, sleep } from 'n8n-workflow';

// Salesteam's public API, version 1, shared by the Salesteam node and the
// Salesteam Trigger. Answers are { data }, lists { data: [...], nextCursor },
// and errors { error: { code, message, requestId } }.

export const SALESTEAM_API_URL = 'https://app.salesteam.dev/api/v1';

export type SalesteamContext = IExecuteFunctions | ILoadOptionsFunctions | IHookFunctions;

export interface SalesteamRequest {
	body?: IDataObject;
	qs?: IDataObject;
	/** The input item, so an error points at it. */
	itemIndex?: number;
}

// Salesteam asks callers to wait and try again after 429 (300 requests a
// minute per key), 409 workspace_busy or idempotency_in_progress (a scheduled
// change is finishing) and 5xx answers, saying how long in Retry-After. Every
// POST carries an Idempotency-Key, so a repeat never runs twice. Waits longer
// than MAX_WAIT_MS fail instead of holding the execution.
const MAX_TRIES = 3;
const MAX_WAIT_MS = 30_000;
const BUSY_CODES = new Set(['workspace_busy', 'idempotency_in_progress']);
const DROPPED_CONNECTION = new Set([
	'ECONNRESET',
	'ETIMEDOUT',
	'ECONNABORTED',
	'EAI_AGAIN',
	'EPIPE',
	'ESOCKETTIMEDOUT',
]);

export function isObject(value: unknown): value is IDataObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** One Salesteam API call. Returns the answer's body, or throws a NodeApiError with Salesteam's message. */
export async function salesteamApiRequest(
	this: SalesteamContext,
	method: IHttpRequestMethods,
	path: string,
	{ body, qs, itemIndex }: SalesteamRequest = {},
): Promise<IDataObject> {
	const options: IHttpRequestOptions = {
		method,
		url: `${SALESTEAM_API_URL}${path}`,
		headers:
			method === 'POST'
				? { Accept: 'application/json', 'Idempotency-Key': randomUUID() }
				: { Accept: 'application/json' },
		json: true,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	};
	if (body) options.body = body;
	if (qs && Object.keys(qs).length) options.qs = qs;

	for (let attempt = 1; ; attempt++) {
		let response: IN8nHttpFullResponse;
		try {
			response = (await this.helpers.httpRequestWithAuthentication.call(
				this,
				'salesteamApi',
				options,
			)) as IN8nHttpFullResponse;
		} catch (error) {
			const dropped = droppedConnection(error);
			if (dropped && attempt < MAX_TRIES) {
				await sleep(attempt * 1000);
				continue;
			}
			throw new NodeApiError(
				this.getNode(),
				error as JsonObject,
				dropped
					? {
							message: 'Salesteam didn’t answer',
							description:
								'Check that this n8n server can reach app.salesteam.dev, then try again.',
							itemIndex,
						}
					: { itemIndex },
			);
		}

		const answer = parseJson(response.body);
		if (response.statusCode >= 200 && response.statusCode < 300)
			return isObject(answer) ? answer : {};

		const wait = attempt < MAX_TRIES ? retryWait(response, errorDetail(answer).code) : undefined;
		if (wait !== undefined) {
			await sleep(wait);
			continue;
		}
		throw salesteamError(this.getNode(), response, answer, itemIndex);
	}
}

/**
 * Every item of a Salesteam list, following nextCursor. With `limit`, stops
 * once it has that many. `pageSize` is sent as ?limit for endpoints that take
 * one (GET /conversations: 1 to 100).
 */
export async function salesteamApiRequestAllItems(
	this: SalesteamContext,
	path: string,
	{
		qs = {},
		limit,
		pageSize,
		itemIndex,
	}: { qs?: IDataObject; limit?: number; pageSize?: number; itemIndex?: number } = {},
): Promise<IDataObject[]> {
	const items: IDataObject[] = [];
	let cursor: string | undefined;
	for (;;) {
		const page = await salesteamApiRequest.call(this, 'GET', path, {
			qs: {
				...qs,
				...(pageSize
					? { limit: Math.min(pageSize, limit === undefined ? pageSize : limit - items.length) }
					: {}),
				...(cursor ? { cursor } : {}),
			},
			itemIndex,
		});
		if (Array.isArray(page.data)) items.push(...(page.data as IDataObject[]).filter(isObject));
		const next =
			typeof page.nextCursor === 'string' && page.nextCursor ? page.nextCursor : undefined;
		if (!next || next === cursor || (limit !== undefined && items.length >= limit)) break;
		cursor = next;
	}
	return limit === undefined ? items : items.slice(0, limit);
}

// ---- choices for the editor's dropdowns

export async function getCampaignOptions(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const campaigns = await salesteamApiRequestAllItems.call(this, '/campaigns');
	return byName(
		campaigns.map((campaign) => {
			const leads =
				isObject(campaign.leads) && typeof campaign.leads.total === 'number'
					? campaign.leads.total
					: undefined;
			return {
				name: String(campaign.name ?? campaign.id),
				value: String(campaign.id),
				description: [
					typeof campaign.status === 'string' ? capitalize(campaign.status) : '',
					leads === undefined ? '' : `${leads} ${leads === 1 ? 'lead' : 'leads'}`,
				]
					.filter(Boolean)
					.join(' · '),
			};
		}),
	);
}

export async function getListOptions(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const lists = await salesteamApiRequestAllItems.call(this, '/lists');
	return byName(
		lists.map((list) => ({
			name: String(list.name ?? list.id),
			value: String(list.id),
			description:
				typeof list.leads === 'number'
					? `${list.leads} ${list.leads === 1 ? 'lead' : 'leads'}`
					: '',
		})),
	);
}

/** Tags by name: Salesteam matches tags by name or ID, and a name stays right if a tag is recreated. */
export async function getTagOptions(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const tags = await salesteamApiRequestAllItems.call(this, '/tags');
	return byName(
		tags
			.filter((tag) => typeof tag.name === 'string' && tag.name)
			.map((tag) => ({ name: String(tag.name), value: String(tag.name) })),
	);
}

/** Webhooks added through the API, such as the ones Salesteam Triggers register. */
export async function getWebhookOptions(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const webhooks = await salesteamApiRequestAllItems.call(this, '/webhooks');
	return byName(
		webhooks.map((webhook) => {
			const events = Array.isArray(webhook.events) ? webhook.events.map(String) : [];
			const summary = `${webhook.enabled === false ? 'Paused' : 'On'} · ${events.join(', ')}`;
			return {
				name: String(webhook.name || webhook.id),
				value: String(webhook.id),
				description: summary.length > 120 ? `${summary.slice(0, 119)}…` : summary,
			};
		}),
	);
}

// ---- answers and errors

function byName(options: INodePropertyOptions[]): INodePropertyOptions[] {
	return options.sort((a, b) => a.name.localeCompare(b.name));
}

function capitalize(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
}

function parseJson(body: unknown): unknown {
	if (typeof body !== 'string') return body;
	try {
		return JSON.parse(body);
	} catch {
		return body;
	}
}

function headerValue(headers: IDataObject | undefined, name: string): string | undefined {
	const value = headers?.[name.toLowerCase()];
	const first = Array.isArray(value) ? value[0] : value;
	return typeof first === 'string' || typeof first === 'number' ? String(first) : undefined;
}

function errorDetail(answer: unknown): { code?: string; message?: string; requestId?: string } {
	const detail = isObject(answer) && isObject(answer.error) ? answer.error : {};
	return {
		...(typeof detail.code === 'string' ? { code: detail.code } : {}),
		...(typeof detail.message === 'string' && detail.message.trim()
			? { message: detail.message.trim() }
			: {}),
		...(typeof detail.requestId === 'string' ? { requestId: detail.requestId } : {}),
	};
}

function retryAfterMs(response: IN8nHttpFullResponse): number | undefined {
	const seconds = Number(headerValue(response.headers, 'retry-after'));
	return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
}

function isTemporary(status: number, code: string | undefined): boolean {
	return (
		status === 429 ||
		status >= 500 ||
		(status === 409 && code !== undefined && BUSY_CODES.has(code))
	);
}

/** How long to wait before trying again, or undefined when trying again won't help. */
function retryWait(response: IN8nHttpFullResponse, code: string | undefined): number | undefined {
	if (!isTemporary(response.statusCode, code)) return undefined;
	const wait = retryAfterMs(response) ?? 1000;
	return wait <= MAX_WAIT_MS ? wait : undefined;
}

function droppedConnection(
	error: { code?: unknown; cause?: { code?: unknown } } | undefined,
): boolean {
	const code = error?.code ?? error?.cause?.code;
	return typeof code === 'string' && DROPPED_CONNECTION.has(code);
}

/** Salesteam's error as n8n shows it: its message, then its code and request ID. */
function salesteamError(
	node: INode,
	response: IN8nHttpFullResponse,
	answer: unknown,
	itemIndex: number | undefined,
): NodeApiError {
	const status = response.statusCode;
	const { code, message: apiMessage, requestId: bodyRequestId } = errorDetail(answer);
	const requestId = bodyRequestId ?? headerValue(response.headers, 'x-request-id');
	const message =
		apiMessage ??
		`Salesteam answered ${status}${response.statusMessage ? ` ${response.statusMessage}` : ''}`;
	const description = [
		code ? `Salesteam error code: ${code}.` : '',
		requestId ? `Request ID: ${requestId}. Include it if you contact Salesteam support.` : '',
	]
		.filter(Boolean)
		.join(' ');
	const wait = retryAfterMs(response);
	// n8n 3.37 and later read `failure` to decide what to do next; older versions ignore it.
	const failure =
		status === 401
			? { cause: 'credential-invalid' as const }
			: status === 429
				? { cause: 'rate-limited' as const, ...(wait ? { retryAfterMs: wait } : {}) }
				: isTemporary(status, code)
					? { cause: 'temporarily-unavailable' as const, ...(wait ? { retryAfterMs: wait } : {}) }
					: undefined;
	const options = {
		message,
		...(description ? { description } : {}),
		httpCode: String(status),
		itemIndex,
		...(failure ? { failure } : {}),
	};
	return new NodeApiError(node, (isObject(answer) ? answer : { message }) as JsonObject, options);
}
