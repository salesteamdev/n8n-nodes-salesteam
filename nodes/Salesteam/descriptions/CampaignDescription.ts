import type { INodeProperties } from 'n8n-workflow';

export const campaignOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['campaign'],
			},
		},
		options: [
			{
				name: 'Add Lead',
				value: 'addLead',
				description: 'Add a person to a campaign, which contacts them within its limits and hours',
				action: 'Add a lead to a campaign',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Get a campaign with how many people are in each state',
				action: 'Get a campaign',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get many campaigns',
				action: 'Get many campaigns',
			},
			{
				name: 'Pause Lead',
				value: 'pauseLead',
				description: 'Hold a person in a campaign until they are resumed',
				action: 'Pause a lead in a campaign',
			},
			{
				name: 'Resume Lead',
				value: 'resumeLead',
				description: 'Resume a paused person at the step where they stopped',
				action: 'Resume a lead in a campaign',
			},
			{
				name: 'Stop Lead',
				value: 'stopLead',
				description:
					'Take a person out of a campaign for good, for example after they booked a call',
				action: 'Stop a lead in a campaign',
			},
		],
		default: 'addLead',
	},
];

export const campaignFields: INodeProperties[] = [
	{
		displayName: 'Campaign Name or ID',
		name: 'campaignId',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getCampaigns',
		},
		required: true,
		default: '',
		description:
			'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
		displayOptions: {
			show: {
				resource: ['campaign'],
				operation: ['addLead', 'get', 'pauseLead', 'resumeLead', 'stopLead'],
			},
		},
	},
];
