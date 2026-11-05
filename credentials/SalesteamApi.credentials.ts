import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class SalesteamApi implements ICredentialType {
	name = 'salesteamApi';

	displayName = 'Salesteam API';

	icon: Icon = { light: 'file:../icons/salesteam.svg', dark: 'file:../icons/salesteam.dark.svg' };

	documentationUrl = 'https://www.npmjs.com/package/n8n-nodes-salesteam#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: {
				password: true,
			},
			required: true,
			default: '',
			description:
				'A workspace API key from Salesteam: Settings → API keys. It starts with st_live_.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://app.salesteam.dev/api/v1',
			url: '/me',
			method: 'GET',
		},
	};
}
