/*
 Drives the compiled demo story in headless Chromium and asserts the core
 chat mechanics work: message rendering, grouping, typing indicator, user
 responses, meta passages, undo and save/restore.

   node scripts/build-demo.js && node scripts/smoke-test.js
*/

'use strict';

const path = require('path');
const { chromium } = require('playwright');

const DEMO = path.join(__dirname, '..', 'docs', 'chatbook-demo.html');
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
	const page = await browser.newPage({
		viewport: { width: 420, height: 780 },
		geolocation: { latitude: 35.4993, longitude: -80.8487 },
		permissions: ['geolocation']
	});
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
	await page.evaluate(() => {
		window.__smShown = 0;
		window.addEventListener('sm.passage.shown', () => {
			window.__smShown += 1;
		});
	});
	check('title shown', (await page.textContent('#ptitle')) === 'Chatbook Demo');
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

	console.log('menu modal & theme toggle');
	check(
		'sidebar columns are gone',
		(await page.locator('.left-sidebar, .right-sidebar').count()) === 0
	);
	await page.click('#nav-link-menu');
	await page.waitForSelector('#menu-dialog[open]');
	check(
		'menu opens as a modal with injected content',
		(await page
			.locator('#menu-dialog #menu-container h3')
			.textContent()) === 'Welcome'
	);
	await page.click('[data-menu-close]');
	check(
		'menu modal closes',
		(await page.locator('#menu-dialog[open]').count()) === 0
	);
	await page.click('#nav-link-theme');
	check(
		'theme toggle switches to dark mode',
		(await page.evaluate(() =>
			document.documentElement.getAttribute('data-theme')
		)) === 'dark'
	);
	check(
		'theme choice persisted per story',
		await page.evaluate(() =>
			Object.keys(window.localStorage).some(function(key) {
				return key.indexOf('chatbook-theme-') === 0;
			})
		)
	);
	await page.click('#nav-link-theme');
	check(
		'theme toggle switches back to light mode',
		(await page.evaluate(() =>
			document.documentElement.getAttribute('data-theme')
		)) === 'light'
	);
	// clear the explicit choice so later dark-mode screenshots follow
	// the emulated system scheme again
	await page.evaluate(() => {
		document.documentElement.removeAttribute('data-theme');
		Object.keys(window.localStorage).forEach(function(key) {
			if (key.indexOf('chatbook-theme-') === 0) {
				window.localStorage.removeItem(key);
			}
		});
	});

	console.log('choose "hello" -> narrator overlay');
	await page.click('.user-response:has-text("hello")');
	check(
		'choice rendered as outgoing bubble',
		(await page
			.locator('.chat-passage-wrapper[data-speaker="you"]')
			.count()) === 1
	);
	await page.waitForSelector('#meta-overlay:not([hidden])', { timeout: 10000 });
	check(
		'narrator passage shown as overlay (metaStyle: overlay)',
		(await page.locator('#meta-overlay-content').textContent()).indexOf(
			'narrator'
		) !== -1
	);
	check(
		'overlay narration leaves no bubble in the chat',
		(await page.locator('.meta-passage').count()) === 0
	);
	check(
		'responses stay available under the overlay',
		(await page.locator('.user-response:has-text("ok")').count()) === 1
	);
	check(
		'receipt stays Delivered while only narration follows',
		(await page
			.locator('.chat-passage-wrapper[data-receipt="delivered"] .chat-receipt')
			.textContent()) === 'Delivered'
	);

	if (SHOT_DIR) {
		await page.waitForTimeout(600);
		await page.screenshot({ path: path.join(SHOT_DIR, 'meta-overlay.png') });
	}

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
		'overlay narration dismissed by the next choice',
		(await page.locator('#meta-overlay[hidden]').count()) === 1
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
	check(
		'Snowman 2 style sm.passage.shown events dispatched',
		(await page.evaluate(() => window.__smShown)) >= 2
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
		(await page.title()) === 'Chatbook Demo'
	);

	console.log('location sharing');
	await page.click('.user-response:has-text("whatsup")');
	await page.waitForSelector('.user-response:has-text("where are you from?")', {
		timeout: 15000
	});
	await page.click('.user-response:has-text("where are you from?")');
	await page.waitForSelector('.user-response--location', { timeout: 15000 });
	check(
		'location share button offered with custom label',
		(await page.locator('.user-response--location').textContent()).indexOf(
			'share my location'
		) !== -1
	);
	await page.click('.user-response--location');
	await page.waitForSelector('.chat-passage--location[data-speaker="you"]', {
		timeout: 15000
	});
	check('player location sent as an outgoing map card', true);
	check(
		'real coordinates stored in story state',
		await page.evaluate(
			() => Math.abs(window.story.state.playerLocation.lat - 35.4993) < 0.001
		)
	);
	await page.waitForSelector('.chat-passage:has-text("35.499")', {
		timeout: 15000
	});
	check('story branched on the shared coordinates', true);
	check(
		'speaker location card links to OpenStreetMap',
		(await page
			.locator('.chat-passage:not([data-speaker="you"]) .chat-location-card')
			.first()
			.getAttribute('href')).indexOf('openstreetmap.org') !== -1
	);

	console.log('voice memo');
	await page.waitForSelector('.chat-voice .chat-voice-play', { timeout: 15000 });
	check(
		'voice memo renders a custom player with waveform',
		(await page.locator('.chat-voice-bars span').count()) >= 20
	);
	await page.waitForFunction(
		() => /[1-9]?\d:\d\d/.test(document.querySelector('.chat-voice-time').textContent),
		null,
		{ timeout: 10000 }
	);
	check(
		'voice memo duration loaded from audio metadata',
		(await page.locator('.chat-voice-time').textContent()) === '0:01'
	);
	await page.click('.chat-voice-play');
	await page.waitForTimeout(400);
	check(
		'voice memo plays on tap',
		await page.evaluate(() =>
			document.querySelector('.chat-voice').classList.contains('playing')
		)
	);

	if (SHOT_DIR) {
		await page.screenshot({ path: path.join(SHOT_DIR, 'voice-location.png') });
	}

	console.log('notification-style narration');
	await page.evaluate(() => {
		window.story.config.metaStyle = 'notification';
		window.story.show('hello');
	});
	await page.waitForSelector('#meta-notification:not([hidden])');
	check(
		'narrator passage shown as notification banner',
		(await page.locator('#meta-notification-body').textContent()).indexOf(
			'narrator'
		) !== -1
	);
	check(
		'notification banner is labeled with the story name',
		(await page.locator('#meta-notification-label').textContent()) ===
			'Chatbook Demo'
	);

	if (SHOT_DIR) {
		await page.waitForTimeout(500);
		await page.screenshot({
			path: path.join(SHOT_DIR, 'meta-notification.png')
		});
	}

	await page.click('.meta-notification-card');
	check(
		'tapping the banner dismisses it',
		(await page.locator('#meta-notification[hidden]').count()) === 1
	);

	console.log('clear thread (flashback)');
	await page.evaluate(() => {
		window.story.config.metaStyle = 'overlay';
		window.story.show('Start');
	});
	await page.click('.user-response:has-text("whatsup")');
	await page.waitForSelector('.user-response:has-text("what is your name?")', {
		timeout: 15000
	});
	await page.click('.user-response:has-text("what is your name?")');
	await page.waitForSelector('.user-response:has-text("tell me")', {
		timeout: 15000
	});

	const bubblesBeforeClear = await page.locator('.chat-passage').count();

	await page.click('.user-response:has-text("tell me")');
	await page.waitForSelector('.chat-timestamp:has-text("Three years earlier")', {
		timeout: 15000
	});
	check(
		'clear tag wiped the thread for the flashback',
		(await page.locator('.chat-passage').count()) < bubblesBeforeClear &&
		(await page.locator('.chat-passage-wrapper[data-speaker="you"]').count()) === 0
	);
	check(
		'undo unavailable across a cleared thread',
		(await page.locator('#nav-link-undo[hidden]').count()) === 1
	);

	console.log('failed to send');
	await page.click('.user-response:has-text("who is this??")');
	await page.waitForSelector('.chat-passage-wrapper[data-receipt="failed"]', {
		timeout: 15000
	});
	check(
		'failed tag marks the message Not Delivered',
		(await page
			.locator('[data-receipt="failed"] .chat-receipt')
			.textContent()) === 'Not Delivered'
	);

	if (SHOT_DIR) {
		await page.waitForTimeout(600);
		await page.screenshot({ path: path.join(SHOT_DIR, 'failed-send.png') });
	}

	console.log('reactions');
	await page.click('.user-response:has-text("back to the present")');
	await page.waitForSelector('.chat-timestamp:has-text("Today 9:44 AM")', {
		timeout: 15000
	});
	check(
		'second clear returned to the present',
		(await page.locator('.chat-passage-wrapper[data-receipt="failed"]').count()) === 0
	);
	await page.click('.user-response:has-text("good to know you")');
	await page.waitForSelector('.chat-reaction', { timeout: 15000 });
	check(
		'speaker reacted to the player message',
		(await page
			.locator('.chat-passage-wrapper[data-speaker="you"] .chat-reaction')
			.textContent()) === '❤️'
	);
	await page.click('.user-response--react');
	await page.waitForSelector('.chat-passage:has-text("all I need")', {
		timeout: 15000
	});
	check(
		'player reaction landed on the speaker message',
		(await page
			.locator('.chat-passage-wrapper:not([data-speaker="you"]) .chat-reaction')
			.count()) === 1
	);
	check(
		'player reaction tracked in state',
		(await page.evaluate(() => window.story.state.lastReaction)) === '👍'
	);

	if (SHOT_DIR) {
		await page.waitForTimeout(600);
		await page.screenshot({ path: path.join(SHOT_DIR, 'reactions.png') });
	}

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
