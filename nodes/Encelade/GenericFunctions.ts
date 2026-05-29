import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	IWebhookFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

const DEFAULT_BASE_URL = 'https://www.encelade.ai';

/**
 * Wraps an authenticated HTTP call to the Encelade public API. The credential's
 * generic `authenticate` block injects the Bearer token; here we only resolve
 * the (self-host-configurable) base URL and normalise the request shape.
 */
export async function enceladeApiRequest(
	this: IExecuteFunctions | IHookFunctions | ILoadOptionsFunctions | IWebhookFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	body: IDataObject = {},
	qs: IDataObject = {},
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
	const credentials = await this.getCredentials('enceladeApi');
	const baseUrl = ((credentials.baseUrl as string) || DEFAULT_BASE_URL).replace(/\/+$/, '');

	const options: IHttpRequestOptions = {
		method,
		url: `${baseUrl}${endpoint}`,
		json: true,
	};

	if (Object.keys(body).length !== 0) {
		options.body = body;
	}
	if (Object.keys(qs).length !== 0) {
		options.qs = qs;
	}

	try {
		return await this.helpers.httpRequestWithAuthentication.call(this, 'enceladeApi', options);
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as JsonObject);
	}
}

interface ProjectsListResponse {
	projects?: IDataObject[];
	nextCursor?: string | null;
	hasMore?: boolean;
}

/**
 * Follows the cursor-based pagination of `GET /projects` until exhausted.
 */
export async function enceladeApiRequestAllItems(
	this: IExecuteFunctions,
	endpoint: string,
	qs: IDataObject = {},
): Promise<IDataObject[]> {
	const returnData: IDataObject[] = [];
	const query: IDataObject = { ...qs, limit: 100 };
	let response: ProjectsListResponse;

	do {
		response = (await enceladeApiRequest.call(
			this,
			'GET',
			endpoint,
			{},
			query,
		)) as ProjectsListResponse;

		if (Array.isArray(response.projects)) {
			returnData.push(...response.projects);
		}

		query.cursor = response.nextCursor ?? undefined;
	} while (response.hasMore === true && query.cursor);

	return returnData;
}
