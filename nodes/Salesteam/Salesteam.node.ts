import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { campaignFields, campaignOperations } from './descriptions/CampaignDescription';
import { conversationFields, conversationOperations } from './descriptions/ConversationDescription';
import {
	leadFields,
	leadOperations,
	leadReferenceFields,
	newLeadFields,
} from './descriptions/LeadDescription';
import { listFields, listOperations } from './descriptions/ListDescription';
import { webhookFields, webhookOperations } from './descriptions/WebhookDescription';
import {
	getCampaignOptions,
	getListOptions,
	getTagOptions,
	getWebhookOptions,
	isObject,
	salesteamApiRequest,
	salesteamApiRequestAllItems,
} from './GenericFunctions';

export class Salesteam implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Salesteam',
		name: 'salesteam',
		icon: { light: 'file:../../icons/salesteam.svg', dark: 'file:../../icons/salesteam.dark.svg' },
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Add leads to Salesteam campaigns, stop, pause or tag them, and read conversations',
		defaults: {
			name: 'Salesteam',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'salesteamApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Campaign',
						value: 'campaign',
					},
					{
						name: 'Conversation',
						value: 'conversation',
					},
					{
						name: 'Lead',
						value: 'lead',
					},
					{
						name: 'List',
						value: 'list',
					},
					{
						name: 'Webhook',
						value: 'webhook',
					},
				],
				default: 'campaign',
			},
			...campaignOperations,
			...conversationOperations,
			...leadOperations,
			...listOperations,
			...webhookOperations,
			...campaignFields,
			...listFields,
			...newLeadFields,
			...leadReferenceFields,
			...leadFields,
			{
				displayName: 'Return All',
				name: 'returnAll',
				type: 'boolean',
				default: false,
				description: 'Whether to return all results or only up to a given limit',
				displayOptions: {
					show: {
						resource: ['campaign', 'conversation', 'list'],
						operation: ['getAll'],
					},
				},
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: {
					minValue: 1,
				},
				default: 50,
				description: 'Max number of results to return',
				displayOptions: {
					show: {
						resource: ['campaign', 'conversation', 'list'],
						operation: ['getAll'],
						returnAll: [false],
					},
				},
			},
			...conversationFields,
			...webhookFields,
		],
	};

	methods = {
		loadOptions: {
			getCampaigns: getCampaignOptions,
			getLists: getListOptions,
			getTags: getTagOptions,
			getWebhooks: getWebhookOptions,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				const result = await runOperation.call(this, resource, operation, i);
				for (const json of Array.isArray(result) ? result : [result]) {
					returnData.push({ json, pairedItem: { item: i } });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: error.message,
							...(error.description ? { description: error.description } : {}),
						},
						pairedItem: { item: i },
					});
					continue;
				}
				if (error instanceof NodeApiError) {
					throw new NodeApiError(this.getNode(), error as unknown as JsonObject, { itemIndex: i });
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}

async function runOperation(
	this: IExecuteFunctions,
	resource: string,
	operation: string,
	i: number,
): Promise<IDataObject | IDataObject[]> {
	switch (`${resource}:${operation}`) {
		case 'campaign:addLead':
			return await addLead.call(this, `${campaignPath(this, i)}/leads`, i);
		case 'campaign:get':
			return dataOf(
				await salesteamApiRequest.call(this, 'GET', campaignPath(this, i), { itemIndex: i }),
			);
		case 'campaign:getAll':
			return await getMany.call(this, '/campaigns', i);
		case 'campaign:pauseLead':
		case 'campaign:resumeLead':
		case 'campaign:stopLead':
			// POST /campaigns/{id}/leads/pause, /resume or /stop. Repeating one is safe: changed is then false.
			return dataOf(
				await salesteamApiRequest.call(
					this,
					'POST',
					`${campaignPath(this, i)}/leads/${operation.replace(/Lead$/, '')}`,
					{
						body: leadReference(this, i),
						itemIndex: i,
					},
				),
			);

		case 'list:addLead':
			return await addLead.call(
				this,
				`/lists/${pathId(this, 'listId', 'List Name or ID', i)}/leads`,
				i,
			);
		case 'list:getAll':
			return await getMany.call(this, '/lists', i);

		case 'lead:get':
			return dataOf(
				await salesteamApiRequest.call(
					this,
					'GET',
					`/leads/${pathId(this, 'leadId', 'Lead ID', i)}`,
					{
						itemIndex: i,
					},
				),
			);
		case 'lead:find': {
			const by = this.getNodeParameter('findBy', i) === 'email' ? 'email' : 'linkedinUrl';
			const value = requiredText(this, by, by === 'email' ? 'Email' : 'LinkedIn URL', i);
			const found = await salesteamApiRequest.call(this, 'GET', '/leads', {
				qs: { [by]: value },
				itemIndex: i,
			});
			return Array.isArray(found.data) ? (found.data as IDataObject[]).filter(isObject) : [];
		}
		case 'lead:addTags':
		case 'lead:removeTags':
			return dataOf(
				await salesteamApiRequest.call(
					this,
					'POST',
					operation === 'addTags' ? '/leads/tags' : '/leads/tags/remove',
					{
						body: { ...leadReference(this, i), tags: tagNames(this, i) },
						itemIndex: i,
					},
				),
			);

		case 'conversation:get':
			return dataOf(
				await salesteamApiRequest.call(
					this,
					'GET',
					`/conversations/${pathId(this, 'conversationId', 'Conversation ID', i)}`,
					{ itemIndex: i },
				),
			);
		case 'conversation:getAll': {
			const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
			const qs: IDataObject = {};
			for (const key of ['campaignId', 'leadId', 'updatedSince']) {
				const value = filters[key];
				const text =
					typeof value === 'string'
						? value.trim()
						: value === undefined || value === null
							? ''
							: String(value);
				if (text) qs[key] = text;
			}
			return await getMany.call(this, '/conversations', i, qs, 100);
		}

		case 'webhook:sendTest':
			return dataOf(
				await salesteamApiRequest.call(
					this,
					'POST',
					`/webhooks/${pathId(this, 'webhookId', 'Webhook Name or ID', i)}/test`,
					{ body: { event: this.getNodeParameter('event', i) as string }, itemIndex: i },
				),
			);
	}

	throw new NodeOperationError(
		this.getNode(),
		`The operation '${operation}' isn’t available for '${resource}'`,
		{
			itemIndex: i,
		},
	);
}

/** Adds one person to a campaign or a list and returns what happened to them. */
async function addLead(this: IExecuteFunctions, path: string, i: number): Promise<IDataObject> {
	const data = dataOf(
		await salesteamApiRequest.call(this, 'POST', path, {
			body: { leads: [newLead(this, i)] },
			itemIndex: i,
		}),
	);
	const first = Array.isArray(data.results) ? data.results.find(isObject) : undefined;
	// One lead per request, so the answer's per-lead result is the output: status (added, updated or
	// skipped), leadId, reason and message when skipped, and for campaigns enrolled and note.
	const result: IDataObject = { ...(first ?? {}) };
	delete result.index;
	if (isObject(data.campaign)) result.campaign = data.campaign;
	if (isObject(data.list)) result.list = data.list;
	return result;
}

const LEAD_TEXT_FIELDS = [
	'firstName',
	'lastName',
	'email',
	'title',
	'company',
	'location',
	'industry',
	'headline',
];

function newLead(ctx: IExecuteFunctions, i: number): IDataObject {
	const lead: IDataObject = { linkedinUrl: requiredText(ctx, 'linkedinUrl', 'LinkedIn URL', i) };
	const extra = ctx.getNodeParameter('additionalFields', i, {}) as IDataObject;
	for (const field of LEAD_TEXT_FIELDS) {
		const value = extra[field];
		const text =
			typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
		if (text) lead[field] = text;
	}
	const rows =
		isObject(extra.customFields) && Array.isArray(extra.customFields.field)
			? extra.customFields.field
			: [];
	const customFields: IDataObject = {};
	for (const row of rows) {
		if (!isObject(row) || typeof row.name !== 'string' || !row.name.trim()) continue;
		const value = row.value === undefined || row.value === null ? '' : String(row.value);
		// An empty value is skipped, so a mapped field that came out empty never erases saved data.
		if (value !== '') customFields[row.name.trim()] = value;
	}
	if (Object.keys(customFields).length) lead.customFields = customFields;
	return lead;
}

/** The person a change is for, as { linkedinUrl }, { email } or { leadId }. */
function leadReference(ctx: IExecuteFunctions, i: number): IDataObject {
	const by = ctx.getNodeParameter('identifyBy', i) as string;
	if (by === 'email') return { email: requiredText(ctx, 'email', 'Email', i) };
	if (by === 'leadId') return { leadId: requiredText(ctx, 'leadId', 'Lead ID', i) };
	return { linkedinUrl: requiredText(ctx, 'linkedinUrl', 'LinkedIn URL', i) };
}

function tagNames(ctx: IExecuteFunctions, i: number): string[] {
	const value = ctx.getNodeParameter('tags', i, []);
	const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
	const tags = Array.from(
		new Set(list.map((tag) => String(tag).trim()).filter((tag) => tag.length > 0)),
	);
	if (!tags.length) {
		throw new NodeOperationError(ctx.getNode(), "'Tag Names or IDs' is empty", {
			itemIndex: i,
			description: 'Choose at least one tag, or map tag names separated by commas.',
		});
	}
	return tags;
}

async function getMany(
	this: IExecuteFunctions,
	path: string,
	i: number,
	qs: IDataObject = {},
	pageSize?: number,
): Promise<IDataObject[]> {
	const returnAll = this.getNodeParameter('returnAll', i) as boolean;
	const limit = returnAll ? undefined : (this.getNodeParameter('limit', i) as number);
	return await salesteamApiRequestAllItems.call(this, path, { qs, limit, pageSize, itemIndex: i });
}

function requiredText(ctx: IExecuteFunctions, name: string, label: string, i: number): string {
	const value = ctx.getNodeParameter(name, i, '');
	const text =
		typeof value === 'string'
			? value.trim()
			: value === undefined || value === null
				? ''
				: String(value).trim();
	if (!text) {
		throw new NodeOperationError(ctx.getNode(), `'${label}' is empty`, {
			itemIndex: i,
			description: `Fill in '${label}', or map it from an earlier node.`,
		});
	}
	return text;
}

/** An ID for an API path. Salesteam IDs are letters, numbers, dashes and underscores. */
function pathId(ctx: IExecuteFunctions, name: string, label: string, i: number): string {
	return encodeURIComponent(requiredText(ctx, name, label, i));
}

function campaignPath(ctx: IExecuteFunctions, i: number): string {
	return `/campaigns/${pathId(ctx, 'campaignId', 'Campaign Name or ID', i)}`;
}

function dataOf(answer: IDataObject): IDataObject {
	return isObject(answer.data) ? answer.data : {};
}
