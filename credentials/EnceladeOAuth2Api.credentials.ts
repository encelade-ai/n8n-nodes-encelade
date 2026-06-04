import type { Icon, ICredentialType, INodeProperties } from 'n8n-workflow';

const DEFAULT_BASE_URL = 'https://www.encelade.ai';

/**
 * OAuth2 (PKCE) credential for Encelade.
 *
 * Encelade's authorization server is a public-client, PKCE-only
 * authorization-code flow (no client secret), so we extend n8n's generic
 * `oAuth2Api` and pin `grantType` to `pkce`. The user supplies a `Client ID`
 * obtained by registering their n8n redirect URL with Encelade (see the
 * connection guide); the Client Secret is left blank for public clients.
 *
 * The authorize/token URLs target the hosted instance — self-hosted Encelade
 * deployments should use the API Key credential instead.
 */
export class EnceladeOAuth2Api implements ICredentialType {
	name = 'enceladeOAuth2Api';

	extends = ['oAuth2Api'];

	displayName = 'Encelade OAuth2 API';

	documentationUrl = 'https://www.encelade.ai/docs';

	icon: Icon = 'file:../nodes/Encelade/encelade.svg';

	properties: INodeProperties[] = [
		{
			displayName: 'Grant Type',
			name: 'grantType',
			type: 'hidden',
			default: 'pkce',
		},
		{
			displayName: 'Authorization URL',
			name: 'authUrl',
			type: 'hidden',
			default: `${DEFAULT_BASE_URL}/oauth/authorize`,
		},
		{
			displayName: 'Access Token URL',
			name: 'accessTokenUrl',
			type: 'hidden',
			default: `${DEFAULT_BASE_URL}/api/oauth/token`,
		},
		{
			displayName: 'Scope',
			name: 'scope',
			type: 'hidden',
			default: '',
		},
		{
			displayName: 'Auth URI Query Parameters',
			name: 'authQueryParameters',
			type: 'hidden',
			default: '',
		},
		{
			displayName: 'Authentication',
			name: 'authentication',
			type: 'hidden',
			default: 'header',
		},
	];
}
