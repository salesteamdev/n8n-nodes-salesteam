// What the Salesteam Trigger remembers about the webhook it registered, and
// when that webhook still fits. Pure functions with no imports, so the tests
// load this file directly.
//
// The trigger keeps the webhook's ID, signing secret and n8n address in the
// workflow's static data (n8n keeps a separate copy for test webhooks). Salesteam
// lists webhooks with masked addresses and never shows a secret again, so the
// saved address and secret are the only proof a webhook belongs to this trigger.

export interface SavedWebhook {
	id: string;
	/** The signing secret (whsec_…). Missing means events can't be verified. */
	secret?: string;
	/** The n8n address the webhook was registered for. */
	url?: string;
}

/** A webhook as GET /webhooks lists it. */
export interface ListedWebhook {
	id?: unknown;
	events?: unknown;
	campaignIds?: unknown;
	enabled?: unknown;
}

/** What the trigger's settings ask for now. */
export interface WantedWebhook {
	url: string;
	events: string[];
	campaignIds: string[];
}

type StaticData = Record<string, unknown>;

/** Salesteam's limit for a webhook name. */
const MAX_NAME_LENGTH = 60;

export function readSavedWebhook(data: StaticData): SavedWebhook | undefined {
	const { webhookId: id, webhookSecret: secret, webhookUrl: url } = data;
	if (typeof id !== 'string' || !id) return undefined;
	return {
		id,
		...(typeof secret === 'string' && secret ? { secret } : {}),
		...(typeof url === 'string' && url ? { url } : {}),
	};
}

export function saveWebhook(data: StaticData, webhook: SavedWebhook): void {
	data.webhookId = webhook.id;
	if (webhook.url) data.webhookUrl = webhook.url;
	else delete data.webhookUrl;
	if (webhook.secret) data.webhookSecret = webhook.secret;
	else delete data.webhookSecret;
}

export function forgetWebhook(data: StaticData): void {
	delete data.webhookId;
	delete data.webhookSecret;
	delete data.webhookUrl;
}

/** Names from a list parameter: an array, or text separated by commas when set by an expression. */
export function textList(value: unknown): string[] {
	const items = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
	const names = items
		.filter((item) => typeof item === 'string' || typeof item === 'number')
		.map((item) => String(item).trim())
		.filter((item) => item.length > 0);
	return Array.from(new Set(names));
}

/** Whether a listed value holds the same strings as `wanted`, in any order. */
export function sameSet(value: unknown, wanted: string[]): boolean {
	const listed = new Set(
		Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [],
	);
	const expected = new Set(wanted);
	return listed.size === expected.size && Array.from(expected).every((item) => listed.has(item));
}

/**
 * Whether the webhook Salesteam lists is still the one the trigger wants: on,
 * with a saved signing secret, the same events and the same campaigns. The
 * caller has already checked that it was saved for this n8n address.
 */
export function isCurrent(
	listed: ListedWebhook,
	saved: SavedWebhook,
	wanted: WantedWebhook,
): boolean {
	return (
		listed.enabled !== false &&
		Boolean(saved.secret) &&
		sameSet(listed.events, wanted.events) &&
		sameSet(listed.campaignIds, wanted.campaignIds)
	);
}

/** "n8n · Workflow name" (or "n8n test · …" while the editor listens), up to Salesteam's 60 characters. */
export function webhookName(workflowName: string | undefined, test: boolean): string {
	const prefix = test ? 'n8n test' : 'n8n';
	const name = (workflowName ?? '').replace(/\s+/g, ' ').trim();
	if (!name) return prefix;
	const full = `${prefix} · ${name}`;
	if (full.length <= MAX_NAME_LENGTH) return full;
	let cut = '';
	for (const character of full) {
		if (cut.length + character.length > MAX_NAME_LENGTH - 1) break;
		cut += character;
	}
	return `${cut.trimEnd()}…`;
}

/** Whether Salesteam can send to this address: https on a public host name. */
export function isPublicHttpsUrl(value: string): boolean {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return false;
	}
	const host = url.hostname.toLowerCase();
	return (
		url.protocol === 'https:' &&
		host.includes('.') &&
		!host.includes(':') &&
		!/^[\d.]+$/.test(host) &&
		!/(^|\.)localhost$/.test(host) &&
		!/\.(local|internal|lan|home|corp)$/.test(host)
	);
}
