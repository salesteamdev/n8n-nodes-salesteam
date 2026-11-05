import type { INodeProperties } from 'n8n-workflow';

export const listOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['list'],
			},
		},
		options: [
			{
				name: 'Add Lead',
				value: 'addLead',
				description: 'Add a person to a lead list, which its campaigns take on their next run',
				action: 'Add a lead to a list',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get many lead lists',
				action: 'Get many lists',
			},
		],
		default: 'addLead',
	},
];

export const listFields: INodeProperties[] = [
	{
		displayName: 'List Name or ID',
		name: 'listId',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getLists',
		},
		required: true,
		default: '',
		description:
			'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
		displayOptions: {
			show: {
				resource: ['list'],
				operation: ['addLead'],
			},
		},
	},
];
