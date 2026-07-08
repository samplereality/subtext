/**
 An object representing a single passage in the story. The passage currently
 being displayed is available as `window.passage`.
**/

'use strict';
var marked = require('marked').marked;
var template = require('./template');

marked.setOptions({
	/* Single newlines become <br>, which reads naturally in chat bubbles. */
	breaks: true,
	gfm: true
});

/**
 Our rendering engine. This is available externally as Passage.render(),
 as well as on Passage instances.

 The pipeline (unchanged from Trialogue 1.x / Snowman):
   1. run the source through the template engine with `s` (story state)
      and `$` (ready helper) in scope
   2. strip comments
   3. expand [text]{.class#id} span/div shorthand
   4. collect [[links]] onto the current passage (external URLs stay inline)
   5. render Markdown
**/

function render(source) {
	var result;

	// only invoke the template engine when template syntax is present
	// (matches Snowman 2.x, which guards this for speed and safety)

	if (source.indexOf('<%') !== -1) {
		result = template.compile(source)({
			s: window.story.state,
			$: readyFunc
		});
	}
	else {
		result = source;
	}

	// Remove /* comments */

	result = result.replace(/\/\*[\s\S]*?\*\//g, '');

	// Remove // comments
	// to avoid clashes with URLs, lines must start with these

	result = result.replace(/^\/\/.*(\r\n?|\n)/gm, '');

	// [timestamp Today 9:41 AM] on its own line becomes a centered
	// timestamp chip above the message

	result = result.replace(
		/^[ \t]*\[timestamp[ \t]+([^\]]+)\][ \t]*$/gim,
		function(match, label) {
			return '<div class="chat-timestamp">' + template.escapeHtml(label.trim()) + '</div>';
		}
	);

	// [system Sam has left the conversation] on its own line becomes a
	// centered system-event chip — joins, departures, missed calls,
	// group renames. Unlike a timestamp it is never shown early while
	// the message is still "typing": events land in sequence.

	result = result.replace(
		/^[ \t]*\[system[ \t]+([^\]]+)\][ \t]*$/gim,
		function(match, label) {
			return '<div class="chat-system">' + template.escapeHtml(label.trim()) + '</div>';
		}
	);

	// [voice some.mp3] on its own line becomes a voice-memo bubble
	// (any audio URL or data URI)

	result = result.replace(
		/^[ \t]*\[voice[ \t]+([^\]\s]+)[ \t]*\][ \t]*$/gim,
		function(match, src) {
			return '<div class="chat-voice" data-src="' + template.escapeHtml(src) + '"></div>';
		}
	);

	// [react ❤️] on its own line reacts to the player's last message
	// with a tapback badge (extracted and applied when the passage shows)

	result = result.replace(
		/^[ \t]*\[react[ \t]+([^\]]+)\][ \t]*$/gim,
		function(match, emoji) {
			return '<div class="chat-react" data-emoji="' + template.escapeHtml(emoji.trim()) + '"></div>';
		}
	);

	// [deliver passage name] on its own line sends that passage to its
	// own conversation thread without moving the story there

	result = result.replace(
		/^[ \t]*\[deliver[ \t]+([^\]]+)\][ \t]*$/gim,
		function(match, name) {
			return '<div class="chat-deliver" data-passage="' + template.escapeHtml(name.trim()) + '"></div>';
		}
	);

	// [location 52.3676,4.9041 Amsterdam] on its own line becomes a
	// map-card bubble linking to OpenStreetMap

	result = result.replace(
		/^[ \t]*\[location[ \t]+(-?[\d.]+)[ \t]*,[ \t]*(-?[\d.]+)(?:[ \t]+([^\]]+))?\][ \t]*$/gim,
		function(match, lat, lon, label) {
			return (
				'<div class="chat-location" data-lat="' + lat +
				'" data-lon="' + lon + '" data-label="' +
				template.escapeHtml((label || '').trim()) + '"></div>'
			);
		}
	);

	// [\ndiv\n]{.withClass#andID}

	var divRegexp = /\[([\r\n+])([^\]]*?)([\r\n+])\]\{(.*?)\}/g;
	var divRenderer = function(wholeMatch, startBr, src, endBr, selector) {
		return renderEl('div', startBr + src + endBr, selector);
	};

	while (divRegexp.test(result)) {
		result = result.replace(divRegexp, divRenderer);
	}

	// [span]{.withClass#andID}

	var spanRegexp = /\[(.*?)\]\{(.*?)\}/g;
	var spanRenderer = function(wholeMatch, src, selector) {
		return renderEl('span', src, selector);
	};

	while (spanRegexp.test(result)) {
		result = result.replace(spanRegexp, spanRenderer);
	}

	// [[links]]

	result = result.replace(/\[\[(.*?)\]\]/g, function(match, target) {
		var display = target;

		// display|target format — a single bar only, so `||` (the
		// multi-bubble separator in a `(send: …)` label) never reads
		// as a display/target split

		var barMatch = /(^|[^|])\|(?!\|)/.exec(target);

		if (barMatch) {
			var barIndex = barMatch.index + barMatch[1].length;

			display = target.substr(0, barIndex);
			target = target.substr(barIndex + 1);
		}
		else {
			// display->target format

			var rightArrIndex = target.indexOf('->');

			if (rightArrIndex != -1) {
				display = target.substr(0, rightArrIndex);
				target = target.substr(rightArrIndex + 2);
			}
			else {
				// target<-display format

				var leftArrIndex = target.indexOf('<-');

				if (leftArrIndex != -1) {
					display = target.substr(leftArrIndex + 2);
					target = target.substr(0, leftArrIndex);
				}
			}
		}

		// does this look like an external link?

		if (/^\w+:\/\/\/?\w/i.test(target)) {
			return (
				'<a href="' + template.escapeHtml(target) +
				'" target="_blank" rel="noopener">' + display + '</a>'
			);
		}

		// internal links become user responses on the current passage,
		// not inline content

		if (window.passage) {
			var link = { display: display, target: target };

			// a `(send: ...)` suffix in the pill label overrides the text
			// sent as the player's message — an empty one sends nothing:
			//   [[yeah (send: yeah, I'll be there)->meet]]
			//   [[start (send:)->intro]]

			var sendMatch = display.match(/\(send:([^)]*)\)\s*$/i);

			if (sendMatch) {
				var label = display.slice(0, sendMatch.index).trim();

				// in the shorthand form [[label (send: ...)]] the label
				// IS the target, so the suffix comes off both

				if (link.target === display) {
					link.target = label;
				}

				link.display = label;
				link.sent = sendMatch[1].trim();
			}

			window.passage.links.push(link);
		}

		return '';
	});

	return marked.parse(result);
}

/**
 A helper function that converts markup like [this]{#id.class} into HTML
 source for a DOM element. A selector starting with a dash (-) hides the
 element via inline style.
**/

function renderEl(nodeName, source, selector) {
	var result = '<' + nodeName;

	if (selector) {
		if (selector[0] == '-') {
			result += ' style="display:none"';
		}

		var classes = [];
		var id = null;
		var classOrId = /([#.])([^#.]+)/g;
		var matches = classOrId.exec(selector);

		while (matches !== null) {
			switch (matches[1]) {
				case '#':
					id = matches[2];
					break;

				case '.':
					classes.push(matches[2]);
					break;

				default:
					throw new Error("Don't know how to apply selector " + matches[0]);
			}

			matches = classOrId.exec(selector);
		}

		if (id !== null) {
			result += ' id="' + template.escapeHtml(id) + '"';
		}

		if (classes.length > 0) {
			result += ' class="' + template.escapeHtml(classes.join(' ')) + '"';
		}
	}

	result += '>';

	if (source !== null) {
		result += render(source);
	}

	return result + '</' + nodeName + '>';
}

/**
 The `$` helper available inside passage templates. Passed a function, it
 runs that function (bound to the #passage element) once the passage is in
 the DOM. Passed a selector string, it returns an array of matching
 elements — a light stand-in for the jQuery object Snowman provided.
**/

function readyFunc(arg) {
	if (typeof arg === 'function') {
		window.addEventListener(
			'showpassage:after',
			function handler(event) {
				arg.call(document.getElementById('phistory'), event);
			},
			{ once: true }
		);
		return;
	}

	if (typeof arg === 'string') {
		return Array.prototype.slice.call(document.querySelectorAll(arg));
	}

	return arg;
}

var Passage = function(id, name, tags, source) {
	/**
	 The numeric ID of the passage.
	**/

	this.id = id;

	/**
	 The name of the passage.
	**/

	this.name = name;

	/**
	 The tags of the passage.
	**/

	this.tags = tags;

	/**
	 The passage source code. Twine stores it HTML-escaped in the published
	 document, so unescape it exactly once here.
	**/

	this.source = template.unescapeHtml(source);

	/**
	 The passage links found in the source. Filled during render().
	**/

	this.links = [];
};

/**
 Static renderer: renders any string through the passage pipeline.
**/

Passage.render = render;

/**
 Returns an HTML-rendered version of this passage's source.
**/

Passage.prototype.render = function() {
	return render(this.source);
};

module.exports = Passage;
