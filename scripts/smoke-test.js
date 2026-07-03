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
		'speaker profile name shown',
		(await page.locator('.chat-speaker-name').first().textContent()) === 'Alex'
	);
	check(
		'timestamp chip rendered',
		(await page.locator('.chat-timestamp').first().textContent()) ===
			'Today 9:41 AM'
	);
	check(
		'speaker profile color applied to bubbles',
		(await page
			.locator('.chat-passage[data-speaker="1"]')
			.first()
			.evaluate((el) => getComputedStyle(el).backgroundColor)) ===
			'rgb(94, 92, 230)'
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
	check(
		'receipt stays Delivered while only a meta passage follows',
		(await page
			.locator('.chat-passage-wrapper[data-receipt="delivered"] .chat-receipt')
			.textContent()) === 'Delivered'
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
	check(
		'speaker reply marks the last message Read',
		(await page
			.locator('.chat-passage-wrapper[data-speaker="you"]')
			.last()
			.getAttribute('data-receipt')) === 'read'
	);
	check(
		'speaker profile avatar image applied',
		(await page.locator('.chat-avatar--img[data-speaker="2"]').count()) >= 1
	);

	console.log('receipt flipping');
	await page.evaluate(() => window.story.markUnread());
	check(
		'markUnread flips the receipt back to Delivered',
		(await page
			.locator('.chat-passage-wrapper[data-speaker="you"]')
			.last()
			.getAttribute('data-receipt')) === 'delivered'
	);
	await page.evaluate(() => window.story.markRead('Read 9:41 AM'));
	check(
		'markRead accepts a custom label',
		(await page
			.locator('.chat-passage-wrapper[data-speaker="you"]')
			.last()
			.locator('.chat-receipt')
			.textContent()) === 'Read 9:41 AM'
	);
	await page.evaluate(() => window.story.markRead());

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
	check(
		'read receipt survives restore',
		(await page2
			.locator('.chat-passage-wrapper[data-speaker="you"]')
			.last()
			.getAttribute('data-receipt')) === 'read'
	);
	await page2.close();

	console.log('photo picker');
	await page.click('.user-response:has-text("pretty good")');
	await page.waitForSelector('.user-response--photo', { timeout: 15000 });
	check(
		'camera button offered alongside text responses',
		(await page.locator('.user-response:has-text("rather not say")').count()) === 1
	);
	await page.click('.user-response--photo');
	await page.waitForSelector('#photo-picker[open]');
	check(
		'picker shows the gallery',
		(await page.locator('.photo-picker-item').count()) === 2
	);

	if (SHOT_DIR) {
		await page.screenshot({ path: path.join(SHOT_DIR, 'photo-picker.png') });
	}

	await page.click('.photo-picker-item:has-text("sunny")');
	check(
		'sent photo appears as outgoing media bubble',
		(await page.locator('.chat-passage--media[data-speaker="you"]').count()) === 1
	);
	check(
		'photo tracked in state',
		(await page.evaluate(() => window.story.state.lastPhoto)) === 'sunny'
	);
	await page.waitForSelector('.chat-passage:has-text("sunshine")', {
		timeout: 15000
	});
	check('story branched on the sent photo', true);

	if (SHOT_DIR) {
		await page.screenshot({ path: path.join(SHOT_DIR, 'photo-sent.png') });
	}

	console.log('undo after photo');
	await page.click('#nav-link-undo');
	check(
		'undo removed the photo bubble',
		(await page.locator('.chat-passage--media[data-speaker="you"]').count()) === 0
	);
	check(
		'undo reverted photo state',
		(await page.evaluate(() => window.story.state.lastPhoto)) === undefined
	);
	await page.click('.user-response--photo');
	await page.waitForSelector('#photo-picker[open]');
	await page.click('.photo-picker-item:has-text("rainy")');
	await page.waitForSelector('.chat-passage:has-text("stay dry")', {
		timeout: 15000
	});
	check('second photo takes the other branch', true);
	check(
		'sentPhotos holds one photo after the undo',
		(await page.evaluate(() => window.story.state.sentPhotos.length)) === 1
	);

	console.log('title notifications');
	await page.evaluate(() => {
		Object.defineProperty(document, 'hidden', {
			get: () => true,
			configurable: true
		});
	});
	await page.click('.user-response:has-text("start over?")');
	await page.waitForFunction(() => document.title.indexOf('(') === 0, null, {
		timeout: 15000
	});
	check('hidden tab title shows the unread count', true);
	await page.evaluate(() => {
		Object.defineProperty(document, 'hidden', {
			get: () => false,
			configurable: true
		});
		document.dispatchEvent(new Event('visibilitychange'));
	});
	check(
		'title resets when the tab becomes visible',
		(await page.title()) === 'Trialogue Demo'
	);

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
