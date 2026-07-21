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

/* the minimum margin (px) beside the phone for asides to sit in it;
   anything tighter and they float over the chat's edge instead */
var ASIDE_MIN_MARGIN = 170;

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

/* a passage name in a [then]/[deliver] directive may be quoted to keep
   an " in " inside the name literal; matched surrounding quotes come off */

function unquoteName(name) {
	var first = name.charAt(0);

	if (
		(first === "'" || first === '"') &&
		name.length > 2 &&
		name.charAt(name.length - 1) === first
	) {
		return name.slice(1, -1);
	}

	return name;
}

/* readable words in passage source: message and narration prose, pill
   labels, and (send: …) text — with code, comments, directive lines,
   and markup stripped. An approximation: text a template prints at
   runtime isn't counted. */

function countWords(source) {
	var text = source
		.replace(/\/\*[\s\S]*?\*\//g, ' ')
		.replace(/^[ \t]*\/\/.*$/gm, ' ')
		.replace(/<%[\s\S]*?%>/g, ' ')

		// links: keep the pill label and any (send: …) text — the
		// player reads both

		.replace(/\[\[(.*?)\]\]/g, function(match, inner) {
			var arrow = inner.indexOf('->');

			if (arrow > -1) {
				inner = inner.slice(0, arrow);
			}
			else {
				var back = inner.indexOf('<-');

				if (back > -1) {
					inner = inner.slice(back + 2);
				}
				else {
					var bar = /(^|[^|])\|(?!\|)/.exec(inner);

					if (bar) {
						inner = inner.slice(0, bar.index + bar[1].length);
					}
				}
			}

			return ' ' + inner.replace(/\(send:([^)]*)\)/gi, ' $1 ') + ' ';
		})

		// directive lines are chrome, not prose

		.replace(
			/^[ \t]*\[(?:timestamp|system|voice|sound|location|react|deliver|then|tombstone)\b[^\]]*\][ \t]*$/gim,
			' '
		)

		// span/div shorthand selectors and HTML tags

		.replace(/\{[^}]*\}/g, ' ')
		.replace(/<[^>]+>/g, ' ');

	var count = 0;

	text.split(/\s+/).forEach(function(token) {
		if (/[A-Za-z0-9\u00C0-\uFFFF]/.test(token)) {
			count += 1;
		}
	});

	return count;
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
 Subtext keeps its original (Snowman 1 / Trialogue) event names and
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
			'Subtext could not find a <tw-storydata> element. ' +
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
	 Debug mode. Twine's Test button and `tweego -t` publish with
	 options="debug"; a ?debug query switch works on any build, and
	 story.config.debug = true forces it from story JavaScript.
	**/
	this.debug =
		(el.getAttribute('options') || '').indexOf('debug') > -1 ||
		/[?&]debug\b/.test(window.location.search);

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
		/* what a deleted message's tombstone says (localize here) */
		redactedLabel: 'This message was deleted',
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
		/* in multi-conversation stories, announce messages that arrive
		   in a thread the player isn't viewing with a tappable banner */
		threadNotifications: true,
		/* how long each notification banner stays up, in seconds */
		bannerSeconds: 5,
		/* how many banners can be on screen at once; further ones
		   wait for a free slot */
		bannerStack: 3,
		/* what banners and inbox previews say for media-only messages
		   (localize or restyle here) */
		previewLabels: {
			photo: '📷 Photo',
			voice: '🎤 Voice message',
			location: '📍 Location'
		},
		/* placeholder in the grayed-out composer shown when viewing a
		   conversation the story isn't in right now (set '' to show
		   nothing instead) */
		threadIdleHint: 'Nothing to say right now',
		/* label on the inbox's Trash section (localize here) */
		trashLabel: 'Trash',
		/* mark the inbox row of the conversation awaiting a reply */
		replyIndicator: true,
		/* its screen-reader label (localize here) */
		replyIndicatorLabel: 'awaiting your reply',
		/* show the light/dark toggle in the header */
		themeToggle: true,
		/* show the header undo button once there is something to undo
		   (set false for stories where choices should be final) */
		undoButton: true,
		/* show the inbox chevron in multi-conversation stories; set
		   false to keep the player focused on one conversation, then
		   story.showInboxButton() to reveal the wider inbox */
		inboxButton: true,
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
		/* helper text under the chat: `hint` above choice chips (also
		   set via inject_hint()), `inputHint` above the free-text
		   composer, and hintFadeAfter retires both once the player has
		   made that many moves (null = never fade, 0 = never show) */
		hint: '',
		inputHint: '',
		hintFadeAfter: null,
		/* default label on a location-share response button */
		locationButtonLabel: 'Share my location',
		/* label under the map card of a shared player location */
		locationBubbleLabel: 'My location',
		/* how many beats a margin aside survives before fading (a beat
		   is any new message in its conversation); per-passage override
		   with aside-beats-N or aside-hold */
		asideBeats: 3,
		/* when the screen has no margin beside the phone, asides float
		   over the chat's edge ('float'); set 'chip' to fall back to
		   centered in-chat narration instead */
		asideMobile: 'float',
		/* where StoryTitle / StorySubtitle / StoryAuthor appear:
		   'header' (default), 'menu' (tucked into the menu dialog), or
		   'none' (handle them yourself, e.g. via setHeader) */
		titlePlacement: 'header',
		/* heading of the menu dialog (also settable per call via
		   inject_menu(content, title)) */
		menuTitle: 'Menu',
		/* force debug mode on (Twine's Test button, `tweego -t`, and a
		   ?debug URL switch enable it too) */
		debug: false
	};

	/**
	 Speaker profiles, parsed from the StorySpeakers passage. Entries are
	 { name, avatar, color } keyed by speaker id; also scriptable via
	 `story.speakers`.
	**/
	this.speakers = {};

	/** Messages received while the tab was hidden. **/
	this.unseen = 0;

	/**
	 Conversation threads, parsed from the StoryThreads passage. Entries
	 are { name, avatar, color } keyed by thread id; also scriptable via
	 `story.threads`. When at least one thread is declared, the story
	 runs in multi-conversation mode: an inbox screen lists the threads,
	 messages route to per-thread logs, and unread badges accumulate on
	 conversations the player isn't looking at. With no StoryThreads
	 passage, none of this machinery is active.
	**/
	this.threads = {};

	/** Thread ids in declaration order. **/
	this.threadOrder = [];

	/** Whether multi-conversation mode is on (derived in start()). **/
	this.multiThread = false;

	/** Unread message counts per thread id. **/
	this.unread = {};

	/* per-thread log elements, view state, and activity ordering */
	this._threadLogs = {};
	this._viewedThread = null;  /* the thread on screen */
	this._hotThread = null;     /* the thread holding pending responses */
	this._screen = 'thread';    /* 'thread' | 'inbox' */
	this._typingThread = null;
	this._threadActivity = {};
	this._activitySeq = 0;

	/* threads moved to the Trash (archived, readable, recoverable) */
	this._threadArchived = {};
	this._seeding = false;

	this._audioCtx = null;
	this._playingAudio = null;

	/** Applied reactions, so undo can revert them. **/
	this._reactionLog = [];

	/** Which screen a viewed thread was opened from: inbox or trash. **/
	this._threadOrigin = 'inbox';

	/** Live margin asides, oldest first, per side. **/
	this._asides = { left: [], right: [] };
	this._asideRaf = null;

	/** Timestamp chips shown early, counted per passage id. **/
	this._preShownStamps = null;

	/** Live banner cards, oldest first. **/
	this._banners = [];

	/** Thread banners waiting for a free slot in the stack. **/
	this._bannerQueue = [];

	/** Redacted messages, so undo can restore their content. **/
	this._redactionLog = [];

	/** When the current choices appeared, for s.replySeconds. **/
	this._responsesShownAt = null;

	/** Cross-playthrough memory cache; see remember()/recall(). **/
	this._memory = null;

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
			inbox: byId('inbox'),
			inboxList: byId('inbox-list'),
			inboxButton: byId('nav-link-inbox'),
			timerText: byId('timer-announcement'),
			asideLayer: byId('aside-layer'),
			bannerStack: byId('banner-stack'),
			lightbox: byId('photo-lightbox'),
			lightboxImg: byId('photo-lightbox-img')
		};

		this._responseTimer = null;

		// tapping notification narration dismisses it (but interactive
		// content inside it, like a voice memo, stays usable); the ×
		// button does the same for keyboard and screen-reader users.
		// Thread banners live in their own stack and wire their own
		// taps when they're built.

		this.dom.metaNotification.addEventListener('click', function(event) {
			if (
				event.target.closest('[data-notification-close]') ||
				!event.target.closest('button, a')
			) {
				story.dom.metaNotification.hidden = true;
			}
		});

		// any chat photo opens in a fullscreen lightbox; tap anywhere
		// (or Escape) closes it

		document.addEventListener('click', function(event) {
			var img =
				event.target.closest &&
				event.target.closest('img[role="button"]');

			if (img && story.dom.lightbox.hidden) {
				story.openLightbox(img);
			}
		});

		this.dom.lightbox.addEventListener('click', function() {
			story.closeLightbox();
		});

		document.addEventListener('keydown', function(event) {
			if (event.key === 'Escape' && !story.dom.lightbox.hidden) {
				story.closeLightbox();
				return;
			}

			if (
				(event.key === 'Enter' || event.key === ' ') &&
				event.target &&
				event.target.matches &&
				event.target.matches('img[role="button"]') &&
				story.dom.lightbox.hidden
			) {
				event.preventDefault();
				story.openLightbox(event.target);
			}
		});

		this.gallery = this.parseGallery();
		this.speakers = this.parseSpeakers();
		this.threads = this.parseThreads();

		// (the header title/subtitle/author render in applyIdentity(),
		// after user scripts have had their say on config.titlePlacement)

		// undo & restart buttons

		this.dom.undo.addEventListener('click', this.undo.bind(this));

		var story = this;
		var openDialog = function(event) {
			event.preventDefault();

			// the restart control lives in the menu modal; close it
			// first so the confirmation isn't stacked behind it

			if (story.dom.menuDialog.open) {
				story.dom.menuDialog.close();
			}

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

			// data-sent (if present) overrides what the player "sends";
			// otherwise the pill's own text is sent. The label itself
			// is recorded as s.lastChoice either way.

			var label = link.textContent.trim();
			var sent = link.hasAttribute('data-sent')
				? link.getAttribute('data-sent')
				: label;

			story.choose(link.getAttribute('data-passage'), sent, label);
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

		if (this.config.debug) {
			this.debug = true;
		}

		if (this.debug) {
			// autosave keeps your place across `tweego -w` rebuilds
			this.config.autosave = true;
			this.enableDebug();
		}

		this.applyIdentity();

		var menuTitle = byId('menu-dialog-title');

		if (menuTitle) {
			menuTitle.textContent = this.config.menuTitle;
		}

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

		this.initThreads();
		this.seedThreads();

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

		if (this.multiThread) {
			var startPassageObj = this.passage(this.startPassage);

			this._hotThread = startPassageObj
				? this.getPassageThread(startPassageObj)
				: this.threadOrder[0];
			this.bumpThreadActivity(this._hotThread);
			this.openThread(this._hotThread);
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

	 The choice is recorded in s.lastChoice — the pill's label when one
	 was tapped, otherwise the sent text — so passages can branch on
	 which reply the player picked even when several pills share a
	 target.
	**/

	choose: function(targetName, sentText, label) {
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

		var chosen =
			typeof label === 'string' && label.trim() !== ''
				? label.trim()
				: (sentText || '').trim();

		if (chosen !== '') {
			this.state.lastChoice = chosen;
		}

		/**
		 Triggered whenever the player picks a reply pill (or code calls
		 story.choose). detail: { label, sent, target, story }.
		**/

		dispatch('choice', {
			label: chosen || null,
			sent: sentText || '',
			target: targetName,
			story: this
		});

		// an empty message (from a `(send:)` link) advances the story
		// without adding a player bubble; `||` in the text splits it
		// into separate bubbles, fired off in quick succession

		var story = this;
		var parts = (sentText || '')
			.split('||')
			.map(function(part) { return part.trim(); })
			.filter(function(part) { return part !== ''; });

		parts.forEach(function(part, index) {
			story.showUserBubble(part, { delay: index * 160 });
		});

		if (parts.length > 0) {
			this.playSound('send');
		}

		// narration the player taps directly into — an empty (send:)
		// "Continue" pill — appears instantly; metaDelay only paces
		// narration that follows a sent message

		var target = this.passage(targetName);

		if (parts.length === 0 && target && !this.getPassageSpeaker(target)) {
			this.show(targetName, { noMove: true, follow: true });
		} else {
			this.showDelayed(targetName, { noMove: true, follow: true });
		}
	},

	/**
	 Displays a passage, appending it to the chat. If there is no passage
	 by the given name or ID, an error message is shown in the chat.

	 Options:
	   noMove  - don't move the current passage into history first
	   record  - if false, don't record this passage in the timeline
	   instant - skip entrance animations (used when restoring)
	   follow  - a player action chose this passage: if it belongs to
	             another conversation, move the view there
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

		if (opts.follow) {
			this.followTargetThread(passage);
		}

		/**
		 Triggered when a passage is about to be hidden/shown.
		**/

		dispatch('hidepassage', { passage: window.passage });
		dispatch('showpassage', { passage: passage });

		if (!opts.noMove) {
			this.movePassageToHistory();
		}

		// how the player got here: passages that several routes lead
		// into can branch on s.previousPassage

		var cameFrom = window.passage;
		var previousName = this.state.previousPassage;

		if (window.passage) {
			this.state.previousPassage = window.passage.name;
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

		// narration with no choices of its own is *side* narration —
		// an aside or interstitial shown while the player is still
		// deciding. It displays, but it does not become the story's
		// current passage: the pending reply pills, the cursor, and
		// the hot thread all stay where they were. (End-tagged finales
		// keep normal behavior — the story really does move there.)

		var sideNarration =
			!speaker &&
			passage.links.length === 0 &&
			passage.tags.indexOf('End') === -1 &&
			passage.tags.indexOf('end') === -1;

		if (sideNarration) {
			window.passage = cameFrom;
			this.state.previousPassage = previousName;
		}

		// with no margin and asideMobile 'chip', asides degrade to
		// centered in-chat narration

		if (
			metaMode === 'aside' &&
			this.config.asideMobile === 'chip' &&
			this.asideMargin() < ASIDE_MIN_MARGIN
		) {
			metaMode = 'chat';
		}

		// route to the passage's thread; a passage tagged for another
		// thread pulls the whole conversation over there

		var threadId = this.getPassageThread(passage);
		var log = this.logFor(threadId);
		var viewingIt = !this.multiThread ||
			(this._screen === 'thread' && this._viewedThread === threadId);

		if (!sideNarration) {
			this._hotThread = threadId;
		}

		// any new content replaces active overlay/notification narration

		this.hideMeta();

		// a passage tagged `clear` wipes its thread first (flashbacks,
		// scene changes)

		if (passage.tags.indexOf('clear') > -1) {
			this.clearThread(threadId);
		}

		// apply [react …] directives to the player's last message

		html = html.replace(
			/<div class="chat-react" data-emoji="([^"]*)"><\/div>/g,
			function(match, emoji) {
				story.react(template.unescapeHtml(emoji), 'out');
				return '';
			}
		);

		// apply [deliver …] directives: messages for other threads

		html = html.replace(
			/<div class="chat-deliver" data-passage="([^"]*)"><\/div>/g,
			function(match, name) {
				story.deliver(template.unescapeHtml(name), {
					instant: opts.instant,
					record: false
				});
				return '';
			}
		);

		// play [sound …] cues (never while replaying a save)

		html = html.replace(
			/<div class="chat-sound" data-src="([^"]*)"><\/div>/g,
			function(match, src) {
				if (!opts.instant) {
					story.playAudioFile(template.unescapeHtml(src));
				}

				return '';
			}
		);

		// [then …] chains to the next passage — the directive form of
		// showDelayed(), so replays treat it exactly like the call

		html = html.replace(
			/<div class="chat-then" data-passage="([^"]*)" data-delay="([^"]*)"><\/div>/g,
			function(match, name, delay) {
				var target = template.unescapeHtml(name);

				if (delay === '') {
					story.showDelayed(target);
				}
				else {
					story.showDelayed(target, parseInt(delay, 10));
				}

				return '';
			}
		);

		if (metaMode === 'aside') {
			// asides are ephemeral: never rebuilt from a save replay

			if (!opts.instant) {
				this.showAside(passage, html, threadId);
			}

			this._currentNodes = [];
		}
		else if (metaMode !== 'chat') {
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
					story.applyGrouping(node, log);
				}

				log.appendChild(node);

				// images finish loading after the initial scroll;
				// re-scroll so they don't cut off the newest messages

				node.querySelectorAll('img').forEach(function(img) {
					img.addEventListener('load', function() {
						story.scrollChatIntoView();
					});
				});
			});

			this._currentNodes = nodes;

			if (nodes.length > 0) {
				this.noteAsideBeat(threadId);
			}

			if (nodes.length > 0 && speaker && speaker !== 'you') {
				this.noteThreadMessage(
					threadId,
					this.previewText(html),
					opts.instant || viewingIt,
					speaker
				);
			}
			else if (this.multiThread) {
				this.bumpThreadActivity(threadId);
				this.renderInbox();
			}
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

		// the passage's choices render only while its thread is on
		// screen; opening the thread re-offers them (and arms any
		// response timer then). Side narration never touches them —
		// the player is still deciding.

		if (!sideNarration) {
			this.clearUserResponses();

			if (viewingIt) {
				this.showUserResponses();
			}
			else {
				this.updateHint();
			}
		}

		this.pcolophon();
		this.persist();

		if (viewingIt) {
			this.scrollChatIntoView();
		}

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

		// hoist [timestamp ...] and [system ...] chips out of the
		// message group: chips before the message render above it,
		// chips after it (a departure ending a passage) render below.
		// Pre-shown timestamps are skipped; system events never
		// pre-show, so they are never skipped.

		var pre = this._preShownStamps;
		var skip = (pre && pre[passage.id]) || 0;
		var tailNodes = [];
		var seenContent = false;

		blocks = blocks.filter(function(block) {
			// sound cues and [then …] chains render nothing; any not
			// consumed by a show path (seeds, for instance) are dropped
			// silently — seeded history never fires a chain

			if (
				block.nodeType === Node.ELEMENT_NODE &&
				(block.classList.contains('chat-sound') ||
					block.classList.contains('chat-then'))
			) {
				return false;
			}

			var isChip =
				block.nodeType === Node.ELEMENT_NODE &&
				(block.classList.contains('chat-timestamp') ||
					block.classList.contains('chat-system'));

			if (!isChip) {
				seenContent = true;
				return true;
			}

			if (block.classList.contains('chat-timestamp') && skip > 0) {
				skip -= 1;
				return false;
			}

			(seenContent ? tailNodes : nodes).push(block);
			return false;
		});

		if (pre && pre[passage.id]) {
			delete pre[passage.id];
		}

		if (blocks.length === 0) {
			Array.prototype.push.apply(nodes, tailNodes);
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
			Array.prototype.push.apply(nodes, tailNodes);
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

		// paragraphs normally split into separate bubbles; the
		// `one-bubble` tag keeps a long message in a single bubble,
		// paragraph breaks and all (splitBubbles=false does it
		// story-wide)

		var single =
			!this.config.splitBubbles ||
			passage.tags.indexOf('one-bubble') > -1;
		var bubbleBlocks = single ? [null] : blocks;
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
		Array.prototype.push.apply(nodes, tailNodes);
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

		// [tombstone] placeholders become deleted-message bubbles

		root.querySelectorAll('.chat-tombstone').forEach(function(el) {
			var label = el.getAttribute('data-label');
			var bubble = el.closest('.chat-passage');

			if (bubble) {
				story.applyRedaction(
					bubble,
					label || story.config.redactedLabel
				);
			}
			else {
				el.textContent = label || story.config.redactedLabel;
			}
		});

		// chat photos open in a lightbox on tap; make them reachable
		// by keyboard too. Authors can opt an image out with
		// data-lightbox="off".

		root.querySelectorAll('img').forEach(function(img) {
			if (
				img.getAttribute('data-lightbox') === 'off' ||
				img.closest('.chat-location')
			) {
				return;
			}

			img.setAttribute('tabindex', '0');
			img.setAttribute('role', 'button');

			if (!img.getAttribute('alt')) {
				img.setAttribute('alt', 'Photo');
			}
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
		speaker = speaker == null ? '' : String(speaker);

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

	applyGrouping: function(wrapper, log) {
		var previous = (log || this.hotLog()).lastElementChild;

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

		// start the deliberation clock for s.replySeconds

		this._responsesShownAt = Date.now();

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
				display !== 'photo' &&
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

			// a link may send different text than its pill label shows
			// (or nothing at all); carry it on the button

			if (typeof link.sent === 'string') {
				button.setAttribute('data-sent', link.sent);
			}

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

		if (
			timeoutOffer &&
			this.config.timers &&
			!(
				this._responseTimer &&
				window.passage &&
				this._responseTimer.pid === window.passage.id
			)
		) {
			this.startResponseTimer(timeoutOffer);
		}

		this.updateHint();
	},

	/**
	 Refreshes the helper text above the responses: the input hint when
	 a composer is showing, the regular hint otherwise — and nothing at
	 all once the player has made config.hintFadeAfter moves (they know
	 how the system works by then).
	**/

	updateHint: function() {
		if (!this.dom.hint) {
			return;
		}

		var fade = this.config.hintFadeAfter;
		var moves = this.timeline.filter(function(entry) {
			return entry.t !== 'p';
		}).length;
		var html = '';

		// the idle composer speaks for itself — no helper text over it

		if (this.dom.responses.querySelector('.chat-composer--idle')) {
			this.dom.hint.innerHTML = '';
			return;
		}

		if (!(typeof fade === 'number' && moves >= fade)) {
			var hasComposer = !!this.dom.responses.querySelector('.chat-composer');

			html =
				hasComposer && this.config.inputHint
					? this.config.inputHint
					: this.config.hint;
		}

		this.dom.hint.innerHTML = html || '';
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

		this.showDelayed(targetName, { noMove: true, follow: true });
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
			pid: window.passage ? window.passage.id : null,
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

		this.showDelayed(offer.target, { noMove: true, follow: true });
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

			story.showDelayed(targetName, { noMove: true, follow: true });
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

		var outLog = this.hotLog();

		this.applyGrouping(wrapper, outLog);
		outLog.appendChild(wrapper);
		this.noteAsideBeat(this._hotThread);

		if (this.multiThread) {
			this.bumpThreadActivity(this._hotThread);
			this.renderInbox();
		}

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

			// bare `photo` offers the whole gallery, like `photo:*` —
			// the same shorthand `location` and `input` already allow

			if (display !== 'photo' && display.indexOf(PHOTO_LINK_PREFIX) !== 0) {
				return;
			}

			var names =
				display === 'photo'
					? '*'
					: display.substring(PHOTO_LINK_PREFIX.length).trim();
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

	/**
	 Opens a chat photo fullscreen, dimming the page behind it. Focus
	 moves to the close button and returns to the photo on close.
	**/

	openLightbox: function(img) {
		this._lightboxReturnFocus = document.activeElement;
		this.dom.lightboxImg.src = img.currentSrc || img.src;
		this.dom.lightboxImg.alt = img.getAttribute('alt') || '';
		this.dom.lightbox.hidden = false;

		var close = this.dom.lightbox.querySelector('[data-lightbox-close]');

		if (close) {
			close.focus();
		}
	},

	closeLightbox: function() {
		if (this.dom.lightbox.hidden) {
			return;
		}

		this.dom.lightbox.hidden = true;
		this.dom.lightboxImg.removeAttribute('src');

		if (
			this._lightboxReturnFocus &&
			typeof this._lightboxReturnFocus.focus === 'function'
		) {
			this._lightboxReturnFocus.focus({ preventScroll: true });
		}

		this._lightboxReturnFocus = null;
	},

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

		this.showDelayed(targetName, { noMove: true, follow: true });
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
		this.buildRichContent(bubble);
		bubbles.appendChild(bubble);
		wrapper.appendChild(bubbles);
		this.applyUserProfile(wrapper);

		var status = this.attachReceipt(wrapper, bubbles, opts.receipt);

		if (opts.instant) {
			wrapper.classList.add('no-anim');
		}

		var outLog = this.hotLog();

		this.applyGrouping(wrapper, outLog);
		outLog.appendChild(wrapper);
		this.noteAsideBeat(this._hotThread);

		if (this.multiThread) {
			this.bumpThreadActivity(this._hotThread);
			this.renderInbox();
		}

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

		// a multi-bubble send staggers its bubbles slightly

		if (opts.delay) {
			wrapper.style.animationDelay = opts.delay + 'ms';
		}

		var outLog = this.hotLog();

		this.applyGrouping(wrapper, outLog);
		outLog.appendChild(wrapper);
		this.noteAsideBeat(this._hotThread);

		if (this.multiThread) {
			this.bumpThreadActivity(this._hotThread);
			this.renderInbox();
		}

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
		var wrappers = this.hotLog().querySelectorAll(
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
		var wrappers = this.hotLog().querySelectorAll(selector);

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

		this.attachReaction(wrapper, emoji);
		this.persist();
	},

	/**
	 Deletes a message the way real chat apps do: the bubble stays,
	 its content becomes a tombstone — "This message was deleted".
	 direction 'out' (the default) redacts the player's newest
	 unredacted message in the current thread; 'in' the other side's.
	 Calling it again deletes the one before, and so on. The node is
	 modified in place, never removed (removals make screen readers
	 re-announce the log), and the redaction participates in undo and
	 save/restore. An optional label overrides config.redactedLabel
	 for this one message. Returns whether a message was redacted.

	 Triggered event: `redact`, detail { direction, story }.
	**/

	redactMessage: function(direction, label) {
		var which = direction === 'in' ? 'in' : 'out';
		var selector =
			'.chat-passage-wrapper' +
			(which === 'in'
				? ':not([data-speaker="you"])'
				: '[data-speaker="you"]');
		var candidates = [];

		this.hotLog()
			.querySelectorAll(selector + ' .chat-passage')
			.forEach(function(bubble) {
				if (!bubble.classList.contains('chat-passage--redacted')) {
					candidates.push(bubble);
				}
			});

		var bubble = candidates[candidates.length - 1];

		if (!bubble) {
			return false;
		}

		this._redactionLog.push({
			bubble: bubble,
			html: bubble.innerHTML,
			className: bubble.className
		});

		this.applyRedaction(bubble, label || this.config.redactedLabel);
		this.timeline.push({
			t: 'x',
			which: which,
			l: label || undefined
		});
		dispatch('redact', { direction: which, story: this });

		if (this.multiThread) {
			this.renderInbox();
		}

		this.persist();
		return true;
	},

	/**
	 Turns a message bubble into a deleted-message tombstone in place.
	 Used by redactMessage() and by the [tombstone] directive.
	**/

	applyRedaction: function(bubble, label) {
		bubble.classList.remove('chat-passage--media');
		bubble.classList.remove('chat-passage--voice');
		bubble.classList.remove('chat-passage--location');
		bubble.classList.add('chat-passage--redacted');
		bubble.textContent = label;
	},

	/**
	 Puts a tapback badge on a message wrapper. Used by react() (which
	 also records it for undo) and by seeded reactions (which don't —
	 they're history, not moves).
	**/

	attachReaction: function(wrapper, emoji) {
		var bubbles = wrapper.querySelector('.chat-bubbles');

		if (!bubbles) {
			return;
		}

		var badge = bubbles.querySelector('.chat-reaction');

		if (!badge) {
			badge = document.createElement('span');
			badge.className = 'chat-reaction';
			badge.setAttribute('role', 'img');
			bubbles.appendChild(badge);
		}

		badge.textContent = emoji;
		badge.setAttribute('aria-label', 'Reaction: ' + emoji);
		wrapper.classList.add('has-reaction');
		this.positionReactionBadge(wrapper);
	},

	/**
	 Centers a wrapper's tapback badge on its last bubble's top corner —
	 the corner facing whoever sent the reaction. Recomputed when a
	 hidden thread log becomes visible (offsets are 0 while hidden).
	**/

	positionReactionBadge: function(wrapper) {
		var badge = wrapper.querySelector('.chat-reaction');
		var bubbleEls = wrapper.querySelectorAll('.chat-passage');
		var lastBubble = bubbleEls[bubbleEls.length - 1];

		if (!badge || !lastBubble) {
			return;
		}

		var outgoing = wrapper.getAttribute('data-speaker') === 'you';
		var x = outgoing
			? lastBubble.offsetLeft + 12
			: lastBubble.offsetLeft + lastBubble.offsetWidth - 12;

		badge.style.left = x + 'px';
		badge.style.top = lastBubble.offsetTop + 'px';
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

		this.showDelayed(targetName, { noMove: true, follow: true });
	},

	/**
	 Wipes the visible conversation — for flashbacks and scene changes.
	 Also triggered by showing a passage tagged `clear`. Story state and
	 the save timeline are untouched, but undo cannot reach back across
	 a cleared thread.
	**/

	clearThread: function(threadId) {
		var story = this;
		var cleared = threadId || this._hotThread;

		['left', 'right'].forEach(function(side) {
			story._asides[side].slice().forEach(function(aside) {
				if (aside.thread === cleared) {
					story.removeAsideEntry(side, aside);
				}
			});
		});

		this.logFor(cleared).textContent = '';
		this._currentNodes = [];
		this.checkpoints = [];
		this._reactionLog = [];
		this._redactionLog = [];
		this.dom.undo.hidden = true;

		if (this.multiThread) {
			this.renderInbox();
		}
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

	/**
	 Plays an audio file once — the [sound …] directive's engine, also
	 callable directly: story.playAudioFile('buzz.mp3'). Browsers
	 allow sound only after the player's first interaction, so a cue
	 on the very first passage may be silent.
	**/

	playAudioFile: function(src) {
		var audio = new Audio(src);

		this._cueAudio = audio; // hold a reference while it plays
		audio.play().catch(function() { /* autoplay blocked */ });
	},

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

		var iconSlot = button.querySelector('.menu-action-icon') || button;
		var labelSlot = button.querySelector('.menu-action-label');

		var updateIcon = function() {
			var dark = effectiveTheme() === 'dark';
			var label = dark ? 'Switch to light mode' : 'Switch to dark mode';

			iconSlot.innerHTML = dark ? SUN_SVG : MOON_SVG;

			if (labelSlot) {
				labelSlot.textContent = label;
			}

			button.setAttribute('title', label);
			button.setAttribute('aria-label', label);
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
		return 'subtext-theme-' + this.ifid;
	},

	/**
	 Places the story's identity (StoryTitle / StorySubtitle /
	 StoryAuthor) according to config.titlePlacement: in the chat
	 header (default), tucked into the menu dialog ('menu'), or
	 nowhere ('none' — style your own via setHeader and inject_menu).
	**/

	applyIdentity: function() {
		if (this.config.titlePlacement === 'menu') {
			var identity = byId('menu-identity');

			if (identity) {
				var html =
					'<div class="menu-identity-title">' +
					template.escapeHtml(this.name) +
					'</div>';
				var subtitle = this.passage('StorySubtitle');
				var author = this.passage('StoryAuthor');

				if (subtitle && subtitle.source.trim()) {
					html +=
						'<div class="menu-identity-sub">' +
						subtitle.source +
						'</div>';
				}

				if (author && author.source.trim()) {
					html +=
						'<div class="menu-identity-author">by ' +
						template.escapeHtml(author.source.trim()) +
						'</div>';
				}

				identity.innerHTML = html;
				identity.hidden = false;
				this.dom.menu.hidden = false;
			}
		}

		this.applyHeader();
	},

	/**
	 Renders the header's title line: the identity defaults (when
	 titlePlacement is 'header'), overridden per field by anything the
	 story has set with setHeader(). In multi-conversation stories the
	 thread screens overwrite the title with the contact's name.
	**/

	applyHeader: function() {
		var custom = this.state._header || {};
		var inHeader = this.config.titlePlacement === 'header';
		var subtitle = this.passage('StorySubtitle');
		var author = this.passage('StoryAuthor');

		if (this.dom.title) {
			this.dom.title.textContent =
				typeof custom.title === 'string'
					? custom.title
					: inHeader
						? this.name
						: '';
		}

		if (this.dom.subtitle) {
			this.dom.subtitle.innerHTML =
				typeof custom.subtitle === 'string'
					? custom.subtitle
					: inHeader && subtitle
						? subtitle.source
						: '';
		}

		if (this.dom.author) {
			this.dom.author.textContent =
				typeof custom.subtitle !== 'string' &&
				inHeader &&
				author &&
				author.source.trim() !== ''
					? ' by ' + author.source.trim()
					: '';
		}
	},

	/**
	 Repurposes the header mid-story — "Prologue", "Three years
	 earlier", an in-fiction app name. Stored in story state, so undo
	 and save/restore keep the header in step with the story:

	   story.setHeader('Prologue');
	   story.setHeader('Prologue', 'part one');
	   story.setHeader(null, 'part two');   // subtitle only

	 Pass empty strings to blank a field. A custom subtitle replaces
	 the author credit on that line.
	**/

	setHeader: function(title, subtitle) {
		var header = this.state._header || {};

		if (title !== undefined && title !== null) {
			header.title = String(title);
		}

		if (subtitle !== undefined && subtitle !== null) {
			header.subtitle = String(subtitle);
		}

		this.state._header = header;
		this.applyHeader();
	},

	/**
	 Fills the menu dialog and reveals the header's Menu button. An
	 optional second argument retitles the dialog:

	   story.setMenu('<h3>About</h3><p>…</p>', 'About');

	 (inject_menu() is the legacy Trialogue-era alias.)
	**/

	setMenu: function(html, title) {
		var container = byId('menu-container');

		if (container) {
			container.innerHTML = html;
		}

		if (this.dom && this.dom.menu) {
			this.dom.menu.hidden = false;
		}

		if (typeof title === 'string') {
			this.config.menuTitle = title;

			var heading = byId('menu-dialog-title');

			if (heading) {
				heading.textContent = title;
			}
		}
	},

	/**
	 Rewords the restart-confirmation dialog — its title, body HTML,
	 and footer buttons. (inject_modal() is the legacy alias; the
	 default buttons carry data-dialog-action="cancel" / "restart".)
	**/

	setRestartDialog: function(title, body, footer) {
		var dialog = byId('exit-dialog');

		if (!dialog) {
			return;
		}

		var apply = function(selector, html) {
			var el = dialog.querySelector(selector);

			if (el && typeof html === 'string') {
				el.innerHTML = html;
			}
		};

		apply('.modal-title', title);
		apply('.modal-body', body);
		apply('.modal-footer', footer);
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

		if (this.getAsideSide(passage)) {
			return 'aside';
		}

		var mode = this.config.metaStyle;

		if (mode === 'aside') {
			return 'aside';
		}

		return mode === 'overlay' || mode === 'notification' ? mode : 'chat';
	},

	/**
	 Which margin an aside-tagged passage belongs in, or null if it
	 isn't an aside. A bare `aside` tag (or config.metaStyle = 'aside')
	 defaults to the right margin.
	**/

	getAsideSide: function(passage) {
		if (passage.tags.indexOf('aside-left') > -1) {
			return 'left';
		}

		if (
			passage.tags.indexOf('aside-right') > -1 ||
			passage.tags.indexOf('aside') > -1 ||
			passage.tags.indexOf('meta-aside') > -1
		) {
			return 'right';
		}

		return null;
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

			// opening the inbox under the veil would strand the player
			// with nothing clickable

			this.updateInboxButton();
		}
	},

	/**
	 Dismisses any overlay or notification narration.
	**/

	hideMeta: function() {
		this.dom.metaOverlay.hidden = true;
		this.dom.metaNotification.hidden = true;
		this.updateInboxButton();
	},

	/**
	 The margin (px) available beside the phone frame. Below
	 ASIDE_MIN_MARGIN, asides float over the chat's edge instead.
	**/

	asideMargin: function() {
		var app = document.getElementById('app');

		if (!app) {
			return 0;
		}

		var rect = app.getBoundingClientRect();

		return Math.min(rect.left, window.innerWidth - rect.right);
	},

	/**
	 Presents narration as an aside: a note pinned in the margin beside
	 the phone, level with the last message, that rides along as the
	 chat scrolls and fades after a few beats. Asides are ephemeral
	 commentary — they are not replayed from saves and vanish on undo.
	**/

	showAside: function(passage, html, threadId) {
		var probe = document.createElement('div');

		probe.innerHTML = html;

		if (
			probe.textContent.trim() === '' &&
			!probe.querySelector('img, video, iframe, svg')
		) {
			return;
		}

		var side = this.getAsideSide(passage) || 'right';
		var beats = this.config.asideBeats;
		var nudge = 0;
		var hold = false;

		passage.tags.forEach(function(tag) {
			var match;

			if ((match = /^aside-beats-(\d+)$/.exec(tag))) {
				beats = parseInt(match[1], 10);
			}
			else if (tag === 'aside-hold') {
				hold = true;
			}
			else if ((match = /^aside-up-(\d+)$/.exec(tag))) {
				nudge = -parseInt(match[1], 10);
			}
			else if ((match = /^aside-down-(\d+)$/.exec(tag))) {
				nudge = parseInt(match[1], 10);
			}
		});

		// asides stack per side — a newcomer joins below any still live,
		// and each fades on its own clock (beats, holds, scrolling away)

		var el = document.createElement('div');

		el.className = 'chat-aside chat-aside--' + side;
		el.setAttribute('role', 'note');
		el.setAttribute('aria-label', 'Aside');
		el.innerHTML = html;
		this.buildRichContent(el);

		// pinned level with the message it comments on

		var anchor = this.logFor(threadId).lastElementChild || null;

		this.dom.asideLayer.appendChild(el);
		this._asides[side].push({
			el: el,
			anchor: anchor,
			thread: threadId,
			beats: hold ? Infinity : Math.max(1, beats),
			nudge: nudge
		});

		this.syncAsides();
		this.startAsideLoop();
	},

	/**
	 Fades out and removes one live aside.
	**/

	removeAsideEntry: function(side, entry) {
		var list = this._asides[side];
		var index = list.indexOf(entry);

		if (index === -1) {
			return;
		}

		list.splice(index, 1);
		entry.el.classList.add('chat-aside--out');
		window.setTimeout(function() {
			entry.el.remove();
		}, 450);
	},

	clearAsides: function() {
		var story = this;

		['left', 'right'].forEach(function(side) {
			story._asides[side].slice().forEach(function(aside) {
				story.removeAsideEntry(side, aside);
			});
		});
	},

	/**
	 A beat: a new message landed in a conversation. Live asides in
	 that conversation age by one and fade once their beats run out.
	**/

	noteAsideBeat: function(threadId) {
		var story = this;

		['left', 'right'].forEach(function(side) {
			story._asides[side].slice().forEach(function(aside) {
				if (aside.thread === threadId) {
					aside.beats -= 1;

					if (aside.beats <= 0) {
						story.removeAsideEntry(side, aside);
					}
				}
			});
		});
	},

	/**
	 Positions live asides against their anchor message: in the margin
	 beside the phone when there's room, floating over the chat's edge
	 when there isn't. Runs every frame while asides exist (anchors
	 move constantly — smooth scrolling, entrance animations).
	**/

	syncAsides: function() {
		var story = this;
		var app = document.getElementById('app');

		if (!app) {
			return;
		}

		var appRect = app.getBoundingClientRect();
		var margin = Math.min(
			appRect.left,
			window.innerWidth - appRect.right
		);
		var over = margin < ASIDE_MIN_MARGIN;
		var panelRect = this.dom.panel.getBoundingClientRect();

		['left', 'right'].forEach(function(side) {
			var prevBottom = null;

			story._asides[side].slice().forEach(function(aside) {
				// the message it commented on is gone (undo, clear-thread)

				if (aside.anchor && !aside.anchor.isConnected) {
					story.removeAsideEntry(side, aside);
					return;
				}

				var el = aside.el;

				// hidden while another conversation or the inbox is on screen

				var visible = !story.multiThread ||
					(story._screen === 'thread' &&
						story._viewedThread === aside.thread);

				el.classList.toggle('chat-aside--hidden', !visible);

				if (!visible) {
					return;
				}

				el.classList.toggle('chat-aside--over', over);

				var top = aside.anchor
					? aside.anchor.getBoundingClientRect().top
					: panelRect.top + 12;

				top += aside.nudge * 16;

				// it followed its message off the top of the screen: done

				if (top + el.offsetHeight < panelRect.top + 4) {
					story.removeAsideEntry(side, aside);
					return;
				}

				top = Math.min(top, panelRect.bottom - el.offsetHeight - 8);

				// stack below any earlier aside on this side rather
				// than overlapping it

				if (prevBottom !== null && top < prevBottom + 8) {
					top = prevBottom + 8;
				}

				el.style.top = top + 'px';
				prevBottom = top + el.offsetHeight;

				if (over) {
					// no margin: hug the phone's inner edge, over the chat

					el.style.maxWidth =
						Math.min(appRect.width * 0.64, 250) + 'px';

					if (side === 'left') {
						el.style.left = (appRect.left + 10) + 'px';
						el.style.right = 'auto';
					}
					else {
						el.style.right =
							(window.innerWidth - appRect.right + 10) + 'px';
						el.style.left = 'auto';
					}
				}
				else {
					var gap = 14;

					el.style.maxWidth =
						Math.min(margin - gap * 2, 270) + 'px';

					if (side === 'left') {
						el.style.right =
							(window.innerWidth - appRect.left + gap) + 'px';
						el.style.left = 'auto';
					}
					else {
						el.style.left = (appRect.right + gap) + 'px';
						el.style.right = 'auto';
					}
				}
			});
		});
	},

	startAsideLoop: function() {
		if (this._asideRaf) {
			return;
		}

		var story = this;
		var tick = function() {
			if (!story._asides.left.length && !story._asides.right.length) {
				story._asideRaf = null;
				return;
			}

			story.syncAsides();
			story._asideRaf = window.requestAnimationFrame(tick);
		};

		this._asideRaf = window.requestAnimationFrame(tick);
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
			// surface errors wherever the player is looking

			var errorLog =
				this.multiThread && this._viewedThread
					? this.logFor(this._viewedThread)
					: this.hotLog();

			errorLog.appendChild(meta);
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
			logCounts: this.logCounts(),
			hotThread: this._hotThread,
			viewedThread: this._viewedThread,
			screen: this._screen,
			unread: deepClone(this.unread),
			threadActivity: deepClone(this._threadActivity),
			threadArchived: deepClone(this._threadArchived),
			activitySeq: this._activitySeq,
			timelineLength: this.timeline.length,
			passageId: window.passage ? window.passage.id : null,
			links: window.passage ? window.passage.links.slice() : [],
			lastReceipt: lastReceipt,
			meta: meta,
			reactionLogLength: this._reactionLog.length,
			redactionLogLength: this._redactionLog.length
		});

		this.dom.undo.hidden = !this.config.undoButton;

		// how long the player deliberated, in seconds — recorded on
		// every response (a checkpoint is pushed exactly when one is
		// applied). Set after the state snapshot above, so undo also
		// rewinds it.

		this.state.replySeconds = this._responsesShownAt
			? Math.round((Date.now() - this._responsesShownAt) / 100) / 10
			: null;
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
		this.clearAsides();
		this.clearUserResponses();
		this._preShownStamps = null;
		this.clearBanners();

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

		// un-delete messages redacted since the checkpoint

		while (
			this._redactionLog.length > (checkpoint.redactionLogLength || 0)
		) {
			var redaction = this._redactionLog.pop();

			redaction.bubble.innerHTML = redaction.html;
			redaction.bubble.className = redaction.className;
		}

		if (this.multiThread && checkpoint.logCounts) {
			var story = this;

			Object.keys(this._threadLogs).forEach(function(id) {
				var log = story._threadLogs[id];
				var keep = checkpoint.logCounts[id] || 0;

				while (log.children.length > keep) {
					log.lastElementChild.remove();
				}

				if (log.lastElementChild) {
					log.lastElementChild.classList.remove('has-follow');
				}
			});

			this._hotThread = checkpoint.hotThread;
			this.unread = checkpoint.unread || {};
			this._threadActivity = checkpoint.threadActivity || {};
			this._threadArchived = checkpoint.threadArchived || {};
			this._activitySeq = checkpoint.activitySeq || 0;
			this.setThreadTyping(null);
		}
		else {
			var history = this.dom.history;

			while (history.children.length > checkpoint.domCount) {
				history.lastElementChild.remove();
			}

			if (history.lastElementChild) {
				history.lastElementChild.classList.remove('has-follow');
			}
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

		// the header follows the restored state (thread screens
		// overwrite the title again below in multi mode)

		this.applyHeader();

		// restore the screen last, so re-offered responses use the
		// checkpoint's links (openThread renders them itself)

		if (this.multiThread && checkpoint.logCounts) {
			if (checkpoint.screen === 'inbox') {
				this.openInbox();
			}
			else if (checkpoint.screen === 'trash') {
				this.openTrash();
			}
			else {
				this.openThread(
					checkpoint.viewedThread || this._hotThread,
					{ silent: true }
				);
			}
		}
		else {
			this.showUserResponses();
		}

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
			(window.passage.tags.indexOf('End') > -1 ||
				window.passage.tags.indexOf('end') > -1) &&
			this.passage('StoryColophon') !== null
		) {
			var meta = document.createElement('div');

			meta.className = 'meta-passage meta-passage--colophon';
			meta.innerHTML = this.passage('StoryColophon').render();
			this.hotLog().appendChild(meta);
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

	/* == Multiple conversations ============================================

	 Declared via a StoryThreads passage (same line syntax as
	 StorySpeakers). Passages tagged thread-<id> belong to that thread;
	 untagged passages inherit the thread the story is currently in, so
	 single-thread stories never think about any of this.
	*/

	parseThreads: function() {
		var story = this;
		var threads = {};
		var threadsPassage = this.passage('StoryThreads');

		this.threadOrder = [];

		if (threadsPassage) {
			threadsPassage.source.split(/\r?\n/).forEach(function(line) {
				var match = line.match(/^\s*[-*]?\s*([\w][\w-]*)\s*:\s*(.+)$/);

				if (!match) {
					return;
				}

				var profile = {};

				match[2].split(';').forEach(function(part) {
					var kv = part.match(
						/^\s*(name|avatar|color|hidden|archived|members)\s*:\s*(.+?)\s*$/
					);

					if (kv) {
						profile[kv[1]] = kv[2];
					}
					else if (part.trim()) {
						profile.name = part.trim();
					}
				});

				// members makes a thread a group chat: speaker ids,
				// comma-separated. They appear under the header title
				// and as a clustered inbox avatar.

				if (typeof profile.members === 'string') {
					profile.members = profile.members
						.split(',')
						.map(function(id) { return id.trim(); })
						.filter(function(id) { return id !== ''; });
				}

				// hidden threads stay out of the inbox until their
				// first message arrives (or story.revealThread(id))

				profile.hidden =
					String(profile.hidden).toLowerCase() === 'true';

				// archived threads start in the Trash

				profile.archived =
					String(profile.archived).toLowerCase() === 'true';

				threads[match[1]] = profile;
				story.threadOrder.push(match[1]);
			});
		}

		return threads;
	},

	getThreadProfile: function(id) {
		return this.threads[id] || {};
	},

	getThreadDisplayName: function(id) {
		var profile = this.getThreadProfile(id);

		return profile.name || String(id).replace(/-+/g, ' ').trim();
	},

	/**
	 The thread a passage belongs to: its thread-<id> tag, else the
	 thread the story is currently in.
	**/

	getPassageThread: function(passage) {
		var tag = passage.tags.find(function(t) {
			return t.indexOf('thread-') === 0;
		});

		if (tag) {
			return tag.substring(7);
		}

		return this._hotThread || this.threadOrder[0] || null;
	},

	/**
	 The log element for a thread (the single shared log outside
	 multi-conversation mode). Unknown thread ids get a log and a
	 default profile on first use.
	**/

	logFor: function(threadId) {
		if (!this.multiThread) {
			return this.dom.history;
		}

		// before the story lands anywhere (e.g. during seeding), a
		// null thread means "the first one" — never a thread literally
		// named null

		if (threadId == null) {
			threadId = this._hotThread || this.threadOrder[0];
		}

		if (!this._threadLogs[threadId]) {
			this.createThreadLog(threadId);
		}

		return this._threadLogs[threadId];
	},

	hotLog: function() {
		return this.logFor(this._hotThread);
	},

	/**
	 Child counts of every log, for undo checkpoints.
	**/

	logCounts: function() {
		var story = this;
		var counts = {};

		Object.keys(this._threadLogs).forEach(function(id) {
			counts[id] = story._threadLogs[id].children.length;
		});

		return counts;
	},

	/**
	 Empties the response panel WITHOUT cancelling a running response
	 timer — used when the player merely switches screens (the clock,
	 if any, keeps running on the live conversation).
	**/

	clearUserResponsesDisplay: function() {
		this.dom.responses.textContent = '';
	},

	/**
	 A disabled composer for threads the story isn't in: diegetic
	 "read-only" — the message field is there, you just have nothing
	 to say. Placeholder text via config.threadIdleHint ('' disables).
	**/

	renderIdleComposer: function() {
		if (!this.config.threadIdleHint) {
			this.updateHint();
			return;
		}

		var shell = document.createElement('div');

		shell.className = 'chat-composer chat-composer--idle';

		var field = document.createElement('input');

		field.type = 'text';
		field.className = 'chat-composer-input';
		field.disabled = true;
		field.placeholder = this.config.threadIdleHint;
		field.setAttribute('aria-label', this.config.threadIdleHint);
		shell.appendChild(field);
		this.dom.responses.appendChild(shell);
		this.updateHint();
	},

	createThreadLog: function(threadId) {
		if (this.threadOrder.indexOf(threadId) === -1) {
			this.threadOrder.push(threadId);
		}

		var log = document.createElement('div');

		log.className = 'thread-log';
		log.setAttribute('role', 'log');
		log.setAttribute(
			'aria-label',
			'Conversation with ' + this.getThreadDisplayName(threadId)
		);
		log.setAttribute('data-thread', threadId);
		log.hidden = true;
		this.dom.history.appendChild(log);
		this._threadLogs[threadId] = log;

		if (!(threadId in this.unread)) {
			this.unread[threadId] = 0;
		}

		return log;
	},

	/**
	 Turns multi-conversation mode on: the shared log becomes a stack of
	 per-thread logs and the inbox becomes reachable. Runs after story
	 JavaScript so scripts may add threads too.
	**/

	initThreads: function() {
		this.multiThread = this.threadOrder.length > 0;

		if (!this.multiThread) {
			return;
		}

		var story = this;

		// the parent container stops being a live region itself; each
		// thread log is its own

		this.dom.history.removeAttribute('role');
		this.dom.history.removeAttribute('aria-label');

		this.threadOrder.slice().forEach(function(id) {
			story.createThreadLog(id);

			if (story.getThreadProfile(id).archived) {
				story._threadArchived[id] = true;
			}
		});

		this.dom.inboxButton.addEventListener('click', function() {
			// the chevron goes back the way the player came: a thread
			// opened from the Trash returns to the Trash

			if (
				story._screen === 'thread' &&
				story._threadOrigin === 'trash'
			) {
				story.openTrash();
			}
			else {
				story.openInbox();
			}
		});

		document.body.classList.add('has-threads');
	},

	bumpThreadActivity: function(threadId) {
		this._activitySeq += 1;
		this._threadActivity[threadId] = this._activitySeq;

		// anything happening in an archived thread pulls it out of the
		// Trash — except seeds, which are history, not happenings

		if (this._threadArchived[threadId] && !this._seeding) {
			this.restoreThread(threadId);
		}
	},

	/**
	 Surfaces a hidden thread in the inbox without sending it anything.
	 (A thread also reveals itself the moment any message lands in it.)
	 Reveal state rides on thread activity, so undo and save/restore
	 handle it like everything else.
	**/

	revealThread: function(threadId) {
		this.bumpThreadActivity(threadId);
		this.renderInbox();
	},

	/**
	 Removes a conversation from the inbox entirely — not the Trash,
	 just gone, as if it had never spoken. The inverse of
	 revealThread(): the thread is marked hidden and its activity is
	 cleared, so the same rule that kept it out of the inbox before
	 its first message keeps it out again. The transcript is kept:
	 any message landing in the thread later (a [deliver], the story
	 moving there, revealThread) brings it back, history intact —
	 and so does undoing past the conceal, since reveal state rides
	 on thread activity.

	 Call it from a passage template so it replays on save/restore
	 (like renameThread), and call it from a passage OUTSIDE the
	 thread being concealed — a message landing in a concealed
	 conversation reveals it again, so a passage cannot conceal its
	 own thread. Don't conceal the conversation holding the story's
	 pending choices; the player would have no way to reach them.

	 Triggered event: `threadconcealed`, detail { thread, story }.
	**/

	concealThread: function(threadId) {
		if (!this.multiThread) {
			return;
		}

		if (!this.threads[threadId]) {
			this.threads[threadId] = {};
		}

		this.threads[threadId].hidden = true;
		delete this._threadActivity[threadId];
		this.unread[threadId] = 0;

		if (this._typingThread === threadId) {
			this.setThreadTyping(null);
		}

		// notifications inviting the player into a concealed
		// conversation would lead nowhere

		var story = this;

		this._banners.slice().forEach(function(entry) {
			if (entry.threadId === threadId) {
				story.dismissBanner(entry);
			}
		});
		this._bannerQueue = this._bannerQueue.filter(function(entry) {
			return entry.threadId !== threadId;
		});

		['left', 'right'].forEach(function(side) {
			story._asides[side].slice().forEach(function(aside) {
				if (aside.thread === threadId) {
					story.removeAsideEntry(side, aside);
				}
			});
		});

		// never strand the player inside a conversation that no
		// longer exists

		if (this._screen === 'thread' && this._viewedThread === threadId) {
			this.openInbox();
		}
		else {
			this.renderInbox();
		}

		dispatch('threadconcealed', { thread: threadId, story: this });
	},

	/**
	 Renames a conversation mid-story: the inbox row, the thread
	 header, and notification banners all use the new name from here
	 on. Pairs with a [system …] chip announcing the rename. Called
	 from a passage template, the rename replays with the passage on
	 save/restore; undo does not revert it.

	 Triggered event: `threadrenamed`, detail { thread, name, story }.
	**/

	renameThread: function(threadId, name) {
		if (!this.threads[threadId]) {
			this.threads[threadId] = {};
		}

		this.threads[threadId].name = name;

		if (this.multiThread) {
			this.renderInbox();

			if (
				this._screen === 'thread' &&
				this._viewedThread === threadId
			) {
				this.applyThreadHeader(threadId);
			}
		}

		dispatch('threadrenamed', {
			thread: threadId,
			name: name,
			story: this
		});
	},

	/**
	 Moves a conversation to the Trash: out of the main inbox, still
	 readable (and openable) under the inbox's Trash section, never
	 deleted. Any message later landing in the thread recovers it
	 automatically, or call restoreThread(id). Declare a thread
	 `archived: true` in StoryThreads to start it in the Trash.
	**/

	archiveThread: function(threadId) {
		if (!this.multiThread || !this._threadLogs[threadId]) {
			return;
		}

		this._threadArchived[threadId] = true;
		this.renderInbox();
		this.persist();
		dispatch('threadarchived', { thread: threadId, story: this });
	},

	/**
	 Recovers a conversation from the Trash.
	**/

	restoreThread: function(threadId) {
		if (!this._threadArchived[threadId]) {
			return;
		}

		delete this._threadArchived[threadId];
		this.renderInbox();
		this.persist();
		dispatch('threadrestored', { thread: threadId, story: this });
	},

	/**
	 Renders the passages tagged `seed` into their threads: the old,
	 already-read messages a real inbox would hold at story start.
	 Seeds render instantly and silently — no unread badges, banners,
	 sounds, or timeline entries — and alternate speakers freely (a
	 passage tagged [thread-dad speaker-you seed] is an old message the
	 player "sent"). Order follows passage order in the story.
	**/

	seedThreads: function() {
		if (!this.multiThread) {
			return;
		}

		var story = this;

		this._seeding = true;

		this.passages.forEach(function(passage) {
			if (!passage || passage.tags.indexOf('seed') === -1) {
				return;
			}

			var threadId = story.getPassageThread(passage);
			var log = story.logFor(threadId);
			var previousPassage = window.passage;

			window.passage = passage;
			passage.links = [];

			var html;

			try {
				html = passage.render();
			}
			catch (error) {
				window.passage = previousPassage;
				story.showError(
					story.errorMessage.replace('%s', error.message)
				);
				return;
			}

			window.passage = previousPassage;

			// a [react …] in a seed is an old tapback: it lands on the
			// previous seeded message from the other side, once that
			// message is in the log. [deliver …] means nothing in
			// history and is dropped.

			var reactions = [];

			html = html
				.replace(
					/<div class="chat-react" data-emoji="([^"]*)"><\/div>/g,
					function(match, emoji) {
						reactions.push(template.unescapeHtml(emoji));
						return '';
					}
				)
				.replace(
					/<div class="chat-deliver" data-passage="[^"]*"><\/div>/g,
					''
				);

			var speaker = story.getPassageSpeaker(passage);
			var nodes = story.buildPassageElement(passage, speaker, html);

			nodes.forEach(function(node) {
				node.classList.add('no-anim');
				node.classList.add('is-history');
				story.applyGrouping(node, log);
				log.appendChild(node);
			});

			reactions.forEach(function(emoji) {
				var selector =
					speaker === 'you'
						? '.chat-passage-wrapper:not([data-speaker="you"])'
						: '.chat-passage-wrapper[data-speaker="you"]';
				var targets = log.querySelectorAll(selector);
				var target = targets[targets.length - 1];

				if (target) {
					story.attachReaction(target, emoji);
				}
			});

			// a seeded player message honors the receipt tags: `unread`
			// leaves it on Delivered, `failed` on Not Delivered, `read`
			// on Read — an old message that never got an answer

			if (speaker === 'you') {
				var status =
					passage.tags.indexOf('failed') > -1
						? 'failed'
						: passage.tags.indexOf('unread') > -1
							? 'delivered'
							: passage.tags.indexOf('read') > -1
								? 'read'
								: null;

				if (status) {
					var wrapper = nodes.find(function(node) {
						return node.classList.contains(
							'chat-passage-wrapper'
						);
					});

					if (wrapper) {
						story.attachReceipt(
							wrapper,
							wrapper.querySelector('.chat-bubbles'),
							{ status: status }
						);
					}
				}
			}

			// old messages order the inbox (and reveal their thread)
			// but are already read: no badge, no banner

			story.bumpThreadActivity(threadId);
		});

		this._seeding = false;
		this.renderInbox();
	},

	/**
	 The inbox chevron shows only when there is somewhere for it to go
	 and nothing in the way: multi-conversation mode, on a thread
	 screen, no narration overlay up (opening the inbox under the veil
	 strands the player), and not switched off by config.inboxButton.
	**/

	updateInboxButton: function() {
		if (!this.dom || !this.dom.inboxButton) {
			return;
		}

		this.dom.inboxButton.hidden = !(
			this.multiThread &&
			(this._screen === 'thread' || this._screen === 'trash') &&
			this.dom.metaOverlay.hidden &&
			this.config.inboxButton
		);
	},

	/**
	 Reveals the inbox chevron mid-story — e.g. after an opening scene
	 that should feel like a single conversation:

	   <% story.showInboxButton() %>
	**/

	showInboxButton: function() {
		this.config.inboxButton = true;
		this.updateInboxButton();
	},

	hideInboxButton: function() {
		this.config.inboxButton = false;
		this.updateInboxButton();
	},

	/**
	 Shows a thread's conversation.
	**/

	openThread: function(threadId, opts) {
		if (!this.multiThread) {
			return;
		}

		opts = opts || {};

		var story = this;
		var log = this.logFor(threadId);

		if (this._viewedThread && this._threadLogs[this._viewedThread]) {
			this._threadLogs[this._viewedThread].hidden = true;
		}

		// remember where the player came from, so the header chevron
		// can take them back there (a Trash thread returns to the
		// Trash)

		this._threadOrigin = this._screen === 'trash' ? 'trash' : 'inbox';

		this._screen = 'thread';
		this._viewedThread = threadId;
		log.hidden = false;
		this.dom.inbox.hidden = true;
		document.body.classList.remove('screen-inbox');

		// tapback badges placed while this log was hidden (seeds,
		// cross-thread reactions) had no geometry to measure — fix
		// their positions now that the log is actually rendered

		log.querySelectorAll('.has-reaction').forEach(function(wrapper) {
			story.positionReactionBadge(wrapper);
		});
		this.updateInboxButton();
		this.applyThreadHeader(threadId);
		this.unread[threadId] = 0;
		this.renderInbox();

		// typing indicator belongs to whichever thread is being typed in

		this.dom.typing.hidden = this._typingThread !== threadId ||
			this._typingThread === null;

		// re-offer pending responses when returning to the live thread;
		// parked threads get a grayed-out composer instead — you can
		// read, but you have nothing to say here right now

		this.clearUserResponsesDisplay();

		if (this._viewedThread === this._hotThread && window.passage) {
			this.showUserResponses();
		}
		else {
			this.renderIdleComposer();
		}

		// a conversation always opens at its newest messages — quiet
		// deliveries land at the bottom, and a remembered mid-scroll
		// position would hide them

		window.requestAnimationFrame(function() {
			story.dom.panel.scrollTop = story.dom.panel.scrollHeight;
		});

		/**
		 Triggered when the player opens a conversation — the
		 navigational counterpart to `choice`. Fires for inbox taps,
		 banner taps, chevron navigation, and the story pulling the
		 player into a thread; it does NOT fire while a save or
		 checkpoint is being rebuilt (pass { silent: true }), so a
		 reload never re-announces the thread the player was viewing.
		 detail: { thread, story }.
		**/

		if (!opts.silent) {
			dispatch('threadopened', { thread: threadId, story: this });
		}
	},

	/**
	 Moves the view to the thread a player-chosen passage belongs to.
	 Tapping a pill that advances the story into another conversation
	 pulls the player along with the cursor — unlike autonomous
	 arrivals ([deliver], chains), which raise a notification instead.
	**/

	followTargetThread: function(passage) {
		if (!this.multiThread) {
			return;
		}

		var threadId = this.getPassageThread(passage);

		if (this._screen !== 'thread' || this._viewedThread !== threadId) {
			this.openThread(threadId);
		}
	},

	/**
	 Shows the inbox: every conversation with previews and unread
	 badges, most recent first.
	**/

	openInbox: function() {
		if (!this.multiThread) {
			return;
		}

		if (this._viewedThread && this._threadLogs[this._viewedThread]) {
			this._threadLogs[this._viewedThread].hidden = true;
		}

		this._screen = 'inbox';
		this._viewedThread = null;
		this.dom.typing.hidden = true;
		this.dom.inbox.hidden = false;
		this.updateInboxButton();
		document.body.classList.add('screen-inbox');
		this.clearThreadSubtitle();
		this.dom.title.textContent = this.name;
		this.renderInbox();
		this.dom.panel.scrollTop = 0;
	},

	/**
	 Opens the Trash: its own screen of archived conversations, still
	 readable. The header chevron returns to the inbox, and a thread
	 opened from here returns to the Trash.
	**/

	openTrash: function() {
		if (!this.multiThread) {
			return;
		}

		if (this._viewedThread && this._threadLogs[this._viewedThread]) {
			this._threadLogs[this._viewedThread].hidden = true;
		}

		this._screen = 'trash';
		this._viewedThread = null;
		this.dom.typing.hidden = true;
		this.dom.inbox.hidden = false;
		this.updateInboxButton();
		document.body.classList.add('screen-inbox');
		this.clearThreadSubtitle();
		this.dom.title.textContent = this.config.trashLabel;
		this.renderInbox();
		this.dom.panel.scrollTop = 0;
	},

	/**
	 Sets the header for a thread screen: the contact's name, and — in
	 a group chat (a thread with declared members) — who's in it,
	 where the subtitle usually sits.
	**/

	applyThreadHeader: function(threadId) {
		var story = this;
		var members = this.getThreadProfile(threadId).members || [];

		if (members.length) {
			this.dom.subtitle.textContent = members
				.map(function(id) {
					return story.getSpeakerDisplayName(id);
				})
				.join(', ');
			this.dom.author.textContent = '';
			this._threadSubtitle = true;
		}
		else {
			this.clearThreadSubtitle();
		}

		this.dom.title.textContent = this.getThreadDisplayName(threadId);
	},

	/**
	 Restores the identity subtitle after a group-chat screen replaced
	 it with the member list.
	**/

	clearThreadSubtitle: function() {
		if (this._threadSubtitle) {
			this._threadSubtitle = false;
			this.applyHeader();
		}
	},

	/**
	 Rebuilds the inbox rows.
	**/

	renderInbox: function() {
		if (!this.multiThread || !this.dom.inboxList) {
			return;
		}

		var story = this;
		var ordered = this.threadOrder.slice().sort(function(a, b) {
			return (story._threadActivity[b] || 0) -
				(story._threadActivity[a] || 0);
		});

		this.dom.inboxList.textContent = '';

		var buildRow = function(id, trashed) {
			var profile = story.getThreadProfile(id);
			var row = document.createElement('li');
			var button = document.createElement('button');

			button.type = 'button';
			button.className = 'inbox-row';

			var avatar = document.createElement('div');

			avatar.className = 'chat-avatar inbox-avatar';
			avatar.setAttribute('aria-hidden', 'true');
			avatar.style.setProperty('--avatar-hue', story.speakerHue(id));

			if (profile.members && profile.members.length > 1) {
				// a group chat gets a cluster of its first two members

				avatar.classList.add('inbox-avatar--group');

				profile.members.slice(0, 2).forEach(function(memberId, i) {
					var mini = document.createElement('div');
					var member = story.getSpeakerProfile(memberId);

					mini.className = 'inbox-avatar-mini';
					mini.style.setProperty(
						'--avatar-hue',
						story.speakerHue(memberId)
					);

					if (member.avatar) {
						mini.classList.add('chat-avatar--img');
						mini.style.backgroundImage =
							'url("' + member.avatar + '")';
					}
					else {
						if (member.color) {
							mini.style.backgroundColor = member.color;
						}

						mini.textContent = story
							.getSpeakerDisplayName(memberId)
							.charAt(0)
							.toUpperCase();
					}

					avatar.appendChild(mini);
				});
			}
			else if (profile.avatar) {
				avatar.classList.add('chat-avatar--img');
				avatar.style.backgroundImage = 'url("' + profile.avatar + '")';
			}
			else {
				if (profile.color) {
					avatar.style.backgroundColor = profile.color;
				}

				avatar.textContent = story
					.getThreadDisplayName(id)
					.charAt(0)
					.toUpperCase();
			}

			var body = document.createElement('div');

			body.className = 'inbox-body';

			var nameEl = document.createElement('div');

			nameEl.className = 'inbox-name';
			nameEl.textContent = story.getThreadDisplayName(id);

			var preview = document.createElement('div');

			preview.className = 'inbox-preview';

			if (story._typingThread === id) {
				preview.textContent = 'typing…';
				preview.classList.add('inbox-preview--typing');
			}
			else {
				// the last bubble of the last message group; receipts and
				// [system] chips are divs too, so :last-of-type lies here

				var log = story._threadLogs[id];
				var wrappers = log
					? log.querySelectorAll('.chat-passage-wrapper')
					: [];
				var lastWrapper = wrappers.length
					? wrappers[wrappers.length - 1]
					: null;
				var bubbles = lastWrapper
					? lastWrapper.querySelectorAll('.chat-passage')
					: [];
				var last = bubbles.length
					? bubbles[bubbles.length - 1]
					: null;

				// group threads name the sender, like a real phone

				var sender = lastWrapper
					? story.senderPrefix(
							id,
							lastWrapper.getAttribute('data-speaker')
						)
					: '';

				preview.textContent = last
					? sender + story.messagePreview(last).slice(0, 80)
					: '';
			}

			body.appendChild(nameEl);
			body.appendChild(preview);
			button.appendChild(avatar);
			button.appendChild(body);

			var count = story.unread[id] || 0;

			if (count > 0) {
				var badge = document.createElement('span');

				badge.className = 'inbox-badge';
				badge.textContent = count > 9 ? '9+' : count;
				badge.setAttribute(
					'aria-label',
					count + ' unread message' + (count === 1 ? '' : 's')
				);
				button.appendChild(badge);
			}

			// wayfinding: the conversation holding the story's pending
			// choices gets a quiet "your turn" row treatment — an
			// accent edge and a faint tint, no icon

			if (
				story.config.replyIndicator &&
				!trashed &&
				id === story._hotThread &&
				window.passage &&
				window.passage.links.length > 0
			) {
				button.classList.add('inbox-row--turn');

				var turnLabel = document.createElement('span');

				turnLabel.className = 'visually-hidden';
				turnLabel.textContent = story.config.replyIndicatorLabel;
				button.appendChild(turnLabel);
			}

			button.addEventListener('click', function() {
				story.openThread(id);
			});

			if (trashed) {
				button.classList.add('inbox-row--trash');
			}

			row.appendChild(button);
			story.dom.inboxList.appendChild(row);
		};

		// hidden threads that never spoke appear nowhere — not even in
		// the Trash

		var visible = ordered.filter(function(id) {
			var profile = story.getThreadProfile(id);

			return !(profile.hidden && !story._threadActivity[id]);
		});

		var trashed = visible.filter(function(id) {
			return story._threadArchived[id];
		});

		// the Trash is its own screen; recovering its last thread
		// bounces the player back to the inbox

		if (this._screen === 'trash') {
			if (trashed.length === 0) {
				this.openInbox();
				return;
			}

			trashed.forEach(function(id) { buildRow(id, true); });
			return;
		}

		visible
			.filter(function(id) { return !story._threadArchived[id]; })
			.forEach(function(id) { buildRow(id, false); });

		// the inbox ends with a doorway to the Trash when there's
		// anything in it

		if (trashed.length > 0) {
			var trashRow = document.createElement('li');
			var trashButton = document.createElement('button');

			trashButton.type = 'button';
			trashButton.className = 'inbox-trash-toggle';
			trashButton.innerHTML =
				'<span class="inbox-trash-icon" aria-hidden="true">🗑</span>' +
				'<span></span>' +
				'<span class="inbox-trash-count"></span>';
			trashButton.children[1].textContent = this.config.trashLabel;
			trashButton.querySelector('.inbox-trash-count').textContent =
				trashed.length;
			trashButton.addEventListener('click', function() {
				story.openTrash();
			});
			trashRow.appendChild(trashButton);
			this.dom.inboxList.appendChild(trashRow);
		}
	},

	/**
	 Records a message landing in a thread: bumps activity ordering and,
	 if the player is looking elsewhere, the unread badge — plus a
	 tap-to-open notification banner.
	**/

	/**
	 The human text of a rendered passage, for banner and inbox
	 previews: chips ([timestamp], [system]) and directive leftovers
	 are dropped — a notification shows the message, not its furniture.
	**/

	previewText: function(html) {
		var probe = document.createElement('div');

		probe.innerHTML = html;
		probe
			.querySelectorAll(
				'.chat-timestamp, .chat-system, .chat-react, ' +
					'.chat-deliver, .chat-sound, .chat-then'
			)
			.forEach(function(el) {
				el.remove();
			});

		return this.messagePreview(probe);
	},

	/**
	 A human preview of a message element (or probe): its text, or a
	 media placeholder — "📷 Photo" — when it has none. Voice memos and
	 location cards always use their placeholder (their rendered
	 players contain incidental text, like a duration label). Labels
	 via config.previewLabels.
	**/

	messagePreview: function(root) {
		var labels = this.config.previewLabels;

		if (root.querySelector('.chat-voice')) {
			return labels.voice;
		}

		if (root.querySelector('.chat-location')) {
			return labels.location;
		}

		if (root.querySelector('.chat-tombstone')) {
			return this.config.redactedLabel;
		}

		var text = root.textContent.trim().replace(/\s+/g, ' ');

		if (text) {
			return text;
		}

		if (root.querySelector('img, video')) {
			return labels.photo;
		}

		return '';
	},

	noteThreadMessage: function(threadId, previewText, instant, speaker, quiet) {
		if (!this.multiThread) {
			return;
		}

		this.bumpThreadActivity(threadId);

		var viewingIt = this._screen === 'thread' &&
			this._viewedThread === threadId;

		if (!viewingIt && !instant) {
			this.unread[threadId] = (this.unread[threadId] || 0) + 1;

			// quiet deliveries keep the unread badge but skip the
			// banner: the message arrived off-screen, in story time

			if (this.config.threadNotifications && previewText && !quiet) {
				// in a group thread the notification names the sender,
				// like a real phone: "Family" up top, "Matt: …" below

				var sender = this.senderPrefix(threadId, speaker);

				this.showThreadBanner(threadId, sender + previewText);
			}
		}

		this.renderInbox();
	},

	/**
	 "Name: " to prefix a message preview with, when the sender is not
	 who the thread is named for (a group chat); '' otherwise.
	**/

	senderPrefix: function(threadId, speaker) {
		if (!speaker || speaker === 'you') {
			return '';
		}

		var name = this.getSpeakerDisplayName(speaker);

		if (!name) {
			return '';
		}

		// group chats always name the sender; elsewhere only when the
		// sender is not who the thread is named for

		var members = this.getThreadProfile(threadId).members;

		if (members && members.length) {
			return name + ': ';
		}

		if (name === this.getThreadDisplayName(threadId)) {
			return '';
		}

		return name + ': ';
	},

	/**
	 A notification banner announcing a message in another thread;
	 tapping it opens that conversation.
	**/

	showThreadBanner: function(threadId, previewText) {
		// real notifications cut long messages off — so does this one

		var preview = previewText.trim().replace(/\s+/g, ' ');

		if (preview.length > 90) {
			preview = preview.slice(0, 89).replace(/\s+\S*$/, '') + '…';
		}

		// each message gets its own banner; they stack newest-last
		// like a notification shade, and overflow waits for a free
		// slot instead of overwriting what's on screen

		if (this._banners.length >= this.config.bannerStack) {
			this._bannerQueue.push({ threadId: threadId, preview: preview });
			return;
		}

		this.displayThreadBanner(threadId, preview);
	},

	displayThreadBanner: function(threadId, preview) {
		var story = this;
		var card = document.createElement('div');

		card.className = 'meta-notification-card meta-notification--thread';
		card.innerHTML =
			'<div class="meta-notification-header">' +
			'<span class="meta-notification-label"></span>' +
			'<span class="meta-notification-time">now</span>' +
			'<button type="button" class="meta-notification-close" ' +
			'aria-label="Dismiss notification">&times;</button>' +
			'</div>' +
			'<div class="meta-notification-body"></div>';
		card.querySelector('.meta-notification-label').textContent =
			this.getThreadDisplayName(threadId);
		card.querySelector('.meta-notification-body').textContent = preview;

		var entry = { threadId: threadId, el: card, timer: null };

		// tapping a banner is an invitation: it jumps to that
		// conversation; the × just dismisses, for keyboard and
		// screen-reader users

		card.addEventListener('click', function(event) {
			if (event.target.closest('.meta-notification-close')) {
				story.dismissBanner(entry);
				return;
			}

			if (!event.target.closest('button, a')) {
				story.dismissBanner(entry);
				story.openThread(entry.threadId);
			}
		});

		this.dom.bannerStack.appendChild(card);
		this._banners.push(entry);

		entry.timer = window.setTimeout(function() {
			story.dismissBanner(entry);
		}, this.config.bannerSeconds * 1000);
	},

	/**
	 Fades out one banner card; a queued banner takes the freed slot
	 a beat later.
	**/

	dismissBanner: function(entry) {
		var story = this;
		var index = this._banners.indexOf(entry);

		if (index === -1) {
			return;
		}

		this._banners.splice(index, 1);
		window.clearTimeout(entry.timer);
		entry.el.classList.add('banner-out');
		window.setTimeout(function() {
			entry.el.remove();
			story.pumpBanners();
		}, 350);
	},

	/**
	 Shows waiting banners while the stack has free slots.
	**/

	pumpBanners: function() {
		while (
			this._banners.length < this.config.bannerStack &&
			this._bannerQueue.length
		) {
			var next = this._bannerQueue.shift();

			this.displayThreadBanner(next.threadId, next.preview);
		}
	},

	/**
	 Removes every banner instantly — undo, restore, scene resets.
	**/

	clearBanners: function() {
		this._banners.forEach(function(entry) {
			window.clearTimeout(entry.timer);
			entry.el.remove();
		});
		this._banners = [];
		this._bannerQueue = [];
	},

	/**
	 Delivers a passage into its own thread without moving the story
	 there — the conversation the player is in keeps its choices, and
	 the other thread gains a message (and an unread badge). Available
	 as the [deliver passage name] directive or story.deliver(name).
	 A delivered passage with reply pills takes the story's pending
	 choices with it: they show when the player opens its thread.
	**/

	deliver: function(idOrName, opts) {
		if (typeof opts === 'number') {
			opts = { delay: opts };
		}

		opts = opts || {};

		var story = this;
		var passage = this.passage(idOrName);

		if (!passage) {
			this.showError(
				this.errorMessage.replace(
					'%s',
					'There is no passage to deliver named "' + idOrName + '"'
				)
			);
			return;
		}

		var run = function() {
			story.renderDelivery(passage, opts);
		};

		if (opts.instant) {
			run();
			return;
		}

		// same pacing grammar as showDelayed: an explicit delay says
		// WHEN it arrives, the target's `instant` tag says HOW (no
		// typing state); otherwise pace by message length. A `quiet`
		// target also lands at once — it happened off-screen.

		var instant =
			passage.tags.indexOf('instant') > -1 ||
			passage.tags.indexOf('quiet') > -1 ||
			passage.tags.indexOf('quiet-read') > -1;
		var delay =
			typeof opts.delay === 'number' && opts.delay >= 0
				? opts.delay
				: instant
					? 0
					: this.getPassageDelay(passage.id);

		this.timers.push(window.setTimeout(run, delay));

		if (delay > 0 && !instant && this.multiThread) {
			this.setThreadTyping(this.getPassageThread(passage));
		}
	},

	renderDelivery: function(passage, opts) {
		var threadId = this.getPassageThread(passage);
		var log = this.logFor(threadId);

		this.setThreadTyping(null);

		// render with the delivered passage as the template context,
		// collecting (and discarding) its links

		var previousPassage = window.passage;

		window.passage = passage;
		passage.links = [];

		var html;

		try {
			html = passage.render();
		}
		catch (error) {
			window.passage = previousPassage;
			this.showError(this.errorMessage.replace('%s', error.message));
			return;
		}

		window.passage = previousPassage;

		var speaker = this.getPassageSpeaker(passage);
		var story = this;

		// a `quiet` delivery happened off-screen: no arrival effects,
		// no banner — just the message waiting in its thread, unread.
		// `quiet-read` goes further: no unread badge either, as if the
		// exchange happened and was read entirely off-camera.

		var quietRead = passage.tags.indexOf('quiet-read') > -1;
		var quiet = quietRead || passage.tags.indexOf('quiet') > -1;

		// [sound …] cues play on live deliveries only

		html = html.replace(
			/<div class="chat-sound" data-src="([^"]*)"><\/div>/g,
			function(match, src) {
				if (!opts.instant && !quiet) {
					story.playAudioFile(template.unescapeHtml(src));
				}

				return '';
			}
		);

		// a [then …] chain in a delivered passage fires like a
		// showDelayed() call in one would

		html = html.replace(
			/<div class="chat-then" data-passage="([^"]*)" data-delay="([^"]*)"><\/div>/g,
			function(match, name, delay) {
				var target = template.unescapeHtml(name);

				if (delay === '') {
					story.showDelayed(target);
				}
				else {
					story.showDelayed(target, parseInt(delay, 10));
				}

				return '';
			}
		);

		var nodes = this.buildPassageElement(passage, speaker, html);

		nodes.forEach(function(node) {
			if (opts.instant || quiet) {
				node.classList.add('no-anim');
			}

			node.classList.add('is-history');
			story.applyGrouping(node, log);
			log.appendChild(node);
		});

		if (opts.record !== false) {
			this.timeline.push({ t: 'd', id: passage.id });
		}

		if (!opts.instant && !quiet && speaker && speaker !== 'you') {
			this.playSound('receive');
			this.notifyTitle();
		}

		// a delivered passage that offers reply pills carries the
		// story's pending choices with it: the next reply belongs to
		// its thread, and the pills appear when the player opens that
		// conversation. (A message-only delivery moves nothing.)

		var links = passage.links || [];

		if (links.length > 0) {
			if (previousPassage && previousPassage.name) {
				this.state.previousPassage = previousPassage.name;
			}

			window.passage = passage;
			this._hotThread = threadId;
			this.clearUserResponses();

			if (!this.multiThread || this._viewedThread === threadId) {
				this.showUserResponses();
			}
			else if (this._screen === 'thread') {
				this.renderIdleComposer();
			}
			else {
				this.updateHint();
			}
		}

		this.noteThreadMessage(
			threadId,
			this.previewText(html),
			opts.instant || quietRead,
			speaker,
			quiet
		);

		if (this._viewedThread === threadId) {
			this.scrollChatIntoView();
		}

		this.persist();
	},

	/**
	 Marks a thread as "typing" in the inbox (null clears it).
	**/

	setThreadTyping: function(threadId) {
		this._typingThread = threadId;

		if (this.multiThread) {
			this.renderInbox();
		}
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
	 Shows a passage after a delay, with a typing indicator while it is
	 "typed". The delay defaults to one proportional to the passage's
	 length (config.metaDelay for narration); pass a number as the
	 second argument — story.showDelayed('next', 2000) — to set the
	 pace yourself. A delay of 0 shows the passage instantly, with no
	 typing indicator or early timestamp.
	**/

	showDelayed: function(idOrName, opts) {
		var story = this;
		var passage = this.passage(idOrName);

		if (typeof opts === 'number') {
			opts = { delay: opts };
		}

		opts = opts || {};

		if (!passage) {
			this.show(idOrName, opts); // surfaces the error message
			return;
		}

		// a player-chosen target in another conversation pulls the view
		// there now, so the typing indicator runs where the player is
		// watching; the deferred show doesn't need to pull again (and
		// shouldn't yank a player who wandered off mid-delay)

		if (opts.follow) {
			this.followTargetThread(passage);
			opts.follow = false;
		}

		var speaker = this.getPassageSpeaker(passage);

		// the delay says WHEN the message arrives, the `instant` tag
		// says HOW: with no typing indicator. An explicit delay on an
		// instant-tagged passage is a silent wait — ten quiet seconds,
		// then the message just lands. With no explicit delay the tag
		// also means "now"; otherwise pace by message length.

		var instant = passage.tags.indexOf('instant') > -1;
		var delay =
			typeof opts.delay === 'number' && opts.delay >= 0
				? opts.delay
				: instant
					? 0
					: speaker
						? this.getPassageDelay(idOrName)
						: this.config.metaDelay;

		// on a real phone the timestamp appears before the reply does:
		// surface the passage's [timestamp ...] chips while the typing
		// dots bounce. Deferred a tick so a showDelayed() call inside a
		// passage template queues its chips *behind* that passage's own
		// bubbles instead of in front of them. (A silent wait keeps its
		// chips with the message — nothing announces what's coming.)

		if (speaker && delay > 0 && !instant) {
			this.timers.push(
				window.setTimeout(function() {
					story.preShowTimestamps(passage);
				}, 0)
			);
		}

		// and the read receipt flips when the reply is *queued* — the
		// sender read the message, then started typing — not when the
		// reply lands. Explicit unread/failed tags keep full control.

		if (
			speaker &&
			speaker !== 'you' &&
			this.config.readReceipts &&
			this.config.autoRead &&
			passage.tags.indexOf('unread') === -1 &&
			passage.tags.indexOf('failed') === -1
		) {
			var lastOutgoing = this.lastOutgoingWrapper();

			if (
				!lastOutgoing ||
				lastOutgoing.getAttribute('data-receipt') !== 'failed'
			) {
				this.markRead();
			}
		}

		if (speaker && delay > 0 && !instant && this.config.typing) {
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
	 Appends a delayed passage's [timestamp ...] chips to its thread
	 immediately, before the message "arrives"; showPassage later skips
	 rendering the same chips. Bails on labels that need the template
	 engine, and on `clear`-tagged passages (their thread is wiped at
	 arrival, which would erase a pre-shown chip).
	**/

	preShowTimestamps: function(passage) {
		if (passage.tags.indexOf('clear') > -1) {
			return;
		}

		var story = this;
		var labels = [];
		var pattern = /^[ \t]*\[timestamp[ \t]+([^\]]+)\][ \t]*$/gim;
		var match;

		while ((match = pattern.exec(passage.source))) {
			if (match[1].indexOf('<%') !== -1) {
				return;
			}

			labels.push(match[1].trim());
		}

		if (labels.length === 0) {
			return;
		}

		var threadId = this.getPassageThread(passage);
		var log = this.logFor(threadId);

		labels.forEach(function(label) {
			log.appendChild(story.buildTimestamp(label));
		});

		if (!this._preShownStamps) {
			this._preShownStamps = {};
		}

		this._preShownStamps[passage.id] = labels.length;

		var viewingIt = !this.multiThread ||
			(this._screen === 'thread' && this._viewedThread === threadId);

		if (viewingIt) {
			this.scrollChatIntoView();
		}
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
			.replace(/\[(voice|location|timestamp|system)[^\]]*\]/gi, '');

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

		if (this.multiThread) {
			var typingThread = this.getPassageThread(passage);

			this.setThreadTyping(typingThread);

			if (
				this._screen !== 'thread' ||
				this._viewedThread !== typingThread
			) {
				return; // shows as "typing…" in the inbox row instead
			}
		}

		var typing = this.dom.typing;
		var wrapper = typing.querySelector('.chat-passage-wrapper');
		var avatar = typing.querySelector('.chat-avatar');

		wrapper.setAttribute('data-speaker', speaker);

		var previous = (this.multiThread
			? this.logFor(this.getPassageThread(passage))
			: this.dom.history
		).lastElementChild;

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

		if (this._typingThread !== null) {
			this.setThreadTyping(null);
		}
	},

	/**
	 Returns a hash value representing the current story progress.
	**/

	saveHash: function() {
		var story = this;
		var timeline = this.timeline;

		// debug saves reference passages by NAME, not id: Tweego and
		// Twine renumber passage ids as the story grows, and a debug
		// autosave has to survive a `tweego -w` rebuild to keep your
		// place (restore() resolves either form)

		if (this.debug) {
			timeline = timeline.map(function(entry) {
				if ((entry.t === 'p' || entry.t === 'd') && entry.id != null) {
					var p = story.passage(entry.id);

					if (p) {
						return { t: entry.t, id: p.name };
					}
				}

				return entry;
			});
		}

		var save = {
			state: this.state,
			timeline: timeline,
			/* legacy field so old integrations reading history keep working */
			history: this.history
		};

		if (this.multiThread) {
			save.threadState = {
				unread: this.unread,
				activity: this._threadActivity,
				archived: this._threadArchived,
				seq: this._activitySeq,
				screen: this._screen,
				viewed: this._viewedThread
			};
		}

		return LZString.compressToBase64(JSON.stringify(save));
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
		return 'subtext-save-' + this.ifid;
	},

	memoryKey: function() {
		return 'subtext-memory-' + this.ifid;
	},

	/**
	 Cross-playthrough memory: values that survive restarts (and even
	 finished stories), stored per story in localStorage. Unlike `s`,
	 nothing here is touched by restart, undo, or save/restore — this
	 is for endings-seen counters, New Game+ content, and characters
	 who remember the player's previous run.

	   story.remember('ending', 'the good one');
	   story.recall('ending')            // 'the good one', next run too
	   story.recall('missing', 'fallback')
	   story.forget('ending')            // or story.forget() for all
	**/

	loadMemory: function() {
		if (this._memory === null) {
			this._memory = {};

			try {
				var raw = window.localStorage.getItem(this.memoryKey());

				if (raw) {
					this._memory = JSON.parse(raw) || {};
				}
			}
			catch (e) { /* storage unavailable or corrupt */ }
		}

		return this._memory;
	},

	remember: function(key, value) {
		var memory = this.loadMemory();

		memory[key] = value;

		try {
			window.localStorage.setItem(
				this.memoryKey(),
				JSON.stringify(memory)
			);
		}
		catch (e) { /* storage unavailable or full */ }

		return value;
	},

	recall: function(key, fallback) {
		var memory = this.loadMemory();

		return key in memory ? memory[key] : fallback;
	},

	forget: function(key) {
		var memory = this.loadMemory();

		if (key === undefined) {
			this._memory = {};
		}
		else {
			delete memory[key];
		}

		try {
			if (key === undefined) {
				window.localStorage.removeItem(this.memoryKey());
			}
			else {
				window.localStorage.setItem(
					this.memoryKey(),
					JSON.stringify(memory)
				);
			}
		}
		catch (e) { /* storage unavailable */ }
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
			this.clearAsides();
			this.clearUserResponses();
			this._preShownStamps = null;
			this.clearBanners();
			this.state = {};
			this.timeline = [];
			this.history = [];
			this.checkpoints = [];
			this._reactionLog = [];
			this._redactionLog = [];

			if (this.multiThread) {
				var storyReset = this;

				Object.keys(this._threadLogs).forEach(function(id) {
					storyReset._threadLogs[id].textContent = '';
					storyReset._threadLogs[id].setAttribute('aria-live', 'off');
					storyReset.unread[id] = 0;
				});
				this._threadActivity = {};
				this._activitySeq = 0;
				this._threadArchived = {};
				this.threadOrder.forEach(function(id) {
					if (storyReset.getThreadProfile(id).archived) {
						storyReset._threadArchived[id] = true;
					}
				});
				this.setThreadTyping(null);

				// the replay must inherit threads from the same
				// starting point as the original playthrough — not
				// from whatever thread was hot when restore was called

				var restartFrom = this.passage(this.startPassage);

				this._hotThread = null;
				this._hotThread = restartFrom
					? this.getPassageThread(restartFrom)
					: this.threadOrder[0];
				this._threadOrigin = 'inbox';

				// the wiped logs get their seed history back before
				// the timeline replays on top of it

				this.seedThreads();
			}
			else {
				this.dom.history.textContent = '';
			}

			this._currentNodes = [];
			this.dom.undo.hidden = true;

			// replaying a whole transcript would flood screen readers;
			// silence the log while it rebuilds

			this.dom.history.setAttribute('aria-live', 'off');

			var story = this;

			timeline.forEach(function(entry) {
				// a replayed passage's template re-runs its side effects,
				// re-arming any story.showDelayed() chain it started. The
				// timeline already holds everything that arrived before
				// the save, so those echoes are dropped; only the newest
				// entry's timers survive, to carry a chain that was still
				// in flight when the save was made.

				story.cancelTimers();

				// every player move gets its checkpoint back, so undo
				// keeps working across reloads (state is mid-rebuild
				// here, exactly as it was when the move was made)

				if (
					entry.t === 'u' ||
					entry.t === 'i' ||
					entry.t === 'l' ||
					entry.t === 'r'
				) {
					story.pushCheckpoint();
				}

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
				else if (entry.t === 'x') {
					// redactMessage re-records its own timeline entry
					story.redactMessage(entry.which, entry.l);
				}
				else if (entry.t === 'd') {
					var delivered = story.passage(entry.id);

					if (delivered) {
						story.renderDelivery(delivered, {
							instant: true,
							record: false
						});
					}

					story.timeline.push({
						t: 'd',
						id: delivered ? delivered.id : entry.id
					});
				}
				else {
					// debug saves store names; resolve back to the
					// current numeric id so history and hasVisited()
					// keep working

					var shown = story.passage(entry.id);
					var pid = shown ? shown.id : entry.id;

					story.show(pid, {
						record: false,
						instant: true
					});
					story.timeline.push({ t: 'p', id: pid });
					story.history.push(pid);
				}
			});

			// replaying re-runs template side effects; the explicitly
			// saved state still wins

			if (save.state) {
				this.state = save.state;
			}

			this.applyHeader();

			if (this.multiThread) {
				var ts = save.threadState || {};
				var storyDone = this;

				this.unread = ts.unread || this.unread;
				this._threadActivity = ts.activity || this._threadActivity;
				this._threadArchived = ts.archived || this._threadArchived;
				this._activitySeq = ts.seq || this._activitySeq;

				Object.keys(this._threadLogs).forEach(function(id) {
					storyDone._threadLogs[id].removeAttribute('aria-live');
				});

				if (ts.screen === 'inbox') {
					this.openInbox();
				}
				else if (ts.screen === 'trash') {
					this.openTrash();
				}
				else {
					this.openThread(
						ts.viewed || this._hotThread || this.threadOrder[0],
						{ silent: true }
					);
				}
			}

			// the replay rebuilt the checkpoint stack — undo works
			// straight away, even right after a reload

			this.dom.undo.hidden =
				this.checkpoints.length === 0 || !this.config.undoButton;

			this.persist();
			this.dom.history.removeAttribute('aria-live');
		}
		catch (e) {
			this.dom.history.removeAttribute('aria-live');

			if (this.multiThread) {
				var storyFail = this;

				Object.keys(this._threadLogs).forEach(function(id) {
					storyFail._threadLogs[id].removeAttribute('aria-live');
				});
			}

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
	},

	/**
	 Jumps straight to a passage — the debug panel's fast-forward. A
	 clean teleport: the transcript and timeline reset to the target
	 (story state `s` is kept), so jumps never stack up in the log or
	 in the autosave that replays on the next rebuild. To go backwards
	 instead, use the timeline's rewind buttons.
	**/

	/**
	 The thread a passage belongs to, inferred statically: its own
	 thread-* tag, or the tag of the nearest passage that links to it
	 (breadth-first through the written graph). Debug jumps teleport
	 without the play history that untagged passages normally inherit
	 their thread from — this stands in for it.
	**/

	inferPassageThread: function(passage) {
		var tagOf = function(p) {
			var tag = p.tags.find(function(t) {
				return t.indexOf('thread-') === 0;
			});

			return tag ? tag.substring(7) : null;
		};

		var direct = tagOf(passage);

		if (direct) {
			return direct;
		}

		var story = this;
		var inbound = {};

		this.passages.filter(Boolean).forEach(function(p) {
			story.passageEdges(p.source).forEach(function(edge) {
				(inbound[edge.target] = inbound[edge.target] || []).push(p);
			});
		});

		var seen = {};
		var frontier = [passage];

		seen[passage.name] = true;

		while (frontier.length) {
			var next = [];

			for (var i = 0; i < frontier.length; i++) {
				var sources = inbound[frontier[i].name] || [];

				for (var j = 0; j < sources.length; j++) {
					var source = sources[j];

					if (seen[source.name]) {
						continue;
					}

					var tag = tagOf(source);

					if (tag) {
						return tag;
					}

					seen[source.name] = true;
					next.push(source);
				}
			}

			frontier = next;
		}

		return this._hotThread || this.threadOrder[0] || null;
	},

	debugJump: function(idOrName) {
		if (!this.passage(idOrName)) {
			return;
		}

		// a teleport has no play history for the target to inherit a
		// thread from — infer it, and follow with the view

		if (this.multiThread) {
			this._hotThread = this.inferPassageThread(
				this.passage(idOrName)
			);
		}

		this.cancelTimers();
		this.cancelResponseTimer();
		this.hideTyping();
		this.hideMeta();
		this.clearAsides();
		this.clearUserResponses();
		this._preShownStamps = null;
		this.clearBanners();
		this._currentNodes = [];

		var story = this;

		if (this.multiThread) {
			Object.keys(this._threadLogs).forEach(function(id) {
				story._threadLogs[id].textContent = '';
			});
		}
		else {
			this.dom.history.textContent = '';
		}

		this.timeline = [];
		this.checkpoints = [];
		this._reactionLog = [];
		this._redactionLog = [];
		this.dom.undo.hidden = true;

		this.show(idOrName);

		if (this.multiThread) {
			this.openThread(this._hotThread);
		}
	},

	/**
	 Rewinds (or fast-forwards) to a point in the timeline by replaying
	 everything up to and including that entry — the debug panel's
	 time travel. State is rebuilt by the replay itself, so template
	 side effects re-run exactly as they did the first time.
	**/

	debugRewind: function(count) {
		var prefix = this.timeline.slice(0, count);

		// a player move is not a resting point: rewinding to "you:
		// yes" lands just BEFORE the yes is sent — pills up, move
		// un-made. Landing just after it would strand the story
		// mid-move (bubble sent, same pills still offered), and
		// continuing from there — a tap, or play-to choosing for
		// you — would send the same reply a second time.

		while (
			prefix.length &&
			'uilr'.indexOf(prefix[prefix.length - 1].t) > -1
		) {
			prefix.pop();
		}

		if (prefix.length === 0) {
			return;
		}

		this.restore(
			LZString.compressToBase64(JSON.stringify({ timeline: prefix }))
		);

		// rewind means THIS moment, paused. A replayed chain re-arms
		// its next showDelayed — left alone it would immediately play
		// the future back in, overshooting the moment the author
		// picked. (A normal restore keeps those timers: a reload
		// mid-chain must carry the chain onward.)

		this.cancelTimers();
		this.hideTyping();

		if (this.multiThread) {
			this.setThreadTyping(null);
		}
	},

	/**
	 Builds the debug panel: watch variables, run JavaScript, jump to
	 any passage, review the timeline, undo and restart. Enabled by
	 Twine's Test button / `tweego -t` (options="debug"), a ?debug URL
	 switch, story.config.debug = true, or calling this directly.
	**/

	/**
	 Parses a passage's source into its outbound edges — every way the
	 story can move on from it. Pill links carry their kind (text,
	 react, photo, location, input, timeout), display label, and sent
	 text; showDelayed()/show()/deliver() calls and [deliver …]
	 directives are 'auto' edges (the story advances by itself).
	 Static only: template code is not evaluated, so a target that
	 contains template syntax comes back verbatim.
	**/

	passageEdges: function(source) {
		var edges = [];
		var re = /\[\[(.*?)\]\]/g;
		var match;

		while ((match = re.exec(source))) {
			var inner = match[1];
			var display = inner;
			var target = inner;
			var arrow = inner.lastIndexOf('->');

			if (arrow > -1) {
				display = inner.slice(0, arrow);
				target = inner.slice(arrow + 2);
			}
			else {
				var bar = /(^|[^|])\|(?!\|)/.exec(inner);

				if (bar) {
					display = inner.slice(0, bar.index + bar[1].length);
					target = inner.slice(bar.index + bar[1].length + 1);
				}
			}

			var sent;
			var send = /\(send:([^)]*)\)\s*$/i.exec(display);

			if (send) {
				sent = send[1].trim();
				display = display.slice(0, send.index);

				// shorthand [[label (send: …)]]: the label IS the target
				if (arrow === -1 && target === inner) {
					target = display;
				}
			}

			display = display.trim();
			target = target.trim();

			var kind = 'text';
			var text = display;

			if (display.indexOf(REACT_LINK_PREFIX) === 0) {
				kind = 'react';
				text = display.slice(REACT_LINK_PREFIX.length).trim();
			}
			else if (
				display === 'input' ||
				display.indexOf(INPUT_LINK_PREFIX) === 0
			) {
				kind = 'input';
				text = display === 'input'
					? ''
					: display.slice(INPUT_LINK_PREFIX.length).trim();
			}
			else if (display.indexOf(TIMEOUT_LINK_PREFIX) === 0) {
				kind = 'timeout';

				var timed = display
					.slice(TIMEOUT_LINK_PREFIX.length)
					.match(/^\s*[\d.]+\s*([\s\S]*)$/);

				text = timed ? timed[1].trim() : '';
			}
			else if (
				display === 'photo' ||
				display.indexOf(PHOTO_LINK_PREFIX) === 0
			) {
				kind = 'photo';
				text = display === 'photo'
					? '*'
					: display.slice(PHOTO_LINK_PREFIX.length).trim();
			}
			else if (
				display === 'location' ||
				display.indexOf(LOCATION_LINK_PREFIX) === 0
			) {
				kind = 'location';
				text = '';
			}

			edges.push({
				target: target,
				kind: kind,
				display: display,
				text: text,
				sent: sent
			});
		}

		// auto-advance edges come in two kinds: 'chain' (the story
		// cursor moves there itself) and 'deliver' (side content that
		// only takes the cursor if it carries pills)

		var deliverRe = /\[deliver[ \t]+([^\]]+)\]/g;

		while ((match = deliverRe.exec(source))) {
			edges.push({
				target: unquoteName(match[1].trim()),
				kind: 'deliver'
			});
		}

		var thenRe =
			/^[ \t]*\[then[ \t]+(.+?)(?:[ \t]+in[ \t]+\d*\.?\d+(?:ms|s))?[ \t]*\][ \t]*$/gim;

		while ((match = thenRe.exec(source))) {
			edges.push({
				target: unquoteName(match[1].trim()),
				kind: 'chain'
			});
		}

		var call = /\b(show|showDelayed|deliver|debugJump)\s*\(\s*(['"])([^'"]+)\2/g;

		while ((match = call.exec(source))) {
			edges.push({
				target: match[3],
				kind: match[1] === 'deliver' ? 'deliver' : 'chain'
			});
		}

		return edges;
	},

	/**
	 Whether an edge is an auto-advance (chain or delivery) rather
	 than a player choice.
	**/

	isAutoEdge: function(edge) {
		return edge.kind === 'chain' || edge.kind === 'deliver';
	},

	/**
	 Fast-forwards: plays the story from the current passage to the
	 target, instantly. The route is found in the written link graph —
	 pills, chains, deliveries — and at each fork the pill that leads
	 toward the target is taken for you, so bubbles, state trackers,
	 events, checkpoints, and history all fill in the way a (very
	 fast) real playthrough would. The route follows links as written:
	 template conditions aren't evaluated when picking it, typed-input
	 gates are answered with a placeholder, and photo pills send the
	 first image they offer. Returns false when no written route
	 exists — callers can fall back to debugJump.
	**/

	debugFastForward: function(idOrName) {
		var story = this;
		var target = this.passage(idOrName);

		if (!target || !window.passage || target.id === window.passage.id) {
			return false;
		}

		// breadth-first through the written graph = fewest moves

		var seen = {};
		var cameBy = {};
		var frontier = [window.passage.name];
		var found = false;

		seen[window.passage.name] = true;

		while (frontier.length && !found) {
			var nextFrontier = [];

			for (var f = 0; f < frontier.length && !found; f++) {
				var passage = this.passage(frontier[f]);
				var edges = passage ? this.passageEdges(passage.source) : [];

				for (var i = 0; i < edges.length; i++) {
					var edge = edges[i];

					if (!this.passage(edge.target) || seen[edge.target]) {
						continue;
					}

					seen[edge.target] = true;
					cameBy[edge.target] = {
						from: frontier[f],
						edge: edge
					};

					if (edge.target === target.name) {
						found = true;
						break;
					}

					nextFrontier.push(edge.target);
				}
			}

			frontier = nextFrontier;
		}

		if (!found) {
			return false;
		}

		var steps = [];
		var at = target.name;

		while (at !== window.passage.name) {
			steps.unshift(cameBy[at]);
			at = cameBy[at].from;
		}

		// play the route: cancel chain timers as we pass (we're the
		// ones driving), make each move, show each passage instantly.
		// The final passage keeps any timers it arms — arriving by
		// fast-forward behaves like arriving normally.

		steps.forEach(function(step) {
			// a deliver edge's message was already rendered by the
			// passage that sent it — its [deliver] directive fired
			// (instantly) when that passage was shown a step ago. The
			// step only walks the graph: showing the target too would
			// render it twice, and would move the story cursor onto a
			// passage the story never actually visits.

			if (step.edge.kind === 'deliver') {
				return;
			}

			story.cancelTimers();
			story.hideTyping();
			story.playEdge(step.edge);
			story.show(step.edge.target, { instant: true });
		});

		// land the view in the target's own thread — the cursor can
		// legitimately sit elsewhere (a delivered or side-narration
		// target never takes it)

		if (this.multiThread) {
			this.openThread(this.getPassageThread(target));
		}

		this.scrollChatIntoView();
		this.persist();
		return true;
	},

	/**
	 Makes the player move an edge describes — bubble, state trackers,
	 event, checkpoint — without any pacing. Auto edges (chains,
	 deliveries) post nothing. Used by debugFastForward.
	**/

	playEdge: function(edge) {
		if (this.isAutoEdge(edge)) {
			return;
		}

		this.pushCheckpoint();
		this.hideMeta();
		this.clearUserResponses();
		this.state.timedOut = edge.kind === 'timeout';

		var story = this;

		if (edge.kind === 'react') {
			this.state.lastReaction = edge.text;
			this.react(edge.text, 'in');
			this.timeline.push({ t: 'r', emoji: edge.text });
			dispatch('reaction', { emoji: edge.text, story: this });
			return;
		}

		if (edge.kind === 'photo') {
			var name = edge.text.split(',')[0].trim();

			if (name === '*' || name === '') {
				name = Object.keys(this.gallery)[0] || '';
			}

			if (name) {
				this.state.lastPhoto = name;
				this.state.sentPhotos =
					(this.state.sentPhotos || []).concat(name);
				this.showPhotoBubble(name, { instant: true });
				dispatch('photosent', {
					name: name,
					target: edge.target,
					story: this
				});
			}

			return;
		}

		if (edge.kind === 'input') {
			var typed = edge.text || '…';

			this.state.lastInput = typed;
			this.state.inputs = (this.state.inputs || []).concat(typed);
			this.showUserBubble(typed, { instant: true });
			dispatch('textinput', {
				text: typed,
				target: edge.target,
				story: this
			});
			return;
		}

		if (edge.kind === 'location') {
			return; // nothing sensible to fake; just advance
		}

		// a plain reply pill, or a timed-out forced reply

		var sentText = edge.sent !== undefined ? edge.sent : edge.display;

		if (edge.kind === 'text' && edge.display.trim() !== '') {
			this.state.lastChoice = edge.display.trim();
		}

		if (edge.kind === 'timeout') {
			dispatch('timeout', {
				target: edge.target,
				text: sentText,
				story: this
			});
		}
		else {
			dispatch('choice', {
				label: edge.display.trim() || null,
				sent: sentText || '',
				target: edge.target,
				story: this
			});
		}

		(sentText || '')
			.split('||')
			.map(function(part) { return part.trim(); })
			.filter(function(part) { return part !== ''; })
			.forEach(function(part) {
				story.showUserBubble(part, { instant: true });
			});
	},

	/**
	 A static story check: broken pill targets, unresolved [deliver]
	 and show()/showDelayed() names, speakers without a StorySpeakers
	 profile, thread tags never declared in StoryThreads, and passages
	 nothing points to. Returns an array of findings:
	   { level: 'error' | 'warn' | 'note', message, passage }
	 Dynamic names (anything containing template syntax) are skipped —
	 the linter reads source, it never runs it.
	**/

	/**
	 Word counts for the piece. story.wordCount('name') returns the
	 readable words in that passage (null if it doesn't exist);
	 story.wordCount() totals every content passage — special Story*
	 passages and script/stylesheet passages excluded — returning
	 { words, passages }. Counts cover message and narration prose,
	 pill labels, and (send: …) text; code, comments, directive lines,
	 and markup are not words. Text printed by templates at runtime
	 can't be counted from source, so treat totals as close, not exact.
	**/

	wordCount: function(idOrName) {
		if (idOrName !== undefined) {
			var passage = this.passage(idOrName);

			return passage ? countWords(passage.source) : null;
		}

		var words = 0;
		var counted = 0;

		this.passages.forEach(function(p) {
			if (
				!p ||
				p.name.indexOf('Story') === 0 ||
				p.tags.indexOf('script') > -1 ||
				p.tags.indexOf('stylesheet') > -1
			) {
				return;
			}

			words += countWords(p.source);
			counted += 1;
		});

		return { words: words, passages: counted };
	},

	lint: function() {
		var story = this;
		var findings = [];
		var isSpecial = function(p) {
			return (
				p.name.indexOf('Story') === 0 ||
				p.tags.indexOf('script') > -1 ||
				p.tags.indexOf('stylesheet') > -1
			);
		};
		var content = this.passages.filter(function(p) {
			return p && !isSpecial(p);
		});

		var reachable = {};
		var refs = {}; // passage name -> outbound names

		content.forEach(function(p) {
			var out = story.passageEdges(p.source).map(function(edge) {
				return edge.target;
			});

			refs[p.name] = out;

			out.forEach(function(name) {
				if (name.indexOf('<%') > -1 || name === '') {
					return;
				}

				if (!story.passage(name)) {
					findings.push({
						level: 'error',
						message: 'links to missing passage "' + name + '"',
						passage: p.name
					});
				}
			});
		});

		// speakers without a profile (only once authors opt into
		// StorySpeakers) and threads never declared in StoryThreads

		var flaggedSpeakers = {};
		var flaggedThreads = {};

		content.forEach(function(p) {
			p.tags.forEach(function(tag) {
				if (
					tag.indexOf('speaker-') === 0 &&
					story.passage('StorySpeakers')
				) {
					var speaker = tag.slice('speaker-'.length);

					if (
						speaker !== 'you' &&
						!story.speakers[speaker] &&
						!flaggedSpeakers[speaker]
					) {
						flaggedSpeakers[speaker] = true;
						findings.push({
							level: 'warn',
							message:
								'speaker "' + speaker +
								'" has no StorySpeakers profile',
							passage: p.name
						});
					}
				}

				if (tag.indexOf('thread-') === 0 && story.multiThread) {
					var thread = tag.slice('thread-'.length);

					if (
						story.threadOrder.indexOf(thread) === -1 &&
						!flaggedThreads[thread]
					) {
						flaggedThreads[thread] = true;
						findings.push({
							level: 'warn',
							message:
								'thread "' + thread +
								'" is not declared in StoryThreads',
							passage: p.name
						});
					}
				}
			});
		});

		// reachability: walk out from the start passage; seeds are
		// reachable by definition (they render at story start)

		var start = this.passage(this.startPassage);
		var queue = start ? [start.name] : [];

		// seeds render at story start, and `unlinked`-tagged passages
		// are declared reachable by dynamic means — both are roots

		content.forEach(function(p) {
			if (
				p.tags.indexOf('seed') > -1 ||
				p.tags.indexOf('unlinked') > -1
			) {
				queue.push(p.name);
			}
		});

		while (queue.length) {
			var name = queue.pop();

			if (reachable[name]) {
				continue;
			}

			reachable[name] = true;
			(refs[name] || []).forEach(function(next) {
				if (story.passage(next) && !reachable[next]) {
					queue.push(next);
				}
			});
		}

		// deliberately unlinked passages (reached by dynamic names the
		// linter can't see) opt out with the `unlinked` tag

		content.forEach(function(p) {
			if (!reachable[p.name] && p.tags.indexOf('unlinked') === -1) {
				findings.push({
					level: 'note',
					message: 'nothing links to "' + p.name + '"',
					passage: p.name
				});
			}
		});

		// dead ends: a passage that takes the story cursor but leaves
		// the player nothing to do — no pills, and no chain or
		// delivery that eventually reaches choices. Exempt: End-tagged
		// finales, seeds (history, not moves), side narration
		// (speakerless and linkless — it never takes the cursor), and
		// passages only ever reached by [deliver] (side content).

		var continues = {};

		var canContinue = function(name, trail) {
			if (continues[name]) {
				return true;
			}

			if (trail[name]) {
				return false; // a cycle with no choices anywhere in it
			}

			trail[name] = true;

			var p = story.passage(name);
			var result = false;

			if (p) {
				var edges = story.passageEdges(p.source);

				result = edges.some(function(edge) {
					return !story.isAutoEdge(edge);
				});

				if (!result) {
					result = edges.some(function(edge) {
						return (
							story.passage(edge.target) &&
							canContinue(edge.target, trail)
						);
					});
				}
			}

			delete trail[name];

			if (result) {
				continues[name] = true; // only sure results are cached
			}

			return result;
		};

		// which passages ever take the cursor: the start passage, and
		// anything reached by a pill or a chain (not delivery alone)

		var takesCursor = {};

		if (start) {
			takesCursor[start.name] = true;
		}

		content.forEach(function(p) {
			story.passageEdges(p.source).forEach(function(edge) {
				if (edge.kind !== 'deliver') {
					takesCursor[edge.target] = true;
				}
			});
		});

		var deadEnds = {};

		content.forEach(function(p) {
			if (
				p.tags.indexOf('End') > -1 ||
				p.tags.indexOf('end') > -1 ||
				p.tags.indexOf('seed') > -1 ||
				!takesCursor[p.name]
			) {
				return;
			}

			var edges = story.passageEdges(p.source);
			var hasChoices = edges.some(function(edge) {
				return !story.isAutoEdge(edge);
			});

			// speakerless + linkless = side narration; never takes
			// the cursor even when chained to

			if (!story.getPassageSpeaker(p) && !hasChoices) {
				return;
			}

			if (!canContinue(p.name, {})) {
				deadEnds[p.name] = p;
			}
		});

		// a dead end at the far end of a chain fails canContinue for
		// every passage along it — report only where the chain stops,
		// not every ancestor that (correctly) leads there. The walk
		// passes through exempt intermediaries (asides, deliveries).

		var leadsToDeeper = function(name, seen) {
			if (seen[name]) {
				return false;
			}

			seen[name] = true;

			var p = story.passage(name);

			if (!p) {
				return false;
			}

			return story.passageEdges(p.source).some(function(edge) {
				if (!story.isAutoEdge(edge) || !story.passage(edge.target)) {
					return false;
				}

				return (
					!!deadEnds[edge.target] ||
					leadsToDeeper(edge.target, seen)
				);
			});
		};

		Object.keys(deadEnds).forEach(function(name) {
			if (!leadsToDeeper(name, {})) {
				findings.push({
					level: 'warn',
					message:
						'dead end — no reply pills, and no chain or ' +
						'delivery from here leads to choices (tag it ' +
						'`End` if the story is meant to stop here)',
					passage: name
				});
			}
		});

		return findings;
	},

	/**
	 Flattens the visible transcript to Markdown — every thread, every
	 message, chips and narration included. Reads the DOM (what the
	 player actually saw), so it never re-runs template side effects.
	**/

	exportTranscript: function() {
		var story = this;
		var lines = ['# ' + (this.name || 'Transcript'), ''];

		var renderLog = function(log) {
			Array.prototype.forEach.call(log.children, function(node) {
				if (!node.classList) {
					return;
				}

				if (node.classList.contains('chat-timestamp')) {
					lines.push('*— ' + node.textContent.trim() + ' —*', '');
				}
				else if (node.classList.contains('chat-system')) {
					lines.push('*' + node.textContent.trim() + '*', '');
				}
				else if (node.classList.contains('meta-passage')) {
					lines.push('> ' + node.textContent.trim(), '');
				}
				else if (node.classList.contains('chat-passage-wrapper')) {
					var speaker = node.getAttribute('data-speaker');
					var name =
						!speaker || speaker === 'you'
							? 'You'
							: story.getSpeakerDisplayName(speaker);

					node.querySelectorAll('.chat-passage').forEach(
						function(bubble) {
							var text = story.messagePreview(bubble);

							if (text) {
								lines.push('**' + name + ':** ' + text, '');
							}
						}
					);
				}
			});
		};

		if (this.multiThread) {
			this.threadOrder.forEach(function(threadId) {
				var log = story._threadLogs[threadId];

				if (!log || log.children.length === 0) {
					return;
				}

				lines.push('## ' + story.getThreadDisplayName(threadId), '');
				renderLog(log);
			});
		}
		else {
			renderLog(this.dom.history);
		}

		return lines.join('\n').replace(/\n{3,}/g, '\n\n');
	},

	enableDebug: function() {
		if (document.getElementById('debug-toggle')) {
			return;
		}

		var story = this;

		this.debug = true;

		var toggle = document.createElement('button');

		toggle.type = 'button';
		toggle.id = 'debug-toggle';
		toggle.textContent = '🐛 debug';
		toggle.setAttribute('aria-expanded', 'false');
		document.body.appendChild(toggle);

		var panel = document.createElement('aside');

		panel.id = 'debug-panel';
		panel.setAttribute('aria-label', 'Debug tools');
		panel.hidden = true;
		panel.innerHTML =
			'<div class="debug-head">' +
			'<strong>Debug</strong>' +
			'<span id="debug-where"></span>' +
			'<button type="button" id="debug-close" aria-label="Close">&times;</button>' +
			'</div>' +
			'<div class="debug-actions">' +
			'<button type="button" id="debug-undo">↩ undo</button>' +
			'<button type="button" id="debug-save">save to URL</button>' +
			'<button type="button" id="debug-export">transcript</button>' +
			'<button type="button" id="debug-restart">restart</button>' +
			'</div>' +
			'<details open><summary>Variables</summary>' +
			'<table id="debug-vars" class="debug-table"></table>' +
			'<form id="debug-eval">' +
			'<input type="text" placeholder="run JS, e.g. s.key = 1" aria-label="Run JavaScript">' +
			'<button type="submit">run</button>' +
			'</form>' +
			'<div id="debug-eval-out"></div>' +
			'</details>' +
			'<details open><summary>Timeline</summary>' +
			'<div class="debug-row">' +
			'<select id="debug-timeline" aria-label="Timeline"></select>' +
			'<button type="button" id="debug-rewind">rewind</button>' +
			'</div>' +
			'<p class="debug-note">pick a moment, rewind to it — paused right there</p>' +
			'</details>' +
			'<details open><summary>Jump to passage</summary>' +
			'<div class="debug-row">' +
			'<select id="debug-passages" aria-label="Jump to passage"></select>' +
			'<button type="button" id="debug-playto">play to</button>' +
			'<button type="button" id="debug-jump">jump</button>' +
			'</div>' +
			'<p class="debug-note" id="debug-jump-note">play to: fast-forward through the story, choosing for you · jump: teleport to a clean transcript (s is kept)</p>' +
			'</details>' +
			'<details><summary id="debug-lint-summary">Story check</summary>' +
			'<div id="debug-lint"></div>' +
			'</details>' +
			'<details><summary>Memory (survives restart)</summary>' +
			'<table id="debug-memory" class="debug-table"></table>' +
			'<button type="button" id="debug-forget">forget all</button>' +
			'</details>';
		document.body.appendChild(panel);

		var vars = panel.querySelector('#debug-vars');
		var where = panel.querySelector('#debug-where');
		var timeline = panel.querySelector('#debug-timeline');
		var passageList = panel.querySelector('#debug-passages');
		var evalOut = panel.querySelector('#debug-eval-out');
		var memoryTable = panel.querySelector('#debug-memory');
		var lintBox = panel.querySelector('#debug-lint');
		var lintSummary = panel.querySelector('#debug-lint-summary');
		var OPEN_KEY = 'subtext-debug-open-' + this.ifid;

		// the story check reads source, not state — run it once

		var renderLint = function() {
			var findings = story.lint();
			var problems = findings.filter(function(f) {
				return f.level !== 'note';
			}).length;

			lintSummary.textContent =
				'Story check' +
				(findings.length ? ' (' + findings.length + ')' : '');

			if (problems > 0) {
				lintSummary.parentElement.open = true;
			}

			lintBox.textContent = '';

			// the piece's size, alongside its health

			var stats = story.wordCount();
			var statsLine = document.createElement('p');

			statsLine.className = 'debug-note';
			statsLine.id = 'debug-wordcount';
			statsLine.textContent =
				stats.words.toLocaleString() + ' words across ' +
				stats.passages + ' passages';
			lintBox.appendChild(statsLine);

			if (findings.length === 0) {
				lintBox.appendChild(
					document.createTextNode('✓ no problems found')
				);
				return;
			}

			var list = document.createElement('ul');

			list.className = 'debug-lint-list';
			findings.forEach(function(f) {
				var item = document.createElement('li');
				var level = document.createElement('strong');

				level.textContent = f.level;
				level.className = 'debug-lint-' + f.level;
				item.appendChild(level);
				item.appendChild(
					document.createTextNode(' ' + f.message + ' ')
				);

				if (f.passage && story.passage(f.passage)) {
					var jump = document.createElement('button');

					jump.type = 'button';
					jump.textContent = 'in “' + f.passage + '”';
					jump.addEventListener('click', function() {
						story.debugJump(f.passage);
					});
					item.appendChild(jump);
				}

				list.appendChild(item);
			});
			lintBox.appendChild(list);
		};

		renderLint();

		var brief = function(value) {
			var text;

			try {
				text = JSON.stringify(value);
			}
			catch (e) {
				text = String(value);
			}

			text = String(text);
			return text.length > 80 ? text.slice(0, 77) + '…' : text;
		};

		var refresh = function() {
			// where we are

			var passageName = window.passage ? window.passage.name : '—';

			where.textContent =
				passageName +
				(story.multiThread && story._hotThread
					? ' · ' + story._hotThread
					: '') +
				' · turn ' + story.history.length +
				(window.passage
					? ' · ' + story.wordCount(window.passage.name) + ' words'
					: '');

			// state variables

			vars.textContent = '';
			var keys = Object.keys(story.state);

			if (keys.length === 0) {
				var empty = vars.insertRow();

				empty.insertCell().textContent = '(no variables set)';
			}

			keys.sort().forEach(function(key) {
				var row = vars.insertRow();

				row.insertCell().textContent = key;

				var cell = row.insertCell();

				cell.textContent = brief(story.state[key]);
				cell.title = String(JSON.stringify(story.state[key]));
			});

			// the timeline dropdown: every moment so far, newest
			// selected; the rewind button replays up to the pick

			timeline.textContent = '';
			story.timeline.forEach(function(entry, index) {
				var option = document.createElement('option');
				var text;

				if (entry.t === 'p' || entry.t === 'd') {
					var p = story.passage(entry.id);

					text =
						(entry.t === 'd' ? '[deliver] ' : '') +
						(p ? p.name : entry.id);
				}
				else if (entry.t === 'u') {
					text = 'you: ' + brief(entry.text);
				}
				else {
					text = '[' + entry.t + ']';
				}

				option.value = String(index);
				option.textContent = (index + 1) + '. ' + text;
				timeline.appendChild(option);
			});
			timeline.selectedIndex = timeline.options.length - 1;

			// cross-playthrough memory

			memoryTable.textContent = '';
			var memory = story.loadMemory();
			var memoryKeys = Object.keys(memory);

			if (memoryKeys.length === 0) {
				var noMemory = memoryTable.insertRow();

				noMemory.insertCell().textContent = '(nothing remembered)';
			}

			memoryKeys.sort().forEach(function(key) {
				var row = memoryTable.insertRow();

				row.insertCell().textContent = key;

				var cell = row.insertCell();

				cell.textContent = brief(memory[key]);
				cell.title = String(JSON.stringify(memory[key]));
			});
		};

		var buildPassageList = function() {
			// a dropdown of every passage, alphabetical, current one
			// selected (type in an open <select> to seek by name)

			passageList.textContent = '';
			story.passages
				.filter(function(p) { return !!p; })
				.sort(function(a, b) { return a.name.localeCompare(b.name); })
				.forEach(function(p) {
					var option = document.createElement('option');

					option.value = p.name;
					option.textContent =
						p.name +
						(p.tags.length > 0 ? ' — ' + p.tags.join(' ') : '');

					if (window.passage && window.passage.id === p.id) {
						option.selected = true;
					}

					passageList.appendChild(option);
				});
		};

		// the panel stays open until explicitly closed — including
		// across reloads (which every `tweego -w` rebuild triggers)

		var setOpen = function(open) {
			panel.hidden = !open;
			toggle.setAttribute('aria-expanded', String(open));

			try {
				if (open) {
					window.localStorage.setItem(OPEN_KEY, '1');
				}
				else {
					window.localStorage.removeItem(OPEN_KEY);
				}
			}
			catch (e) { /* storage unavailable */ }

			if (open) {
				refresh();
				buildPassageList();
			}
		};

		toggle.addEventListener('click', function() {
			setOpen(panel.hidden);
		});
		panel.querySelector('#debug-close').addEventListener('click', function() {
			setOpen(false);
		});
		panel.querySelector('#debug-forget').addEventListener('click', function() {
			story.forget();
			refresh();
		});
		panel.querySelector('#debug-undo').addEventListener('click', function() {
			story.undo();
			refresh();
		});
		panel.querySelector('#debug-restart').addEventListener('click', function() {
			story.restart();
		});
		panel.querySelector('#debug-save').addEventListener('click', function() {
			story.save();
			evalOut.textContent = 'progress saved to the URL — bookmark it';
		});
		panel.querySelector('#debug-export').addEventListener('click', function() {
			var blob = new Blob([story.exportTranscript()], {
				type: 'text/markdown'
			});
			var link = document.createElement('a');

			link.href = URL.createObjectURL(blob);
			link.download = (story.name || 'story') + ' transcript.md';
			link.click();
			URL.revokeObjectURL(link.href);
			evalOut.textContent = 'transcript downloaded';
		});
		panel.querySelector('#debug-eval').addEventListener('submit', function(event) {
			event.preventDefault();

			var field = event.target.querySelector('input');
			var s = story.state; // eslint-disable-line no-unused-vars

			try {
				/* eslint-disable no-eval */
				var result = eval(field.value);
				/* eslint-enable no-eval */

				evalOut.textContent =
					result === undefined ? '✓' : '→ ' + brief(result);
				field.value = '';
				story.persist();
			}
			catch (error) {
				evalOut.textContent = '✗ ' + error.message;
			}

			refresh();
		});
		panel.querySelector('#debug-rewind').addEventListener('click', function() {
			var index = parseInt(timeline.value, 10);

			if (!isNaN(index)) {
				story.debugRewind(index + 1);
				refresh();
			}
		});
		panel.querySelector('#debug-jump').addEventListener('click', function() {
			if (passageList.value) {
				story.debugJump(passageList.value);
				buildPassageList();
			}
		});
		panel.querySelector('#debug-playto').addEventListener('click', function() {
			if (!passageList.value) {
				return;
			}

			var note = panel.querySelector('#debug-jump-note');

			if (story.debugFastForward(passageList.value)) {
				note.textContent =
					'fast-forwarded — the transcript above is a real playthrough';
			}
			else {
				story.debugJump(passageList.value);
				note.textContent =
					'no written route from here — teleported instead';
			}

			refresh();
			buildPassageList();
		});

		window.addEventListener('showpassage:after', refresh);
		window.addEventListener('restore:after', refresh);
		window.addEventListener('showpassage:after', function() {
			if (!panel.hidden) {
				buildPassageList();
			}
		});
		refresh();

		// reopen if it was open before the last reload

		try {
			if (window.localStorage.getItem(OPEN_KEY)) {
				setOpen(true);
			}
		}
		catch (e) { /* storage unavailable */ }
	}
});

module.exports = Story;
