import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeProperties,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';

import { Midjourney as MidjourneyClient } from 'midjourney';
import { bannedWords } from 'midjourney'
import { pick } from 'lodash';
import * as console from "node:console";

// todo move
class TimeoutError extends Error {}

export const addTimeout = <T>(
	promise: Promise<T>,
	timout: number,
	timeoutMessage = 'timeout',
): Promise<T> => {
	let timer: NodeJS.Timeout | null;
	const timerPromise = new Promise<T>((resolve, reject) => {
		timer = setTimeout(() => {
			timer = null;
			reject(new TimeoutError(`${timeoutMessage} ${timout} ms`));
		}, timout);
	});

	void promise.finally(() => {
		if (timer) {
			clearTimeout(timer);
		}
	});

	return Promise.race([promise, timerPromise]);
};

const inputs: { [key: string]: INodeProperties } = {
	action: {
		displayName: 'Action',
		name: 'action',
		type: 'options',
		noDataExpression: true,
		default: 'imagine',
		options: [
			{
				name: 'Custom',
				value: 'custom',
				description: 'Use custom values for call',
				action: 'Use custom values for call',
			},
			{
				name: 'Describe',
				value: 'describe',
				description: 'Describe the image',
				action: 'Describe the image',
			},
			{
				name: 'Imagine',
				value: 'imagine',
				description: 'Generate a grid with 4 images',
				action: 'Generate a grid with 4 images',
			},
			{
				name: 'Upscale',
				value: 'upscale',
				description: 'Upscale the selected image',
				action: 'Upscale the selected image',
			},
			{
				name: 'Upscale All',
				value: 'upscale-all',
				description: 'Upscale all images',
				action: 'Upscale images',
			},
			{
				name: 'To base64',
				value: 'base64',
				description: 'base64',
				action: 'base64',
			},
			{
				name: 'Variation',
				value: 'variation',
				description: 'Create variation grid with 4 images',
				action: 'Create variation grid with 4 images',
			},
			{
				name: 'Zoom Out',
				value: 'zoomout',
				description: 'Zoom out selected image',
				action: 'Zoom out selected image',
			},
		],
	},
	prompt: {
		displayName: 'Prompt',
		name: 'prompt',
		type: 'string',
		default: '',
		displayOptions: {
			show: {
				action: ['imagine', 'variation'],
			},
		},
		placeholder: 'prompt',
		description: 'The prompt to imagine',
		required: true,
	},
	maxwait: {
		displayName: 'MaxWait',
		name: 'maxwait',
		type: 'number',
		default: 60,
		displayOptions: {
			show: {
				action: ['imagine'],
			},
		},
		placeholder: 'maxwait',
		description: 'The maxwait invetval'
	},
	generationTimeout: {
		displayName: 'Generation Timeout',
		name: 'generationTimeout',
		type: 'number',
		displayOptions: {
			show: {
				action: ['imagine'],
			},
		},
		description: 'Max generation timeout (seconds)',
		placeholder: 'Max generation timeout (seconds)',
		default: 60,
		typeOptions: {
			minValue: 1,
		}
	},
	upscaleTimeout: {
		displayName: 'Upscale Timeout',
		name: 'upscaleTimeout',
		type: 'number',
		displayOptions: {
			show: {
				action: ['upscale', 'upscale-all'],
			},
		},
		description: 'Max upscale timeout (seconds)',
		placeholder: 'Max upscale timeout (seconds)',
		default: 60,
		typeOptions: {
			minValue: 1,
		}
	},
	content: {
		displayName: 'content',
		name: 'content',
		type: 'string',
		default: '',
		displayOptions: {
			show: {
				action: ['upscale', 'upscale-all'],
			},
		},
		placeholder: 'content',
		required: true,
	},
	urls: {
		displayName: 'urls',
		name: 'urls',
		type: 'json',
		default: null,
		displayOptions: {
			show: {
				action: ['base64'],
			},
		},
		placeholder: 'urls',
		required: true,
	},
	imageURI: {
		displayName: 'Image URI',
		name: 'imageURI',
		type: 'string',
		default: '',
		displayOptions: {
			show: {
				action: ['describe'],
			},
		},
		placeholder: 'imageURI',
		required: true,
	},
	msgId: {
		displayName: 'Message ID',
		name: 'msgId',
		type: 'string',
		default: '',
		displayOptions: {
			show: {
				action: ['variation', 'upscale', 'upscale-all', 'zoomout', 'custom'],
			},
		},
		placeholder: 'msgId',
		required: true,
	},
	messageHash: {
		displayName: 'Message Hash',
		name: 'messageHash',
		type: 'string',
		default: '',
		displayOptions: {
			show: {
				action: ['variation', 'upscale', 'upscale-all', 'zoomout'],
			},
		},
		placeholder: 'messageHash',
		required: true,
	},
	messageFlags: {
		displayName: 'Message Flags',
		name: 'messageFlags',
		type: 'number',
		default: 0,
		displayOptions: {
			show: {
				action: ['variation', 'upscale', 'upscale-all', 'zoomout', 'custom'],
			},
		},
		placeholder: 'messageFlags',
		required: true,
	},
	index: {
		displayName: 'Index',
		name: 'index',
		type: 'number',
		default: 1,
		displayOptions: {
			show: {
				action: ['variation', 'upscale'],
			},
		},
		placeholder: 'index',
		required: true,
	},
	custom: {
		displayName: 'Custom ID',
		name: 'customId',
		type: 'string',
		default: '',
		displayOptions: {
			show: {
				action: ['custom'],
			},
		},
		placeholder: 'custom',
		description: 'The custom',
		required: true,
	},
	zoomLevel: {
		displayName: 'Zoom Level',
		name: 'zoomLevel',
		type: 'options',
		default: 'high',
		displayOptions: {
			show: {
				action: ['zoomout'],
			},
		},
		placeholder: 'zoomLevel',
		required: true,
		options: [
			{
				name: 'High',
				value: 'high',
			},
			{
				name: 'Low',
				value: 'low',
			},
			{
				name: '2x',
				value: '2x',
			},
			{
				name: '1.5x',
				value: '1.5x',
			},
		],
	},
};

export class Topjourney implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Topjourney',
		name: 'topjourney',
		group: ['transform'],
		icon: 'file:topjourney.svg',
		version: 1,
		description: 'AI to generate images',
		defaults: {
			name: 'Topjourney',
		},
		subtitle: '={{$parameter["action"]}}',
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'topjourneyApi',
				required: true,
			},
		],
		properties: [
			// Node properties which the user gets displayed and
			// can change on the node.
			...Object.values(inputs),
		],
	};

	// The function below is responsible for actually doing whatever this node
	// is supposed to do. In this case, we're just appending the `myString` property
	// with whatever the user has entered.
	// You can make async calls and use `await`.
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();

		const maxwait = this.getNodeParameter('maxwait', 0, 100) as number || 60

		const credentials = await this.getCredentials('topjourneyApi');
		const client = new MidjourneyClient({
			ServerId: <string>credentials.serverId,
			ChannelId: <string>credentials.channelId,
			SalaiToken: <string>credentials.salaiToken,
			Debug: true,
			// Setup Max wait
			MaxWait: maxwait,
			Limit: 100,
			// Disable for now
			Ws: false, //enable ws is required for remix mode (and custom zoom)
		});
		const instance = await client.Connect();

		// delay random
		function randomIntFromInterval(min: number, max: number) { // min and max included
			return Math.floor(Math.random() * (max - min + 1) + min);
		}

		const rndInt = randomIntFromInterval(100, 500);
		await new Promise(resolve => setTimeout(resolve, rndInt));

		// Iterates over all input items and add the key "myString" with the
		// value the parameter "myString" resolves to.
		// (This could be a different value for each item in case it contains an expression)
		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				let item: INodeExecutionData = items[itemIndex];

				const action = this.getNodeParameter('action', itemIndex) as string;
				switch (action) {
					case 'imagine': {
						const generationTimeoutSeconds = this.getNodeParameter('generationTimeout', 0) as number || 60
						// Filter banned words
						let fprompt = this.getNodeParameter('prompt', itemIndex) as string;
						for (const word of bannedWords) {
							fprompt = fprompt.replace(word, '')
						}

						const msg = await addTimeout(instance.Imagine(fprompt), generationTimeoutSeconds * 1000);
						if (!msg) {
							throw Error('Could not imagine!')
						}

						item.json = pick(msg, ['id', 'hash', 'content', 'uri', 'flags', 'options']);
						continue;
					}
					case 'describe': {
						const imageURI = this.getNodeParameter('imageURI', itemIndex) as string;
						const msg = await client.Describe(imageURI);
						item.json = pick(msg, ['descriptions', 'uri']);
						continue;
					}
					case 'custom': {
						const msgId = this.getNodeParameter('msgId', itemIndex) as string;
						const flags = this.getNodeParameter('messageFlags', itemIndex) as number;
						const customId = this.getNodeParameter('customId', itemIndex) as string;
						const msg = await client.Custom({
							msgId,
							flags,
							customId,
						});
						item.json = pick(msg, ['id', 'hash', 'content', 'uri', 'flags', 'options']);
						continue;
					}
					case 'upscale': {
						const index = this.getNodeParameter('index', itemIndex) as 1 | 2 | 3 | 4;
						const msgId = this.getNodeParameter('msgId', itemIndex) as string;
						const messageHash = this.getNodeParameter('messageHash', itemIndex) as string;
						const messageFlags = this.getNodeParameter('messageFlags', itemIndex) as number;
						const upscaleTimeout = this.getNodeParameter('upscaleTimeout', itemIndex) as number;
						const content = this.getNodeParameter('content', itemIndex) as string;
						const msg = await addTimeout(client.Upscale({
							index,
							msgId,
							hash: messageHash,
							flags: messageFlags,
							content,
						}), upscaleTimeout * 1000);
						item.json = pick(msg, ['id', 'hash', 'content', 'uri', 'flags', 'options']);
						continue;
					}
					case 'upscale-all': {
						const msgId = this.getNodeParameter('msgId', itemIndex) as string;
						const messageHash = this.getNodeParameter('messageHash', itemIndex) as string;
						const messageFlags = this.getNodeParameter('messageFlags', itemIndex) as number;
						const upscaleTimeout = this.getNodeParameter('upscaleTimeout', itemIndex) as number;
						const content = this.getNodeParameter('content', itemIndex) as string;

						const result: Array<string> = [];

						for (let index = 1; index <= 4; index++) {
							try {
								const msg = await addTimeout(client.Upscale({
									index: index as 1 | 2 | 3 | 4,
									msgId,
									hash: messageHash,
									content,
									flags: messageFlags,
								}), upscaleTimeout * 1000);

								if (msg) {
									result.push(msg.uri);
								}
							} catch (error) {
								if (error instanceof TimeoutError) {
									console.error(error);
								} else {
									throw error;
								}
							}
						}

						if (result.length === 0) {
							throw new Error('No one upscale');
						}
						item.json = { result };
						continue;
					}
					case 'base64': {
						const urls = this.getNodeParameter('urls', itemIndex) as Array<string>;
						const blobToBase64 = async (blob: Blob): Promise<string> => {
							return `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`;
						};
						const base64Data = await Promise.all(urls.map(item => fetch(item).then(res => res.blob()).then(blobToBase64)));
						item.json = { base64Data };
						continue;
					}
					case 'variation': {
						const index = this.getNodeParameter('index', itemIndex) as 1 | 2 | 3 | 4;
						const msgId = this.getNodeParameter('msgId', itemIndex) as string;
						const messageHash = this.getNodeParameter('messageHash', itemIndex) as string;
						const messageFlags = this.getNodeParameter('messageFlags', itemIndex) as number;
						const prompt = this.getNodeParameter('prompt', itemIndex) as string;
						const msg = await client.Variation({
							index,
							msgId,
							hash: messageHash,
							flags: messageFlags,
							content: prompt,
						});
						item.json = pick(msg, ['id', 'hash', 'content', 'uri', 'flags', 'options']);
						continue;
					}
					case 'zoomout': {
						const zoomLevel = this.getNodeParameter('zoomLevel', itemIndex) as
							| 'high'
							| 'low'
							| '2x'
							| '1.5x';
						const msgId = this.getNodeParameter('msgId', itemIndex) as string;
						const messageHash = this.getNodeParameter('messageHash', itemIndex) as string;
						const messageFlags = this.getNodeParameter('messageFlags', itemIndex) as number;
						const msg = await client.ZoomOut({
							level: zoomLevel,
							msgId,
							hash: messageHash,
							flags: messageFlags,
						});
						item.json = pick(msg, ['id', 'hash', 'content', 'uri', 'flags', 'options']);
						continue;
					}
				}
			} catch (error) {
				// This node should never fail but we want to showcase how
				// to handle errors.
				if (this.continueOnFail()) {
					items.push({ json: this.getInputData(itemIndex)[0].json, error, pairedItem: itemIndex });
				} else {
					// Adding `itemIndex` allows other workflows to handle this error
					if (error.context) {
						// If the error thrown already contains the context property,
						// only append the itemIndex
						error.context.itemIndex = itemIndex;
						throw error;
					}
					throw new NodeOperationError(this.getNode(), error, {
						itemIndex,
					});
				}
			}
			finally {
				if (instance) {
					instance.Close()
				}
			}
		}

		return this.prepareOutputData(items);
	}
}
