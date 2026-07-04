/*
 Compiles docs/chatbook-demo.twee into docs/chatbook-demo.html using the
 freshly built story format — a tiny stand-in for Tweego so the demo can be
 rebuilt (and the format smoke-tested) with no external tools.

   node scripts/build-demo.js [input.twee] [output.html]
*/

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const input = process.argv[2] || path.join(ROOT, 'docs/chatbook-demo.twee');
const output = process.argv[3] || path.join(ROOT, 'docs/chatbook-demo.html');

function escapeHtml(text) {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function parseTwee(source) {
	const passages = [];
	const chunks = source.split(/^::[ \t]?/m).slice(1);

	for (const chunk of chunks) {
		const newline = chunk.indexOf('\n');
		const header = (newline === -1 ? chunk : chunk.slice(0, newline)).trim();
		const text = (newline === -1 ? '' : chunk.slice(newline + 1))
			.replace(/\s+$/, '');

		const match = header.match(
			/^(.*?)(?:\s*\[([^\]]*)\])?(?:\s*\{.*\})?\s*$/
		);
		const name = match[1].trim();
		const tags = (match[2] || '').trim();

		passages.push({ name, tags, text });
	}

	return passages;
}

function compile(tweeSource, formatSource) {
	const passages = parseTwee(tweeSource);
	const byName = (name) => passages.find((p) => p.name === name);

	const title = byName('StoryTitle');
	const storyData = byName('StoryData');
	const meta = storyData ? JSON.parse(storyData.text) : {};
	const storyName = title ? title.text.trim() : 'Untitled';
	const startName = meta.start || 'Start';

	const SPECIAL = ['StoryTitle', 'StoryData'];
	let pid = 0;
	let startNode = 0;
	const passageEls = [];
	const scriptEls = [];
	const styleEls = [];

	for (const passage of passages) {
		if (SPECIAL.includes(passage.name)) {
			continue;
		}

		const tags = passage.tags.split(/\s+/).filter(Boolean);

		if (tags.includes('script')) {
			scriptEls.push(
				'<script role="script" id="twine-user-script" ' +
				'type="text/twine-javascript">' + passage.text + '</script>'
			);
			continue;
		}

		if (tags.includes('stylesheet')) {
			styleEls.push(
				'<style role="stylesheet" id="twine-user-stylesheet" ' +
				'type="text/twine-css">' + passage.text + '</style>'
			);
			continue;
		}

		pid += 1;

		if (passage.name === startName) {
			startNode = pid;
		}

		passageEls.push(
			'<tw-passagedata pid="' + pid + '" name="' +
			escapeHtml(passage.name) + '" tags="' + escapeHtml(passage.tags) +
			'">' + escapeHtml(passage.text) + '</tw-passagedata>'
		);
	}

	const storyEl =
		'<tw-storydata name="' + escapeHtml(storyName) + '" ' +
		'startnode="' + startNode + '" ' +
		'creator="chatbook-build-demo" creator-version="1.0" ' +
		'ifid="' + escapeHtml(meta.ifid || '') + '" ' +
		'format="Chatbook" options="" hidden>' +
		styleEls.join('') + scriptEls.join('') + passageEls.join('') +
		'</tw-storydata>';

	return formatSource
		.replace(/\{\{STORY_NAME\}\}/g, () => escapeHtml(storyName))
		.replace(/\{\{STORY_DATA\}\}/g, () => storyEl);
}

const formatPath = path.join(ROOT, 'build/format.html');

if (!fs.existsSync(formatPath)) {
	console.error('build/format.html not found — run `node build.js` first.');
	process.exit(1);
}

const html = compile(
	fs.readFileSync(input, 'utf8'),
	fs.readFileSync(formatPath, 'utf8')
);

fs.writeFileSync(output, html);
console.log('Compiled ' + path.relative(ROOT, input) + ' -> ' + path.relative(ROOT, output));
