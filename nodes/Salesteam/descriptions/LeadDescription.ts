import type { INodeProperties } from 'n8n-workflow';

export const leadOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: {
			show: {
				resource: ['lead'],
			},
		},
		options: [
			{
				name: 'Add Tags',
				value: 'addTags',
				description: 'Tag a lead, creating any tag that doesn’t exist yet',
				action: 'Add tags to a lead',
			},
			{
				name: 'Find',
				value: 'find',
				description: 'Find a lead by LinkedIn profile URL or email',
				action: 'Find a lead by profile URL or email',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Get a lead with their campaigns, tags and custom fields',
				action: 'Get a lead',
			},
			{
				name: 'Remove Tags',
				value: 'removeTags',
				description: 'Remove tags from a lead and their conversations',
				action: 'Remove tags from a lead',
			},
		],
		default: 'addTags',
	},
];

const ADD_LEAD = {
	resource: ['campaign', 'list'],
	operation: ['addLead'],
};

/** The person to add to a campaign or a list. */
export const newLeadFields: INodeProperties[] = [
	{
		displayName: 'LinkedIn URL',
		name: 'linkedinUrl',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. https://www.linkedin.com/in/jamie-lee-example',
		description:
			'The person’s LinkedIn profile URL. Salesteam matches people by it, so adding someone twice never adds them twice.',
		displayOptions: {
			show: ADD_LEAD,
		},
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: {
			show: ADD_LEAD,
		},
		options: [
			{
				displayName: 'Company',
				name: 'company',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Custom Fields',
				name: 'customFields',
				type: 'fixedCollection',
				placeholder: 'Add Custom Field',
				typeOptions: {
					multipleValues: true,
				},
				default: {},
				description:
					'Up to 30 fields. A name has up to 40 letters, numbers, spaces, dots, dashes or underscores. Empty values are skipped.',
				options: [
					{
						displayName: 'Field',
						name: 'field',
						values: [
							{
								displayName: 'Name',
								name: 'name',
								type: 'string',
								default: '',
								placeholder: 'e.g. source',
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
								placeholder: 'e.g. Webinar',
							},
						],
					},
				],
			},
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				placeholder: 'name@email.com',
				default: '',
				description:
					'The person’s email. It fills in an email Salesteam doesn’t have yet; one it found or verified stays.',
			},
			{
				displayName: 'First Name',
				name: 'firstName',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Headline',
				name: 'headline',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Industry',
				name: 'industry',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Last Name',
				name: 'lastName',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Location',
				name: 'location',
				type: 'string',
				default: '',
				placeholder: 'e.g. London, United Kingdom',
			},
			{
				displayName: 'Title',
				name: 'title',
				type: 'string',
				default: '',
				description: 'Job title',
			},
		],
	},
];

const LEAD_REFERENCE = {
	resource: ['campaign', 'lead'],
	operation: ['addTags', 'pauseLead', 'removeTags', 'resumeLead', 'stopLead'],
};

/** Who a change is for: Salesteam finds the person by LinkedIn URL, email or lead ID. */
export const leadReferenceFields: INodeProperties[] = [
	{
		displayName: 'Identify Lead By',
		name: 'identifyBy',
		type: 'options',
		options: [
			{
				name: 'LinkedIn URL',
				value: 'linkedinUrl',
			},
			{
				name: 'Email',
				value: 'email',
				description: 'The email Salesteam found or was sent with the lead',
			},
			{
				name: 'Lead ID',
				value: 'leadId',
			},
		],
		default: 'linkedinUrl',
		displayOptions: {
			show: LEAD_REFERENCE,
		},
	},
	{
		displayName: 'LinkedIn URL',
		name: 'linkedinUrl',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. https://www.linkedin.com/in/jamie-lee-example',
		description: 'The person’s LinkedIn profile URL',
		displayOptions: {
			show: {
				...LEAD_REFERENCE,
				identifyBy: ['linkedinUrl'],
			},
		},
	},
	{
		displayName: 'Email',
		name: 'email',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'name@email.com',
		description:
			'The email Salesteam found or was sent with the lead. If two people share it, use their LinkedIn URL instead.',
		displayOptions: {
			show: {
				...LEAD_REFERENCE,
				identifyBy: ['email'],
			},
		},
	},
	{
		displayName: 'Lead ID',
		name: 'leadId',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. lead_8f2c',
		displayOptions: {
			show: {
				...LEAD_REFERENCE,
				identifyBy: ['leadId'],
			},
		},
	},
];

export const leadFields: INodeProperties[] = [
	// ---- lead: get
	{
		displayName: 'Lead ID',
		name: 'leadId',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. lead_8f2c',
		description: 'The lead’s ID, as events and other operations show it',
		displayOptions: {
			show: {
				resource: ['lead'],
				operation: ['get'],
			},
		},
	},

	// ---- lead: find
	{
		displayName: 'Find By',
		name: 'findBy',
		type: 'options',
		options: [
			{
				name: 'LinkedIn URL',
				value: 'linkedinUrl',
			},
			{
				name: 'Email',
				value: 'email',
				description: 'The email Salesteam found or was sent with the lead',
			},
		],
		default: 'linkedinUrl',
		displayOptions: {
			show: {
				resource: ['lead'],
				operation: ['find'],
			},
		},
	},
	{
		displayName: 'LinkedIn URL',
		name: 'linkedinUrl',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. https://www.linkedin.com/in/jamie-lee-example',
		description: 'The person’s LinkedIn profile URL. Nothing is returned when nobody matches.',
		displayOptions: {
			show: {
				resource: ['lead'],
				operation: ['find'],
				findBy: ['linkedinUrl'],
			},
		},
	},
	{
		displayName: 'Email',
		name: 'email',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'name@email.com',
		description:
			'The email Salesteam found or was sent with the lead. Nothing is returned when nobody matches.',
		displayOptions: {
			show: {
				resource: ['lead'],
				operation: ['find'],
				findBy: ['email'],
			},
		},
	},

	// ---- lead: add tags, remove tags
	{
		displayName: 'Tag Names or IDs',
		name: 'tags',
		type: 'multiOptions',
		typeOptions: {
			loadOptionsMethod: 'getTags',
		},
		required: true,
		default: [],
		description:
			'Tags to add, up to 20. A name that doesn’t exist yet becomes a new tag; in an expression, separate names with commas. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: {
			show: {
				resource: ['lead'],
				operation: ['addTags'],
			},
		},
	},
	{
		displayName: 'Tag Names or IDs',
		name: 'tags',
		type: 'multiOptions',
		typeOptions: {
			loadOptionsMethod: 'getTags',
		},
		required: true,
		default: [],
		description:
			'Tags to remove from the lead and their conversations. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: {
			show: {
				resource: ['lead'],
				operation: ['removeTags'],
			},
		},
	},
];
