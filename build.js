/*
 Builds the Trialogue story format.

   node build.js

 Produces:
   dist/Twine2/Trialogue/format.js   the story format, importable in Twine 2
   dist/Twine2/Trialogue/icon.svg
   build/format.html                 the assembled template (for inspection)
*/

'use strict';

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const pkg = require('./package.json');

const ROOT = __dirname;
const FORMAT_NAME = pkg.config.formatName;

function build() {
	// bundle & minify the runtime

	const jsResult = esbuild.buildSync({
		entryPoints: [path.join(ROOT, 'src/index.js')],
		bundle: true,
		minify: true,
		write: false,
		target: ['es2018'],
		legalComments: 'none',
		logLevel: 'silent'
	});

	// a literal "</script>" inside the bundle would terminate the inline
	// script tag in the published story

	const js = jsResult.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

	// minify the stylesheet

	const css = esbuild.transformSync(
		fs.readFileSync(path.join(ROOT, 'src/trialogue.css'), 'utf8'),
		{ loader: 'css', minify: true }
	).code;

	// assemble the template; {{STORY_NAME}} and {{STORY_DATA}} are left
	// intact for Twine to fill in at publish time

	const source = fs
		.readFileSync(path.join(ROOT, 'src/index.html'), 'utf8')
		.replace('<!--BUILD:STYLE-->', () => '<style>' + css + '</style>')
		.replace('<!--BUILD:SCRIPT-->', () => '<script>' + js + '</script>');

	const formatData = {
		name: FORMAT_NAME,
		version: pkg.version,
		author: pkg.author,
		description: pkg.description,
		image: 'icon.svg',
		url: pkg.repository,
		proofing: false,
		source: source
	};

	const outDir = path.join(ROOT, pkg.config.distDir, 'Twine2', FORMAT_NAME);

	fs.mkdirSync(outDir, { recursive: true });
	fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true });

	fs.writeFileSync(
		path.join(outDir, 'format.js'),
		'window.storyFormat(' + JSON.stringify(formatData) + ');'
	);
	fs.copyFileSync(
		path.join(ROOT, 'src/icon.svg'),
		path.join(outDir, 'icon.svg')
	);
	fs.writeFileSync(path.join(ROOT, 'build/format.html'), source);

	console.log(
		'Built ' + FORMAT_NAME + ' ' + pkg.version + ' -> ' +
		path.relative(ROOT, path.join(outDir, 'format.js'))
	);
}

build();
