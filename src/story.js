/**
 An object representing the entire story. After the document has completed
 loading, an instance of this class is available at `window.story`.
**/

'use strict';
var LZString = require('lz-string');
var Passage = require('./passage');
var template = require('./template');

var SPEAKER_TAG_PREFIX = 'speaker-';
var PHOTO_LINK_PREFIX = 'photo:';
var LOCATION_LINK_PREFIX = 'location:';
var REACT_LINK_PREFIX = 'react:';
var INPUT_LINK_PREFIX = 'input:';
var TIMEOUT_LINK_PREFIX = 'timeout:';

/* Feather Icons arrow-up (MIT) */
var SEND_SVG =
	'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" ' +
	'stroke="currentColor" stroke-width="2.5" stroke-linecap="round" ' +
	'stroke-linejoin="round" aria-hidden="true">' +
	'<line x1="12" y1="19" x2="12" y2="5"></line>' +
	'<polyline points="5 12 12 5 19 12"></polyline></svg>';

/* Feather Icons camera (MIT) */
var CAMERA_SVG =
	'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" ' +
	'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
	'stroke-linejoin="round" aria-hidden="true">' +
	'<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 ' +
	'2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>' +
	'<circle cx="12" cy="13" r="4"></circle></svg>';

/* Feather Icons map-pin (MIT) */
var PIN_SVG =
	'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" ' +
	'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
	'stroke-linejoin="round" aria-hidden="true">' +
	'<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>' +
	'<circle cx="12" cy="10" r="3"></circle></svg>';

/* Feather Icons moon & sun (MIT) */
var MOON_SVG =
	'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" ' +
	'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
	'stroke-linejoin="round" aria-hidden="true">' +
	'<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';

var SUN_SVG =
	'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" ' +
	'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
	'stroke-linejoin="round" aria-hidden="true">' +
	'<circle cx="12" cy="12" r="5"></circle>' +
	'<line x1="12" y1="1" x2="12" y2="3"></line>' +
	'<line x1="12" y1="21" x2="12" y2="23"></line>' +
	'<line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>' +
	'<line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>' +
	'<line x1="1" y1="12" x2="3" y2="12"></line>' +
	'<line x1="21" y1="12" x2="23" y2="12"></line>' +
	'<line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>' +
	'<line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';

var PLAY_SVG =
	'<svg viewBox="0 0 24 24" width="16" height="16" ' +
	'fill="currentColor" aria-hidden="true">' +
	'<path d="M7 4.5v15l13-7.5z"></path></svg>';

var PAUSE_SVG =
	'<svg viewBox="0 0 24 24" width="16" height="16" ' +
	'fill="currentColor" aria-hidden="true">' +
	'<rect x="6" y="4.5" width="4" height="15" rx="1"></rect>' +
	'<rect x="14" y="4.5" width="4" height="15" rx="1"></rect></svg>';

function byId(id) {
	return document.getElementById(id);
}

function deepClone(value) {
	try {
		return JSON.parse(JSON.stringify(value));
	}
	catch (e) {
		return value;
	}
}

/*
 Chatbook keeps its original (Snowman 1 / Trialogue) event names and
 also dispatches the Snowman 2 sm.* equivalents, so scripts written
 against either generation of documentation work.
*/

var SM_EVENT_ALIASES = {
	'startstory': 'sm.story.started',
	'hidepassage': 'sm.passage.hidden',
	'showpassage': 'sm.passage.showing',
	'showpassage:after': 'sm.passage.shown',
	'save': 'sm.story.saved',
	'restorefailed': 'sm.restore.failed',
	'restore:after': 'sm.restore.success'
};

function dispatch(name, detail) {
	window.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));

	if (SM_EVENT_ALIASES[name]) {
		window.dispatchEvent(
			new CustomEvent(SM_EVENT_ALIASES[name], { detail: detail || {} })
		);
	}
}

/**
 Picks black or white text for a hex background color (YIQ brightness).
 Returns null for non-hex values, leaving the theme default in place.
**/

function contrastColor(color) {
	var match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());

	if (!match) {
		return null;
	}

	var hex = match[1];

	if (hex.length === 3) {
		hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
	}

	var r = parseInt(hex.substr(0, 2), 16);
	var g = parseInt(hex.substr(2, 2), 16);
	var b = parseInt(hex.substr(4, 2), 16);
	var yiq = (r * 299 + g * 587 + b * 114) / 1000;

	return yiq >= 145 ? '#111114' : '#ffffff';
}

var Story = function() {
	var el = document.querySelector('tw-storydata');

	if (!el) {
		throw new Error(
			'Chatbook could not find a <tw-storydata> element. ' +
			'(Twine 1 documents are no longer supported.)'
		);
	}

	this.el = el;

	/** The name of the story. **/
	this.name = el.getAttribute('name') || '';

	/** The story's IFID, used to key autosaves. **/
	this.ifid = el.getAttribute('ifid') || '';

	/** The ID of the first passage to be displayed. **/
	this.startPassage = parseInt(el.getAttribute('startnode'), 10);

	/** The program that created this story, and its version. **/
	this.creator = el.getAttribute('creator');
	this.creatorVersion = el.getAttribute('creator-version');

	/**
	 An object that stores data that persists across a single user session.
	**/
	this.state = {};

	/**
	 An ordered record of everything rendered in the chat: passages the
	 speakers sent and responses the user chose. This is what gets saved
	 and what restore() replays.
	 Entries: { t: 'p', id: <passage id> } or { t: 'u', text: <string> }
	**/
	this.timeline = [];

	/**
	 DOM nodes belonging to the passage currently "live" (its inline
	 links still clickable). All messages share one role="log" container
	 so screen readers announce each exactly once; these refs replace
	 the old separate #passage element.
	**/
	this._currentNodes = [];

	/**
	 An array of passage IDs viewed this session (kept for compatibility
	 with Trialogue 1.x scripts that read story.history).
	**/
	this.history = [];

	/**
	 Undo checkpoints, one pushed per user choice.
	**/
	this.checkpoints = [];

	/**
	 If true, JavaScript errors are ignored instead of shown in the chat.
	**/
	this.ignoreErrors = false;

	/**
	 Message shown when an error occurs; %s is replaced by the error text.
	**/
	this.errorMessage = '⚠ %s';

	/**
	 Tunable behavior. Adjust from your story's JavaScript, e.g.:
	   story.config.maxTypingDelay = 2500;
	   story.config.splitBubbles = false;
	   story.config.autosave = true;
	**/
	this.config = {
		/* show the typing indicator before speaker passages */
		typing: true,
		/* simulated typing speed */
		msPerChar: 20,
		minTypingDelay: 500,
		maxTypingDelay: 4000,
		/* delay before meta (speakerless) passages appear */
		metaDelay: 800,
		/* render each paragraph of a passage as its own bubble */
		splitBubbles: true,
		/* stagger between bubbles of the same passage, in ms */
		bubbleStagger: 140,
		/* persist progress to localStorage after every message */
		autosave: false,
		/* warm the browser cache for StoryImages entries at startup */
		preloadImages: true,
		/* accessible label on the camera button */
		photoButtonLabel: 'Send a photo',
		/* heading of the photo picker */
		photoPickerTitle: 'Send a photo',
		/* show Delivered/Read status under the player's last message */
		readReceipts: true,
		/* a speaker's reply automatically marks the last message read */
		autoRead: true,
		/* receipt wording (localize or restyle here) */
		receiptLabels: {
			delivered: 'Delivered',
			read: 'Read',
			failed: 'Not Delivered'
		},
		/* subtle send/receive sounds (opt-in; requires a user gesture) */
		sounds: false,
		/* show "(2) Story Name" in the tab title while it is hidden */
		titleNotifications: true,
		/* where speakerless (narrator) passages appear:
		   'chat'         - centered system text inside the conversation
		   'overlay'      - a narration veil over the blurred chat
		   'notification' - a phone-style notification banner
		   Override per passage with the tags meta-chat / meta-overlay /
		   meta-notification. */
		metaStyle: 'chat',
		/* app-name label on notification-style narration
		   (defaults to the story name) */
		metaNotificationLabel: '',
		/* show the light/dark toggle in the header */
		themeToggle: true,
		/* language of the story's interface, applied to <html lang>
		   (leave empty to keep the default "en") */
		lang: '',
		/* screen-reader announcement while a speaker is typing;
		   %s is replaced with the speaker's display name */
		typingLabel: '%s is typing',
		/* honor [[timeout:...]] links; set false to give every player
		   unlimited time (an accessibility affordance) */
		timers: true,
		/* screen-reader announcement when a response timer starts;
		   %s is replaced with the number of seconds */
		timerLabel: 'You have %s seconds to reply',
		/* accessible label on the free-text send button */
		inputSendLabel: 'Send',
		/* default label on a location-share response button */
		locationButtonLabel: 'Share my location',
		/* label under the map card of a shared player location */
		locationBubbleLabel: 'My location'
	};

	/**
	 Speaker profiles, parsed from the StorySpeakers passage. Entries are
	 { name, avatar, color } keyed by speaker id; also scriptable via
	 `story.speakers`.
	**/
	this.speakers = {};

	/** Messages received while the tab was hidden. **/
	this.unseen = 0;

	this._audioCtx = null;
	this._playingAudio = null;

	/** Applied reactions, so undo can revert them. **/
	this._reactionLog = [];

	/**
	 The story's image gallery, parsed from the StoryImages passage
	 (one `name: url` per line). Add or change entries from your story
	 JavaScript via `story.gallery`.
	**/
	this.gallery = {};

	/** Pending setTimeout ids for the current delayed passage. **/
	this.timers = [];

	this._speakerHues = {};

	/** An array of all passages, indexed by ID. **/
	this.passages = [];

	var p = this.passages;

	el.querySelectorAll('tw-passagedata').forEach(function(pEl) {
		var id = parseInt(pEl.getAttribute('pid'), 10);
		var tags = (pEl.getAttribute('tags') || '').trim();

		p[id] = new Passage(
			id,
			pEl.getAttribute('name'),
			tags !== '' ? tags.split(/\s+/) : [],
			pEl.innerHTML
		);
	});

	/** User-provided scripts and styles, run/added at start. **/

	this.userScripts = Array.prototype.map.call(
		el.querySelectorAll('*[type="text/twine-javascript"]'),
		function(n) { return n.textContent; }
	);

	this.userStyles = Array.prototype.map.call(
		el.querySelectorAll('*[type="text/twine-css"]'),
		function(n) { return n.textContent; }
	);
};

/**
 Legacy alias for config.maxTypingDelay (Trialogue 1.x exposed
 story.maxPassageDelay).
**/

Object.defineProperty(Story.prototype, 'maxPassageDelay', {
	get: function() {
		return this.config.maxTypingDelay;
	},
	set: function(value) {
		this.config.maxTypingDelay = value;
	}
});

Object.assign(Story.prototype, {
	/**
	 Begins playing this story.
	**/

	start: function() {
		this.dom = {
			panel: byId('chat-panel'),
			history: byId('phistory'),
			typingText: byId('typing-announcement'),
			typing: byId('animation-container'),
			responses: byId('user-response-panel'),
			hint: byId('user-response-hint'),
			title: byId('ptitle'),
			subtitle: byId('psubtitle'),
			author: byId('pauthor'),
			undo: byId('nav-link-undo'),
			restart: byId('nav-link-restart'),
			back: byId('nav-link-back'),
			menu: byId('nav-link-menu'),
			dialog: byId('exit-dialog'),
			picker: byId('photo-picker'),
			pickerGrid: byId('photo-picker-grid'),
			pickerTitle: byId('photo-picker-title'),
			metaOverlay: byId('meta-overlay'),
			metaOverlayContent: byId('meta-overlay-content'),
			metaNotification: byId('meta-notification'),
			metaNotificationLabel: byId('meta-notification-label'),
			metaNotificationBody: byId('meta-notification-body'),
			menuDialog: byId('menu-dialog'),
			theme: byId('nav-link-theme'),
			footer: document.querySelector('.user-response-panel'),
			timerText: byId('timer-announcement')
		};

		this._responseTimer = null;

		// tapping a notification banner dismisses it (but interactive
		// content inside it, like a voice memo, stays usable); the ×
		// button does the same for keyboard and screen-reader users

		this.dom.metaNotification.addEventListener('click', function(event) {
			if (
				event.target.closest('[data-notification-close]') ||
				!event.target.closest('button, a')
			) {
				story.dom.metaNotification.hidden = true;
			}
		});

		this.gallery = this.parseGallery();
		this.speakers = this.parseSpeakers();

		// header: title, subtitle, author

		if (this.dom.title) {
			this.dom.title.textContent = this.name;
		}

		var subtitle = this.passage('StorySubtitle');

		if (subtitle && this.dom.subtitle) {
			this.dom.subtitle.innerHTML = subtitle.source;
		}

		var author = this.passage('StoryAuthor');

		if (author && author.source.trim() && this.dom.author) {
			this.dom.author.textContent = ' by ' + author.source.trim();
		}

		// undo & restart buttons

		this.dom.undo.addEventListener('click', this.undo.bind(this));

		var story = this;
		var openDialog = function(event) {
			event.preventDefault();

			if (typeof story.dom.dialog.showModal === 'function') {
				story.dom.dialog.showModal();
			}
			else if (window.confirm('Restart the story?')) {
				story.restart();
			}
		};

		this.dom.restart.addEventListener('click', openDialog);
		this.dom.back.addEventListener('click', openDialog);

		this.dom.dialog.addEventListener('click', function(event) {
			var action = event.target.closest('[data-dialog-action]');

			if (action) {
				if (action.getAttribute('data-dialog-action') === 'restart') {
					story.restart();
				}

				story.dom.dialog.close();
				return;
			}

			// Bootstrap-era compatibility: injected modal footers use
			// data-dismiss="modal" for their close buttons.

			if (event.target.closest('[data-dismiss="modal"]')) {
				story.dom.dialog.close();
			}
		});

		// menu button opens the menu modal

		this.dom.menu.addEventListener('click', function() {
			if (typeof story.dom.menuDialog.showModal === 'function') {
				story.dom.menuDialog.showModal();
			}
		});

		this.dom.menuDialog.addEventListener('click', function(event) {
			if (
				event.target === story.dom.menuDialog ||
				event.target.closest('[data-menu-close]')
			) {
				story.dom.menuDialog.close();
			}
		});


		// photo picker: close button and backdrop click both dismiss

		this.dom.picker.addEventListener('click', function(event) {
			if (
				event.target === story.dom.picker ||
				event.target.closest('[data-picker-close]')
			) {
				story.dom.picker.close();
			}
		});

		// passage link handler; links inside the chat history are inert

		document.body.addEventListener('click', function(event) {
			var link = event.target.closest('[data-passage]');

			if (!link || link.closest('.is-history')) {
				return;
			}

			event.preventDefault();
			story.choose(
				link.getAttribute('data-passage'),
				link.textContent.trim()
			);
		});

		// audio can only start after a user gesture; unlock it on the
		// first interaction so receive sounds work from then on

		var resumeAudio = function() {
			if (!story.config.sounds) {
				return;
			}

			var Ctx = window.AudioContext || window.webkitAudioContext;

			if (!story._audioCtx && Ctx) {
				story._audioCtx = new Ctx();
			}

			if (story._audioCtx && story._audioCtx.state === 'suspended') {
				story._audioCtx.resume();
			}
		};

		document.addEventListener('pointerdown', resumeAudio);
		document.addEventListener('keydown', resumeAudio);

		// clear the title-bar unread badge when the tab becomes visible

		document.addEventListener('visibilitychange', function() {
			if (!document.hidden) {
				story.unseen = 0;
				document.title = story.name;
			}
		});

		// hash change handler for save/restore

		window.addEventListener('hashchange', function() {
			var hash = window.location.hash.replace('#', '');

			if (hash) {
				story.restore(hash);
			}
		});

		// error handler

		window.onerror = function(message, url, line) {
			if (!story.errorMessage || typeof story.errorMessage != 'string') {
				story.errorMessage = Story.prototype.errorMessage;
			}

			if (!story.ignoreErrors) {
				if (url) {
					message += ' (' + url;

					if (line) {
						message += ': ' + line;
					}

					message += ')';
				}

				story.showError(story.errorMessage.replace('%s', message));
			}
		};

		// activate user styles

		this.userStyles.forEach(function(style) {
			var styleEl = document.createElement('style');

			styleEl.textContent = style;
			document.body.appendChild(styleEl);
		});

		// run user scripts

		this.userScripts.forEach(function(script) {
			try {
				/* eslint-disable no-eval */
				eval(script);
				/* eslint-enable no-eval */
			}
			catch (error) {
				if (!story.ignoreErrors) {
					story.showError(
						story.errorMessage.replace('%s', error.message)
					);
				}
			}
		});

		// apply config that user scripts may have changed

		if (this.config.lang) {
			document.documentElement.lang = this.config.lang;
		}

		this.initTheme();

		if (this.dom.pickerTitle) {
			this.dom.pickerTitle.textContent = this.config.photoPickerTitle;
		}

		if (this.config.preloadImages) {
			Object.keys(this.gallery).forEach(function(name) {
				new Image().src = story.gallery[name];
			});
		}

		/**
		 Triggered when the story is finished loading, right before the
		 first passage is displayed.
		**/

		dispatch('startstory', { story: this });

		// restore from the URL hash, then from autosave, else start fresh

		var hash = window.location.hash.replace('#', '');

		if (hash !== '' && this.restore(hash)) {
			return;
		}

		if (this.config.autosave && this.ifid) {
			var saved = null;

			try {
				saved = window.localStorage.getItem(this.saveKey());
			}
			catch (e) { /* storage unavailable */ }

			if (saved && this.restore(saved)) {
				return;
			}
		}

		this.show(this.startPassage);
	},

	/**
	 Returns the Passage object corresponding to either an ID or name.
	 If none exists, returns null.
	**/

	passage: function(idOrName) {
		if (typeof idOrName === 'number') {
			return this.passages[idOrName] || null;
		}

		if (typeof idOrName === 'string') {
			return (
				this.passages.find(function(p) {
					return p && p.name === idOrName;
				}) || null
			);
		}

		return null;
	},

	/**
	 Handles the user choosing a response: checkpoints the current state,
	 renders the choice as an outgoing message and shows the target
	 passage after a typing delay.
	**/

	choose: function(targetName, displayText) {
		if (!this.passage(targetName)) {
			this.showError(
				this.errorMessage.replace(
					'%s',
					'There is no passage named "' + targetName + '"'
				)
			);
			return;
		}

		this.movePassageToHistory();
		this.pushCheckpoint();
		this.hideMeta();
		this.clearUserResponses();
		this.focusResponses();

		this.state.timedOut = false;
		this.showUserBubble(displayText);
		this.playSound('send');
		this.showDelayed(targetName, { noMove: true });
	},

	/**
	 Displays a passage, appending it to the chat. If there is no passage
	 by the given name or ID, an error message is shown in the chat.

	 Options:
	   noMove  - don't move the current passage into history first
	   record  - if false, don't record this passage in the timeline
	   instant - skip entrance animations (used when restoring)
	**/

	show: function(idOrName, opts) {
		opts = opts || {};

		var passage = this.passage(idOrName);

		if (!passage) {
			this.showError(
				this.errorMessage.replace(
					'%s',
					'There is no passage with the ID or name "' + idOrName + '"'
				)
			);
			return;
		}

		/**
		 Triggered when a passage is about to be hidden/shown.
		**/

		dispatch('hidepassage', { passage: window.passage });
		dispatch('showpassage', { passage: passage });

		if (!opts.noMove) {
			this.movePassageToHistory();
		}

		window.passage = passage;
		passage.links = [];

		var html;

		try {
			html = passage.render();
		}
		catch (error) {
			this.showError(this.errorMessage.replace('%s', error.message));
			return;
		}

		var story = this;
		var speaker = this.getPassageSpeaker(passage);
		var metaMode = speaker ? 'chat' : this.getMetaMode(passage);

		// any new content replaces active overlay/notification narration

		this.hideMeta();

		// a passage tagged `clear` wipes the visible thread first
		// (flashbacks, scene changes)

		if (passage.tags.indexOf('clear') > -1) {
			this.clearThread();
		}

		// apply [react …] directives to the player's last message

		html = html.replace(
			/<div class="chat-react" data-emoji="([^"]*)"><\/div>/g,
			function(match, emoji) {
				story.react(template.unescapeHtml(emoji), 'out');
				return '';
			}
		);

		if (metaMode !== 'chat') {
			this.showMeta(html, metaMode);
			this._currentNodes = [];
		}
		else {
			var nodes = this.buildPassageElement(passage, speaker, html);

			nodes.forEach(function(node) {
				if (opts.instant) {
					node.classList.add('no-anim');
				}

				if (node.classList.contains('chat-passage-wrapper')) {
					story.applyGrouping(node);
				}

				story.dom.history.appendChild(node);

				// images finish loading after the initial scroll;
				// re-scroll so they don't cut off the newest messages

				node.querySelectorAll('img').forEach(function(img) {
					img.addEventListener('load', function() {
						story.scrollChatIntoView();
					});
				});
			});

			this._currentNodes = nodes;
		}

		// read receipts: explicit tags win, otherwise a speaker's reply
		// marks the player's last message as read

		if (this.config.readReceipts) {
			var lastOutgoing = this.lastOutgoingWrapper();

			if (passage.tags.indexOf('failed') > -1) {
				this.markFailed();
			}
			else if (passage.tags.indexOf('unread') > -1) {
				this.markUnread();
			}
			else if (passage.tags.indexOf('read') > -1) {
				this.markRead();
			}
			else if (
				this.config.autoRead &&
				speaker &&
				speaker !== 'you' &&
				(!lastOutgoing ||
					lastOutgoing.getAttribute('data-receipt') !== 'failed')
			) {
				this.markRead();
			}
		}

		// incoming-message effects (skipped while replaying a save)

		if (!opts.instant && speaker && speaker !== 'you') {
			this.playSound('receive');
			this.notifyTitle();
		}

		if (opts.record !== false) {
			this.timeline.push({ t: 'p', id: passage.id });
			this.history.push(passage.id);
		}

		this.clearUserResponses();
		this.showUserResponses();
		this.pcolophon();
		this.persist();
		this.scrollChatIntoView();

		/**
		 Triggered after a passage has been shown onscreen.
		**/

		dispatch('showpassage:after', { passage: passage });
	},

	/**
	 Builds the DOM elements for a rendered passage: timestamp chips,
	 then a centered meta passage (no speaker tag) or a chat message
	 group with avatar, speaker name and one bubble per paragraph.
	 Returns an array of elements (empty if nothing rendered visible).
	**/

	buildPassageElement: function(passage, speaker, html) {
		var story = this;
		var nodes = [];
		var content = document.createElement('div');

		content.innerHTML = html;

		var blocks = Array.prototype.filter.call(content.childNodes, function(node) {
			return !(
				node.nodeType === Node.TEXT_NODE && node.textContent.trim() === ''
			);
		});

		// a passage tagged `timestamp` renders entirely as timestamp chips

		if (passage.tags.indexOf('timestamp') > -1) {
			blocks.forEach(function(block) {
				nodes.push(story.buildTimestamp(block.textContent.trim()));
			});

			return nodes;
		}

		// hoist inline [timestamp ...] chips above the message group

		blocks = blocks.filter(function(block) {
			if (
				block.nodeType === Node.ELEMENT_NODE &&
				block.classList.contains('chat-timestamp')
			) {
				nodes.push(block);
				return false;
			}

			return true;
		});

		if (blocks.length === 0) {
			return nodes;
		}

		// meta passage (no speaker)

		if (!speaker) {
			var meta = document.createElement('div');

			meta.className = 'meta-passage';
			blocks.forEach(function(node) {
				meta.appendChild(node);
			});
			this.buildRichContent(meta);

			nodes.push(meta);
			return nodes;
		}

		// chat message group

		var profile = this.getSpeakerProfile(speaker);
		var wrapper = document.createElement('div');

		wrapper.className = 'chat-passage-wrapper';
		wrapper.setAttribute('data-speaker', speaker);

		if (profile.color) {
			wrapper.style.setProperty('--speaker-color', profile.color);

			var textColor = contrastColor(profile.color);

			if (textColor) {
				wrapper.style.setProperty('--speaker-text-color', textColor);
			}
		}

		passage.tags.forEach(function(tag) {
			if (/^[A-Za-z_][\w-]*$/.test(tag)) {
				wrapper.classList.add(tag);
			}
		});

		if (speaker !== 'you') {
			var avatar = document.createElement('div');

			avatar.className = 'chat-avatar';
			avatar.setAttribute('aria-hidden', 'true');
			this.decorateAvatar(avatar, speaker);
			wrapper.appendChild(avatar);
		}

		var bubbles = document.createElement('div');

		bubbles.className = 'chat-bubbles';
		wrapper.appendChild(bubbles);

		if (speaker !== 'you') {
			var name = document.createElement('div');

			name.className = 'chat-speaker-name';
			name.textContent = this.getSpeakerDisplayName(speaker);
			bubbles.appendChild(name);
		}

		var bubbleBlocks = this.config.splitBubbles ? blocks : [null];
		var index = 0;

		bubbleBlocks.forEach(function(block) {
			var bubble = document.createElement('div');

			bubble.className = 'chat-passage';
			bubble.setAttribute('data-speaker', speaker);

			if (block === null) {
				while (content.firstChild) {
					bubble.appendChild(content.firstChild);
				}
			}
			else {
				if (block.nodeType === Node.TEXT_NODE) {
					var p = document.createElement('p');

					p.textContent = block.textContent;
					bubble.appendChild(p);
				}
				else {
					bubble.appendChild(block);
				}
			}

			// media-only bubbles (a lone image/video/iframe) render
			// borderless, like a photo message

			if (story.isMediaOnly(bubble)) {
				bubble.classList.add('chat-passage--media');
			}

			story.buildRichContent(bubble);

			if (bubble.querySelector('.chat-voice')) {
				bubble.classList.add('chat-passage--voice');
			}

			if (bubble.querySelector('.chat-location')) {
				bubble.classList.add('chat-passage--location');
			}

			bubble.style.animationDelay =
				(index * story.config.bubbleStagger) + 'ms';
			index += 1;

			bubbles.appendChild(bubble);
		});

		nodes.push(wrapper);
		return nodes;
	},

	/**
	 Upgrades rich-content placeholders inside rendered passage HTML:
	 .chat-voice divs become voice-memo players and .chat-location divs
	 become map cards.
	**/

	buildRichContent: function(root) {
		var story = this;

		root.querySelectorAll('.chat-voice').forEach(function(el) {
			story.buildVoicePlayer(el);
		});
		root.querySelectorAll('.chat-location').forEach(function(el) {
			story.buildLocationCard(el);
		});
	},

	/**
	 Builds a WhatsApp-style voice-memo player: play/pause button,
	 waveform bars that fill as the audio plays, and a duration label.
	**/

	buildVoicePlayer: function(el) {
		var story = this;
		var src = el.getAttribute('data-src');

		if (!src || el.getAttribute('data-built')) {
			return;
		}

		el.setAttribute('data-built', '1');
		el.setAttribute('role', 'group');
		el.setAttribute('aria-label', 'Voice message');

		var audio = document.createElement('audio');

		audio.preload = 'metadata';
		audio.src = src;

		var button = document.createElement('button');

		button.type = 'button';
		button.className = 'chat-voice-play';
		button.setAttribute('aria-label', 'Play voice message');
		button.innerHTML = PLAY_SVG;

		var bars = document.createElement('div');
		var BAR_COUNT = 24;
		var barEls = [];

		bars.className = 'chat-voice-bars';
		bars.setAttribute('aria-hidden', 'true');

		// a decorative waveform, deterministic per source

		var seed = 0;

		for (var i = 0; i < src.length; i++) {
			seed = (seed * 31 + src.charCodeAt(i)) % 9973;
		}

		for (var b = 0; b < BAR_COUNT; b++) {
			var bar = document.createElement('span');

			seed = (seed * 137 + 71) % 9973;
			bar.style.setProperty('--h', (30 + (seed % 65)) + '%');
			bars.appendChild(bar);
			barEls.push(bar);
		}

		var time = document.createElement('span');

		time.className = 'chat-voice-time';
		time.textContent = '0:00';

		var format = function(seconds) {
			var m = Math.floor(seconds / 60);
			var s = Math.round(seconds % 60);

			return m + ':' + (s < 10 ? '0' : '') + s;
		};

		audio.addEventListener('loadedmetadata', function() {
			if (isFinite(audio.duration)) {
				time.textContent = format(audio.duration);
			}
		});

		button.addEventListener('click', function() {
			if (audio.paused) {
				if (story._playingAudio && story._playingAudio !== audio) {
					story._playingAudio.pause();
				}

				story._playingAudio = audio;
				audio.play().catch(function() { /* autoplay policy */ });
			}
			else {
				audio.pause();
			}
		});

		audio.addEventListener('play', function() {
			el.classList.add('playing');
			button.innerHTML = PAUSE_SVG;
			button.setAttribute('aria-label', 'Pause voice message');
		});

		audio.addEventListener('pause', function() {
			el.classList.remove('playing');
			button.innerHTML = PLAY_SVG;
			button.setAttribute('aria-label', 'Play voice message');
		});

		audio.addEventListener('timeupdate', function() {
			if (!isFinite(audio.duration) || audio.duration === 0) {
				return;
			}

			time.textContent = format(audio.currentTime);

			var played = Math.floor(
				(audio.currentTime / audio.duration) * BAR_COUNT
			);

			barEls.forEach(function(bar, index) {
				bar.classList.toggle('played', index < played);
			});
		});

		audio.addEventListener('ended', function() {
			audio.currentTime = 0;
			time.textContent = format(audio.duration);
			barEls.forEach(function(bar) {
				bar.classList.remove('played');
			});
		});

		el.textContent = '';
		el.appendChild(button);
		el.appendChild(bars);
		el.appendChild(time);
		el.appendChild(audio);
	},

	/**
	 Builds a location map card that links out to OpenStreetMap.
	**/

	buildLocationCard: function(el) {
		var lat = parseFloat(el.getAttribute('data-lat'));
		var lon = parseFloat(el.getAttribute('data-lon'));

		if (isNaN(lat) || isNaN(lon) || el.getAttribute('data-built')) {
			return;
		}

		el.setAttribute('data-built', '1');

		var label = el.getAttribute('data-label') || 'Location';
		var card = document.createElement('a');

		card.className = 'chat-location-card';
		card.href =
			'https://www.openstreetmap.org/?mlat=' + lat + '&mlon=' + lon +
			'#map=16/' + lat + '/' + lon;
		card.target = '_blank';
		card.rel = 'noopener';

		var map = document.createElement('div');

		map.className = 'chat-location-map';
		map.innerHTML = PIN_SVG;

		var info = document.createElement('div');

		info.className = 'chat-location-info';

		var name = document.createElement('strong');

		name.textContent = label;

		var coords = document.createElement('span');

		coords.textContent = lat.toFixed(4) + ', ' + lon.toFixed(4);

		var srNote = document.createElement('span');

		srNote.className = 'visually-hidden';
		srNote.textContent = ' (opens map in a new tab)';
		info.appendChild(name);
		info.appendChild(coords);
		info.appendChild(srNote);
		card.appendChild(map);
		card.appendChild(info);
		el.textContent = '';
		el.appendChild(card);
	},

	buildTimestamp: function(text) {
		var chip = document.createElement('div');

		chip.className = 'chat-timestamp';
		chip.textContent = text;

		return chip;
	},

	/**
	 Fills an avatar element for a speaker: profile image if one is set,
	 otherwise an initial on a stable auto color.
	**/

	decorateAvatar: function(avatar, speaker) {
		var profile = this.getSpeakerProfile(speaker);

		avatar.setAttribute('data-speaker', speaker);
		avatar.style.setProperty('--avatar-hue', this.speakerHue(speaker));

		if (profile.avatar) {
			avatar.classList.add('chat-avatar--img');
			avatar.style.backgroundImage = 'url("' + profile.avatar + '")';
			avatar.textContent = '';
		}
		else {
			avatar.classList.remove('chat-avatar--img');
			avatar.style.backgroundImage = '';

			if (profile.color) {
				avatar.style.backgroundColor = profile.color;
			}
			else {
				avatar.style.backgroundColor = '';
			}

			avatar.textContent = this.getSpeakerDisplayName(speaker)
				.charAt(0)
				.toUpperCase();
		}
	},

	isMediaOnly: function(bubble) {
		if (bubble.textContent.trim() !== '') {
			return false;
		}

		var media = bubble.querySelectorAll('img, video, iframe, svg');

		return media.length > 0;
	},

	/**
	 Derives a stable hue (0-359) from a speaker name, used to tint that
	 speaker's avatar. Override per speaker with CSS if you prefer:
	   .chat-avatar[data-speaker="alice"] { background: rebeccapurple; }
	**/

	speakerHue: function(speaker) {
		if (!(speaker in this._speakerHues)) {
			var hash = 0;

			for (var i = 0; i < speaker.length; i++) {
				hash = (hash * 31 + speaker.charCodeAt(i)) % 360;
			}

			this._speakerHues[speaker] = hash;
		}

		return this._speakerHues[speaker];
	},

	/**
	 Marks a new message group as a continuation when the previous group
	 has the same speaker, so CSS can tighten spacing, hide the repeated
	 name/avatar and adjust bubble corners.
	**/

	applyGrouping: function(wrapper) {
		var previous = this.dom.history.lastElementChild;

		if (
			previous &&
			previous.classList.contains('chat-passage-wrapper') &&
			previous.getAttribute('data-speaker') ===
				wrapper.getAttribute('data-speaker')
		) {
			wrapper.classList.add('chat-follow');
			previous.classList.add('has-follow');

			var name = wrapper.querySelector('.chat-speaker-name');

			if (name) {
				name.remove();
			}
		}
	},

	/**
	 Moves the current passage's messages into the history container.
	**/

	movePassageToHistory: function() {
		// nodes stay where they are (one shared role="log" container,
		// so screen readers never see them re-inserted); they are only
		// marked historical, which makes their inline links inert

		this._currentNodes.forEach(function(node) {
			node.classList.add('is-history');
		});
		this._currentNodes = [];
	},

	/**
	 Renders passage links as response buttons in the response panel.
	 Links whose display text starts with "photo:" are collected into a
	 single camera button that opens the photo picker.
	**/

	showUserResponses: function() {
		var story = this;

		if (!window.passage) {
			return;
		}

		var links = window.passage.links;
		var photoOffers = this.getPhotoOffers(links);
		var locationOffers = this.getLocationOffers(links);
		var reactionOffers = [];
		var inputOffer = null;
		var timeoutOffer = null;

		links.forEach(function(link) {
			var display = link.display.trim();

			if (display.indexOf(REACT_LINK_PREFIX) === 0) {
				reactionOffers.push({
					emoji: display.substring(REACT_LINK_PREFIX.length).trim(),
					target: link.target
				});
			}
			else if (
				!inputOffer &&
				(display === 'input' || display.indexOf(INPUT_LINK_PREFIX) === 0)
			) {
				inputOffer = {
					placeholder:
						display === 'input'
							? ''
							: display.substring(INPUT_LINK_PREFIX.length).trim(),
					target: link.target
				};
			}
			else if (!timeoutOffer && display.indexOf(TIMEOUT_LINK_PREFIX) === 0) {
				var match = display
					.substring(TIMEOUT_LINK_PREFIX.length)
					.match(/^\s*([\d.]+)\s*([\s\S]*)$/);

				if (match && parseFloat(match[1]) > 0) {
					timeoutOffer = {
						seconds: parseFloat(match[1]),
						text: match[2].trim(),
						target: link.target
					};
				}
			}
		});

		var textLinks = links.filter(function(link) {
			var display = link.display.trim();

			return (
				display.indexOf(PHOTO_LINK_PREFIX) !== 0 &&
				display !== 'location' &&
				display.indexOf(LOCATION_LINK_PREFIX) !== 0 &&
				display.indexOf(REACT_LINK_PREFIX) !== 0 &&
				display !== 'input' &&
				display.indexOf(INPUT_LINK_PREFIX) !== 0 &&
				display.indexOf(TIMEOUT_LINK_PREFIX) !== 0
			);
		});

		textLinks.forEach(function(link, index) {
			var button = document.createElement('button');

			button.type = 'button';
			button.className = 'user-response';
			button.setAttribute('data-passage', link.target);
			button.innerHTML = link.display;
			button.style.animationDelay = (index * 60) + 'ms';
			story.dom.responses.appendChild(button);
		});

		if (photoOffers.length > 0) {
			var photoButton = document.createElement('button');

			photoButton.type = 'button';
			photoButton.className = 'user-response user-response--photo';
			photoButton.setAttribute('aria-label', this.config.photoButtonLabel);
			photoButton.setAttribute('title', this.config.photoButtonLabel);
			photoButton.innerHTML = CAMERA_SVG;
			photoButton.style.animationDelay = (textLinks.length * 60) + 'ms';
			photoButton.addEventListener('click', function() {
				story.openPhotoPicker(photoOffers);
			});
			this.dom.responses.appendChild(photoButton);
		}

		locationOffers.forEach(function(offer, index) {
			var button = document.createElement('button');

			button.type = 'button';
			button.className = 'user-response user-response--location';
			button.innerHTML =
				PIN_SVG + '<span></span>';
			button.querySelector('span').textContent =
				offer.label || story.config.locationButtonLabel;
			button.style.animationDelay =
				((textLinks.length + (photoOffers.length ? 1 : 0) + index) * 60) +
				'ms';
			button.addEventListener('click', function() {
				story.sendLocation(offer.target, offer.label);
			});
			story.dom.responses.appendChild(button);
		});

		reactionOffers.forEach(function(offer, index) {
			var button = document.createElement('button');

			button.type = 'button';
			button.className = 'user-response user-response--react';
			button.setAttribute(
				'aria-label',
				'React with ' + offer.emoji
			);
			button.textContent = offer.emoji;
			button.style.animationDelay =
				((textLinks.length + locationOffers.length +
					(photoOffers.length ? 1 : 0) + index) * 60) + 'ms';
			button.addEventListener('click', function() {
				story.sendReaction(offer.emoji, offer.target);
			});
			story.dom.responses.appendChild(button);
		});

		// free-text composer

		if (inputOffer) {
			var form = document.createElement('form');

			form.className = 'chat-composer';

			var field = document.createElement('input');

			field.type = 'text';
			field.className = 'chat-composer-input';
			field.autocomplete = 'off';
			field.maxLength = 500;
			field.placeholder = inputOffer.placeholder;
			field.setAttribute(
				'aria-label',
				inputOffer.placeholder || 'Type a message'
			);

			var send = document.createElement('button');

			send.type = 'submit';
			send.className = 'chat-composer-send';
			send.setAttribute('aria-label', this.config.inputSendLabel);
			send.setAttribute('title', this.config.inputSendLabel);
			send.innerHTML = SEND_SVG;

			form.appendChild(field);
			form.appendChild(send);

			var inputTarget = inputOffer.target;

			form.addEventListener('submit', function(event) {
				event.preventDefault();
				story.sendText(field.value, inputTarget);
			});

			this.dom.responses.appendChild(form);

			// when typing is the only way to reply, put the cursor there

			if (
				textLinks.length === 0 &&
				photoOffers.length === 0 &&
				locationOffers.length === 0 &&
				reactionOffers.length === 0
			) {
				field.focus({ preventScroll: true });
			}
		}

		// response timer

		if (timeoutOffer && this.config.timers) {
			this.startResponseTimer(timeoutOffer);
		}
	},

	/**
	 Sends the player's typed message and shows the target passage.
	 The text is recorded in s.lastInput (and appended to s.inputs), so
	 the target passage can react to it:

	   <% if (s.lastInput.trim().toLowerCase() === 'swordfish') { %>…
	**/

	sendText: function(text, targetName) {
		text = (text || '').trim();

		if (text === '') {
			return;
		}

		if (!this.passage(targetName)) {
			this.showError(
				this.errorMessage.replace(
					'%s',
					'There is no passage named "' + targetName + '"'
				)
			);
			return;
		}

		this.movePassageToHistory();
		this.pushCheckpoint();
		this.hideMeta();
		this.clearUserResponses();
		this.focusResponses();

		this.state.timedOut = false;
		this.state.lastInput = text;
		this.state.inputs = (this.state.inputs || []).concat(text);

		this.showUserBubble(text);
		this.playSound('send');

		/**
		 Triggered when the player sends a typed message.
		**/

		dispatch('textinput', { text: text, target: targetName, story: this });

		this.showDelayed(targetName, { noMove: true });
	},

	/**
	 Arms the response timer: the thin rule above the reply panel fills
	 left to right — shifting from the accent color into red — and when
	 it reaches the end the timeout fires: the offer's text is sent as
	 the player's forced reply (if given), otherwise the story simply
	 moves on without one. s.timedOut records which way it went.
	**/

	startResponseTimer: function(offer) {
		this.cancelResponseTimer();

		var story = this;
		var bar = document.createElement('div');

		bar.className = 'response-timer';
		bar.setAttribute('aria-hidden', 'true');
		bar.style.backgroundSize = this.dom.footer.clientWidth + 'px 100%';
		this.dom.footer.appendChild(bar);

		this.dom.timerText.textContent = this.config.timerLabel.replace(
			'%s',
			offer.seconds
		);

		var started = performance.now();
		var duration = offer.seconds * 1000;

		var tick = function(now) {
			if (!story._responseTimer) {
				return;
			}

			var fraction = Math.min((now - started) / duration, 1);

			bar.style.width = fraction * 100 + '%';

			if (fraction >= 1) {
				story.fireResponseTimeout(offer);
			}
			else {
				story._responseTimer.raf = window.requestAnimationFrame(tick);
			}
		};

		this._responseTimer = {
			bar: bar,
			raf: window.requestAnimationFrame(tick)
		};
	},

	cancelResponseTimer: function() {
		if (!this._responseTimer) {
			return;
		}

		window.cancelAnimationFrame(this._responseTimer.raf);
		this._responseTimer.bar.remove();
		this._responseTimer = null;
		this.dom.timerText.textContent = '';
	},

	fireResponseTimeout: function(offer) {
		this.cancelResponseTimer();

		if (!this.passage(offer.target)) {
			this.showError(
				this.errorMessage.replace(
					'%s',
					'There is no passage named "' + offer.target + '"'
				)
			);
			return;
		}

		if (this.dom.picker.open) {
			this.dom.picker.close();
		}

		this.movePassageToHistory();
		this.pushCheckpoint();
		this.hideMeta();
		this.clearUserResponses();

		this.state.timedOut = true;

		if (offer.text) {
			this.showUserBubble(offer.text);
			this.playSound('send');
		}

		/**
		 Triggered when a response timer expires.
		**/

		dispatch('timeout', {
			target: offer.target,
			text: offer.text,
			story: this
		});

		this.showDelayed(offer.target, { noMove: true });
	},

	/**
	 Extracts location-share offers from a passage's links:

	   [[location->Target]]                  default button label
	   [[location:Drop them a pin->Target]]  custom button label

	 Choosing one asks the browser for the player's real coordinates
	 (with their permission), sends them as a map card, and stores them
	 in s.playerLocation before showing the target passage. If the
	 player declines (or geolocation is unavailable), s.playerLocation
	 is null and the story continues to the same target.
	**/

	getLocationOffers: function(links) {
		var offers = [];

		links.forEach(function(link) {
			var display = link.display.trim();

			if (display === 'location') {
				offers.push({ label: '', target: link.target });
			}
			else if (display.indexOf(LOCATION_LINK_PREFIX) === 0) {
				offers.push({
					label: display.substring(LOCATION_LINK_PREFIX.length).trim(),
					target: link.target
				});
			}
		});

		return offers;
	},

	/**
	 Requests the player's real location and sends it as an outgoing
	 map card, then continues to the target passage either way.
	**/

	sendLocation: function(targetName) {
		if (!this.passage(targetName)) {
			this.showError(
				this.errorMessage.replace(
					'%s',
					'There is no passage named "' + targetName + '"'
				)
			);
			return;
		}

		this.movePassageToHistory();
		this.pushCheckpoint();
		this.hideMeta();
		this.clearUserResponses();
		this.focusResponses();

		this.state.timedOut = false;

		var story = this;

		var proceed = function(position) {
			if (position) {
				var lat = position.coords.latitude;
				var lon = position.coords.longitude;

				story.state.playerLocation = {
					lat: lat,
					lon: lon,
					accuracy: position.coords.accuracy
				};
				story.showLocationBubble(
					lat,
					lon,
					story.config.locationBubbleLabel
				);
				story.playSound('send');

				/**
				 Triggered when the player shares their location.
				**/

				dispatch('locationshared', {
					lat: lat,
					lon: lon,
					story: story
				});
			}
			else {
				story.state.playerLocation = null;
			}

			story.showDelayed(targetName, { noMove: true });
		};

		if (!navigator.geolocation) {
			proceed(null);
			return;
		}

		navigator.geolocation.getCurrentPosition(
			function(position) { proceed(position); },
			function() { proceed(null); },
			{ timeout: 8000, maximumAge: 60000 }
		);
	},

	/**
	 Renders a shared location as an outgoing map-card message.
	**/

	showLocationBubble: function(lat, lon, label, opts) {
		opts = opts || {};

		var wrapper = document.createElement('div');

		wrapper.className = 'chat-passage-wrapper';
		wrapper.setAttribute('data-speaker', 'you');

		var bubbles = document.createElement('div');

		bubbles.className = 'chat-bubbles';

		var bubble = document.createElement('div');

		bubble.className = 'chat-passage chat-passage--location phistory';
		bubble.setAttribute('data-speaker', 'you');

		var card = document.createElement('div');

		card.className = 'chat-location';
		card.setAttribute('data-lat', lat);
		card.setAttribute('data-lon', lon);
		card.setAttribute('data-label', label || '');
		bubble.appendChild(card);
		this.buildLocationCard(card);
		bubbles.appendChild(bubble);
		wrapper.appendChild(bubbles);
		this.applyUserProfile(wrapper);

		var status = this.attachReceipt(wrapper, bubbles, opts.receipt);

		if (opts.instant) {
			wrapper.classList.add('no-anim');
		}

		this.applyGrouping(wrapper);
		this.dom.history.appendChild(wrapper);

		var entry = { t: 'l', lat: lat, lon: lon, label: label };

		if (status) {
			entry.r = status;

			if (opts.receipt && opts.receipt.label) {
				entry.rl = opts.receipt.label;
			}
		}

		this.timeline.push(entry);
		this.scrollChatIntoView();
	},

	/**
	 Parses the StoryImages passage into the gallery: one image per line
	 in `name: url` form. Lines may optionally start with a list dash.
	**/

	parseGallery: function() {
		var gallery = {};
		var imagesPassage = this.passage('StoryImages');

		if (imagesPassage) {
			imagesPassage.source.split(/\r?\n/).forEach(function(line) {
				var match = line.match(/^\s*[-*]?\s*([\w][\w -]*?)\s*:\s*(\S.*?)\s*$/);

				if (match) {
					gallery[match[1]] = match[2];
				}
			});
		}

		return gallery;
	},

	/**
	 Extracts photo offers from a passage's links.

	   [[photo:cat->Target]]       offer the gallery image named "cat"
	   [[photo:cat,dog->Target]]   offer several images
	   [[photo:*->Target]]         offer the whole gallery

	 Each offer is { name, target }; choosing one sends that image and
	 shows the target passage.
	**/

	getPhotoOffers: function(links) {
		var story = this;
		var offers = [];
		var seen = {};

		links.forEach(function(link) {
			var display = link.display.trim();

			if (display.indexOf(PHOTO_LINK_PREFIX) !== 0) {
				return;
			}

			var names = display.substring(PHOTO_LINK_PREFIX.length).trim();
			var list =
				names === '*' || names === ''
					? Object.keys(story.gallery)
					: names.split(',').map(function(n) { return n.trim(); });

			list.forEach(function(name) {
				if (name && !seen[name]) {
					seen[name] = true;
					offers.push({ name: name, target: link.target });
				}
			});
		});

		return offers;
	},

	/**
	 Opens the photo picker sheet with the given offers.
	**/

	openPhotoPicker: function(offers) {
		var story = this;
		var grid = this.dom.pickerGrid;

		grid.textContent = '';

		offers.forEach(function(offer) {
			var url = story.gallery[offer.name];

			if (!url) {
				return;
			}

			var item = document.createElement('button');

			item.type = 'button';
			item.className = 'photo-picker-item';

			var img = document.createElement('img');

			img.src = url;
			img.alt = '';

			var label = document.createElement('span');

			label.textContent = offer.name;
			item.appendChild(img);
			item.appendChild(label);
			item.addEventListener('click', function() {
				story.dom.picker.close();
				story.sendPhoto(offer.name, offer.target);
			});
			grid.appendChild(item);
		});

		if (grid.children.length === 0) {
			this.showError(
				this.errorMessage.replace(
					'%s',
					'No matching images — add them to a StoryImages passage ' +
					'(one "name: url" per line)'
				)
			);
			return;
		}

		if (typeof this.dom.picker.showModal === 'function') {
			this.dom.picker.showModal();
		}
	},

	/**
	 Sends a gallery image as the player's message and shows the target
	 passage. The choice is tracked in story state: `s.lastPhoto` holds
	 the most recent image name and `s.sentPhotos` every image sent.
	**/

	sendPhoto: function(name, targetName) {
		if (!this.gallery[name]) {
			this.showError(
				this.errorMessage.replace(
					'%s',
					'There is no image named "' + name + '" in StoryImages'
				)
			);
			return;
		}

		if (!this.passage(targetName)) {
			this.showError(
				this.errorMessage.replace(
					'%s',
					'There is no passage named "' + targetName + '"'
				)
			);
			return;
		}

		this.movePassageToHistory();
		this.pushCheckpoint();
		this.hideMeta();
		this.clearUserResponses();
		this.focusResponses();

		this.state.timedOut = false;

		this.state.lastPhoto = name;
		this.state.sentPhotos = (this.state.sentPhotos || []).concat(name);

		this.showPhotoBubble(name);
		this.playSound('send');

		/**
		 Triggered when the player sends a photo.
		**/

		dispatch('photosent', { name: name, target: targetName, story: this });

		this.showDelayed(targetName, { noMove: true });
	},

	/**
	 Renders a sent image as an outgoing photo message.
	**/

	showPhotoBubble: function(name, opts) {
		opts = opts || {};

		var story = this;
		var wrapper = document.createElement('div');

		wrapper.className = 'chat-passage-wrapper';
		wrapper.setAttribute('data-speaker', 'you');

		var bubbles = document.createElement('div');

		bubbles.className = 'chat-bubbles';

		var bubble = document.createElement('div');

		bubble.className = 'chat-passage chat-passage--media phistory';
		bubble.setAttribute('data-speaker', 'you');

		var img = document.createElement('img');

		img.src = this.gallery[name] || '';
		img.alt = name;
		img.addEventListener('load', function() {
			story.scrollChatIntoView();
		});
		bubble.appendChild(img);
		bubbles.appendChild(bubble);
		wrapper.appendChild(bubbles);
		this.applyUserProfile(wrapper);

		var status = this.attachReceipt(wrapper, bubbles, opts.receipt);

		if (opts.instant) {
			wrapper.classList.add('no-anim');
		}

		this.applyGrouping(wrapper);
		this.dom.history.appendChild(wrapper);

		var entry = { t: 'i', name: name };

		if (status) {
			entry.r = status;

			if (opts.receipt && opts.receipt.label) {
				entry.rl = opts.receipt.label;
			}
		}

		this.timeline.push(entry);
		this.scrollChatIntoView();
	},

	/**
	 Removes response buttons from the response panel.
	**/

	clearUserResponses: function() {
		this.cancelResponseTimer();
		this.dom.responses.textContent = '';
	},

	/**
	 Keeps keyboard/screen-reader focus anchored on the response panel
	 after a chosen reply button is removed from the DOM (otherwise
	 focus falls back to the top of the page).
	**/

	focusResponses: function() {
		if (this.dom.responses && this.dom.responses.focus) {
			this.dom.responses.focus({ preventScroll: true });
		}
	},

	/**
	 Renders a chosen response as an outgoing chat message.
	**/

	showUserBubble: function(text, opts) {
		opts = opts || {};

		var wrapper = document.createElement('div');

		wrapper.className = 'chat-passage-wrapper';
		wrapper.setAttribute('data-speaker', 'you');

		var bubbles = document.createElement('div');

		bubbles.className = 'chat-bubbles';

		var bubble = document.createElement('div');

		bubble.className = 'chat-passage phistory';
		bubble.setAttribute('data-speaker', 'you');

		if (window.passage) {
			bubble.setAttribute('data-upassage', window.passage.id);
		}

		bubble.textContent = text;
		bubbles.appendChild(bubble);
		wrapper.appendChild(bubbles);
		this.applyUserProfile(wrapper);

		var status = this.attachReceipt(wrapper, bubbles, opts.receipt);

		if (opts.instant) {
			wrapper.classList.add('no-anim');
		}

		this.applyGrouping(wrapper);
		this.dom.history.appendChild(wrapper);

		var entry = { t: 'u', text: text };

		if (status) {
			entry.r = status;

			if (opts.receipt && opts.receipt.label) {
				entry.rl = opts.receipt.label;
			}
		}

		this.timeline.push(entry);
		this.scrollChatIntoView();
	},

	/**
	 Applies the "you" speaker profile color (if any) to an outgoing
	 message wrapper.
	**/

	applyUserProfile: function(wrapper) {
		var profile = this.getSpeakerProfile('you');

		if (profile.color) {
			wrapper.style.setProperty('--speaker-color', profile.color);

			var textColor = contrastColor(profile.color);

			if (textColor) {
				wrapper.style.setProperty('--speaker-text-color', textColor);
			}
		}
	},

	/**
	 Sets the read receipt on the player's most recent message and
	 records it in the timeline so saves and undo keep it. `status` is
	 'delivered' or 'read'; `label` optionally overrides the display
	 text (e.g. story.markRead('Read 9:41 PM')).
	**/

	setReceipt: function(status, label) {
		if (!this.config.readReceipts) {
			return;
		}

		var wrapper = this.lastOutgoingWrapper();

		if (!wrapper) {
			return;
		}

		var text = label || this.config.receiptLabels[status] || '';

		wrapper.setAttribute('data-receipt', status);

		var receipt = wrapper.querySelector('.chat-receipt');

		if (!receipt) {
			receipt = document.createElement('div');
			receipt.className = 'chat-receipt';
			wrapper.querySelector('.chat-bubbles').appendChild(receipt);
		}

		receipt.textContent = text;

		for (var i = this.timeline.length - 1; i >= 0; i--) {
			var entry = this.timeline[i];

			if (entry.t === 'u' || entry.t === 'i' || entry.t === 'l') {
				entry.r = status;

				if (label) {
					entry.rl = label;
				}
				else {
					delete entry.rl;
				}

				break;
			}
		}

		this.persist();
	},

	/**
	 The player's most recent message wrapper, or null.
	**/

	lastOutgoingWrapper: function() {
		var wrappers = this.dom.history.querySelectorAll(
			'.chat-passage-wrapper[data-speaker="you"]'
		);

		return wrappers.length ? wrappers[wrappers.length - 1] : null;
	},

	/**
	 Marks the player's last message as read. Called automatically when
	 a speaker replies (config.autoRead) or by a passage tagged `read`;
	 call it yourself for finer control.
	**/

	markRead: function(label) {
		this.setReceipt('read', label);
	},

	/**
	 Marks the player's last message as failed ("Not Delivered", shown
	 in red and — unlike other receipts — displayed permanently on that
	 message). Also triggered by a passage tagged `failed`. Automatic
	 read receipts will not override a failed message.
	**/

	markFailed: function(label) {
		this.setReceipt('failed', label);
	},

	/**
	 Flips the player's last message back to Delivered — useful for
	 dramatic tension (the reply that never comes). Also triggered by a
	 passage tagged `unread`.
	**/

	markUnread: function(label) {
		this.setReceipt('delivered', label);
	},

	/**
	 Attaches an emoji tapback badge to the most recent message.
	 `which` is 'out' (the player's last message — the default, used by
	 [react …] directives) or 'in' (the last speaker message, used when
	 the player reacts). One reaction per message; a new one replaces it.
	**/

	react: function(emoji, which) {
		var selector =
			'.chat-passage-wrapper' +
			(which === 'in'
				? ':not([data-speaker="you"])'
				: '[data-speaker="you"]');
		var wrappers = this.dom.history.querySelectorAll(selector);

		var wrapper = wrappers[wrappers.length - 1];

		if (!wrapper) {
			return;
		}

		var bubbles = wrapper.querySelector('.chat-bubbles');

		if (!bubbles) {
			return;
		}

		var badge = bubbles.querySelector('.chat-reaction');

		this._reactionLog.push({
			bubbles: bubbles,
			prev: badge ? badge.textContent : null
		});

		if (!badge) {
			badge = document.createElement('span');
			badge.className = 'chat-reaction';
			badge.setAttribute('role', 'img');
			bubbles.appendChild(badge);
		}

		badge.textContent = emoji;
		badge.setAttribute('aria-label', 'Reaction: ' + emoji);
		wrapper.classList.add('has-reaction');
		this.persist();
	},

	/**
	 Handles the player reacting to the speaker's last message via a
	 [[react:👍->Target]] response: no bubble is sent, the tapback
	 lands on their message, and the story continues to the target.
	 The choice is tracked in s.lastReaction.
	**/

	sendReaction: function(emoji, targetName) {
		if (!this.passage(targetName)) {
			this.showError(
				this.errorMessage.replace(
					'%s',
					'There is no passage named "' + targetName + '"'
				)
			);
			return;
		}

		this.movePassageToHistory();
		this.pushCheckpoint();
		this.hideMeta();
		this.clearUserResponses();
		this.focusResponses();

		this.state.timedOut = false;

		this.state.lastReaction = emoji;
		this.react(emoji, 'in');
		this.timeline.push({ t: 'r', emoji: emoji });
		this.playSound('send');

		/**
		 Triggered when the player reacts to a message.
		**/

		dispatch('reaction', { emoji: emoji, story: this });

		this.showDelayed(targetName, { noMove: true });
	},

	/**
	 Wipes the visible conversation — for flashbacks and scene changes.
	 Also triggered by showing a passage tagged `clear`. Story state and
	 the save timeline are untouched, but undo cannot reach back across
	 a cleared thread.
	**/

	clearThread: function() {
		this.dom.history.textContent = '';
		this._currentNodes = [];
		this.checkpoints = [];
		this._reactionLog = [];
		this.dom.undo.hidden = true;
	},

	/**
	 Attaches a receipt element to an outgoing message wrapper.
	**/

	attachReceipt: function(wrapper, bubbles, receiptOpts) {
		if (!this.config.readReceipts) {
			return null;
		}

		var status = (receiptOpts && receiptOpts.status) || 'delivered';
		var receipt = document.createElement('div');

		receipt.className = 'chat-receipt';
		receipt.textContent =
			(receiptOpts && receiptOpts.label) ||
			this.config.receiptLabels[status] ||
			'';
		wrapper.setAttribute('data-receipt', status);
		bubbles.appendChild(receipt);

		return status;
	},

	/**
	 Plays a short synthesized blip for a sent or received message.
	 Only when config.sounds is on, and only once the browser has
	 unlocked audio after a user gesture.
	**/

	playSound: function(kind) {
		if (!this.config.sounds) {
			return;
		}

		var ctx = this._audioCtx;

		if (!ctx || ctx.state !== 'running') {
			return;
		}

		try {
			var t = ctx.currentTime;
			var osc = ctx.createOscillator();
			var gain = ctx.createGain();

			osc.type = 'sine';

			if (kind === 'send') {
				osc.frequency.setValueAtTime(880, t);
				osc.frequency.exponentialRampToValueAtTime(1320, t + 0.09);
			}
			else {
				osc.frequency.setValueAtTime(660, t);
				osc.frequency.exponentialRampToValueAtTime(470, t + 0.11);
			}

			gain.gain.setValueAtTime(0.0001, t);
			gain.gain.exponentialRampToValueAtTime(0.1, t + 0.015);
			gain.gain.exponentialRampToValueAtTime(
				0.0001,
				t + (kind === 'send' ? 0.12 : 0.16)
			);

			osc.connect(gain);
			gain.connect(ctx.destination);
			osc.start(t);
			osc.stop(t + 0.2);
		}
		catch (e) { /* audio is best-effort */ }
	},

	/**
	 Bumps the "(n) Story Name" tab title while the tab is hidden.
	**/

	notifyTitle: function() {
		if (!this.config.titleNotifications || !document.hidden) {
			return;
		}

		this.unseen += 1;
		document.title = '(' + this.unseen + ') ' + this.name;
	},

	/**
	 Sets up the header light/dark toggle. Dark mode follows the
	 player's system preference until they choose explicitly here;
	 their choice is remembered per story.
	**/

	initTheme: function() {
		var story = this;
		var button = this.dom.theme;

		if (!this.config.themeToggle) {
			button.hidden = true;
			return;
		}

		var saved = null;

		try {
			saved = window.localStorage.getItem(this.themeKey());
		}
		catch (e) { /* storage unavailable */ }

		if (saved === 'light' || saved === 'dark') {
			document.documentElement.setAttribute('data-theme', saved);
		}

		var effectiveTheme = function() {
			var explicit = document.documentElement.getAttribute('data-theme');

			if (explicit === 'light' || explicit === 'dark') {
				return explicit;
			}

			return window.matchMedia &&
				window.matchMedia('(prefers-color-scheme: dark)').matches
				? 'dark'
				: 'light';
		};

		var updateIcon = function() {
			var dark = effectiveTheme() === 'dark';

			button.innerHTML = dark ? SUN_SVG : MOON_SVG;
			button.setAttribute(
				'title',
				dark ? 'Switch to light mode' : 'Switch to dark mode'
			);
			button.setAttribute(
				'aria-label',
				dark ? 'Switch to light mode' : 'Switch to dark mode'
			);
		};

		button.addEventListener('click', function() {
			var next = effectiveTheme() === 'dark' ? 'light' : 'dark';

			document.documentElement.setAttribute('data-theme', next);

			try {
				window.localStorage.setItem(story.themeKey(), next);
			}
			catch (e) { /* storage unavailable */ }

			updateIcon();
		});

		if (window.matchMedia) {
			window
				.matchMedia('(prefers-color-scheme: dark)')
				.addEventListener('change', updateIcon);
		}

		updateIcon();
	},

	themeKey: function() {
		return 'chatbook-theme-' + this.ifid;
	},

	/**
	 Resolves how a speakerless (narrator) passage should be presented:
	 a per-passage tag wins, then config.metaStyle, defaulting to 'chat'.
	**/

	getMetaMode: function(passage) {
		if (passage.tags.indexOf('meta-overlay') > -1) {
			return 'overlay';
		}

		if (passage.tags.indexOf('meta-notification') > -1) {
			return 'notification';
		}

		if (passage.tags.indexOf('meta-chat') > -1) {
			return 'chat';
		}

		var mode = this.config.metaStyle;

		return mode === 'overlay' || mode === 'notification' ? mode : 'chat';
	},

	/**
	 Presents narration outside the conversation: as a veil over the
	 blurred chat ('overlay') or a phone-style banner ('notification').
	 The player's responses stay live below either one.
	**/

	showMeta: function(html, mode) {
		var probe = document.createElement('div');

		probe.innerHTML = html;

		if (
			probe.textContent.trim() === '' &&
			!probe.querySelector('img, video, iframe, svg, .chat-voice, .chat-location')
		) {
			return;
		}

		if (mode === 'notification') {
			this.dom.metaNotificationLabel.textContent =
				this.config.metaNotificationLabel || this.name;
			this.dom.metaNotificationBody.innerHTML = html;
			this.buildRichContent(this.dom.metaNotificationBody);
			this.dom.metaNotification.hidden = false;
		}
		else {
			this.dom.metaOverlayContent.innerHTML = html;
			this.buildRichContent(this.dom.metaOverlayContent);
			this.dom.metaOverlay.hidden = false;
		}
	},

	/**
	 Dismisses any overlay or notification narration.
	**/

	hideMeta: function() {
		this.dom.metaOverlay.hidden = true;
		this.dom.metaNotification.hidden = true;
	},

	/**
	 Shows an error as a meta message in the chat.
	**/

	showError: function(message) {
		dispatch('sm.story.error', { message: message, story: this });

		var meta = document.createElement('div');

		meta.className = 'meta-passage meta-passage--error';
		meta.textContent = message;

		if (this.dom && this.dom.history) {
			this.dom.history.appendChild(meta);
			this._currentNodes.push(meta);
			this.scrollChatIntoView();
		}
	},

	/**
	 Saves an undo checkpoint. Called right before a user choice is
	 applied.
	**/

	pushCheckpoint: function() {
		// snapshot the receipt on the (currently) last outgoing message,
		// so undo can rewind a later Delivered -> Read flip

		var lastReceipt = null;

		for (var i = this.timeline.length - 1; i >= 0; i--) {
			var entry = this.timeline[i];

			if (entry.t === 'u' || entry.t === 'i' || entry.t === 'l') {
				if (entry.r) {
					lastReceipt = { status: entry.r, label: entry.rl };
				}

				break;
			}
		}

		// keep overlay/notification narration restorable by undo

		var meta = null;

		if (!this.dom.metaOverlay.hidden) {
			meta = { html: this.dom.metaOverlayContent.innerHTML, mode: 'overlay' };
		}
		else if (!this.dom.metaNotification.hidden) {
			meta = {
				html: this.dom.metaNotificationBody.innerHTML,
				mode: 'notification'
			};
		}

		this.checkpoints.push({
			state: deepClone(this.state),
			domCount: this.dom.history.children.length,
			timelineLength: this.timeline.length,
			passageId: window.passage ? window.passage.id : null,
			links: window.passage ? window.passage.links.slice() : [],
			lastReceipt: lastReceipt,
			meta: meta,
			reactionLogLength: this._reactionLog.length
		});

		this.dom.undo.hidden = false;
	},

	/**
	 Undoes the most recent choice: restores state, trims the chat back
	 to the checkpoint and re-offers the responses that were available.
	**/

	undo: function() {
		var checkpoint = this.checkpoints.pop();

		if (!checkpoint) {
			return;
		}

		this.cancelTimers();
		this.hideTyping();
		this.hideMeta();
		this.clearUserResponses();

		// everything since the checkpoint is discarded

		this._currentNodes = [];

		// revert reactions applied since the checkpoint

		while (this._reactionLog.length > (checkpoint.reactionLogLength || 0)) {
			var reaction = this._reactionLog.pop();
			var badge = reaction.bubbles.querySelector('.chat-reaction');

			if (reaction.prev) {
				if (badge) {
					badge.textContent = reaction.prev;
				}
			}
			else if (badge) {
				badge.remove();

				var reactedWrapper = reaction.bubbles.closest(
					'.chat-passage-wrapper'
				);

				if (reactedWrapper) {
					reactedWrapper.classList.remove('has-reaction');
				}
			}
		}

		var history = this.dom.history;

		while (history.children.length > checkpoint.domCount) {
			history.lastElementChild.remove();
		}

		if (history.lastElementChild) {
			history.lastElementChild.classList.remove('has-follow');
		}

		this.state = checkpoint.state;
		this.timeline.length = checkpoint.timelineLength;
		this.history = this.timeline
			.filter(function(entry) { return entry.t === 'p'; })
			.map(function(entry) { return entry.id; });

		var passage = this.passage(checkpoint.passageId);

		if (passage) {
			window.passage = passage;
			passage.links = checkpoint.links.slice();
		}

		if (checkpoint.lastReceipt) {
			this.setReceipt(
				checkpoint.lastReceipt.status,
				checkpoint.lastReceipt.label
			);
		}

		if (checkpoint.meta) {
			this.showMeta(checkpoint.meta.html, checkpoint.meta.mode);
		}

		this.showUserResponses();
		this.persist();
		this.scrollChatIntoView();

		if (this.checkpoints.length === 0) {
			this.dom.undo.hidden = true;
		}
	},

	/**
	 Scrolls the chat panel so the newest messages are visible.
	**/

	scrollChatIntoView: function() {
		var panel = this.dom.panel;

		window.requestAnimationFrame(function() {
			panel.scrollTo({
				top: panel.scrollHeight,
				behavior: 'smooth'
			});
		});
	},

	/**
	 Appends the StoryColophon passage when an End-tagged passage shows.
	**/

	pcolophon: function() {
		if (
			window.passage.tags.indexOf('End') > -1 &&
			this.passage('StoryColophon') !== null
		) {
			var meta = document.createElement('div');

			meta.className = 'meta-passage meta-passage--colophon';
			meta.innerHTML = this.passage('StoryColophon').render();
			this.dom.history.appendChild(meta);
			this._currentNodes.push(meta);
		}
	},

	/**
	 Retrieves the speaker from a passage's tags. Returns null when the
	 passage has no speaker-* tag (it renders as a meta passage).
	**/

	getPassageSpeaker: function(passage) {
		var speakerTag = passage.tags.find(function(tag) {
			return tag.indexOf(SPEAKER_TAG_PREFIX) === 0;
		});

		return speakerTag ? speakerTag.substring(SPEAKER_TAG_PREFIX.length) : null;
	},

	/**
	 Human-readable version of a speaker id: the profile name if one is
	 set, otherwise dashes become spaces ("speaker-happy-bot" is
	 displayed as "happy bot").
	**/

	getSpeakerDisplayName: function(speaker) {
		var profile = this.getSpeakerProfile(speaker);

		return profile.name || speaker.replace(/-+/g, ' ').trim();
	},

	/**
	 Returns the profile ({ name, avatar, color }) for a speaker id, or
	 an empty object.
	**/

	getSpeakerProfile: function(speaker) {
		return this.speakers[speaker] || {};
	},

	/**
	 Parses the StorySpeakers passage into speaker profiles. One speaker
	 per line: the speaker id, a colon, then a display name and/or
	 semicolon-separated `avatar:`/`color:` properties, e.g.

	   detective: Detective Marlowe; avatar: marlowe.png; color: #8e44ad
	   you: color: #34c759
	**/

	parseSpeakers: function() {
		var speakers = {};
		var speakersPassage = this.passage('StorySpeakers');

		if (speakersPassage) {
			speakersPassage.source.split(/\r?\n/).forEach(function(line) {
				var match = line.match(/^\s*[-*]?\s*([\w][\w-]*)\s*:\s*(.+)$/);

				if (!match) {
					return;
				}

				var profile = {};

				match[2].split(';').forEach(function(part) {
					var kv = part.match(/^\s*(name|avatar|color)\s*:\s*(.+?)\s*$/);

					if (kv) {
						profile[kv[1]] = kv[2];
					}
					else if (part.trim()) {
						profile.name = part.trim();
					}
				});

				speakers[match[1]] = profile;
			});
		}

		return speakers;
	},

	/**
	 Returns the HTML source for a passage, most often used to embed one
	 passage in another.
	**/

	render: function(idOrName) {
		var passage = this.passage(idOrName);

		if (!passage) {
			throw new Error('There is no passage with the ID or name ' + idOrName);
		}

		return passage.render();
	},

	/**
	 Shows a passage after a delay proportional to its length, with a
	 typing indicator while "typing" it.
	**/

	showDelayed: function(idOrName, opts) {
		var story = this;
		var passage = this.passage(idOrName);

		if (!passage) {
			this.show(idOrName, opts); // surfaces the error message
			return;
		}

		var speaker = this.getPassageSpeaker(passage);
		var delay = speaker
			? this.getPassageDelay(idOrName)
			: this.config.metaDelay;

		if (speaker && this.config.typing) {
			this.timers.push(
				window.setTimeout(function() {
					story.showTyping(idOrName);
				}, Math.min(250, delay * 0.25))
			);
		}

		this.timers.push(
			window.setTimeout(function() {
				story.hideTyping();
				story.show(idOrName, opts);
			}, delay)
		);
	},

	cancelTimers: function() {
		this.timers.forEach(function(id) {
			window.clearTimeout(id);
		});
		this.timers = [];
	},

	/**
	 Number of milliseconds to "type" the target passage, based on its
	 text length (links excluded), clamped to configured bounds.
	**/

	getPassageDelay: function(idOrName) {
		var target = this.passage(idOrName);

		if (!target) {
			return this.config.minTypingDelay;
		}

		var probe = document.createElement('div');

		probe.innerHTML = target.source
			.replace(/\[\[.*?\]\]/g, '')
			.replace(/\[(voice|location|timestamp)[^\]]*\]/gi, '');

		var length = probe.textContent.trim().length;

		return Math.max(
			this.config.minTypingDelay,
			Math.min(length * this.config.msPerChar, this.config.maxTypingDelay)
		);
	},

	/**
	 Shows the typing indicator, styled for the passage's speaker.
	**/

	showTyping: function(idOrName) {
		var passage = this.passage(idOrName);
		var speaker = passage ? this.getPassageSpeaker(passage) : null;

		if (!speaker) {
			return;
		}

		var typing = this.dom.typing;
		var wrapper = typing.querySelector('.chat-passage-wrapper');
		var avatar = typing.querySelector('.chat-avatar');

		wrapper.setAttribute('data-speaker', speaker);

		var previous = this.dom.history.lastElementChild;

		wrapper.classList.toggle(
			'chat-follow',
			!!(
				previous &&
				previous.classList.contains('chat-passage-wrapper') &&
				previous.getAttribute('data-speaker') === speaker
			)
		);

		this.decorateAvatar(avatar, speaker);

		var profile = this.getSpeakerProfile(speaker);
		var textColor = profile.color ? contrastColor(profile.color) : null;

		if (profile.color) {
			wrapper.style.setProperty('--speaker-color', profile.color);
		}
		else {
			wrapper.style.removeProperty('--speaker-color');
		}

		if (textColor) {
			wrapper.style.setProperty('--speaker-text-color', textColor);
		}
		else {
			wrapper.style.removeProperty('--speaker-text-color');
		}

		typing.hidden = false;

		// announce "<name> is typing" — set the text after the region
		// is visible so screen readers reliably pick up the change

		var story = this;

		window.requestAnimationFrame(function() {
			if (!typing.hidden) {
				story.dom.typingText.textContent =
					story.config.typingLabel.replace(
						'%s',
						story.getSpeakerDisplayName(speaker)
					);
			}
		});

		this.scrollChatIntoView();
	},

	/**
	 Hides the typing indicator.
	**/

	hideTyping: function() {
		this.dom.typing.hidden = true;
		this.dom.typingText.textContent = '';
	},

	/**
	 Returns a hash value representing the current story progress.
	**/

	saveHash: function() {
		return LZString.compressToBase64(
			JSON.stringify({
				state: this.state,
				timeline: this.timeline,
				/* legacy field so old integrations reading history keep working */
				history: this.history
			})
		);
	},

	/**
	 Sets the URL hash to the current progress, creating a bookmarkable
	 save.
	**/

	save: function() {
		dispatch('save', { story: this });
		window.history.replaceState(null, '', '#' + this.saveHash());
	},

	saveKey: function() {
		return 'chatbook-save-' + this.ifid;
	},

	/**
	 Writes an autosave if enabled.
	**/

	persist: function() {
		if (!this.config.autosave || !this.ifid) {
			return;
		}

		try {
			window.localStorage.setItem(this.saveKey(), this.saveHash());
		}
		catch (e) { /* storage unavailable or full */ }
	},

	/**
	 Restores progress from a hash created by saveHash(), replaying the
	 whole conversation instantly. Returns whether the restore succeeded.
	**/

	restore: function(hash) {
		dispatch('restore', { story: this });

		try {
			var save = JSON.parse(LZString.decompressFromBase64(hash));
			var timeline = save.timeline;

			if (!timeline && save.history) {
				// legacy hash from Trialogue 1.x
				timeline = save.history.map(function(id) {
					return { t: 'p', id: id };
				});
			}

			if (!timeline || !timeline.length) {
				throw new Error('Save data is empty');
			}

			this.cancelTimers();
			this.hideTyping();
			this.hideMeta();
			this.clearUserResponses();
			this.state = {};
			this.timeline = [];
			this.history = [];
			this.checkpoints = [];
			this._reactionLog = [];
			this.dom.history.textContent = '';
			this._currentNodes = [];
			this.dom.undo.hidden = true;

			// replaying a whole transcript would flood screen readers;
			// silence the log while it rebuilds

			this.dom.history.setAttribute('aria-live', 'off');

			var story = this;

			timeline.forEach(function(entry) {
				var receipt = entry.r
					? { status: entry.r, label: entry.rl }
					: null;

				if (entry.t === 'u') {
					story.showUserBubble(entry.text, {
						instant: true,
						receipt: receipt
					});
				}
				else if (entry.t === 'i') {
					story.state.lastPhoto = entry.name;
					story.state.sentPhotos =
						(story.state.sentPhotos || []).concat(entry.name);
					story.showPhotoBubble(entry.name, {
						instant: true,
						receipt: receipt
					});
				}
				else if (entry.t === 'l') {
					story.state.playerLocation = {
						lat: entry.lat,
						lon: entry.lon
					};
					story.showLocationBubble(entry.lat, entry.lon, entry.label, {
						instant: true,
						receipt: receipt
					});
				}
				else if (entry.t === 'r') {
					story.state.lastReaction = entry.emoji;
					story.react(entry.emoji, 'in');
				}
				else {
					story.show(entry.id, {
						record: false,
						instant: true
					});
					story.timeline.push({ t: 'p', id: entry.id });
					story.history.push(entry.id);
				}
			});

			// replaying re-runs template side effects; the explicitly
			// saved state still wins

			if (save.state) {
				this.state = save.state;
			}

			this.persist();
			this.dom.history.removeAttribute('aria-live');
		}
		catch (e) {
			this.dom.history.removeAttribute('aria-live');
			dispatch('restorefailed', { error: e });
			return false;
		}

		dispatch('restore:after', { story: this });
		return true;
	},

	/**
	 Clears saved progress and restarts the story from the beginning.
	**/

	restart: function() {
		try {
			window.localStorage.removeItem(this.saveKey());
		}
		catch (e) { /* storage unavailable */ }

		window.history.replaceState(
			null,
			'',
			window.location.pathname + window.location.search
		);
		window.location.reload();
	}
});

module.exports = Story;
