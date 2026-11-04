const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { dirname, resolve } = require('node:path');
const test = require('node:test');
const { n8n } = require('../package.json');

test('only the action node is available as an AI tool', () => {
	const tools = n8n.nodes.flatMap((file) => {
		const [Node] = Object.values(require(resolve(__dirname, '..', file)));
		const { name, usableAsTool } = new Node().description;
		return usableAsTool ? [name] : [];
	});
	assert.deepEqual(tools, ['encelade']);
});

test('both icon themes resolve from every installed node and credential', () => {
	for (const file of [...n8n.nodes, ...n8n.credentials]) {
		const entry = resolve(__dirname, '..', file);
		const [Type] = Object.values(require(entry));
		const instance = new Type();
		const { icon } = instance.description ?? instance;
		const images = ['light', 'dark'].map((theme) => {
			assert.match(icon[theme], /^file:/);
			return readFileSync(resolve(dirname(entry), icon[theme].slice(5)), 'utf8');
		});
		assert.notEqual(images[0], images[1], file);
	}
});
