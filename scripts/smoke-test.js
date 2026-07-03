/*
 Drives the compiled demo story in headless Chromium and asserts the core
 chat mechanics work: message rendering, grouping, typing indicator, user
 responses, meta passages, undo and save/restore.

   node scripts/build-demo.js && node scripts/smoke-test.js
*/

'use strict';

const path = require('path');
const { chromium } = require('playwright');

const DEMO = path.join(__dirname, '..', 'docs', 'trialogue-demo.html');
const SHOT_DIR = process.env.SMOKE_SHOT_DIR || '';

let failures = 0;

function check(label, condition) {
	if (condition) {
		console.log('  ok - ' + label);
	}
	else {
		console.error('  FAIL - ' + label);
		failures += 1;
	}
}

async function run() {
	const browser = await chromium.launch({
		// allows running against a system/preinstalled Chromium when the
		// Playwright-managed download is unavailable
		executablePath: process.env.CHROMIUM_PATH || undefined
	});
	const page = await browser.newPage({ viewport: { width: 420, height: 780 } });
	const errors = [];

	page.on('pageerror', (err) => errors.push(err.message));
	page.on('console', (msg) => {
		if (msg.type() === 'error') {
			errors.push(msg.text());
		}
	});

	await page.goto('file://' + DEMO);

	console.log('start passage');
	await page.waitForSelector('.user-response');
	check('title shown', (await page.textContent('#ptitle')) === 'Trialogue Demo');
	check(
		'start passage split into two bubbles',
		(await page.locator('.chat-passage[data-speaker="1"]').count()) === 2
	);
	check(
		'speaker name shown',
		(await page.locator('.chat-speaker-name').first().textContent()) === '1'
	);
	check(
		'two responses offered',
		(await page.locator('.user-response').count()) === 2
	);

	console.log('choose "hello" -> meta passage');
	await page.click('.user-response:has-text("hello")');
	check(
		'choice rendered as outgoing bubble',
		(await page
			.locator('.chat-passage-wrapper[data-speaker="you"]')
			.count()) === 1
	);
	await page.waitForSelector('.meta-passage', { timeout: 10000 });
	check(
		'speakerless passage rendered as meta passage',
		(await page.locator('.meta-passage').count()) === 1
	);

	console.log('choose "ok" -> typing indicator -> speaker 2');
	await page.click('.user-response:has-text("ok")');
	await page.waitForSelector('#animation-container:not([hidden])', {
		timeout: 10000
	});
	check('typing indicator shown', true);
	await page.waitForSelector('.chat-passage[data-speaker="2"]', {
		timeout: 10000
	});
	check(
		'typing indicator hidden again',
		await page.locator('#animation-container[hidden]').count() === 1
	);

	if (SHOT_DIR) {
		await page.screenshot({ path: path.join(SHOT_DIR, 'demo-light.png') });
		await page.emulateMedia({ colorScheme: 'dark' });
		await page.screenshot({ path: path.join(SHOT_DIR, 'demo-dark.png') });
		await page.emulateMedia({ colorScheme: 'light' });
	}

	console.log('undo');
	const bubblesBeforeUndo = await page.locator('.chat-passage').count();

	await page.click('#nav-link-undo');
	check(
		'undo removed the last exchange',
		(await page.locator('.chat-passage').count()) < bubblesBeforeUndo
	);
	check(
		'undo restored the previous responses',
		(await page.locator('.user-response:has-text("ok")').count()) === 1
	);

	console.log('save & restore');
	await page.click('.user-response:has-text("ok")');
	await page.waitForSelector('.chat-passage[data-speaker="2"]', {
		timeout: 10000
	});
	await page.evaluate(() => window.story.save());

	const savedUrl = page.url();
	const page2 = await browser.newPage({ viewport: { width: 420, height: 780 } });

	page2.on('pageerror', (err) => errors.push(err.message));
	await page2.goto(savedUrl);
	await page2.waitForSelector('.chat-passage[data-speaker="2"]', {
		timeout: 10000
	});
	check(
		'restore replays the whole transcript',
		(await page2.locator('.chat-passage-wrapper[data-speaker="you"]').count()) >= 2 &&
		(await page2.locator('.user-response').count()) === 2
	);
	await page2.close();

	check('no page errors (' + errors.join('; ').slice(0, 300) + ')', errors.length === 0);

	await browser.close();

	if (failures > 0) {
		console.error('\n' + failures + ' check(s) failed');
		process.exit(1);
	}

	console.log('\nAll checks passed');
}

run().catch((err) => {
	console.error(err);
	process.exit(1);
});
