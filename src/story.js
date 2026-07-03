/**
 An object representing the entire story. After the document has completed
 loading, an instance of this class is available at `window.story`.
**/

'use strict';
var LZString = require('lz-string');
var Passage = require('./passage');
var template = require('./template');

var SPEAKER_TAG_PREFIX = 'speaker-';

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

function dispatch(name, detail) {
	window.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
}

var Story = function() {
	var el = document.querySelector('tw-storydata');

	if (!el) {
		throw new Error(
			'Trialogue could not find a <tw-storydata> element. ' +
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
		autosave: false
	};

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
			passage: byId('passage'),
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
			rightSidebar: document.querySelector('.right-sidebar')
		};

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

		// menu button toggles the right sidebar on small screens

		this.dom.menu.addEventListener('click', function() {
			story.dom.rightSidebar.classList.toggle('open');
		});

		// passage link handler; links inside the chat history are inert

		document.body.addEventListener('click', function(event) {
			var link = event.target.closest('[data-passage]');

			if (!link || link.closest('#phistory')) {
				return;
			}

			event.preventDefault();
			story.choose(
				link.getAttribute('data-passage'),
				link.textContent.trim()
			);
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
		this.clearUserResponses();
		this.showUserBubble(displayText);
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

		var speaker = this.getPassageSpeaker(passage);
		var wrapper = this.buildPassageElement(passage, speaker, html);

		if (wrapper) {
			if (opts.instant) {
				wrapper.classList.add('no-anim');
			}

			this.applyGrouping(wrapper);
			this.dom.passage.appendChild(wrapper);
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
	 Builds the DOM element for a rendered passage: a centered meta
	 passage when there is no speaker tag, otherwise a chat message
	 group with avatar, speaker name and one bubble per paragraph.
	 Returns null if the passage rendered to nothing visible.
	**/

	buildPassageElement: function(passage, speaker, html) {
		var content = document.createElement('div');

		content.innerHTML = html;

		var blocks = Array.prototype.filter.call(content.childNodes, function(node) {
			return !(
				node.nodeType === Node.TEXT_NODE && node.textContent.trim() === ''
			);
		});

		if (blocks.length === 0) {
			return null;
		}

		// meta passage (no speaker)

		if (!speaker) {
			var meta = document.createElement('div');

			meta.className = 'meta-passage';
			blocks.forEach(function(node) {
				meta.appendChild(node);
			});

			return meta;
		}

		// chat message group

		var wrapper = document.createElement('div');

		wrapper.className = 'chat-passage-wrapper';
		wrapper.setAttribute('data-speaker', speaker);

		passage.tags.forEach(function(tag) {
			if (/^[A-Za-z_][\w-]*$/.test(tag)) {
				wrapper.classList.add(tag);
			}
		});

		if (speaker !== 'you') {
			wrapper.appendChild(this.buildAvatar(speaker));
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

		var story = this;
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

			bubble.style.animationDelay =
				(index * story.config.bubbleStagger) + 'ms';
			index += 1;

			bubbles.appendChild(bubble);
		});

		return wrapper;
	},

	buildAvatar: function(speaker) {
		var avatar = document.createElement('div');

		avatar.className = 'chat-avatar';
		avatar.setAttribute('aria-hidden', 'true');
		avatar.setAttribute('data-speaker', speaker);
		avatar.textContent = this.getSpeakerDisplayName(speaker)
			.charAt(0)
			.toUpperCase();
		avatar.style.setProperty('--avatar-hue', this.speakerHue(speaker));

		return avatar;
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
		var previous =
			this.dom.passage.lastElementChild ||
			this.dom.history.lastElementChild;

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
		while (this.dom.passage.firstChild) {
			this.dom.history.appendChild(this.dom.passage.firstChild);
		}
	},

	/**
	 Renders passage links as response buttons in the response panel.
	**/

	showUserResponses: function() {
		var story = this;

		if (!window.passage) {
			return;
		}

		window.passage.links.forEach(function(link, index) {
			var button = document.createElement('button');

			button.type = 'button';
			button.className = 'user-response';
			button.setAttribute('data-passage', link.target);
			button.innerHTML = link.display;
			button.style.animationDelay = (index * 60) + 'ms';
			story.dom.responses.appendChild(button);
		});
	},

	/**
	 Removes response buttons from the response panel.
	**/

	clearUserResponses: function() {
		this.dom.responses.textContent = '';
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

		if (opts.instant) {
			wrapper.classList.add('no-anim');
		}

		this.applyGrouping(wrapper);
		this.dom.history.appendChild(wrapper);
		this.timeline.push({ t: 'u', text: text });
		this.scrollChatIntoView();
	},

	/**
	 Shows an error as a meta message in the chat.
	**/

	showError: function(message) {
		var meta = document.createElement('div');

		meta.className = 'meta-passage meta-passage--error';
		meta.textContent = message;

		if (this.dom && this.dom.passage) {
			this.dom.passage.appendChild(meta);
			this.scrollChatIntoView();
		}
	},

	/**
	 Saves an undo checkpoint. Called right before a user choice is
	 applied.
	**/

	pushCheckpoint: function() {
		this.checkpoints.push({
			state: deepClone(this.state),
			domCount: this.dom.history.children.length,
			timelineLength: this.timeline.length,
			passageId: window.passage ? window.passage.id : null,
			links: window.passage ? window.passage.links.slice() : []
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
		this.clearUserResponses();

		// everything since the checkpoint is discarded

		this.dom.passage.textContent = '';

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
			this.dom.passage.appendChild(meta);
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
	 Human-readable version of a speaker id: dashes become spaces
	 ("speaker-happy-bot" is displayed as "happy bot").
	**/

	getSpeakerDisplayName: function(speaker) {
		return speaker.replace(/-+/g, ' ').trim();
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

		probe.innerHTML = target.source.replace(/\[\[.*?\]\]/g, '');

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

		var previous =
			this.dom.passage.lastElementChild ||
			this.dom.history.lastElementChild;

		wrapper.classList.toggle(
			'chat-follow',
			!!(
				previous &&
				previous.classList.contains('chat-passage-wrapper') &&
				previous.getAttribute('data-speaker') === speaker
			)
		);

		avatar.textContent = this.getSpeakerDisplayName(speaker)
			.charAt(0)
			.toUpperCase();
		avatar.setAttribute('data-speaker', speaker);
		avatar.style.setProperty('--avatar-hue', this.speakerHue(speaker));

		typing.hidden = false;
		this.scrollChatIntoView();
	},

	/**
	 Hides the typing indicator.
	**/

	hideTyping: function() {
		this.dom.typing.hidden = true;
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
		return 'trialogue-save-' + this.ifid;
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
			this.clearUserResponses();
			this.state = {};
			this.timeline = [];
			this.history = [];
			this.checkpoints = [];
			this.dom.history.textContent = '';
			this.dom.passage.textContent = '';
			this.dom.undo.hidden = true;

			var story = this;

			timeline.forEach(function(entry) {
				if (entry.t === 'u') {
					story.showUserBubble(entry.text, { instant: true });
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
		}
		catch (e) {
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
