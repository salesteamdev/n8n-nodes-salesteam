import type { INodeProperties } from 'n8n-workflow';

export const conversationOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['conversation'],
			},
		},
		options: [
			{
				name: 'Get',
				value: 'get',
				description: 'Get a conversation with all its messages, oldest first',
				action: 'Get a conversation',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get many conversations from the inbox, newest first',
				action: 'Get many conversations',
			},
		],
		default: 'getAll',
	},
];

export const conversationFields: INodeProperties[] = [
	{
		displayName: 'Conversation ID',
		name: 'conversationId',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. conv_8f2c',
		description: 'The conversation’s ID, as events and Get Many show it',
		displayOptions: {
			show: {
				resource: ['conversation'],
				operation: ['get'],
			},
		},
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: {
			show: {
				resource: ['conversation'],
				operation: ['getAll'],
			},
		},
		options: [
			{
				displayName: 'Campaign Name or ID',
				name: 'campaignId',
				type: 'options',
				typeOptions: {
					loadOptionsMethod: 'getCampaigns',
				},
				default: '',
				description:
					'Only conversations from this campaign. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
			{
				displayName: 'Lead ID',
				name: 'leadId',
				type: 'string',
				default: '',
				description: 'Only conversations with this lead',
			},
			{
				displayName: 'Updated Since',
				name: 'updatedSince',
				type: 'dateTime',
				default: '',
				description: 'Only conversations updated at or after this time',
			},
		],
	},
];
