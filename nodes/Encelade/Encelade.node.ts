import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { enceladeApiRequest, enceladeApiRequestAllItems } from './GenericFunctions';

const pageCountOptions: INodePropertyOptions[] = [
	{ name: 'Auto', value: 'auto' },
	...Array.from({ length: 47 }, (_unused, index) => {
		const value = String(index + 4);
		return { name: value, value };
	}),
];

const RUNS_ENDPOINT = '/api/public/v1/generation/runs';

export class Encelade implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Encelade',
		name: 'encelade',
		icon: 'file:encelade.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Generate and manage AI presentations with the Encelade API',
		defaults: {
			name: 'Encelade',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'enceladeApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Generation Run', value: 'generationRun' },
					{ name: 'Presentation', value: 'presentation' },
				],
				default: 'presentation',
			},

			// ----------------------------------------------------------------
			//                       Presentation operations
			// ----------------------------------------------------------------
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['presentation'] } },
				options: [
					{
						name: 'Delete',
						value: 'delete',
						action: 'Delete a presentation',
						description: 'Delete a presentation',
					},
					{
						name: 'Generate',
						value: 'generate',
						action: 'Generate a presentation',
						description: 'Start a generation run and return its run ID',
					},
					{
						name: 'Get',
						value: 'get',
						action: 'Get a presentation',
						description: 'Retrieve a single presentation by ID',
					},
					{
						name: 'Get Many',
						value: 'getAll',
						action: 'Get many presentations',
						description: 'List presentations',
					},
					{
						name: 'Get Published',
						value: 'getPublished',
						action: 'Get a published presentation',
						description: 'Retrieve a published presentation by its public slug (no token required)',
					},
					{
						name: 'Update',
						value: 'update',
						action: 'Update a presentation',
						description: 'Update presentation settings',
					},
				],
				default: 'generate',
			},

			// ----------------------------------------------------------------
			//                      Generation run operations
			// ----------------------------------------------------------------
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['generationRun'] } },
				options: [
					{
						name: 'Cancel',
						value: 'cancel',
						action: 'Cancel a generation run',
						description: 'Cancel a generation run that has not finished',
					},
					{
						name: 'Get',
						value: 'get',
						action: 'Get a generation run',
						description: 'Get the status, plan and link of a generation run',
					},
				],
				default: 'get',
			},

			// ----------------------------------------------------------------
			//                             Generate
			// ----------------------------------------------------------------
			{
				displayName: 'Brief',
				name: 'brief',
				type: 'string',
				typeOptions: { rows: 6 },
				default: '',
				required: true,
				placeholder: 'Q3 product strategy review for the executive team. Notes: ...',
				displayOptions: { show: { resource: ['presentation'], operation: ['generate'] } },
				description:
					'What to make, plus any notes or data to build it from (up to 200,000 characters). Links in the brief are read.',
			},
			{
				displayName: 'Artifact Type',
				name: 'artifactType',
				type: 'options',
				default: 'deck',
				displayOptions: { show: { resource: ['presentation'], operation: ['generate'] } },
				options: [
					{ name: 'Deck', value: 'deck' },
					{ name: 'One-Pager', value: 'one_pager' },
					{ name: 'Proposal', value: 'proposal' },
				],
				description: 'What to generate',
			},
			{
				displayName: 'Page Count',
				name: 'pageCount',
				type: 'options',
				default: 'auto',
				displayOptions: {
					show: { resource: ['presentation'], operation: ['generate'] },
					hide: { artifactType: ['one_pager'] },
				},
				options: pageCountOptions,
				description:
					"Number of pages to generate (4–50, up to your plan's page limit), or Auto to let Encelade decide",
			},
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: { show: { resource: ['presentation'], operation: ['generate'] } },
				options: [
					{
						displayName: 'Audience',
						name: 'audience',
						type: 'string',
						default: '',
						description: 'Who the presentation is for',
					},
					{
						displayName: 'Call To Action',
						name: 'cta',
						type: 'string',
						default: '',
						description: 'What the audience should do next',
					},
					{
						displayName: 'Fit To Page Cap',
						name: 'fitToPageCap',
						type: 'boolean',
						default: false,
						description:
							"Whether to condense the presentation into your plan's page cap instead of failing when it needs more pages",
					},
					{
						displayName: 'Language',
						name: 'locale',
						type: 'options',
						default: 'en',
						options: [
							{ name: 'English', value: 'en' },
							{ name: 'German', value: 'de' },
							{ name: 'Spanish', value: 'es' },
							{ name: 'Ukrainian', value: 'uk' },
						],
						description: 'Language of the presentation. Leave unset to detect it from the brief.',
					},
					{
						displayName: 'One-Pager Design',
						name: 'onePagerDesign',
						type: 'options',
						default: 'auto',
						options: [
							{ name: 'Auto', value: 'auto' },
							{ name: 'Bands', value: 'bands' },
							{ name: 'Editorial', value: 'editorial' },
							{ name: 'Modular', value: 'modular' },
						],
						description: 'Layout of a one-pager. Ignored for decks and proposals.',
					},
					{
						displayName: 'Research',
						name: 'research',
						type: 'boolean',
						default: false,
						description: 'Whether the run may search the web for facts the brief lacks',
					},
					{
						displayName: 'Style',
						name: 'style',
						type: 'options',
						default: 'classic',
						options: [
							{ name: 'Cinematic', value: 'cinematic' },
							{ name: 'Classic', value: 'classic' },
						],
						description: 'Visual style of a deck. Ignored for one-pagers and proposals.',
					},
					{
						displayName: 'Theme',
						name: 'theme',
						type: 'string',
						default: '',
						placeholder: 'auto',
						description:
							'Leave empty to let Encelade pick, or enter a built-in theme ID or a workspace theme as "tenant-theme:{ID}"',
					},
					{
						displayName: 'Tone',
						name: 'tone',
						type: 'string',
						default: '',
						description: 'Tone of voice for the content',
					},
				],
			},

			// ----------------------------------------------------------------
			//                  Get / Update / Delete by ID
			// ----------------------------------------------------------------
			{
				displayName: 'Presentation ID',
				name: 'presentationId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: {
					show: { resource: ['presentation'], operation: ['get', 'update', 'delete'] },
				},
				description: 'The PID of the presentation',
			},
			{
				displayName: 'Slug',
				name: 'slug',
				type: 'string',
				default: '',
				required: true,
				displayOptions: { show: { resource: ['presentation'], operation: ['getPublished'] } },
				description: 'The public slug of the published presentation',
			},

			// ----------------------------------------------------------------
			//                            Get Many
			// ----------------------------------------------------------------
			{
				displayName: 'Return All',
				name: 'returnAll',
				type: 'boolean',
				default: false,
				displayOptions: { show: { resource: ['presentation'], operation: ['getAll'] } },
				description: 'Whether to return all results or only up to a given limit',
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: { minValue: 1, maxValue: 100 },
				default: 50,
				displayOptions: {
					show: { resource: ['presentation'], operation: ['getAll'], returnAll: [false] },
				},
				description: 'Max number of results to return',
			},

			// ----------------------------------------------------------------
			//                              Update
			// ----------------------------------------------------------------
			{
				displayName: 'Update Fields',
				name: 'updateFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: { show: { resource: ['presentation'], operation: ['update'] } },
				options: [
					{
						displayName: 'Branding ID',
						name: 'brandingId',
						type: 'string',
						default: '',
						description: 'Tenant branding profile to apply',
					},
					{
						displayName: 'Link Access',
						name: 'linkAccess',
						type: 'options',
						default: 'tenant',
						options: [
							{ name: 'Anyone', value: 'anyone' },
							{ name: 'Tenant', value: 'tenant' },
						],
						description: 'Who can open the share link',
					},
					{
						displayName: 'Link Role',
						name: 'linkRole',
						type: 'options',
						default: 'viewer',
						options: [
							{ name: 'Content Editor', value: 'content_editor' },
							{ name: 'Editor', value: 'editor' },
							{ name: 'Owner', value: 'owner' },
							{ name: 'Viewer', value: 'viewer' },
						],
						description: 'Role granted to link visitors',
					},
					{
						displayName: 'Name',
						name: 'name',
						type: 'string',
						default: '',
						description: 'New name for the presentation',
					},
					{
						displayName: 'Page Aspect Ratio',
						name: 'pageAspectRatio',
						type: 'options',
						default: '16:9',
						options: [
							{ name: '16:9', value: '16:9' },
							{ name: '3:2', value: '3:2' },
							{ name: 'Fluid', value: 'fluid' },
						],
						description: 'Aspect ratio of the pages',
					},
					{
						displayName: 'Page Numbers Enabled',
						name: 'pageNumbersEnabled',
						type: 'boolean',
						default: false,
						description: 'Whether page numbers are shown',
					},
					{
						displayName: 'Publish Description',
						name: 'publishDescription',
						type: 'string',
						default: '',
						description: 'Description shown on the published deck',
					},
					{
						displayName: 'Published',
						name: 'isPublished',
						type: 'boolean',
						default: false,
						description: 'Whether the presentation is published',
					},
					{
						displayName: 'Show Made With Encelade',
						name: 'showMadeWithEncelade',
						type: 'boolean',
						default: true,
						description: 'Whether to show the "Made with Encelade" badge',
					},
					{
						displayName: 'Theme',
						name: 'theme',
						type: 'string',
						default: '',
						description: 'Built-in theme name or "tenant-theme:{ID}"',
					},
				],
			},

			// ----------------------------------------------------------------
			//                     Generation run: Get / Cancel
			// ----------------------------------------------------------------
			{
				displayName: 'Run ID',
				name: 'runId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: { show: { resource: ['generationRun'], operation: ['get', 'cancel'] } },
				description: 'The run ID returned by the Generate operation',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;

				let responseData: IDataObject | IDataObject[] = {};

				if (resource === 'presentation') {
					if (operation === 'generate') {
						responseData = await enceladeApiRequest.call(
							this,
							'POST',
							RUNS_ENDPOINT,
							buildRunBody.call(this, i),
						);
					} else if (operation === 'get') {
						const id = this.getNodeParameter('presentationId', i) as string;
						responseData = await enceladeApiRequest.call(
							this,
							'GET',
							`/api/public/v1/projects/${encodeURIComponent(id)}`,
						);
					} else if (operation === 'getAll') {
						const returnAll = this.getNodeParameter('returnAll', i) as boolean;

						if (returnAll) {
							responseData = await enceladeApiRequestAllItems.call(this, '/api/public/v1/projects');
						} else {
							const limit = this.getNodeParameter('limit', i) as number;
							const response = (await enceladeApiRequest.call(
								this,
								'GET',
								'/api/public/v1/projects',
								{},
								{ limit },
							)) as { projects?: IDataObject[] };
							responseData = response.projects ?? [];
						}
					} else if (operation === 'update') {
						const id = this.getNodeParameter('presentationId', i) as string;
						const updateFields = this.getNodeParameter('updateFields', i, {}) as IDataObject;
						responseData = await enceladeApiRequest.call(
							this,
							'PATCH',
							`/api/public/v1/projects/${encodeURIComponent(id)}`,
							updateFields,
						);
					} else if (operation === 'delete') {
						const id = this.getNodeParameter('presentationId', i) as string;
						await enceladeApiRequest.call(
							this,
							'DELETE',
							`/api/public/v1/projects/${encodeURIComponent(id)}`,
						);
						responseData = { success: true };
					} else if (operation === 'getPublished') {
						const slug = this.getNodeParameter('slug', i) as string;
						responseData = await enceladeApiRequest.call(
							this,
							'GET',
							`/api/public/published/${encodeURIComponent(slug)}`,
						);
					}
				} else if (resource === 'generationRun') {
					const runId = this.getNodeParameter('runId', i) as string;
					const runPath = `${RUNS_ENDPOINT}/${encodeURIComponent(runId)}`;

					if (operation === 'get') {
						responseData = await enceladeApiRequest.call(this, 'GET', runPath);
					} else if (operation === 'cancel') {
						responseData = await enceladeApiRequest.call(this, 'POST', `${runPath}/cancel`);
					}
				}

				if (Array.isArray(responseData)) {
					for (const entry of responseData) {
						returnData.push({ json: entry, pairedItem: { item: i } });
					}
				} else {
					returnData.push({ json: responseData, pairedItem: { item: i } });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				const apiError =
					error instanceof NodeOperationError
						? error
						: new NodeApiError(this.getNode(), error as JsonObject, { itemIndex: i });
				throw apiError;
			}
		}

		return [returnData];
	}
}

// An empty Theme is not a valid theme, so blank fields are left out and the API's defaults apply.
function buildRunBody(this: IExecuteFunctions, i: number): IDataObject {
	const brief = this.getNodeParameter('brief', i) as string;
	if (!brief.trim()) {
		throw new NodeOperationError(this.getNode(), 'A Brief is required', { itemIndex: i });
	}

	const artifactType = this.getNodeParameter('artifactType', i, 'deck') as string;
	const body: IDataObject = { brief, artifactType };

	if (artifactType !== 'one_pager') {
		const pageCount = this.getNodeParameter('pageCount', i, 'auto') as string;
		body.pageCount = pageCount === 'auto' ? 'auto' : Number(pageCount);
	}

	const additionalFields = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
	for (const [key, value] of Object.entries(additionalFields)) {
		if (typeof value === 'string' && value.trim() === '') continue;
		body[key] = value;
	}

	return body;
}
