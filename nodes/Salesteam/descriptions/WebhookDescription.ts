import type { INodeProperties } from 'n8n-workflow';
import { TEST_EVENT_OPTIONS } from '../../SalesteamTrigger/events';

export const webhookOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['webhook'],
			},
		},
		options: [
			{
				name: 'Send Test Event',
				value: 'sendTest',
				description:
					'Send a signed sample event, with fictional people, to a webhook added through the API',
				action: 'Send a test event to a webhook',
			},
		],
		default: 'sendTest',
	},
];

export const webhookFields: INodeProperties[] = [
	{
		displayName: 'Webhook Name or ID',
		name: 'webhookId',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getWebhooks',
		},
		required: true,
		default: '',
		description:
			'A webhook added through the API, such as the one a Salesteam Trigger registers (named after its workflow). Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: {
			show: {
				resource: ['webhook'],
				operation: ['sendTest'],
			},
		},
	},
	{
		displayName: 'Event',
		name: 'event',
		type: 'options',
		options: TEST_EVENT_OPTIONS,
		default: 'test.ping',
		description: 'The event to send a sample of',
		displayOptions: {
			show: {
				resource: ['webhook'],
				operation: ['sendTest'],
			},
		},
	},
];
