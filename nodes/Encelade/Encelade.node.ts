import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError, jsonParse } from 'n8n-workflow';

import { enceladeApiRequest, enceladeApiRequestAllItems } from './GenericFunctions';

const modelOptions: INodePropertyOptions[] = [
	{ name: 'Claude 3 Opus', value: 'claude-3-opus-20240229' },
	{ name: 'Claude 3.5 Haiku', value: 'claude-3-5-haiku-20241022' },
	{ name: 'Claude 3.5 Sonnet', value: 'claude-3-5-sonnet-20241022' },
	{ name: 'Claude 3.7 Sonnet', value: 'claude-3-7-sonnet-20250219' },
	{ name: 'Claude Haiku 4.5', value: 'claude-haiku-4-5-20251001' },
	{ name: 'Claude Opus 4.5', value: 'claude-opus-4-5-20251101' },
	{ name: 'Claude Sonnet 4', value: 'claude-sonnet-4-20250514' },
	{ name: 'Claude Sonnet 4.5 (Default)', value: 'claude-sonnet-4-5-20250929' },
	{ name: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash' },
	{ name: 'Gemini 2.5 Pro', value: 'gemini-2.5-pro' },
	{ name: 'GPT-5 Mini', value: 'gpt-5-mini' },
	{ name: 'GPT-5.4', value: 'gpt-5.4' },
	{ name: 'GPT-5.5', value: 'gpt-5.5' },
];

const pageCountOptions: INodePropertyOptions[] = [
	{ name: 'Auto', value: 'auto' },
	...Array.from({ length: 18 }, (_unused, index) => {
		const value = String(index + 3);
		return { name: value, value };
	}),
];

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
				displayOptions: { show: { authentication: ['apiKey'] } },
			},
			{
				name: 'enceladeOAuth2Api',
				required: true,
				displayOptions: { show: { authentication: ['oAuth2'] } },
			},
		],
		properties: [
			{
				displayName: 'Authentication',
				name: 'authentication',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'API Key', value: 'apiKey' },
					{ name: 'OAuth2 (PKCE)', value: 'oAuth2' },
				],
				default: 'apiKey',
				description: 'How to authenticate with the Encelade API',
			},
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Presentation', value: 'presentation' },
					{ name: 'Session', value: 'session' },
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
						description: 'Plan and generate a presentation in one asynchronous call',
					},
					{
						name: 'Generate From Plan',
						value: 'generateFromPlan',
						action: 'Generate a presentation from a plan',
						description: 'Build a presentation from an existing or edited plan',
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
						name: 'Plan Outline',
						value: 'plan',
						action: 'Plan a presentation outline',
						description: 'Generate an editable outline without building slides',
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
			//                        Session operations
			// ----------------------------------------------------------------
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['session'] } },
				options: [
					{
						name: 'Cancel',
						value: 'cancel',
						action: 'Cancel a generation',
						description: 'Cancel an in-progress generation session',
					},
					{
						name: 'Get Status',
						value: 'getStatus',
						action: 'Get generation status',
						description: 'Poll a generation session for its status and result',
					},
				],
				default: 'getStatus',
			},

			// ----------------------------------------------------------------
			//             Shared fields: Generate + Plan Outline
			// ----------------------------------------------------------------
			{
				displayName: 'Topic',
				name: 'topic',
				type: 'string',
				default: '',
				placeholder: 'Q3 product strategy review',
				displayOptions: { show: { resource: ['presentation'], operation: ['generate', 'plan'] } },
				description: 'High-level topic for the presentation',
			},
			{
				displayName: 'Outline Hints',
				name: 'outlineHints',
				type: 'string',
				typeOptions: { multipleValues: true, multipleValueButtonText: 'Add Hint' },
				default: [],
				required: true,
				displayOptions: { show: { resource: ['presentation'], operation: ['generate', 'plan'] } },
				description:
					'One or more prompts describing what the presentation should cover. At least one is required.',
			},
			{
				displayName: 'Page Count',
				name: 'pageCount',
				type: 'options',
				default: 'auto',
				displayOptions: { show: { resource: ['presentation'], operation: ['generate', 'plan'] } },
				options: pageCountOptions,
				description: 'Number of pages to generate, or Auto to let Encelade decide',
			},
			{
				displayName: 'Supporting Materials',
				name: 'supportingMaterials',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true },
				placeholder: 'Add Material',
				default: {},
				displayOptions: { show: { resource: ['presentation'], operation: ['generate', 'plan'] } },
				description: 'Reference materials to ground the presentation',
				options: [
					{
						displayName: 'Material',
						name: 'material',
						values: [
							{
								displayName: 'Asset ID',
								name: 'assetId',
								type: 'string',
								default: '',
								description: 'ID of a previously uploaded asset',
							},
							{
								displayName: 'Kind',
								name: 'kind',
								type: 'options',
								default: 'link',
								options: [
									{
										name: 'CSV Upload',
										value: 'csv_upload',
									},
									{
										name: 'DOCX Upload',
										value: 'docx_upload',
									},
									{
										name: 'Link',
										value: 'link',
									},
									{
										name: 'PDF Upload',
										value: 'pdf_upload',
									},
									{
										name: 'PPTX Upload',
										value: 'pptx_upload',
									},
									{
										name: 'Text Upload',
										value: 'text_upload',
									},
									{
										name: 'XLSX Upload',
										value: 'xlsx_upload',
									},
								],
								description: 'Type of material',
							},
							{
								displayName: 'MIME Type',
								name: 'mimeType',
								type: 'string',
								default: '',
								description: 'MIME type of the uploaded asset',
							},
							{
								displayName: 'Notes',
								name: 'notes',
								type: 'string',
								default: '',
								description: 'Extra context about how to use this material',
							},
							{
								displayName: 'Title',
								name: 'title',
								type: 'string',
								default: '',
								required: true,
								description: 'Label for this material',
							},
							{
								displayName: 'URL',
								name: 'url',
								type: 'string',
								default: '',
								description: 'Link to the material',
							},
						],
					},
				],
			},
			{
				displayName: 'Run in Background',
				name: 'background',
				type: 'boolean',
				default: false,
				displayOptions: { show: { resource: ['presentation'], operation: ['plan'] } },
				description:
					'Whether to plan asynchronously and return a session ID to poll, instead of waiting for the outline in the response',
			},
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: { show: { resource: ['presentation'], operation: ['generate', 'plan'] } },
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
						name: 'callToAction',
						type: 'string',
						default: '',
						description: 'Closing call to action',
					},
					{
						displayName: 'Callback URL',
						name: 'callbackUrl',
						type: 'string',
						default: '',
						placeholder: 'https://example.com/webhook',
						description:
							'HTTPS URL that receives a generation.completed / generation.failed callback when the deck finishes',
					},
					{
						displayName: 'Deep Research',
						name: 'deepResearch',
						type: 'boolean',
						default: false,
						description: 'Whether to run deep web research before planning (adds latency)',
					},
					{
						displayName: 'End User Email',
						name: 'endUserEmail',
						type: 'string',
						placeholder: 'name@email.com',
						default: '',
						description: 'Email of the end user a link-shared deck is generated for',
					},
					{
						displayName: 'End User Role',
						name: 'endUserRole',
						type: 'options',
						default: 'viewer',
						options: [
							{ name: 'Content Editor', value: 'content_editor' },
							{ name: 'Editor', value: 'editor' },
							{ name: 'Viewer', value: 'viewer' },
						],
						description: 'Access role granted to the end user on the shared link',
					},
					{
						displayName: 'Icon Family',
						name: 'iconFamily',
						type: 'options',
						default: 'lucide',
						options: [
							{ name: 'Emoji', value: 'emoji' },
							{ name: 'Lucide', value: 'lucide' },
							{ name: 'Nucleo Glass', value: 'nucleo-glass' },
							{ name: 'Nucleo Isometric', value: 'nucleo-isometric' },
						],
						description: 'Icon set used in the presentation',
					},
					{
						displayName: 'Image Style',
						name: 'imageStyle',
						type: 'string',
						default: '',
						description: 'Global style hint for generated imagery',
					},
					{
						displayName: 'Include Call To Action',
						name: 'includeCallToAction',
						type: 'boolean',
						default: true,
						description: 'Whether to include a closing call-to-action slide',
					},
					{
						displayName: 'Media Provider',
						name: 'mediaProvider',
						type: 'options',
						default: 'unsplash',
						options: [
							{ name: 'Generated', value: 'generated' },
							{ name: 'Giphy', value: 'giphy' },
							{ name: 'Unsplash', value: 'unsplash' },
						],
						description: 'Source for presentation media',
					},
					{
						displayName: 'Model',
						name: 'model',
						type: 'options',
						default: 'claude-sonnet-4-5-20250929',
						options: modelOptions,
						description: 'Model used for planning and generation',
					},
					{
						displayName: 'Theme',
						name: 'theme',
						type: 'string',
						default: '',
						placeholder: 'default',
						description:
							'Built-in theme name (default, simple, cyber, tropical-night, amber, obsidian, ivory, blueprint, calm, artemis, noir, editorial) or a tenant theme as "tenant-theme:{ID}"',
					},
					{
						displayName: 'Theme Mode',
						name: 'themeMode',
						type: 'options',
						default: 'light',
						options: [
							{ name: 'Dark', value: 'dark' },
							{ name: 'Light', value: 'light' },
						],
						description: 'Light or dark variant of the theme',
					},
					{
						displayName: 'Tone',
						name: 'tone',
						type: 'string',
						default: '',
						description: 'Tone of voice for the content',
					},
					{
						displayName: 'Use Connectors',
						name: 'useConnectors',
						type: 'boolean',
						default: false,
						description: 'Whether to pull data from connected data sources during generation',
					},
					{
						displayName: 'Verbosity',
						name: 'verbosity',
						type: 'options',
						default: 'balanced',
						options: [
							{ name: 'Balanced', value: 'balanced' },
							{ name: 'Concise', value: 'concise' },
							{ name: 'Detailed', value: 'detailed' },
							{ name: 'Guide', value: 'guide' },
						],
						description: 'How much content to put on each slide',
					},
				],
			},

			// ----------------------------------------------------------------
			//                      Generate From Plan
			// ----------------------------------------------------------------
			{
				displayName: 'Plan',
				name: 'plan',
				type: 'json',
				default: '{}',
				required: true,
				displayOptions: {
					show: { resource: ['presentation'], operation: ['generateFromPlan'] },
				},
				description: 'The plan object (from a Plan Outline operation) to generate the deck from',
			},
			{
				displayName: 'Options',
				name: 'fromPlanOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: {
					show: { resource: ['presentation'], operation: ['generateFromPlan'] },
				},
				options: [
					{
						displayName: 'Callback URL',
						name: 'callbackUrl',
						type: 'string',
						default: '',
						placeholder: 'https://example.com/webhook',
						description: 'HTTPS URL that receives a callback when the deck finishes',
					},
					{
						displayName: 'Request Overrides (JSON)',
						name: 'request',
						type: 'json',
						default: '{}',
						description:
							'Partial generation request to merge into the plan (e.g. model, theme, verbosity, mediaProvider)',
					},
					{
						displayName: 'Run Synchronously',
						name: 'runSynchronously',
						type: 'boolean',
						default: false,
						description:
							'Whether to wait for the full deck in a single request instead of returning a session ID to poll. Not recommended for large decks — generation can take minutes and may exceed request timeouts.',
					},
					{
						displayName: 'Session ID',
						name: 'sessionId',
						type: 'string',
						default: '',
						description: 'Existing session to attach this generation to',
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
			{
				displayName: 'Filters',
				name: 'filters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				displayOptions: { show: { resource: ['presentation'], operation: ['getAll'] } },
				options: [
					{
						displayName: 'End User Email',
						name: 'endUserEmail',
						type: 'string',
						placeholder: 'name@email.com',
						default: '',
						description: 'Only return presentations shared with this end user',
					},
				],
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
						displayName: 'Locked Theme Mode',
						name: 'lockedThemeMode',
						type: 'options',
						default: 'light',
						options: [
							{ name: 'Dark', value: 'dark' },
							{ name: 'Light', value: 'light' },
						],
						description: 'Force viewers into a single theme mode',
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
			//                       Session: Get Status
			// ----------------------------------------------------------------
			{
				displayName: 'Session ID',
				name: 'sessionId',
				type: 'string',
				default: '',
				required: true,
				displayOptions: { show: { resource: ['session'], operation: ['getStatus', 'cancel'] } },
				description: 'The session ID returned by a Generate or Plan Outline operation',
			},
			{
				displayName: 'Fields',
				name: 'fields',
				type: 'string',
				default: '',
				placeholder: 'phase,status,projectPid',
				displayOptions: { show: { resource: ['session'], operation: ['getStatus'] } },
				description: 'Optional comma-separated list of fields to return',
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
					if (operation === 'generate' || operation === 'plan') {
						const body = buildGenerationBody.call(this, i);

						if (operation === 'plan') {
							if (this.getNodeParameter('background', i, false) as boolean) {
								body.background = true;
							}
							responseData = await enceladeApiRequest.call(
								this,
								'POST',
								'/api/public/v1/projects/plan',
								body,
							);
						} else {
							responseData = await enceladeApiRequest.call(
								this,
								'POST',
								'/api/public/v1/projects/generate',
								body,
							);
						}
					} else if (operation === 'generateFromPlan') {
						const planRaw = this.getNodeParameter('plan', i) as string | IDataObject;
						const options = this.getNodeParameter('fromPlanOptions', i, {}) as IDataObject;

						const plan = (
							typeof planRaw === 'string' ? jsonParse(planRaw) : planRaw
						) as IDataObject;

						const body: IDataObject = {
							plan,
							background: options.runSynchronously !== true,
						};
						if (options.sessionId) {
							body.sessionId = options.sessionId;
						}
						if (options.callbackUrl) {
							body.callbackUrl = options.callbackUrl;
						}
						if (options.request) {
							const overrides = (
								typeof options.request === 'string'
									? jsonParse(options.request as string)
									: options.request
							) as IDataObject;
							// The API validates `request` against the full generate schema
							// (outlineHints and pageCount are required) even though
							// generate-from-plan drives content from `plan`, so partial
							// overrides 400. Seed the required fields — outlineHints is
							// unused here, so the plan title is a harmless placeholder —
							// and let the user's values win.
							if (Object.keys(overrides).length > 0) {
								const planTitle = typeof plan?.title === 'string' ? plan.title : '';
								body.request = {
									outlineHints: [planTitle || 'Generated from plan'],
									pageCount: 'auto',
									...overrides,
								};
							}
						}

						responseData = await enceladeApiRequest.call(
							this,
							'POST',
							'/api/public/v1/projects/generate-from-plan',
							body,
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
						const filters = this.getNodeParameter('filters', i, {}) as IDataObject;

						if (returnAll) {
							responseData = await enceladeApiRequestAllItems.call(
								this,
								'/api/public/v1/projects',
								{ ...filters },
							);
						} else {
							const limit = this.getNodeParameter('limit', i) as number;
							const response = (await enceladeApiRequest.call(
								this,
								'GET',
								'/api/public/v1/projects',
								{},
								{ ...filters, limit },
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
				} else if (resource === 'session') {
					const sessionId = this.getNodeParameter('sessionId', i) as string;

					if (operation === 'getStatus') {
						const fields = this.getNodeParameter('fields', i, '') as string;
						const qs: IDataObject = {};
						if (fields) {
							qs.fields = fields;
						}
						responseData = await enceladeApiRequest.call(
							this,
							'GET',
							`/api/public/v1/sessions/${encodeURIComponent(sessionId)}`,
							{},
							qs,
						);
					} else if (operation === 'cancel') {
						await enceladeApiRequest.call(
							this,
							'DELETE',
							`/api/public/v1/sessions/${encodeURIComponent(sessionId)}`,
						);
						responseData = { success: true };
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

/**
 * Builds the request body shared by the Generate and Plan Outline operations
 * from the `projectGenerateRequestSchema` fields. Only fields the user actually
 * set are included, so the server's Zod defaults apply to everything else.
 */
function buildGenerationBody(this: IExecuteFunctions, i: number): IDataObject {
	const body: IDataObject = {};

	const topic = this.getNodeParameter('topic', i, '') as string;
	if (topic) {
		body.topic = topic;
	}

	const outlineHints = (this.getNodeParameter('outlineHints', i, []) as string[]).filter(
		(hint) => typeof hint === 'string' && hint.trim().length > 0,
	);
	if (outlineHints.length === 0) {
		throw new NodeOperationError(this.getNode(), 'At least one Outline Hint is required', {
			itemIndex: i,
		});
	}
	body.outlineHints = outlineHints;

	const pageCount = this.getNodeParameter('pageCount', i, 'auto') as string;
	body.pageCount = pageCount === 'auto' ? 'auto' : Number(pageCount);

	const additionalFields = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
	Object.assign(body, additionalFields);

	const supportingMaterials = this.getNodeParameter('supportingMaterials', i, {}) as {
		material?: IDataObject[];
	};
	if (supportingMaterials.material && supportingMaterials.material.length > 0) {
		body.supportingMaterials = supportingMaterials.material.map((material) => {
			const cleaned: IDataObject = {};
			for (const [key, value] of Object.entries(material)) {
				if (value !== '' && value !== undefined && value !== null) {
					cleaned[key] = value;
				}
			}
			return cleaned;
		});
	}

	return body;
}
