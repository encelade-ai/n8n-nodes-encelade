import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes } from 'n8n-workflow';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { enceladeApiRequest } from './GenericFunctions';

export class EnceladeTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Encelade Trigger',
		name: 'enceladeTrigger',
		icon: 'file:encelade.svg',
		group: ['trigger'],
		version: 1,
		subtitle: '=Events: {{$parameter["events"].join(", ")}}',
		description: 'Starts the workflow when an Encelade generation completes or fails',
		defaults: {
			name: 'Encelade Trigger',
		},
		usableAsTool: true,
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'enceladeApi',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				required: true,
				default: ['generation.completed', 'generation.failed'],
				options: [
					{
						name: 'Generation Completed',
						value: 'generation.completed',
						description: 'A presentation finished generating',
					},
					{
						name: 'Generation Failed',
						value: 'generation.failed',
						description: 'A presentation generation failed',
					},
				],
				description: 'The Encelade events to subscribe to',
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				// Only treat the webhook as existing when this node registered it and
				// the secret is still on hand — otherwise we must re-create so inbound
				// signatures can be verified. Match on the stored id, not the URL.
				const staticData = this.getWorkflowStaticData('node');
				const webhookId = staticData.webhookId as string | undefined;
				if (!webhookId || !staticData.secret) {
					return false;
				}

				const data = await enceladeApiRequest.call(this, 'GET', '/api/public/v1/webhooks');
				const registered = (data.webhooks as IDataObject[] | undefined) ?? [];
				return registered.some((webhook) => webhook.id === webhookId);
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default');
				const events = this.getNodeParameter('events') as string[];
				const secret = randomBytes(32).toString('hex');

				const response = await enceladeApiRequest.call(this, 'POST', '/api/public/v1/webhooks', {
					url: webhookUrl,
					events,
					secret,
				});

				const staticData = this.getWorkflowStaticData('node');
				staticData.webhookId = response.id;
				staticData.secret = secret;
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');
				const webhookId = staticData.webhookId as string | undefined;
				if (!webhookId) {
					return true;
				}

				try {
					await enceladeApiRequest.call(
						this,
						'DELETE',
						`/api/public/v1/webhooks/${encodeURIComponent(webhookId)}`,
					);
				} catch (error) {
					// A 404 is ambiguous: the webhook may already be gone, or the current
					// credentials may point at a different Encelade tenant than the one
					// that owns it (the API scopes deletes by tenant). We can't tell these
					// apart, so we keep webhookId/secret rather than clear them below —
					// clearing would orphan a still-registered webhook and lose the only
					// handle to remove it later. Report failure so the state survives and a
					// later deactivation with the right credentials can still deregister it.
					if ((error as NodeApiError).httpCode === '404') {
						return false;
					}
					// Real failures (auth, network, 5xx) surface in the n8n UI.
					throw new NodeApiError(this.getNode(), error as JsonObject);
				}

				delete staticData.webhookId;
				delete staticData.secret;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const bodyData = this.getBodyData();
		const headers = this.getHeaderData();
		const staticData = this.getWorkflowStaticData('node');
		const secret = staticData.secret as string | undefined;

		// Verify the HMAC signature when a secret was registered. Encelade signs
		// the raw JSON body with HMAC-SHA256 and sends a lowercase-hex digest in
		// the `X-Webhook-Signature` header.
		if (secret) {
			const signatureHeader = headers['x-webhook-signature'];
			const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;

			const request = this.getRequestObject() as unknown as { rawBody?: Buffer };
			const payload =
				request.rawBody && request.rawBody.length > 0
					? request.rawBody.toString('utf8')
					: JSON.stringify(bodyData);
			const expected = createHmac('sha256', secret).update(payload).digest('hex');

			const valid =
				typeof signature === 'string' &&
				signature.length === expected.length &&
				timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expected, 'utf8'));

			if (!valid) {
				const response = this.getResponseObject();
				response.status(401).json({ error: 'Invalid webhook signature' });
				return { noWebhookResponse: true };
			}
		}

		return {
			workflowData: [[{ json: bodyData }]],
		};
	}
}
