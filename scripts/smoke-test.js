/*
 Drives the compiled demo story in headless Chromium and asserts the core
 chat mechanics work: message rendering, grouping, typing indicator, user
 responses, meta passages, undo and save/restore.

   node scripts/build-demo.js && node scripts/smoke-test.js
*/

'use strict';

const path = require('path');
const { chromium } = require('playwright');

const DEMO = path.join(__dirname, '..', 'docs', 'subtext-demo.html');
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

		// guard the screen-reader fix: message elements must never be
		// removed from (or re-inserted into) the role="log" region
		// during normal play, or live regions re-announce old messages
		// (text updates, like a receipt flipping to Read, are fine)
		window.__logRemovals = 0;
		new MutationObserver((mutations) => {
			mutations.forEach((m) => {
				m.removedNodes.forEach((node) => {
					if (
						node.nodeType === 1 &&
						(node.classList.contains('chat-passage-wrapper') ||
							node.classList.contains('chat-passage') ||
							node.classList.contains('meta-passage') ||
							node.classList.contains('chat-timestamp'))
					) {
						window.__logRemovals += 1;
					}
				});
			});
		}).observe(document.getElementById('phistory'), {
			childList: true,
			subtree: true
		});
	});
	check('title shown', (await page.textContent('#ptitle')) === 'Subtext Demo');
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
	check(
		'single-conversation stories stay inbox-free',
		(await page.locator('.thread-log').count()) === 0 &&
		(await page.locator('#nav-link-inbox[hidden]').count()) === 1 &&
		(await page.locator('#inbox[hidden]').count()) === 1
	);
	check(
		'hint text shown while the player is new',
		(await page.textContent('#user-response-hint')).indexOf(
			'Choose an option'
		) !== -1
	);

	console.log('menu modal & theme toggle');
	check(
		'sidebar columns are gone',
		(await page.locator('.left-sidebar, .right-sidebar').count()) === 0
	);
	check(
		'undo lives on the right, next to the menu',
		await page.evaluate(() => {
			const right = document.querySelector('.chat-header-right');

			return (
				!!right.querySelector('#nav-link-undo') &&
				!!right.querySelector('#nav-link-menu') &&
				!document.querySelector('.chat-header-left #nav-link-undo')
			);
		})
	);
	await page.click('#nav-link-menu');
	await page.waitForSelector('#menu-dialog[open]');
	check(
		'menu opens as a modal with injected content',
		(await page
			.locator('#menu-dialog #menu-container h3')
			.textContent()) === 'Welcome'
	);
	check(
		'theme and restart controls moved into the menu',
		(await page.locator('#menu-dialog #nav-link-theme').count()) === 1 &&
		(await page.locator('#menu-dialog #nav-link-restart').count()) === 1
	);
	// theme toggle now lives in the menu
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
				return key.indexOf('subtext-theme-') === 0;
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
	await page.click('[data-menu-close]');
	check(
		'menu modal closes',
		(await page.locator('#menu-dialog[open]').count()) === 0
	);
	// clear the explicit choice so later dark-mode screenshots follow
	// the emulated system scheme again
	await page.evaluate(() => {
		document.documentElement.removeAttribute('data-theme');
		Object.keys(window.localStorage).forEach(function(key) {
			if (key.indexOf('subtext-theme-') === 0) {
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
	check(
		'no DOM removals from the conversation log during normal flow',
		(await page.evaluate(() => window.__logRemovals)) === 0
	);
	check(
		'response timer meter armed by the timeout link',
		(await page.locator('.response-timer').count()) === 1
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
	check(
		'choosing a reply cancels the response timer',
		(await page.locator('.response-timer').count()) === 0
	);
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
		(await page.title()) === 'Subtext Demo'
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
			'Subtext Demo'
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
	check(
		'reaction badge superimposed on the bubble corner',
		await page.evaluate(() => {
			const wrapper = document.querySelector(
				'.chat-passage-wrapper[data-speaker="you"].has-reaction'
			);
			const bubble = wrapper.querySelector('.chat-passage');
			const badge = wrapper.querySelector('.chat-reaction');
			const b = bubble.getBoundingClientRect();
			const r = badge.getBoundingClientRect();
			const cx = r.left + r.width / 2;
			const cy = r.top + r.height / 2;

			// badge center sits on the bubble's top edge, near its left
			// (sender-facing) corner — half on, half off
			return Math.abs(cy - b.top) < 6 && cx > b.left && cx < b.left + 40;
		})
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

	console.log('free text input');
	await page.waitForSelector('.chat-composer-input', { timeout: 15000 });
	check(
		'hint retired after the configured number of moves',
		(await page.textContent('#user-response-hint')).trim() === ''
	);
	await page.evaluate(() => {
		// show hints again to verify the composer-specific wording
		window.story.config.hintFadeAfter = null;
		window.story.updateHint();
	});
	check(
		'composer shows its own hint text',
		(await page.textContent('#user-response-hint')) ===
			'Type your reply to continue'
	);
	await page.evaluate(() => {
		window.story.config.hintFadeAfter = 4;
		window.story.updateHint();
	});
	await page.fill('.chat-composer-input', 'clogs');
	await page.click('.chat-composer-send');
	await page.waitForSelector('.chat-passage:has-text("think geography")', {
		timeout: 15000
	});
	check(
		'typed reply sent as an outgoing bubble',
		(await page.locator('.chat-passage[data-speaker="you"]:has-text("clogs")').count()) === 1
	);
	check(
		'typed reply recorded in s.lastInput',
		(await page.evaluate(() => window.story.state.lastInput)) === 'clogs'
	);
	await page.waitForSelector('.chat-composer-input', { timeout: 15000 });
	await page.fill('.chat-composer-input', 'Amsterdam');
	await page.press('.chat-composer-input', 'Enter');
	await page.waitForSelector('.chat-passage:has-text("paying attention")', {
		timeout: 15000
	});
	check('story branched on the secret phrase', true);
	check(
		'every typed reply kept in s.inputs',
		(await page.evaluate(() => window.story.state.inputs.length)) === 2
	);

	console.log('axe accessibility audit');
	await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });

	const axeViolations = await page.evaluate(async () => {
		const results = await window.axe.run(document, {
			resultTypes: ['violations']
		});

		return results.violations.map((v) => ({
			id: v.id,
			impact: v.impact,
			nodes: v.nodes.length
		}));
	});
	const axeSerious = axeViolations.filter((v) =>
		['serious', 'critical'].includes(v.impact)
	);

	if (axeViolations.length > 0) {
		console.log('  axe findings: ' + JSON.stringify(axeViolations));
	}

	check(
		'axe: no serious or critical violations',
		axeSerious.length === 0
	);

	console.log('Snowman utility functions');
	check(
		'either() picks from a flattened pool',
		await page.evaluate(() => {
			const picks = new Set();

			for (let i = 0; i < 40; i++) {
				picks.add(window.either('a', ['b', 'c']));
			}

			return [...picks].every((p) => ['a', 'b', 'c'].includes(p)) &&
				picks.size > 1;
		})
	);
	check(
		'hasVisited() and visited() track story history',
		await page.evaluate(
			() =>
				window.hasVisited('Start') &&
				!window.hasVisited('no such passage') &&
				window.visited('Start') >= 2 &&
				window.visited('no such passage') === 0
		)
	);
	check(
		'renderToSelector() renders a passage into any element',
		await page.evaluate(() => {
			const el = document.createElement('div');

			el.id = 'rts-test';
			document.body.appendChild(el);
			window.renderToSelector('#rts-test', 'hello');

			const ok = el.textContent.indexOf('narrator') !== -1;

			el.remove();
			return ok;
		})
	);

	console.log('response timer expiry');
	await page.evaluate(() => {
		window.passage.links.push({
			display: 'timeout:0.2 sorry, dozed off 😴',
			target: 'Start'
		});
		window.story.clearUserResponses();
		window.story.showUserResponses();
	});
	await page.waitForSelector('.chat-passage:has-text("sorry, dozed off")', {
		timeout: 10000
	});
	check('expired timer auto-sent the forced reply', true);
	check(
		's.timedOut records the expiry',
		await page.evaluate(() => window.story.state.timedOut === true)
	);
	await page.waitForSelector('.user-response:has-text("whatsup")', {
		timeout: 15000
	});
	check('story continued to the timeout target', true);

	console.log('typing dots animate');
	await page.evaluate(() => window.story.showTyping('ok'));

	const dotTransforms = await page.evaluate(async () => {
		const dots = [...document.querySelectorAll('.chat-typing .dot')];
		const seen = new Set();

		for (let i = 0; i < 6; i++) {
			dots.forEach((dot) => {
				seen.add(getComputedStyle(dot).transform);
			});
			await new Promise((resolve) => setTimeout(resolve, 140));
		}

		return [...seen];
	});

	await page.evaluate(() => window.story.hideTyping());
	check(
		'typing dots visibly bounce (' + dotTransforms.length + ' transform states)',
		dotTransforms.length > 3 &&
		dotTransforms.some((t) => t !== 'none' && t !== 'matrix(1, 0, 0, 1, 0, 0)')
	);

	console.log('multi-conversation inbox');

	const INBOX_DEMO = path.join(__dirname, '..', 'docs', 'subtext-inbox-demo.html');
	const inboxPage = await browser.newPage({ viewport: { width: 420, height: 780 } });

	inboxPage.on('pageerror', (err) => errors.push('inbox: ' + err.message));
	await inboxPage.goto('file://' + INBOX_DEMO);
	await inboxPage.waitForSelector('.user-response');
	check(
		'starts in the start passage thread with inbox nav',
		(await inboxPage.textContent('#ptitle')) === 'Sam' &&
		(await inboxPage.locator('#nav-link-inbox:not([hidden])').count()) === 1
	);
	check(
		'one log per declared thread',
		(await inboxPage.locator('.thread-log').count()) === 3
	);

	await inboxPage.click('.user-response:has-text("what happened")');
	await inboxPage.waitForSelector('#meta-notification:not([hidden])', {
		timeout: 25000
	});
	check(
		'a delivery to another thread raises a banner',
		(await inboxPage.textContent('#meta-notification-label')) === 'Mom'
	);

	await inboxPage.click('#nav-link-inbox');
	await inboxPage.waitForSelector('#inbox:not([hidden])');
	check(
		'inbox lists every thread',
		(await inboxPage.locator('.inbox-row').count()) === 3
	);
	check(
		'unread badge on the delivered thread',
		(await inboxPage
			.locator('.inbox-row:has-text("Mom") .inbox-badge')
			.textContent()) === '1'
	);

	await inboxPage.click('.inbox-row:has-text("Mom")');
	await inboxPage.waitForSelector('.thread-log[data-thread="mom"]:not([hidden])');
	check(
		'delivered message readable in its thread',
		(await inboxPage
			.locator('.thread-log[data-thread="mom"] .chat-passage')
			.first()
			.textContent()).indexOf('porch light') !== -1
	);
	check(
		'no responses leak into a thread without the story cursor',
		(await inboxPage.locator('.user-response').count()) === 0
	);

	await inboxPage.click('#nav-link-inbox');
	check(
		'viewing a thread clears its unread badge',
		(await inboxPage.locator('.inbox-row:has-text("Mom") .inbox-badge').count()) === 0
	);

	await inboxPage.click('.inbox-row:has-text("Sam")');
	await inboxPage.waitForSelector('.user-response:has-text("be careful")');
	check('returning to the live thread re-offers its choices', true);

	await inboxPage.click('.user-response:has-text("be careful")');
	await inboxPage.waitForFunction(
		() =>
			!document.getElementById('meta-notification').hidden &&
			document
				.getElementById('meta-notification-label')
				.textContent.indexOf('Unknown') === 0,
		null,
		{ timeout: 30000 }
	);
	await inboxPage.click('.meta-notification-card');
	await inboxPage.waitForSelector(
		'.thread-log[data-thread="unknown"]:not([hidden])'
	);
	check(
		'tapping the banner jumps to that conversation',
		(await inboxPage
			.locator('.thread-log[data-thread="unknown"] .chat-passage')
			.first()
			.textContent()).indexOf('awake') !== -1
	);

	await inboxPage.click('#nav-link-inbox');
	await inboxPage.click('.inbox-row:has-text("Sam")');
	await inboxPage.waitForSelector(".user-response:has-text(\"mom's texting me\")");
	await inboxPage.click(".user-response:has-text(\"mom's texting me\")");
	check(
		'the reply bubble stays in the thread where it was sent',
		(await inboxPage
			.locator('.thread-log[data-thread="sam"] .chat-passage[data-speaker="you"]:has-text("texting me")')
			.count()) === 1
	);
	await inboxPage.waitForFunction(
		() =>
			!document.getElementById('meta-notification').hidden &&
			document.getElementById('meta-notification-label').textContent === 'Mom',
		null,
		{ timeout: 30000 }
	);
	await inboxPage.click('.meta-notification-card');
	await inboxPage.waitForSelector('.user-response:has-text("stay inside")', {
		timeout: 25000
	});
	check('a cross-thread link moves the conversation there', true);

	await inboxPage.click('.user-response:has-text("stay inside")');
	await inboxPage.waitForSelector('.thread-log[data-thread="mom"] .chat-reaction', {
		timeout: 25000
	});
	check('reaction lands on the message in its own thread', true);
	await inboxPage.waitForSelector('.user-response:has-text("tell Sam")', {
		timeout: 25000
	});

	await inboxPage.evaluate(() => window.story.save());

	const savedInboxUrl = inboxPage.url();
	const inboxPage2 = await browser.newPage({
		viewport: { width: 420, height: 780 }
	});

	inboxPage2.on('pageerror', (err) => errors.push('inbox2: ' + err.message));
	await inboxPage2.goto(savedInboxUrl);
	await inboxPage2.waitForSelector('.user-response:has-text("tell Sam")', {
		timeout: 25000
	});
	check(
		'restore rebuilds every thread and the viewed screen',
		(await inboxPage2.locator('.thread-log[data-thread="sam"] .chat-passage').count()) >= 4 &&
		(await inboxPage2.locator('.thread-log[data-thread="mom"]:not([hidden])').count()) === 1
	);
	await inboxPage2.close();

	const bubblesInMom = await inboxPage
		.locator('.thread-log[data-thread="mom"] .chat-passage')
		.count();

	await inboxPage.click('#nav-link-undo');
	check(
		'undo trims the right thread and restores its choices',
		(await inboxPage.locator('.thread-log[data-thread="mom"] .chat-passage').count()) < bubblesInMom &&
		(await inboxPage.locator('.user-response:has-text("stay inside")').count()) === 1
	);

	await inboxPage.click('#nav-link-inbox');
	await inboxPage.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });

	const inboxAxe = await inboxPage.evaluate(async () => {
		const results = await window.axe.run(document, {
			resultTypes: ['violations']
		});

		return results.violations
			.filter((v) => ['serious', 'critical'].includes(v.impact))
			.map((v) => v.id);
	});

	check(
		'axe: inbox screen has no serious violations (' + inboxAxe.join(',') + ')',
		inboxAxe.length === 0
	);
	await inboxPage.close();

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
