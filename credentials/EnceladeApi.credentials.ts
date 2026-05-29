import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class EnceladeApi implements ICredentialType {
	name = 'enceladeApi';

	displayName = 'Encelade API';

	documentationUrl = 'https://www.encelade.ai';

	icon: Icon = 'file:../nodes/Encelade/encelade.svg';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Your Encelade API token. Sent as a Bearer token in the Authorization header. The tenant is derived from the token, so no extra header is needed.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://www.encelade.ai',
			description:
				'Base URL of the Encelade instance. Change this only for self-hosted deployments.',
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
			baseURL: '={{$credentials.baseUrl}}',
			url: '/api/public/v1/projects',
			qs: { limit: 1 },
		},
	};
}
