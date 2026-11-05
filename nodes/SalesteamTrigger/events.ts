import type { INodePropertyOptions } from 'n8n-workflow';

// Salesteam's webhook events: the names of its event catalog (lib/integrations.ts
// in the Salesteam app), which match HeyReach's where Salesteam has the same
// event. n8n lists options alphabetically. Descriptions follow n8n's linter: no
// final period on a single sentence, and "URL" in capitals (so post.liked's
// mention of the post.url field is reworded). Salesteam's catalog only grows.
// When it adds an event, add it here in order.
export const SALESTEAM_EVENTS: INodePropertyOptions[] = [
	{
		name: 'Campaign Completed',
		value: 'campaign.completed',
		description: 'A campaign finished: everyone in it is done. results has its numbers.',
	},
	{
		name: 'Connection Request Accepted',
		value: 'connection.accepted',
		description: 'Someone accepted a connection request from a campaign',
	},
	{
		name: 'Connection Request Sent',
		value: 'connection.sent',
		description: 'A campaign sent someone a connection request',
	},
	{
		name: 'Every InMail Reply Received',
		value: 'inmail.replied',
		description: 'A lead answered an InMail. Fires for every answer.',
	},
	{
		name: 'Every Message Reply Received',
		value: 'message.replied',
		description: 'A lead sent a LinkedIn message. Fires for every reply.',
	},
	{
		name: 'First InMail Reply Received',
		value: 'inmail.first_reply',
		description: 'A lead a campaign reached answered an InMail for the first time',
	},
	{
		name: 'First Message Reply Received',
		value: 'message.first_reply',
		description: 'A lead a campaign reached replied to a LinkedIn message for the first time',
	},
	{
		name: 'Follow Sent',
		value: 'profile.followed',
		description: 'A campaign followed a lead on LinkedIn',
	},
	{
		name: 'InMail Sent',
		value: 'inmail.sent',
		description: 'A campaign sent an InMail',
	},
	{
		name: 'Lead Auto Tagged Generic',
		value: 'lead.auto_tagged_generic',
		description:
			'Salesteam read a lead’s first reply and it was neither a yes nor a no, like a thank-you or an out-of-office. No tag is added.',
	},
	{
		name: 'Lead Auto Tagged Negative',
		value: 'lead.auto_tagged_negative',
		description:
			'Salesteam read a lead’s first reply and it was a no. The conversation is tagged Not interested.',
	},
	{
		name: 'Lead Auto Tagged Positive',
		value: 'lead.auto_tagged_positive',
		description:
			'Salesteam read a lead’s first reply and it was a yes, like asking for a call. The conversation is tagged Interested.',
	},
	{
		name: 'Lead Tag Updated',
		value: 'lead.tagged',
		description: 'A lead got a tag: in the inbox, from a campaign step or through the API',
	},
	{
		name: 'Liked Post',
		value: 'post.liked',
		description:
			'A campaign liked a lead’s latest LinkedIn post. The event links to the post when LinkedIn names it.',
	},
	{
		name: 'LinkedIn Account Disconnected',
		value: 'account.disconnected',
		description: 'A LinkedIn account was disconnected. Its campaigns wait until it’s reconnected.',
	},
	{
		name: 'Message Sent',
		value: 'message.sent',
		description: 'A LinkedIn message went out in a conversation Salesteam shows',
	},
	{
		name: 'Requests Paused for Low Acceptance',
		value: 'campaign.requests_paused',
		description:
			'Few people accepted a campaign’s connection requests, so new ones paused to protect the account. Messages go on.',
	},
	{
		name: 'Sequence Finished',
		value: 'lead.finished',
		description: 'A lead left a campaign: the sequence ended, they replied, or they were stopped',
	},
	{
		name: 'Viewed Profile',
		value: 'profile.viewed',
		description: 'A campaign viewed a lead’s LinkedIn profile',
	},
];

/** The events above plus Salesteam's connection check, for sending a test, in the same order. */
export const TEST_EVENT_OPTIONS: INodePropertyOptions[] = [
	{
		name: 'Campaign Completed',
		value: 'campaign.completed',
		description: 'A campaign finished: everyone in it is done. results has its numbers.',
	},
	{
		name: 'Connection Request Accepted',
		value: 'connection.accepted',
		description: 'Someone accepted a connection request from a campaign',
	},
	{
		name: 'Connection Request Sent',
		value: 'connection.sent',
		description: 'A campaign sent someone a connection request',
	},
	{
		name: 'Every InMail Reply Received',
		value: 'inmail.replied',
		description: 'A lead answered an InMail. Fires for every answer.',
	},
	{
		name: 'Every Message Reply Received',
		value: 'message.replied',
		description: 'A lead sent a LinkedIn message. Fires for every reply.',
	},
	{
		name: 'First InMail Reply Received',
		value: 'inmail.first_reply',
		description: 'A lead a campaign reached answered an InMail for the first time',
	},
	{
		name: 'First Message Reply Received',
		value: 'message.first_reply',
		description: 'A lead a campaign reached replied to a LinkedIn message for the first time',
	},
	{
		name: 'Follow Sent',
		value: 'profile.followed',
		description: 'A campaign followed a lead on LinkedIn',
	},
	{
		name: 'InMail Sent',
		value: 'inmail.sent',
		description: 'A campaign sent an InMail',
	},
	{
		name: 'Lead Auto Tagged Generic',
		value: 'lead.auto_tagged_generic',
		description:
			'Salesteam read a lead’s first reply and it was neither a yes nor a no, like a thank-you or an out-of-office. No tag is added.',
	},
	{
		name: 'Lead Auto Tagged Negative',
		value: 'lead.auto_tagged_negative',
		description:
			'Salesteam read a lead’s first reply and it was a no. The conversation is tagged Not interested.',
	},
	{
		name: 'Lead Auto Tagged Positive',
		value: 'lead.auto_tagged_positive',
		description:
			'Salesteam read a lead’s first reply and it was a yes, like asking for a call. The conversation is tagged Interested.',
	},
	{
		name: 'Lead Tag Updated',
		value: 'lead.tagged',
		description: 'A lead got a tag: in the inbox, from a campaign step or through the API',
	},
	{
		name: 'Liked Post',
		value: 'post.liked',
		description:
			'A campaign liked a lead’s latest LinkedIn post. The event links to the post when LinkedIn names it.',
	},
	{
		name: 'LinkedIn Account Disconnected',
		value: 'account.disconnected',
		description: 'A LinkedIn account was disconnected. Its campaigns wait until it’s reconnected.',
	},
	{
		name: 'Message Sent',
		value: 'message.sent',
		description: 'A LinkedIn message went out in a conversation Salesteam shows',
	},
	{
		name: 'Requests Paused for Low Acceptance',
		value: 'campaign.requests_paused',
		description:
			'Few people accepted a campaign’s connection requests, so new ones paused to protect the account. Messages go on.',
	},
	{
		name: 'Sequence Finished',
		value: 'lead.finished',
		description: 'A lead left a campaign: the sequence ended, they replied, or they were stopped',
	},
	{
		name: 'Test Ping',
		value: 'test.ping',
		description:
			'A connection check without a lead. Only a trigger that is listening for a test event shows it.',
	},
	{
		name: 'Viewed Profile',
		value: 'profile.viewed',
		description: 'A campaign viewed a lead’s LinkedIn profile',
	},
];
