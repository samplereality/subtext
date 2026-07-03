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

window.inject_left_sidebar = function(htmlContent) {
	setContent('#left-sidebar-container', htmlContent);
	document.querySelector('.left-sidebar').classList.add('has-content');
};

window.inject_right_sidebar = function(htmlContent) {
	setContent('#right-sidebar-container', htmlContent);
	document.querySelector('.right-sidebar').classList.add('has-content');

	// the menu button opens the sidebar on small screens

	var menu = document.getElementById('nav-link-menu');

	if (menu.hidden) {
		menu.hidden = false;
	}
};

window.inject_hint = function(htmlContent) {
	setContent('#user-response-hint', htmlContent);
};

window.inject_modal = function(titleContent, bodyContent, footerContent) {
	setContent('#exit-dialog .modal-title', titleContent);
	setContent('#exit-dialog .modal-body', bodyContent);
	setContent('#exit-dialog .modal-footer', footerContent);
};

window.fade_in_content_containers = function() {
	document.querySelectorAll('.content-container').forEach(function(el) {
		el.style.opacity = 1;
	});
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
