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
							node.classList.contains('chat-timestamp') ||
							node.classList.contains('chat-system'))
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

	console.log('pill vs sent text');
	await page.evaluate(() => window.story.show('pill-demo'));
	await page.waitForSelector('.user-response:has-text("sure")', {
		timeout: 15000
	});
	check(
		'pill label differs from the sent-text override',
		(await page
			.locator('.user-response[data-sent]:has-text("sure")')
			.getAttribute('data-sent')) ===
			'sure, that makes total sense now that you explain it'
	);
	const bubblesBeforePill = await page.locator(
		'.chat-passage[data-speaker="you"]'
	).count();
	await page.click('.user-response:has-text("sure")');
	check(
		'sent bubble shows the override text, not the pill label',
		(await page
			.locator('.chat-passage[data-speaker="you"]')
			.last()
			.textContent()).indexOf('now that you explain it') !== -1
	);
	check(
		's.lastChoice records the pill label, not the sent text',
		(await page.evaluate(() => window.story.state.lastChoice)) === 'sure'
	);
	await page.waitForSelector('.chat-passage:has-text("elaborated")', {
		timeout: 15000
	});
	await page.evaluate(() => window.story.show('pill-demo'));
	await page.waitForSelector('.user-response:has-text("just react")', {
		timeout: 15000
	});
	const bubblesBeforeSilent = await page.locator(
		'.chat-passage[data-speaker="you"]'
	).count();
	await page.click('.user-response:has-text("just react")');
	await page.waitForSelector('.chat-passage:has-text("nothing at all")', {
		timeout: 15000
	});
	check(
		'an empty (send:) advances without a player bubble',
		(await page.locator('.chat-passage[data-speaker="you"]').count()) ===
			bubblesBeforeSilent
	);
	check(
		's.lastChoice records the label even when nothing was sent',
		(await page.evaluate(() => window.story.state.lastChoice)) ===
			'just react'
	);

	console.log('asides in the margin');

	// a desktop-sized page: real margins beside the phone
	const asidePage = await browser.newPage({
		viewport: { width: 1280, height: 800 }
	});

	asidePage.on('pageerror', (err) => errors.push('aside: ' + err.message));
	await asidePage.goto('file://' + DEMO);
	await asidePage.waitForSelector('.user-response');
	await asidePage.evaluate(() => window.story.show('one-more-thing'));
	await asidePage.waitForSelector('#aside-layer .chat-aside--right', {
		timeout: 15000
	});
	await asidePage.waitForTimeout(600);
	const asideGeom = await asidePage.evaluate(() => {
		const aside = document.querySelector('.chat-aside');
		const app = document.getElementById('app');
		const anchor = document.querySelector(
			'#phistory .chat-passage-wrapper:last-of-type'
		);
		return {
			role: aside.getAttribute('role'),
			left: aside.getBoundingClientRect().left,
			top: aside.getBoundingClientRect().top,
			appRight: app.getBoundingClientRect().right,
			over: aside.classList.contains('chat-aside--over'),
			anchorTop: anchor ? anchor.getBoundingClientRect().top : null
		};
	});
	check(
		'aside sits in the margin outside the phone',
		asideGeom.left > asideGeom.appRight && !asideGeom.over
	);
	check('aside is a note for assistive tech', asideGeom.role === 'note');
	check(
		'aside rides level with the message it follows',
		asideGeom.anchorTop !== null &&
			Math.abs(asideGeom.top - asideGeom.anchorTop) < 40
	);

	// three beats (new messages) age it out
	await asidePage.evaluate(() => {
		window.story.showUserBubble('one');
		window.story.showUserBubble('two');
		window.story.showUserBubble('three');
	});
	await asidePage.waitForTimeout(700);
	check(
		'aside fades after its beats run out',
		(await asidePage.locator('.chat-aside').count()) === 0
	);

	// the left margin, via tag
	await asidePage.evaluate(() => window.story.show('aside-demo-left'));
	await asidePage.waitForSelector('#aside-layer .chat-aside--left', {
		timeout: 15000
	});
	check(
		'aside-left lands in the left margin',
		await asidePage.evaluate(() => {
			const aside = document.querySelector('.chat-aside--left');
			const app = document.getElementById('app');
			return (
				aside.getBoundingClientRect().right <
				app.getBoundingClientRect().left
			);
		})
	);

	// undo sweeps asides away (they are ephemeral commentary)
	await asidePage.click('.user-response:has-text("onward")');
	await asidePage.evaluate(() => window.story.undo());
	await asidePage.waitForTimeout(700);
	check(
		'undo clears any live aside',
		(await asidePage.locator('.chat-aside').count()) === 0
	);
	await asidePage.close();

	// no margin on a phone-sized screen: the aside floats over the
	// chat's edge instead
	await page.evaluate(() => window.story.show('one-more-thing'));
	await page.waitForSelector('#aside-layer .chat-aside', { timeout: 15000 });
	await page.waitForTimeout(600);
	check(
		'on small screens the aside floats over the chat edge',
		await page.evaluate(() => {
			const aside = document.querySelector('.chat-aside');
			const app = document.getElementById('app');
			const a = aside.getBoundingClientRect();
			const b = app.getBoundingClientRect();
			return (
				aside.classList.contains('chat-aside--over') &&
				a.left >= b.left - 1 &&
				a.right <= b.right + 1
			);
		})
	);
	await page.evaluate(() => window.story.clearAsides());

	console.log('timestamps appear while typing');

	// choosing back to Start (which opens with [timestamp Today 9:41 AM])
	// must surface the chip right away — one tick after choose() (the
	// pre-show is deferred a tick so it can't front-run the passage
	// that scheduled it), long before the reply "arrives"
	const stampCounts = await page.evaluate(
		() =>
			new Promise((resolve) => {
				const count = () =>
					document.querySelectorAll('.chat-timestamp').length;
				const before = count();

				window.story.choose('Start', 'one more time');
				setTimeout(() => resolve({ before, nextTick: count() }), 0);
			})
	);
	check(
		'timestamp chip appears as soon as typing begins',
		stampCounts.nextTick === stampCounts.before + 1
	);
	await page.waitForTimeout(2000); // Start's typing delay is ~500ms
	check(
		'chip is not duplicated when the message arrives',
		(await page.locator('.chat-timestamp').count()) ===
			stampCounts.before + 1
	);

	console.log('choice tracking');

	const tracked = await page.evaluate(() => {
		window.__choiceEvents = [];
		window.addEventListener('choice', (e) =>
			window.__choiceEvents.push({
				label: e.detail.label,
				target: e.detail.target
			})
		);
		return {
			prev: window.story.state.previousPassage,
			current: window.passage.name
		};
	});
	check(
		's.previousPassage tracks how the player arrived',
		typeof tracked.prev === 'string' &&
			tracked.prev.length > 0 &&
			tracked.prev !== tracked.current
	);
	await page.evaluate(() => window.story.choose('Start', 'again'));
	await page.waitForTimeout(200);
	check(
		'a choice event fires with label and target',
		await page.evaluate(
			() =>
				window.__choiceEvents.length === 1 &&
				window.__choiceEvents[0].label === 'again' &&
				window.__choiceEvents[0].target === 'Start'
		)
	);
	check(
		's.replySeconds records the deliberation time',
		await page.evaluate(() => {
			const t = window.story.state.replySeconds;
			return typeof t === 'number' && t >= 0 && t < 600;
		})
	);

	// cross-playthrough memory: survives restart, unlike s
	check(
		'remember/recall round-trips and forget clears',
		await page.evaluate(() => {
			window.story.remember('endings', ['bad']);
			const kept = window.story.recall('endings');
			const fallback = window.story.recall('missing', 'dflt');
			window.story.forget('endings');
			const gone = window.story.recall('endings', 'gone');
			return (
				Array.isArray(kept) && kept[0] === 'bad' &&
				fallback === 'dflt' && gone === 'gone'
			);
		})
	);
	check(
		'memory persists in storage while saves stay separate',
		await page.evaluate(() => {
			window.story.remember('runs', 2);
			const raw = localStorage.getItem(
				'subtext-memory-' + window.story.ifid
			);
			window.story.forget();
			return raw !== null && JSON.parse(raw).runs === 2;
		})
	);

	console.log('multi-bubble send');

	await page.evaluate(() => window.story.show('pill-demo'));
	await page.waitForSelector('.user-response:has-text("the long version")', {
		timeout: 15000
	});
	const bubblesBeforeMulti = await page.locator(
		'.chat-passage[data-speaker="you"]'
	).count();
	await page.click('.user-response:has-text("the long version")');
	await page.waitForTimeout(700);
	check(
		'|| in a (send:) label splits into separate bubbles',
		(await page.locator('.chat-passage[data-speaker="you"]').count()) ===
			bubblesBeforeMulti + 3
	);
	check(
		'classic [[display|target]] links still parse',
		await page.evaluate(() => {
			window.passage.links = [];
			window.Passage.render('[[say hi|Start]] [[a || b (send: a || b)->Start]]');
			const links = window.passage.links;
			return (
				links.length === 2 &&
				links[0].display === 'say hi' &&
				links[0].target === 'Start' &&
				links[1].target === 'Start' &&
				links[1].sent === 'a || b'
			);
		})
	);

	// an empty (send:) into narration is a direct tap — the overlay
	// must appear in the same tick, not after metaDelay
	check(
		'empty (send:) into narration shows the overlay instantly',
		await page.evaluate(() => {
			window.story.choose('hello', '');
			return !document.getElementById('meta-overlay').hidden;
		})
	);

	console.log('message chains');

	const chainPage = await browser.newPage({
		viewport: { width: 480, height: 800 }
	});

	chainPage.on('pageerror', (err) => errors.push('chain: ' + err.message));
	await chainPage.goto('file://' + DEMO);
	await chainPage.waitForSelector('.user-response');

	// capture a save right as the chain starts, before any link lands —
	// it should replay and then finish the chain on its own
	const midChainHash = await chainPage.evaluate(() => {
		window.story.show('montage');
		return window.story.saveHash();
	});

	await chainPage.waitForSelector(
		'.chat-passage:has-text("twelve missed calls on here from 2013")',
		{ timeout: 15000 }
	);

	const chainShape = () =>
		chainPage.evaluate(() => {
			const labels = [
				'Mon, Mar 5, 2012',
				'Fri, Jul 18, 2014',
				'Sat, Feb 3, 2018'
			];

			return labels.every((label) => {
				const chips = Array.from(
					document.querySelectorAll('.chat-timestamp')
				).filter((chip) => chip.textContent.trim() === label);

				return (
					chips.length === 1 &&
					chips[0].nextElementSibling !== null &&
					chips[0].nextElementSibling.classList.contains(
						'chat-passage-wrapper'
					)
				);
			});
		});

	check(
		'a showDelayed chain renders each [timestamp] chip once, glued above its message',
		await chainShape()
	);

	// a completed chain restored from a save must not re-run its
	// showDelayed echoes on top of the replayed messages
	await chainPage.evaluate(() =>
		window.story.restore(window.story.saveHash())
	);
	await chainPage.waitForTimeout(2500);
	check(
		'restoring a finished chain does not duplicate its messages',
		await chainShape()
	);

	// a save made mid-chain replays, then the pending link continues
	// (the text probe reads the transcript, not body.textContent —
	// the page's tw-storydata holds the whole twee source)
	const midState = await chainPage.evaluate((hash) => {
		window.story.restore(hash);

		const text = Array.from(
			document.querySelectorAll('.chat-passage-wrapper')
		)
			.map((node) => node.textContent)
			.join(' ');

		return {
			first: text.indexOf('found my old flip phone') > -1,
			rest: text.indexOf('twelve missed calls on here from 2013') > -1
		};
	}, midChainHash);

	check(
		'a mid-chain save replays only what had arrived',
		midState.first && !midState.rest
	);
	await chainPage.waitForSelector(
		'.chat-passage:has-text("twelve missed calls on here from 2013")',
		{ timeout: 15000 }
	);
	check(
		'the chain picks up where the save left off, without duplicates',
		await chainShape()
	);

	// an instant-tagged passage lands right after its pill, no dots
	await chainPage.waitForSelector('.user-response:has-text("and then?")');
	const instantState = await chainPage.evaluate(
		() =>
			new Promise((resolve) => {
				const pill = Array.from(
					document.querySelectorAll('.user-response')
				).find((p) => p.textContent.indexOf('and then?') > -1);

				pill.click();
				setTimeout(() => {
					const transcript = Array.from(
						document.querySelectorAll('.chat-passage-wrapper')
					)
						.map((node) => node.textContent)
						.join(' ');

					resolve({
						arrived:
							transcript.indexOf('flip phone is going back') > -1,
						typing: !document.getElementById(
							'animation-container'
						).hidden
					});
				}, 50);
			})
	);

	check(
		'an [instant] passage arrives without a typing indicator',
		instantState.arrived && !instantState.typing
	);

	// an explicit delay on an [instant] passage is a silent wait: no
	// dots during the pause, the message simply lands when it's over
	const silentWait = await chainPage.evaluate(
		() =>
			new Promise((resolve) => {
				const count = () =>
					document.querySelectorAll('.chat-passage').length;
				const typing = () =>
					!document.getElementById('animation-container').hidden;
				const before = count();

				window.story.showDelayed('montage-4', 600);
				setTimeout(() => {
					const during = {
						typing: typing(),
						arrived: count() > before
					};

					setTimeout(
						() =>
							resolve({
								during,
								after: count() > before,
								typingAfter: typing()
							}),
						600
					);
				}, 300);
			})
	);

	check(
		'an [instant] passage with an explicit delay waits silently, then lands',
		!silentWait.during.typing &&
			!silentWait.during.arrived &&
			silentWait.after &&
			!silentWait.typingAfter
	);
	await chainPage.close();

	console.log('photo lightbox');

	const lightbox = await page.evaluate(() => {
		const name = Object.keys(window.story.gallery)[0];

		window.story.showPhotoBubble(name);

		const imgs = document.querySelectorAll(
			'.chat-passage--media img[role="button"]'
		);
		const img = imgs[imgs.length - 1];

		if (!img) {
			return { focusable: false };
		}

		img.click();

		return {
			focusable: img.getAttribute('tabindex') === '0',
			open: !document.getElementById('photo-lightbox').hidden,
			src: document.getElementById('photo-lightbox-img').src === img.src
		};
	});

	check(
		'a chat photo is keyboard-focusable and opens the lightbox',
		lightbox.focusable && lightbox.open && lightbox.src
	);
	await page.keyboard.press('Escape');
	check(
		'Escape closes the lightbox',
		await page.evaluate(
			() => document.getElementById('photo-lightbox').hidden
		)
	);

	console.log('deleted messages');

	// redactMessage tombstones in place — the node is never removed,
	// so the role="log" MutationObserver guard stays quiet
	const redacted = await page.evaluate(() => {
		window.story.showUserBubble('you did NOT just say that');
		window.story.pushCheckpoint();
		window.story.redactMessage('out');

		const bubbles = document.querySelectorAll(
			'.chat-passage[data-speaker="you"]'
		);
		const last = bubbles[bubbles.length - 1];

		return {
			tombstoned:
				last.classList.contains('chat-passage--redacted') &&
				last.textContent === 'This message was deleted',
			logged: window.story._redactionLog.length > 0
		};
	});

	check(
		'redactMessage tombstones the player message in place',
		redacted.tombstoned && redacted.logged
	);

	check(
		'undo restores a deleted message',
		await page.evaluate(() => {
			window.story.undo();

			const bubbles = document.querySelectorAll(
				'.chat-passage[data-speaker="you"]'
			);
			const last = bubbles[bubbles.length - 1];

			return (
				!last.classList.contains('chat-passage--redacted') &&
				last.textContent.indexOf('you did NOT just say that') > -1
			);
		})
	);

	check(
		'a deleted message stays deleted through save/restore',
		await page.evaluate(() => {
			window.story.redactMessage('out', 'You deleted this message');
			window.story.restore(window.story.saveHash());

			const bubbles = document.querySelectorAll(
				'.chat-passage[data-speaker="you"]'
			);
			const last = bubbles[bubbles.length - 1];

			return (
				last.classList.contains('chat-passage--redacted') &&
				last.textContent === 'You deleted this message'
			);
		})
	);

	console.log('debug mode');

	const debugPage = await browser.newPage({
		viewport: { width: 1280, height: 800 }
	});

	debugPage.on('pageerror', (err) => errors.push('debug: ' + err.message));
	await debugPage.goto('file://' + DEMO + '?debug');
	await debugPage.waitForSelector('.user-response');

	// an earlier session's debug autosave would restore mid-story and
	// skew every assertion below; start from a clean slate
	if (await debugPage.evaluate(() => window.passage.name !== 'Start')) {
		await debugPage.evaluate(() => localStorage.clear());
		await debugPage.reload();
		await debugPage.waitForSelector('.user-response');
	}
	check(
		'?debug enables debug mode and forces autosave',
		await debugPage.evaluate(
			() => window.story.debug && window.story.config.autosave
		)
	);
	await debugPage.click('#debug-toggle');
	await debugPage.waitForSelector('#debug-panel:not([hidden])');
	check(
		'panel reports the current passage',
		(await debugPage.textContent('#debug-where')).indexOf('Start') > -1
	);

	// live variable watch via the eval console
	await debugPage.fill('#debug-eval input', 's.clue = "red herring"');
	await debugPage.click('#debug-eval button');
	check(
		'eval sets state and the variables table shows it',
		(await debugPage.textContent('#debug-vars')).indexOf('red herring') > -1
	);

	// fast-forward: filter the passage list and jump — a clean teleport
	await debugPage.fill('#debug-filter', 'pill-demo');
	await debugPage.click('#debug-passages button:has-text("pill-demo")');
	await debugPage.waitForSelector('.user-response:has-text("the long version")', {
		timeout: 15000
	});
	check(
		'jump fast-forwards to the chosen passage',
		await debugPage.evaluate(() => window.passage.name === 'pill-demo')
	);
	check(
		'jump teleports onto a clean transcript',
		(await debugPage.locator('.chat-passage:has-text("hi!")').count()) === 0
	);

	// timeline time travel: make some moves, then rewind to the start
	await debugPage.click('.user-response:has-text("the long version")');
	await debugPage.waitForSelector('.chat-passage:has-text("nothing at all")', {
		timeout: 15000
	});
	await debugPage.locator('#debug-timeline button').first().click();
	await debugPage.waitForSelector('.user-response:has-text("the long version")', {
		timeout: 15000
	});
	check(
		'a timeline entry rewinds the story to that moment',
		await debugPage.evaluate(
			() =>
				window.passage.name === 'pill-demo' &&
				document.querySelectorAll(
					'.chat-passage[data-speaker="you"]'
				).length === 0
		)
	);
	check(
		'timeline section sits above the jump section',
		await debugPage.evaluate(() => {
			const timeline = document.getElementById('debug-timeline');
			const jump = document.getElementById('debug-passages');
			return !!(
				timeline.compareDocumentPosition(jump) &
				Node.DOCUMENT_POSITION_FOLLOWING
			);
		})
	);

	// resume: a reload (what a `tweego -w` rebuild triggers in a live
	// preview) restores the current position from the debug autosave —
	// even when the rebuild renumbers every passage id
	await debugPage.evaluate(() => window.story.debugJump('pill-demo'));
	await debugPage.waitForSelector('.user-response:has-text("the long version")', {
		timeout: 15000
	});
	await debugPage.waitForTimeout(300);

	const fs = require('fs');
	const { execFileSync } = require('child_process');
	const TWEE = path.join(__dirname, '..', 'docs', 'subtext-demo.twee');
	const shiftedTwee = path.join(__dirname, '_shifted.twee');

	fs.writeFileSync(
		shiftedTwee,
		fs.readFileSync(TWEE, 'utf8').replace(
			':: Start [speaker-1]',
			':: brand-new-scene [speaker-1]\nadded mid-session\n\n[[ok->Start]]\n\n:: Start [speaker-1]'
		)
	);
	execFileSync('node', [path.join(__dirname, 'build-demo.js'), shiftedTwee, DEMO]);
	await debugPage.reload();
	await debugPage.waitForSelector('.user-response', { timeout: 15000 });
	check(
		'reload after a pid-shifting rebuild resumes at the same passage',
		await debugPage.evaluate(
			() =>
				window.passage.name === 'pill-demo' &&
				!!window.story.passage('brand-new-scene')
		)
	);
	check(
		'the panel stays open across the reload',
		(await debugPage.locator('#debug-panel:not([hidden])').count()) === 1
	);
	fs.unlinkSync(shiftedTwee);
	execFileSync('node', [path.join(__dirname, 'build-demo.js')]); // restore
	await debugPage.reload(); // back onto the unshifted build
	await debugPage.waitForSelector('.user-response', { timeout: 15000 });

	// the story check: the demo lints clean, and planted problems
	// (bad targets, unprofiled speaker, an orphan) are all caught
	check(
		'story check: the demo lints clean',
		await debugPage.evaluate(() => window.story.lint().length === 0)
	);
	check(
		'story check catches broken targets, bad tags, and orphans',
		await debugPage.evaluate(() => {
			window.story.passages.push(
				new window.Passage(
					9999,
					'lint-bait',
					['speaker-nobody'],
					'[[nowhere]]\n[deliver ghost]\n' +
						'<% story.showDelayed("phantom") %>'
				)
			);

			const findings = window.story.lint();

			window.story.passages.pop();

			const msgs = findings.map((f) => f.message).join('; ');

			return (
				msgs.indexOf('missing passage "nowhere"') > -1 &&
				msgs.indexOf('missing passage "ghost"') > -1 &&
				msgs.indexOf('missing passage "phantom"') > -1 &&
				msgs.indexOf(
					'"nobody" has no StorySpeakers profile'
				) > -1 &&
				msgs.indexOf('nothing links to "lint-bait"') > -1
			);
		})
	);
	check(
		'debug panel reports the story check result',
		(await debugPage.textContent('#debug-lint')).indexOf(
			'no problems'
		) > -1
	);

	// the transcript export flattens what's on screen to Markdown
	check(
		'transcript export flattens the conversation to Markdown',
		await debugPage.evaluate(() => {
			const text = window.story.exportTranscript();

			return (
				text.indexOf('# Subtext Demo') === 0 &&
				text.indexOf(':**') > -1
			);
		})
	);

	await debugPage.evaluate(() => window.story.restart && localStorage.clear());
	await debugPage.close();

	// debug chrome never appears for players
	check(
		'no debug UI outside debug mode',
		(await page.locator('#debug-toggle').count()) === 0
	);

	console.log('page chrome');

	// the read receipt flips when the reply is queued — before the
	// typing indicator finishes, not when the message lands
	await page.evaluate(() => {
		window.story.config.minTypingDelay = 3000;
		window.story.choose('ok', 'you there?');
	});
	await page.waitForSelector('#animation-container:not([hidden])');
	check(
		'read receipt flips while the reply is still typing',
		await page.evaluate(
			() =>
				window.story.lastOutgoingWrapper()
					.getAttribute('data-receipt') === 'read' &&
				!document.getElementById('animation-container').hidden
		)
	);
	await page.waitForTimeout(3500);
	await page.evaluate(() => {
		window.story.config.minTypingDelay = 500;
	});

	// the header is a stage: repurpose it mid-story
	await page.evaluate(() => window.story.setHeader('Prologue', 'part one'));
	check(
		'setHeader repurposes the title line',
		(await page.textContent('#ptitle')) === 'Prologue' &&
			(await page.textContent('#psubtitle')) === 'part one' &&
			(await page.textContent('#pauthor')) === ''
	);

	// identity can live in the menu instead of the header
	await page.evaluate(() => {
		delete window.story.state._header;
		window.story.config.titlePlacement = 'menu';
		window.story.applyIdentity();
	});
	check(
		'titlePlacement "menu" tucks the identity into the menu',
		(await page.textContent('#ptitle')) === '' &&
			(await page.textContent('#menu-identity')).indexOf(
				'Subtext Demo'
			) > -1
	);
	await page.evaluate(() => {
		window.story.config.titlePlacement = 'header';
		window.story.applyIdentity();
	});

	// the menu dialog itself is renameable
	await page.evaluate(() =>
		window.inject_menu('<p>about this story</p>', 'About')
	);
	check(
		'inject_menu can retitle the menu dialog',
		(await page.textContent('#menu-dialog-title')) === 'About'
	);

	check(
		'Trialogue sidebar helpers are gone',
		await page.evaluate(
			() =>
				typeof window.inject_left_sidebar === 'undefined' &&
				typeof window.inject_right_sidebar === 'undefined' &&
				typeof window.fade_in_content_containers === 'undefined'
		)
	);

	// canonical chrome methods, with inject_* as aliases
	await page.evaluate(() =>
		window.story.setRestartDialog('Leave?', '<p>All will be lost.</p>')
	);
	check(
		'setRestartDialog rewords the restart confirmation',
		(await page.textContent('#exit-dialog .modal-title')) === 'Leave?'
	);
	check(
		'setMenu is the canonical menu API (inject_menu delegates)',
		await page.evaluate(() => {
			window.story.setMenu('<p>via setMenu</p>', 'Info');
			return (
				document.getElementById('menu-container').textContent ===
					'via setMenu' &&
				document.getElementById('menu-dialog-title').textContent ===
					'Info'
			);
		})
	);

	// design-language shorthands and aliases
	check(
		'bare [[photo->x]] offers the whole gallery like photo:*',
		await page.evaluate(() => {
			window.passage.links = [];
			window.Passage.render('[[photo->photo-reply]]');
			return (
				window.story.getPhotoOffers(window.passage.links).length ===
				Object.keys(window.story.gallery).length
			);
		})
	);
	check(
		'meta-aside completes the narration tag family',
		await page.evaluate(
			() =>
				window.story.getAsideSide({ tags: ['meta-aside'] }) ===
				'right'
		)
	);

	// Snowman-lineage globals resolve bare inside templates
	check(
		'story and passage globals reach into templates',
		await page.evaluate(() => {
			const rendered = window.Passage.render(
				'<%= story.name %> / <%= passage.name %>'
			);
			return (
				rendered.indexOf('Subtext Demo') > -1 &&
				rendered.indexOf(window.passage.name) > -1
			);
		})
	);

	// (send:) strips from the target too in shorthand [[label]] links
	check(
		'(send:) works in shorthand links without an arrow',
		await page.evaluate(() => {
			window.passage.links = [];
			window.Passage.render('[[ok (send: hi || there)]]');
			const link = window.passage.links[0];
			return (
				link.target === 'ok' &&
				link.display === 'ok' &&
				link.sent === 'hi || there'
			);
		})
	);

	// undo can be disabled by config
	await page.evaluate(() => {
		window.story.config.undoButton = false;
		window.story.choose('Start', 'no takebacks');
	});
	await page.waitForTimeout(300);
	check(
		'config.undoButton = false keeps the undo button hidden',
		await page.evaluate(
			() =>
				document.getElementById('nav-link-undo').hidden &&
				window.story.checkpoints.length > 0
		)
	);
	await page.evaluate(() => {
		window.story.config.undoButton = true;
	});

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
		(await inboxPage.locator('.thread-log').count()) === 5
	);

	// seed-tagged passages are already in Mom's thread — old and read
	check(
		'seed passages fill a thread with read history at start',
		await inboxPage.evaluate(() => {
			const log = document.querySelector('.thread-log[data-thread="mom"]');
			return (
				log.querySelectorAll('.chat-passage-wrapper').length === 2 &&
				log.textContent.indexOf('Did you eat today') > -1 &&
				(window.story.unread.mom || 0) === 0
			);
		})
	);
	check(
		'a seeded player message honors its receipt tag',
		await inboxPage.evaluate(() => {
			const receipt = document.querySelector(
				'.thread-log[data-thread="mom"] ' +
				'.chat-passage-wrapper[data-speaker="you"] .chat-receipt'
			);
			return !!receipt && receipt.textContent === 'Delivered';
		})
	);
	check(
		'a seeded [react …] lands on the previous seeded message',
		await inboxPage.evaluate(() => {
			const badge = document.querySelector(
				'.thread-log[data-thread="mom"] ' +
				'.chat-passage-wrapper:not([data-speaker="you"]) .chat-reaction'
			);
			return !!badge && badge.textContent === '👍';
		})
	);
	check(
		'markUnread with no hot thread cannot corrupt the inbox',
		await inboxPage.evaluate(() => {
			const prev = window.story._hotThread;
			window.story._hotThread = null;
			window.story.markUnread();
			window.story._hotThread = prev;
			window.story.renderInbox();
			return (
				window.story.threadOrder.indexOf(null) === -1 &&
				!document.querySelector('.thread-log[data-thread="null"]')
			);
		})
	);

	await inboxPage.click('.user-response:has-text("what happened")');
	await inboxPage.waitForSelector('#meta-notification:not([hidden])', {
		timeout: 25000
	});
	check(
		'a delivery to another thread raises a banner',
		(await inboxPage.textContent('#meta-notification-label')) === 'Mom'
	);
	check(
		'banner shows the message body, not its [timestamp] chip',
		await inboxPage.evaluate(() => {
			const body = document.getElementById(
				'meta-notification-body'
			).textContent;
			return body.indexOf('Honey') === 0 && body.indexOf('2:03') === -1;
		})
	);
	check(
		'long deliveries are cut off like real notifications',
		await inboxPage.evaluate(() => {
			const body = document.getElementById('meta-notification-body');
			return (
				body.textContent.length <= 92 &&
				body.textContent.slice(-1) === '…' &&
				document
					.getElementById('meta-notification')
					.classList.contains('meta-notification--thread')
			);
		})
	);

	await inboxPage.click('#nav-link-inbox');
	await inboxPage.waitForSelector('#inbox:not([hidden])');
	check(
		'a hidden thread stays out of the inbox until it speaks',
		(await inboxPage.locator('.inbox-row:not(.inbox-row--trash)').count()) === 3 &&
		(await inboxPage.locator('.inbox-row:has-text("Unknown")').count()) === 0
	);
	check(
		'a narration overlay hides the inbox chevron (no stranding)',
		await inboxPage.evaluate(() => {
			// back on a thread screen first
			window.story.openThread(window.story._hotThread);
			window.story.showMeta('<p>the night stretches on</p>', 'overlay');
			const hiddenUnderVeil =
				document.getElementById('nav-link-inbox').hidden;
			window.story.hideMeta();
			const backAfter =
				!document.getElementById('nav-link-inbox').hidden;
			return hiddenUnderVeil && backAfter;
		})
	);
	check(
		'hideInboxButton/showInboxButton control the chevron',
		await inboxPage.evaluate(() => {
			window.story.hideInboxButton();
			const gone = document.getElementById('nav-link-inbox').hidden;
			window.story.showInboxButton();
			const back = !document.getElementById('nav-link-inbox').hidden;
			return gone && back;
		})
	);
	await inboxPage.evaluate(() => window.story.openInbox());
	await inboxPage.waitForSelector('#inbox:not([hidden])');
	check(
		'an archived thread waits in the Trash instead of the inbox',
		(await inboxPage.locator('.inbox-row:has-text("Pizza")').count()) === 0 &&
		(await inboxPage.textContent('.inbox-trash-count')) === '1'
	);
	await inboxPage.click('.inbox-trash-toggle');
	check(
		'the Trash opens to readable archived conversations',
		(await inboxPage.locator('.inbox-row--trash:has-text("Pizza")').count()) === 1
	);
	await inboxPage.click('.inbox-row--trash:has-text("Pizza")');
	await inboxPage.waitForSelector('.thread-log[data-thread="pizza"]:not([hidden])');
	check(
		'an archived conversation is readable, seeds and all',
		(await inboxPage
			.locator('.thread-log[data-thread="pizza"]')
			.textContent()).indexOf('order is ready') > -1
	);
	check(
		'a message landing in an archived thread recovers it',
		await inboxPage.evaluate(() => {
			const inTrash = !!window.story._threadArchived.pizza;
			window.story.deliver('pizza-old', {
				instant: true,
				record: false
			});
			const recovered = !window.story._threadArchived.pizza;
			window.story.archiveThread('pizza'); // put the demo back
			return inTrash && recovered;
		})
	);
	await inboxPage.click('#nav-link-inbox');
	await inboxPage.waitForSelector('#inbox:not([hidden])');
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
			.locator(
				'.thread-log[data-thread="mom"] .chat-passage:has-text("porch light")'
			)
			.count()) === 1
	);
	check(
		'no responses leak into a thread without the story cursor',
		(await inboxPage.locator('.user-response').count()) === 0
	);
	check(
		'the seeded tapback is repositioned once its log is visible',
		await inboxPage.evaluate(() => {
			const badge = document.querySelector(
				'.thread-log[data-thread="mom"] .chat-reaction'
			);
			return !!badge && parseFloat(badge.style.left) > 0;
		})
	);
	check(
		'a parked thread shows the disabled idle composer',
		await inboxPage.evaluate(() => {
			const idle = document.querySelector(
				'#user-response-panel .chat-composer--idle input'
			);
			return (
				!!idle &&
				idle.disabled &&
				idle.placeholder === 'Nothing to say right now' &&
				document.getElementById('user-response-hint')
					.textContent === ''
			);
		})
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
	check(
		'the hidden thread joins the inbox once it has spoken',
		(await inboxPage.locator('.inbox-row:has-text("Unknown")').count()) === 1
	);
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

	// [system ...] event chips: never pre-shown, and one that ends a
	// passage renders BELOW the message group, not hoisted above it
	check(
		'[system ...] renders a centered event chip',
		await page.evaluate(() =>
			window.Passage.render('[system Sam has left the conversation]')
				.indexOf('<div class="chat-system">Sam has left the conversation</div>') > -1
		)
	);
	await inboxPage.evaluate(() => window.story.show('unknown-2'));
	await inboxPage.waitForSelector(
		'.thread-log[data-thread="unknown"] .chat-system',
		{ state: 'attached', timeout: 15000 }
	);
	check(
		'a passage can archive its own thread (deferred via $)',
		await inboxPage.evaluate(
			() => !!window.story._threadArchived.unknown
		)
	);
	check(
		'a trailing [system ...] chip lands below its message group',
		await inboxPage.evaluate(() => {
			const log = document.querySelector(
				'.thread-log[data-thread="unknown"]'
			);
			const chip = log.querySelector('.chat-system');
			return (
				chip.textContent === 'Unknown Number has left the conversation' &&
				chip.previousElementSibling !== null &&
				chip.previousElementSibling.classList.contains(
					'chat-passage-wrapper'
				)
			);
		})
	);

	// [deliver] into a "group" thread: the banner and inbox preview
	// name the actual sender, and reply pills travel with the message
	await inboxPage.evaluate(() => {
		// clear any banner left over from the previous checks
		document.getElementById('meta-notification').hidden = true;

		window.story.config.minTypingDelay = 50;
		window.story.config.maxTypingDelay = 100;
		window.story.openThread('sam');
		window.story.deliver('mom-crossover');
	});
	await inboxPage.waitForSelector('#meta-notification:not([hidden])');
	check(
		'a cross-speaker delivery names its sender in the banner',
		(await inboxPage.textContent('#meta-notification-label')) === 'Mom' &&
			(await inboxPage.textContent('#meta-notification-body')).indexOf(
				'Sam: '
			) === 0
	);

	await inboxPage.evaluate(() => window.story.openThread('mom'));
	await inboxPage.waitForSelector(
		'.user-response:has-text("my lips are sealed")'
	);
	check('a delivered passage with pills moves the choices to its thread', true);

	await inboxPage.click('.user-response:has-text("my lips are sealed")');
	await inboxPage.waitForSelector(
		'.thread-log[data-thread="mom"] .chat-passage:has-text("stay away from that building")',
		{ timeout: 15000 }
	);
	check(
		'replying to a delivered message continues in its thread',
		await inboxPage.evaluate(() => {
			const log = document.querySelector(
				'.thread-log[data-thread="mom"]'
			);

			return log.textContent.indexOf('my lips are sealed') > -1;
		})
	);

	await inboxPage.evaluate(() => window.story.openInbox());
	check(
		'a cross-speaker inbox preview names the sender',
		await inboxPage.evaluate(() => {
			const rows = Array.from(
				document.querySelectorAll('.inbox-row')
			);
			const mom = rows.find(
				(row) =>
					row.querySelector('.inbox-name').textContent === 'Mom'
			);

			return (
				mom.querySelector('.inbox-preview').textContent.indexOf(
					'Sam: ok. stay away'
				) === 0
			);
		})
	);

	// media-only messages get placeholders in previews and banners
	check(
		'media-only messages get preview placeholders',
		await inboxPage.evaluate(
			() =>
				window.story.previewText('<p><img src="x.png"></p>') ===
					'📷 Photo' &&
				window.story.previewText(
					'<div class="chat-voice" data-src="v.mp3"></div>'
				) === '🎤 Voice message' &&
				window.story.previewText(
					'<div class="chat-location" data-lat="1" data-lon="2"></div>'
				) === '📍 Location' &&
				window.story.previewText('<p>a caption</p>') === 'a caption'
		)
	);

	// banners queue: same-thread updates collapse, other threads wait
	const bannerQueue = await inboxPage.evaluate(
		() =>
			new Promise((resolve) => {
				document.getElementById('meta-notification').hidden = true;
				window.story._bannerThread = null;
				window.story._bannerQueue = [];
				window.story.config.bannerSeconds = 0.5;

				window.story.showThreadBanner('mom', 'first message');
				window.story.showThreadBanner('mom', 'first, updated');
				window.story.showThreadBanner('pizza', 'second message');

				const first = {
					label: document.getElementById('meta-notification-label')
						.textContent,
					body: document.getElementById('meta-notification-body')
						.textContent,
					queued: window.story._bannerQueue.length
				};

				setTimeout(() => {
					resolve({
						first,
						secondLabel: document.getElementById(
							'meta-notification-label'
						).textContent,
						secondBody: document.getElementById(
							'meta-notification-body'
						).textContent
					});
				}, 800);
			})
	);

	check(
		'banners queue instead of overwriting (same thread collapses)',
		bannerQueue.first.label === 'Mom' &&
			bannerQueue.first.body === 'first, updated' &&
			bannerQueue.first.queued === 1 &&
			bannerQueue.secondLabel === 'Pizza Palace' &&
			bannerQueue.secondBody === 'second message'
	);

	// group chats: member subtitle, cluster avatar, sender previews
	await inboxPage.evaluate(() => window.story.openThread('family'));
	check(
		'a group thread lists its members under the title',
		(await inboxPage.textContent('#ptitle')) === 'The Fam' &&
			(await inboxPage.textContent('#psubtitle')) === 'Mom, Matt'
	);

	await inboxPage.evaluate(() => window.story.openInbox());
	check(
		'leaving a group chat restores the identity subtitle',
		(await inboxPage.textContent('#psubtitle')) ===
			'a Subtext inbox demo'
	);

	check(
		'group inbox row: cluster avatar and sender-prefixed preview',
		await inboxPage.evaluate(() => {
			const rows = Array.from(document.querySelectorAll('.inbox-row'));
			const fam = rows.find(
				(row) =>
					row.querySelector('.inbox-name').textContent === 'The Fam'
			);

			return (
				fam.querySelectorAll('.inbox-avatar-mini').length === 2 &&
				fam
					.querySelector('.inbox-preview')
					.textContent.indexOf('Matt: not me') === 0
			);
		})
	);

	check(
		'a seeded [tombstone] renders as a deleted message',
		await inboxPage.evaluate(() => {
			const log = document.querySelector(
				'.thread-log[data-thread="family"]'
			);
			const bubble = log.querySelector('.chat-passage--redacted');

			return (
				!!bubble &&
				bubble.textContent === 'This message was deleted' &&
				bubble
					.closest('.chat-passage-wrapper')
					.getAttribute('data-speaker') === 'matt'
			);
		})
	);

	check(
		'[tombstone] parses bare and with a custom label',
		await inboxPage.evaluate(() => {
			const bare = window.Passage.render('[tombstone]');
			const custom = window.Passage.render(
				'[tombstone You deleted this message]'
			);

			return (
				bare.indexOf('chat-tombstone') > -1 &&
				custom.indexOf('You deleted this message') > -1
			);
		})
	);

	check(
		'transcript export sections multi-thread stories by conversation',
		await inboxPage.evaluate(() => {
			const text = window.story.exportTranscript();

			return (
				text.indexOf('## Sam') > -1 &&
				text.indexOf('## Mom') > -1 &&
				text.indexOf('**Mom:**') > -1
			);
		})
	);

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
