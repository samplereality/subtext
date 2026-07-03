/*
 A minimal, Underscore-compatible template engine so passages keep working
 without bundling Underscore itself.

 Supported syntax (same delimiters as Underscore/Snowman):
   <%= expression %>   interpolate
   <%- expression %>   interpolate, HTML-escaped
   <%  statements  %>  evaluate

 Templates are invoked with a data object whose keys become in-scope
 variables (Trialogue passes `s` for story state and `$` for the ready
 helper), matching Underscore's `with(data)` behavior.
*/

'use strict';

var ESCAPES = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	'"': '&quot;',
	"'": '&#x27;',
	'`': '&#x60;'
};

function escapeHtml(value) {
	if (value === null || value === undefined) {
		return '';
	}

	return String(value).replace(/[&<>"'`]/g, function(ch) {
		return ESCAPES[ch];
	});
}

function unescapeHtml(value) {
	if (value === null || value === undefined) {
		return '';
	}

	return String(value)
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#x27;/g, "'")
		.replace(/&#39;/g, "'")
		.replace(/&#x60;/g, '`')
		.replace(/&amp;/g, '&');
}

var MATCHER = /<%-([\s\S]+?)%>|<%=([\s\S]+?)%>|<%([\s\S]+?)%>|$/g;

var STRING_ESCAPES = {
	"'": "\\'",
	'\\': '\\\\',
	'\r': '\\r',
	'\n': '\\n',
	'\u2028': '\\u2028',
	'\u2029': '\\u2029'
};

var ESCAPE_CHAR_RE = new RegExp("['\\\\\r\n  ]", 'g');

function escapeStringChar(ch) {
	return STRING_ESCAPES[ch];
}

function compile(text) {
	var index = 0;
	var source = "__p+='";

	text.replace(MATCHER, function(match, escaped, interpolate, evaluate, offset) {
		source += text.slice(index, offset).replace(ESCAPE_CHAR_RE, escapeStringChar);
		index = offset + match.length;

		if (escaped) {
			source += "'+\n((__t=(" + escaped + "))==null?'':__esc(__t))+\n'";
		}
		else if (interpolate) {
			source += "'+\n((__t=(" + interpolate + "))==null?'':__t)+\n'";
		}
		else if (evaluate) {
			source += "';\n" + evaluate + "\n__p+='";
		}

		return match;
	});

	source += "';\n";

	/* `with` requires sloppy mode; functions made via `new Function` are
	   sloppy by default, which is exactly what we need here. */

	source =
		"var __t,__p='';\nwith(__data||{}){\n" + source + '}\nreturn __p;';

	var render = new Function('__data', '__esc', source);

	return function(data) {
		return render(data, escapeHtml);
	};
}

module.exports = {
	compile: compile,
	escapeHtml: escapeHtml,
	unescapeHtml: unescapeHtml
};
