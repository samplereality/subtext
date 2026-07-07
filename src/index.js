'use strict';
var Story = require('./story');
var Passage = require('./passage');

window.Story = Story;
window.Passage = Passage;

/*
 * Helper functions for injecting content into the page chrome.
 * Call these from your story's JavaScript.
 */

function setContent(selector, htmlContent) {
	var el = document.querySelector(selector);

	if (el) {
		el.innerHTML = htmlContent;
	}

	return el;
}

window.inject_nav_back = function(htmlContent) {
	var el = setContent('#nav-link-back', htmlContent);

	if (el) {
		el.hidden = false;
	}
};

window.inject_nav_menu = function(htmlContent) {
	var el = setContent('#nav-link-menu', htmlContent);

	if (el) {
		el.hidden = false;
	}
};

/*
 * Legacy Trialogue-era aliases. The canonical APIs are
 * story.setMenu(html, title) and story.setRestartDialog(...).
 */

window.inject_menu = function(htmlContent, title) {
	if (window.story) {
		window.story.setMenu(htmlContent, title);
		return;
	}

	setContent('#menu-container', htmlContent);

	var menu = document.getElementById('nav-link-menu');

	if (menu) {
		menu.hidden = false;
	}

	if (typeof title === 'string') {
		setContent('#menu-dialog-title', title);
	}
};

window.inject_hint = function(htmlContent) {
	if (window.story) {
		window.story.config.hint = htmlContent;

		if (window.story.dom) {
			window.story.updateHint();
		}
	}
	else {
		setContent('#user-response-hint', htmlContent);
	}
};

window.inject_modal = function(titleContent, bodyContent, footerContent) {
	if (window.story) {
		window.story.setRestartDialog(titleContent, bodyContent, footerContent);
		return;
	}

	setContent('#exit-dialog .modal-title', titleContent);
	setContent('#exit-dialog .modal-body', bodyContent);
	setContent('#exit-dialog .modal-footer', footerContent);
};

/*
 * Snowman utility functions, reimplemented without Underscore/jQuery
 * so scripts and passages written against Snowman 2 documentation work
 * in Subtext.
 */

/**
 Randomly selects one value from its arguments; array arguments are
 flattened into the pool first: either('a', 'b', ['c', 'd']).
**/

window.either = function() {
	var pool = [];

	for (var i = 0; i < arguments.length; i++) {
		if (Array.isArray(arguments[i])) {
			pool = pool.concat(arguments[i]);
		}
		else {
			pool.push(arguments[i]);
		}
	}

	if (pool.length === 0) {
		return undefined;
	}

	return pool[Math.floor(Math.random() * pool.length)];
};

/**
 Returns whether the passage(s) — by name or ID, singly, as an array,
 or as multiple arguments — have all been visited.
**/

window.hasVisited = function() {
	var list = [];

	for (var i = 0; i < arguments.length; i++) {
		list = list.concat(arguments[i]);
	}

	if (list.length === 0 || !window.story) {
		return false;
	}

	return list.every(function(item) {
		var p = window.story.passage(item);

		return !!p && window.story.history.indexOf(p.id) !== -1;
	});
};

/**
 Returns the number of times a passage has been visited.
**/

window.visited = function(search) {
	if (!window.story || !window.story.history) {
		return 0;
	}

	var p = window.story.passage(search);

	if (!p) {
		return 0;
	}

	return window.story.history.filter(function(id) {
		return id === p.id;
	}).length;
};

/**
 Renders a passage into the element matching a DOM selector.
**/

window.renderToSelector = function(selector, passage) {
	var p = window.story ? window.story.passage(passage) : null;
	var el = document.querySelector(selector);

	if (p && el) {
		el.innerHTML = p.render();
	}
};

/**
 Loads external stylesheet(s); returns a Promise that resolves when
 all have loaded. (Snowman's version returned a jQuery promise.)
**/

window.getStyles = function() {
	var urls = Array.prototype.slice.call(arguments);

	return Promise.all(
		urls.map(function(url) {
			return new Promise(function(resolve, reject) {
				var link = document.createElement('link');

				link.rel = 'stylesheet';
				link.href = url;
				link.onload = function() {
					resolve(url);
				};
				link.onerror = function() {
					reject(new Error('Could not load stylesheet ' + url));
				};
				document.head.appendChild(link);
			});
		})
	);
};

function ready() {
	window.story = new Story();
	window.story.start();
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', ready);
}
else {
	ready();
}
