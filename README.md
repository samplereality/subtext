<p align="center"><img src="src/icon.svg" alt="Trialogue logo"></p>
<h1 align="center">Trialogue</h1>

Trialogue is a story format for [Twine 2](https://twinery.org/) that turns a branching narrative into an interactive chat story. Write a non-linear story in the Twine editor, select Trialogue as the story format, and play your story back as a modern text-message exchange.

This is a modernized fork of [phivk/trialogue](https://github.com/phivk/trialogue) (itself based on [Paloma](http://mcdemarco.net/tools/scree/paloma/) and [Snowman](https://github.com/videlais/snowman)).

## What's new in 2.0

**A modern messaging look**

- Message bubbles are grouped by speaker with iMessage-style corner shaping, a speaker name above each group, and an auto-colored avatar beside it.
- Each paragraph of a passage becomes its own bubble, so longer passages read like a real text exchange.
- Outgoing (player) messages render as accent-colored bubbles on the right; choices appear as quick-reply pill buttons.
- Passages containing only an image render frameless, like a photo message.
- Refined typing indicator, message entrance animations (disabled for players who prefer reduced motion), and automatic dark mode.

**A more robust format**

- The runtime was rewritten in dependency-free vanilla JavaScript. jQuery, Underscore, and the Bootstrap/jQuery CDN links are gone — published stories are fully self-contained and work offline.
- Save/restore now replays the entire conversation, not just the last passage, and an optional autosave keeps progress across reloads.
- Undo restores story state correctly (state snapshots are deep-copied per choice).
- Broken links, render errors, and script errors surface as readable messages in the chat instead of failing silently.
- The Grunt/Browserify toolchain was replaced with a single esbuild-based build script, plus a built-in Twee compiler and headless-browser smoke test.

## Writing a chat story

Every passage is a message. Tag a passage `speaker-<name>` to say who sends it:

```
:: Start [speaker-detective]
Something doesn't add up here.

Meet me at the docks in an hour?

[[on my way]]
[[why the docks?]]
```

- Each paragraph (blank-line separated) becomes its own bubble.
- `[[links]]` become the player's quick-reply choices. The usual Twine link forms work: `[[display|target]]`, `[[display->target]]`, `[[target<-display]]`.
- A passage **without** a `speaker-` tag renders as a centered "meta" message — good for narration or scene breaks.
- Speaker names get an avatar automatically (initial + a stable color derived from the name). Multi-word names use dashes: `speaker-happy-bot` displays as "happy bot".
- Markdown, inline HTML, and Snowman-style `<%= s.variable %>` templates are all supported. Story state lives in `s` (an alias for `window.story.state`).

### Special passages

| Passage | Purpose |
| --- | --- |
| `StorySubtitle` | Subtitle shown under the story title in the header |
| `StoryAuthor` | Author credit shown next to the subtitle |
| `StoryColophon` | Appended as a meta message when a passage tagged `End` is shown |
| tag `script` | Story JavaScript (Twine's Edit Story JavaScript also works) |
| tag `stylesheet` | Story CSS (Twine's Edit Story Stylesheet also works) |

### Configuration

Adjust behavior from your story's JavaScript:

```js
story.config.typing = true;        // show the typing indicator
story.config.msPerChar = 20;       // simulated typing speed
story.config.minTypingDelay = 500; // ms
story.config.maxTypingDelay = 4000;// ms
story.config.metaDelay = 800;      // delay before meta passages
story.config.splitBubbles = true;  // one bubble per paragraph
story.config.autosave = false;     // persist progress to localStorage
```

### Theming

Override CSS variables from your story stylesheet:

```css
:root {
  --t-accent: #34c759;            /* player bubbles & buttons */
  --t-bg: #ffffff;                /* chat background */
  --t-bubble-in: #e9e9eb;         /* incoming bubble background */
  --t-bubble-in-text: #111114;    /* incoming bubble text */
  --t-chat-width: 44rem;          /* max chat column width */
}
```

Dark mode follows the player's system preference automatically; force a scheme with `<html data-theme="dark">` (or `light`). The Trialogue 1.x variable names (`--bg-color`, `--user-color`, `--passage-bg-color`, `--passage-text-color`, `--navbar-bg-color`, `--speaker-color`) are still honored.

Style an individual speaker by targeting its `data-speaker` attribute:

```css
.chat-avatar[data-speaker="detective"] {
  background-image: url('detective.png');
  color: transparent;
}
.chat-passage[data-speaker="detective"] {
  background: #ffe8cc;
}
```

### Page chrome helpers

Call these from your story JavaScript to fill in the page around the chat:

```js
inject_left_sidebar('<h3>About</h3><p>…</p>');   // desktop-only left column
inject_right_sidebar('<p>…</p>');                // right column / mobile drawer
inject_hint('Choose an option to continue');     // text above the choices
inject_modal('Leave?', '<p>Progress will be lost.</p>', '<button data-dismiss="modal">Stay</button>');
inject_nav_back('← back');                       // shows a back link in the header
inject_nav_menu('menu');                         // custom label for the drawer button
```

The header always includes an Undo button (appears once there is something to undo) and a Restart button that asks for confirmation.

### Saving

- `story.save()` writes progress into the URL hash — players can bookmark or share it, and loading that URL replays the whole conversation.
- `story.config.autosave = true` additionally saves after every message and resumes automatically on the next visit. Restart clears the autosave.

## Using the format in Twine

In Twine 2: **Twine → Story Formats → Add** and paste the URL of a hosted copy of `dist/Twine2/Trialogue/format.js`, e.g. the GitHub Pages/raw URL for this repository.

## Development

```
npm install
npm run build   # build dist/Twine2/Trialogue/format.js
npm run demo    # build + compile docs/trialogue-demo.twee to docs/trialogue-demo.html
npm test        # build + demo + headless-browser smoke test
```

The demo compiler (`scripts/build-demo.js`) is a minimal Twee-to-HTML stand-in for [Tweego](https://www.motoslave.net/tweego/), so you can iterate on the format without external tools. Tweego still works too:

```
tweego --output=story.html story.twee --format=./dist/Twine2/Trialogue
```

## Migrating from Trialogue 1.x

Stories authored for 1.x work unchanged in most cases — speaker tags, links, special passages, templates, `inject_*` helpers, and the old CSS variable names are all still supported. Differences to be aware of:

- jQuery and Underscore are no longer bundled. Story JavaScript that used `$(…)` or `_.…` directly needs to be rewritten in plain JavaScript. (The `$` helper *inside passages* — `<% $(function() { … }) %>` — still works.)
- Story events (`startstory`, `showpassage`, `showpassage:after`, …) are now plain DOM `CustomEvent`s on `window`: `window.addEventListener('showpassage', e => …)` with data in `e.detail`.
- Passages are one bubble per paragraph by default; set `story.config.splitBubbles = false` for the old one-bubble-per-passage behavior.
- Twine 1 documents are no longer supported.

# Credits

Trialogue was created by [Philo van Kemenade](https://github.com/phivk). It is based on [Paloma](http://mcdemarco.net/tools/scree/paloma/) by M. C. DeMarco, a Jonah-style story format based on [Snowman](https://github.com/videlais/snowman) by [Chris Klimas](https://github.com/klembot) and [Dan Cox](https://videlais.com/).
