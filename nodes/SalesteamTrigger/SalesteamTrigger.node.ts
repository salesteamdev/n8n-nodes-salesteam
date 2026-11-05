import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import {
	getCampaignOptions,
	isObject,
	salesteamApiRequest,
	salesteamApiRequestAllItems,
} from '../Salesteam/GenericFunctions';
import { SALESTEAM_EVENTS } from './events';
import {
	forgetWebhook,
	isCurrent,
	isPublicHttpsUrl,
	readSavedWebhook,
	saveWebhook,
	textList,
	webhookName,
	type WantedWebhook,
} from './registration';
import { checkSalesteamSignature, type SignatureFailure } from './signature';

// Starts a workflow when something happens in Salesteam. Activating the
// workflow registers a webhook in Salesteam (POST /webhooks) and keeps its ID,
// signing secret and address in the workflow's static data; deactivating it
// removes the webhook. Every request is checked against that secret, and one
// that fails the check is answered 401 and never starts the workflow.
//
// No saved secret means no request can be verified, so all are refused. That
// only happens if the static data was lost; the next activation or n8n restart
// notices it (checkExists) and registers a new webhook with a new secret.

const REFUSED: Record<SignatureFailure, string> = {
	no_secret:
		'This trigger has no signing secret saved. Turn the workflow off and on again to register a new Salesteam webhook.',
	missing_headers: 'The request has no Salesteam signature.',
	invalid_timestamp: 'The request’s X-Salesteam-Timestamp isn’t a Unix time.',
	stale_timestamp:
		'The request’s signing time is more than 5 minutes off. Check that this server’s clock is right.',
	invalid_signature: 'The signature doesn’t match this webhook’s signing secret.',
};

export class SalesteamTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Salesteam Trigger',
		name: 'salesteamTrigger',
		icon: { light: 'file:../../icons/salesteam.svg', dark: 'file:../../icons/salesteam.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].join(", ")}}',
		description: 'Starts the workflow when something happens in Salesteam',
		defaults: {
			name: 'Salesteam Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'salesteamApi',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				required: true,
				options: SALESTEAM_EVENTS,
				// Salesteam's Recommended set: accepted requests and first replies.
				default: ['connection.accepted', 'message.first_reply', 'inmail.first_reply'],
				description: 'The Salesteam events that start this workflow',
			},
			{
				displayName: 'Campaign Names or IDs',
				name: 'campaignIds',
				type: 'multiOptions',
				typeOptions: {
					loadOptionsMethod: 'getCampaigns',
				},
				default: [],
				description:
					'Only events from these campaigns. Leave empty for every event, with or without a campaign. LinkedIn account alerts always come through. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
		],
	};

	methods = {
		loadOptions: {
			getCampaigns: getCampaignOptions,
		},
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node');
				const saved = readSavedWebhook(data);
				if (!saved) return false;
				const wanted = wantedWebhook(this);
				if (saved.url !== wanted.url) {
					// Saved for another address: an old n8n address, or static data copied from another
					// workflow. That webhook can't be proven to be this trigger's, so it stays as it is.
					forgetWebhook(data);
					return false;
				}
				const webhooks = await salesteamApiRequestAllItems.call(this, '/webhooks');
				const listed = webhooks.find((webhook) => webhook.id === saved.id);
				if (!listed) {
					forgetWebhook(data);
					return false;
				}
				if (isCurrent(listed, saved, wanted)) return true;
				// This trigger's webhook, but its events or campaigns changed, Salesteam paused it, or its
				// signing secret is missing. Replace it, so the next one has a secret and the right events.
				await removeWebhook.call(this, saved.id);
				forgetWebhook(data);
				return false;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node');
				const wanted = wantedWebhook(this);
				const body: IDataObject = {
					url: wanted.url,
					events: wanted.events,
					name: webhookName(this.getWorkflow().name, this.getMode() === 'manual'),
				};
				if (wanted.campaignIds.length) body.campaignIds = wanted.campaignIds;

				let answer: IDataObject;
				try {
					answer = await salesteamApiRequest.call(this, 'POST', '/webhooks', { body });
				} catch (error) {
					if (
						error instanceof NodeApiError &&
						error.httpCode === '400' &&
						!isPublicHttpsUrl(wanted.url)
					) {
						error.description = `Salesteam sends events only to a public https address, and this trigger’s address is ${wanted.url}. On self-hosted n8n, set n8n’s public https address (the N8N_WEBHOOK_URL setting, or WEBHOOK_URL in older n8n) or use a tunnel, then activate the workflow again.`;
					}
					throw new NodeApiError(this.getNode(), error as JsonObject);
				}

				const webhook = isObject(answer.data) ? answer.data : {};
				if (typeof webhook.id !== 'string' || !webhook.id) {
					throw new NodeOperationError(this.getNode(), 'Salesteam didn’t return the new webhook', {
						description:
							'Activate the workflow again. If it keeps happening, contact Salesteam support.',
					});
				}
				saveWebhook(data, {
					id: webhook.id,
					url: wanted.url,
					...(typeof webhook.secret === 'string' && webhook.secret
						? { secret: webhook.secret }
						: {}),
				});
				if (!data.webhookSecret) {
					// Saved without a secret, so n8n's clean-up or the next checkExists removes it.
					throw new NodeOperationError(
						this.getNode(),
						'Salesteam returned no signing secret for the new webhook',
						{
							description: 'Events can’t be verified without it. Activate the workflow again.',
						},
					);
				}
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node');
				const saved = readSavedWebhook(data);
				if (saved) await removeWebhook.call(this, saved.id);
				forgetWebhook(data);
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const headers = this.getHeaderData();
		const event = this.getBodyData();
		const secret = this.getWorkflowStaticData('node').webhookSecret;
		const check = checkSalesteamSignature({
			secret: typeof secret === 'string' ? secret : undefined,
			rawBody: rawBodyOf(this.getRequestObject(), event),
			timestamp: firstHeader(headers['x-salesteam-timestamp']),
			signature: firstHeader(headers['x-salesteam-signature']),
		});

		if (!check.valid) {
			this.logger.warn(`Salesteam Trigger refused a request: ${REFUSED[check.reason]}`, {
				node: this.getNode().name,
				reason: check.reason,
			});
			this.getResponseObject()
				.status(401)
				.json({ error: { code: 'invalid_signature', message: REFUSED[check.reason] } });
			return { noWebhookResponse: true };
		}

		// A ping only checks the connection. A trigger listening in the editor shows it;
		// an active workflow answers and doesn't run.
		if (event.type === 'test.ping' && this.getMode() !== 'manual') {
			return { webhookResponse: { received: true } };
		}

		return { workflowData: [this.helpers.returnJsonArray(event)] };
	}
}

/** The webhook the trigger's settings ask for: this n8n address, the chosen events and campaigns. */
function wantedWebhook(ctx: IHookFunctions): WantedWebhook {
	const url = ctx.getNodeWebhookUrl('default');
	if (!url) {
		throw new NodeOperationError(ctx.getNode(), 'n8n has no webhook address for this trigger', {
			description: 'Save the workflow, then activate it again.',
		});
	}
	const events = textList(ctx.getNodeParameter('events', []));
	if (!events.length) {
		throw new NodeOperationError(ctx.getNode(), "'Events' is empty", {
			description: 'Choose at least one Salesteam event to start this workflow.',
		});
	}
	return { url, events, campaignIds: textList(ctx.getNodeParameter('campaignIds', [])) };
}

/** Removes a webhook from Salesteam. One that is already gone counts as removed. */
async function removeWebhook(this: IHookFunctions, id: string): Promise<void> {
	try {
		await salesteamApiRequest.call(this, 'DELETE', `/webhooks/${encodeURIComponent(id)}`);
	} catch (error) {
		if (error instanceof NodeApiError && error.httpCode === '404') return;
		throw new NodeApiError(this.getNode(), error as JsonObject);
	}
}

/** The body exactly as Salesteam sent it. n8n keeps it as rawBody for webhook triggers. */
function rawBodyOf(request: unknown, parsed: IDataObject): string | Buffer {
	const raw = (request as { rawBody?: unknown } | undefined)?.rawBody;
	if (Buffer.isBuffer(raw) || typeof raw === 'string') return raw;
	// Without it, Salesteam's JSON serializes back to the same text it signed.
	return JSON.stringify(parsed);
}

function firstHeader(value: string | string[] | undefined): string | undefined {
	return Array.isArray(value) ? value[0] : value;
}
