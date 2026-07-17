/*
 Builds the documentation site published to GitHub Pages.

   node build.js && node scripts/build-demo.js && node scripts/build-site.js

 Produces site/ containing:
   index.html    docs rendered from README.md, with an embedded demo
   demo.html     the playable demo story
   format.js     the story format, at a stable URL for Twine to import
   icon.svg      logo / favicon
*/

'use strict';

const fs = require('fs');
const path = require('path');
const { marked } = require('marked');
const pkg = require('../package.json');

const ROOT = path.join(__dirname, '..');
const SITE = path.join(ROOT, 'site');
const PAGES_URL = 'https://samplereality.github.io/subtext';

marked.setOptions({ gfm: true });

// README, minus the logo/title header (the site has its own hero)

let readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const introAt = readme.indexOf('Subtext is a story format');

if (introAt !== -1) {
	readme = readme.slice(introAt);
}

// the site has a persistent sidebar TOC, so the README's inline
// "Table of contents" section (which GitHub still needs) is dropped

readme = readme.replace(/^## Table of contents[\s\S]*?(?=^## )/m, '');

let docsHtml = marked.parse(readme);

// marked no longer emits heading ids, so in-page anchors like
// [Multiple conversations](#multiple-conversations) — which work on
// GitHub's README render — went nowhere on the site. Add GitHub-style
// slug ids to headings ourselves.

function slugify(html) {
	return html
		.replace(/<[^>]+>/g, '')
		.replace(/&[a-z#0-9]+;/gi, '')
		.toLowerCase()
		.replace(/[^\w\s-]/g, '')
		.trim()
		.replace(/\s+/g, '-');
}

docsHtml = docsHtml.replace(
	/<h([1-4])>([\s\S]*?)<\/h\1>/g,
	(match, level, inner) =>
		`<h${level} id="${slugify(inner)}">${inner}</h${level}>`
);

// sidebar TOC from the h2/h3 outline. Changelog versions and other
// h3s under the Changelog stay out — the sidebar is a map, not a
// release history.

const tocItems = [];
const headingRe = /<h([23]) id="([^"]+)">([\s\S]*?)<\/h\1>/g;
let inChangelog = false;
let heading;

while ((heading = headingRe.exec(docsHtml))) {
	const level = Number(heading[1]);
	const text = heading[3].replace(/<[^>]+>/g, '');

	if (level === 2) {
		inChangelog = heading[2] === 'changelog';
		tocItems.push({ level, id: heading[2], text });
	}
	else if (!inChangelog) {
		tocItems.push({ level, id: heading[2], text });
	}
}

let tocHtml = '<nav class="toc" aria-label="Contents"><ol>';

tocItems.forEach((item, i) => {
	if (item.level === 2) {
		if (i > 0 && tocItems[i - 1].level === 3) {
			tocHtml += '</ol></li>';
		}
		else if (i > 0) {
			tocHtml += '</li>';
		}

		const nested = tocItems[i + 1] && tocItems[i + 1].level === 3;

		tocHtml += `<li><a href="#${item.id}">${item.text}</a>`;

		if (nested) {
			tocHtml += '<ol>';
		}
	}
	else {
		tocHtml += `<li><a href="#${item.id}">${item.text}</a></li>`;
	}
});
tocHtml +=
	(tocItems.length && tocItems[tocItems.length - 1].level === 3
		? '</ol></li>'
		: '</li>') + '</ol></nav>';

const css = `
:root {
	--bg: #f5f5f7; --surface: #ffffff; --text: #111114; --muted: #6e6e73;
	--accent: #0a84ff; --border: rgba(0, 0, 0, 0.09); --code-bg: rgba(0, 0, 0, 0.05);
}
@media (prefers-color-scheme: dark) {
	:root {
		--bg: #0a0a0d; --surface: #17171b; --text: #f2f2f4; --muted: #98989f;
		--accent: #409cff; --border: rgba(255, 255, 255, 0.1); --code-bg: rgba(255, 255, 255, 0.08);
	}
}
* { box-sizing: border-box; }
body {
	margin: 0; background: var(--bg); color: var(--text);
	font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
	-webkit-font-smoothing: antialiased;
}
a { color: var(--accent); }
.hero { text-align: center; padding: 3.5rem 1.25rem 2rem; }
.hero img { width: 72px; height: 72px; }
.hero h1 { font-size: 2.4rem; letter-spacing: -0.02em; margin: 0.75rem 0 0.25rem; }
.hero .tagline { color: var(--muted); font-size: 1.1rem; max-width: 34rem; margin: 0.25rem auto 1.5rem; }
.actions { display: flex; gap: 0.6rem; justify-content: center; flex-wrap: wrap; }
.btn {
	display: inline-block; padding: 0.55rem 1.2rem; border-radius: 999px;
	background: var(--accent); color: #fff !important; text-decoration: none; font-weight: 600;
}
.btn--ghost { background: transparent; color: var(--accent) !important; border: 1.5px solid var(--accent); }
.install { margin: 1.75rem auto 0; max-width: 34rem; }
.install .label { font-size: 0.8rem; color: var(--muted); margin-bottom: 0.35rem; }
.install code {
	display: block; padding: 0.7rem 1rem; border-radius: 0.75rem; overflow-x: auto;
	background: var(--surface); border: 1px solid var(--border); font-size: 0.85rem; white-space: nowrap;
}
.try { display: flex; justify-content: center; padding: 1.5rem 1rem 0.5rem; }
.try iframe {
	width: 396px; max-width: 100%; height: 720px; border: 1px solid var(--border);
	border-radius: 1.6rem; box-shadow: 0 24px 70px rgba(0, 0, 0, 0.25); background: var(--bg);
}
.try-hint { text-align: center; color: var(--muted); font-size: 0.8rem; margin: 0.75rem 0 0; }
.docs { display: flex; align-items: flex-start; max-width: 72rem; margin: 0 auto; gap: 1rem; }
.toc {
	flex: 0 0 16rem; position: sticky; top: 0; max-height: 100vh; overflow-y: auto;
	padding: 2rem 0.5rem 2rem 1.25rem; font-size: 0.85rem; line-height: 1.45;
	scrollbar-width: thin;
}
.toc ol { list-style: none; margin: 0; padding: 0; }
.toc ol ol { padding-left: 0.9rem; margin: 0.15rem 0 0.4rem; border-left: 1px solid var(--border); }
.toc li { margin: 0.15rem 0; }
.toc a {
	display: block; color: var(--muted); text-decoration: none;
	padding: 0.12rem 0.5rem; border-radius: 0.4rem;
	white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.toc a:hover { color: var(--text); background: var(--code-bg); }
.toc a.current { color: var(--accent); font-weight: 600; }
@media (max-width: 63.99rem) {
	.docs { display: block; }
	.toc { position: static; max-height: none; columns: 2; padding: 1.5rem 1.25rem 0; }
	.toc li { break-inside: avoid; }
}
main { flex: 1; min-width: 0; max-width: 46rem; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
main h1, main h2 { letter-spacing: -0.01em; margin-top: 2.2em; }
main h1 { font-size: 1.6rem; } main h2 { font-size: 1.35rem; } main h3 { font-size: 1.1rem; margin-top: 1.8em; }
main pre {
	background: var(--surface); border: 1px solid var(--border); border-radius: 0.75rem;
	padding: 0.9rem 1.1rem; overflow-x: auto; font-size: 0.85rem; line-height: 1.5;
}
main code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.875em; }
main :not(pre) > code { background: var(--code-bg); padding: 0.12em 0.35em; border-radius: 0.35em; }
main table { border-collapse: collapse; width: 100%; font-size: 0.92rem; }
main th, main td { border: 1px solid var(--border); padding: 0.45rem 0.7rem; text-align: left; }
main blockquote { border-left: 3px solid var(--accent); margin: 1em 0; padding: 0.1em 1em; color: var(--muted); }
footer { text-align: center; color: var(--muted); font-size: 0.85rem; padding: 0 1rem 3rem; }
`;

const page = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Subtext — a chat story format for Twine</title>
<meta name="description" content="Subtext turns a branching Twine story into a modern text-message exchange: bubbles, typing indicators, photos, voice memos, locations, reactions, and read receipts.">
<link rel="icon" href="icon.svg" type="image/svg+xml">
<style>${css}</style>
</head>
<body>
<header class="hero">
	<img src="icon.svg" alt="">
	<h1>Subtext</h1>
	<p class="tagline">A story format for Twine 2 that turns a branching narrative into a modern text-message exchange.</p>
	<div class="actions">
		<a class="btn" href="demo.html">Play the demo</a>
		<a class="btn btn--ghost" href="inbox-demo.html">Inbox demo</a>
		<a class="btn btn--ghost" href="https://github.com/samplereality/subtext">GitHub</a>
	</div>
	<div class="install">
		<div class="label">Add to Twine via Twine → Story Formats → Add a New Format:</div>
		<code>${PAGES_URL}/format.js?v=${pkg.version}</code>
	</div>
</header>
<section class="try">
	<iframe src="demo.html" title="Playable Subtext demo" loading="lazy"></iframe>
</section>
<p class="try-hint">The demo, running live — tap a reply to play.</p>
<div class="docs">
${tocHtml}
<main>
${docsHtml}
</main>
</div>
<footer>Subtext ${pkg.version} · MIT License</footer>
<script>
(function () {
	var links = document.querySelectorAll('.toc a');
	var byId = {};

	links.forEach(function (a) {
		byId[a.getAttribute('href').slice(1)] = a;
	});

	var current = null;
	var observer = new IntersectionObserver(function (entries) {
		entries.forEach(function (entry) {
			if (!entry.isIntersecting) { return; }

			var link = byId[entry.target.id];

			if (link && link !== current) {
				if (current) { current.classList.remove('current'); }
				current = link;
				link.classList.add('current');
			}
		});
	}, { rootMargin: '0px 0px -70% 0px' });

	document.querySelectorAll('main h2[id], main h3[id]').forEach(function (h) {
		if (byId[h.id]) { observer.observe(h); }
	});
})();
</script>
</body>
</html>
`;

fs.rmSync(SITE, { recursive: true, force: true });
fs.mkdirSync(SITE, { recursive: true });
fs.writeFileSync(path.join(SITE, 'index.html'), page);
fs.copyFileSync(
	path.join(ROOT, 'docs/subtext-demo.html'),
	path.join(SITE, 'demo.html')
);
fs.copyFileSync(
	path.join(ROOT, 'dist/Twine2/Subtext/format.js'),
	path.join(SITE, 'format.js')
);
fs.copyFileSync(
	path.join(ROOT, 'docs/subtext-inbox-demo.html'),
	path.join(SITE, 'inbox-demo.html')
);
fs.copyFileSync(path.join(ROOT, 'src/icon.svg'), path.join(SITE, 'icon.svg'));
fs.writeFileSync(path.join(SITE, '.nojekyll'), '');

console.log('Built docs site -> site/');
