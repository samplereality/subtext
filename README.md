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
- Players can send photos from a picker; stories can branch on which image was sent.
- Read receipts (Delivered/Read) under the player's last message, with author control for dramatic effect.
- Timestamp chips, speaker profiles (display names, avatar images, bubble colors), optional message sounds, and a tab-title unread badge.
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
story.config.readReceipts = true;  // Delivered/Read under the last message
story.config.autoRead = true;      // replies mark the last message read
story.config.sounds = false;       // subtle send/receive sounds (opt-in)
story.config.titleNotifications = true; // "(2) Story" tab title when hidden
```

### Photo messages

Let the player reply with a picture instead of words. First, declare the story's image gallery in a passage named `StoryImages`, one image per line:

```
:: StoryImages
sunny: https://example.com/sunny.jpg
rainy: images/rainy.png
selfie: data:image/svg+xml,%3Csvg …%3E
```

(Any URL works — hosted files, relative paths, or data URIs for fully self-contained stories. Entries can also be added from story JavaScript via `story.gallery`.)

Then offer photos in a passage using `photo:` links. A camera button appears with the other choices; tapping it opens a picker sheet, and the selected image is sent as an outgoing photo message before the story continues to the link's target:

```
:: pretty good [speaker-1]
what's the weather like where you are? send me a photo!

[[photo:*->photo-reply]]
[[rather not say->Start]]
```

- `[[photo:*->Target]]` offers the whole gallery
- `[[photo:sunny->Target]]` offers a single image
- `[[photo:sunny,rainy->Target]]` offers a subset
- Several `photo:` links with different targets can branch per image

**Tracking what was sent:** the choice is recorded in story state, so passages can react to it:

```
:: photo-reply [speaker-1]
<% if (s.lastPhoto === 'sunny') { %>enjoy the sunshine!<% } else { %>stay dry!<% } %>

you've sent <%= s.sentPhotos.length %> photo(s)
```

`s.lastPhoto` is the most recently sent image name; `s.sentPhotos` is an array of every image sent. Both participate in undo and save/restore like any other state, and a `photosent` event (`window.addEventListener('photosent', e => …)`, with `e.detail.name` and `e.detail.target`) fires on every send. Related config: `story.config.photoButtonLabel`, `story.config.photoPickerTitle`, and `story.config.preloadImages` (warms the browser cache for gallery images at startup, on by default).

### Speaker profiles

Give speakers display names, avatar images, and bubble colors in one place with a `StorySpeakers` passage — one speaker per line, using the speaker id from the tag (the part after `speaker-`):

```
:: StorySpeakers
detective: Detective Marlowe; avatar: images/marlowe.png; color: #8e44ad
happy-bot: Chip; color: #148f77
you: color: #34c759
```

- The first segment (or `name:`) sets the display name shown above the speaker's messages and used for the avatar initial.
- `avatar:` sets an avatar image (any URL or data URI); without one, the speaker gets an initial on a stable auto-generated color.
- `color:` tints that speaker's bubbles (and avatar); text automatically switches between dark and light for contrast. A `you` entry recolors the player's outgoing bubbles.

Profiles are also scriptable: `story.speakers['detective'] = { name: 'Marlowe', … }` in your story JavaScript. Anything not covered by a profile can still be styled with CSS via `data-speaker` attributes.

### Read receipts

Player messages show a **Delivered** status that flips to **Read** when a speaker replies (only the most recent message displays its receipt, iMessage-style). The receipt participates in undo and save/restore.

Silence can be louder than a reply — so you control the receipt:

- Tag a passage `unread` and showing it will *not* mark the player's message as read (a meta passage narrating "hours pass…" while the message sits on Delivered).
- Tag a passage `read` to force the flip — even from a meta passage. Read with no reply coming is peak dramatic tension.
- From JavaScript or inside a passage template: `<% story.markRead() %>`, `<% story.markUnread() %>`, or with a custom label, `<% story.markRead('Read 11:58 PM') %>`.
- Set `story.config.autoRead = false` to take full manual control, or `story.config.readReceipts = false` to turn receipts off entirely. Labels are configurable via `story.config.receiptLabels`.

### Timestamps

Add centered timestamp chips, like a conversation that unfolds over time:

```
:: morning [speaker-detective]
[timestamp Tuesday 9:41 AM]
any progress on the case?

[[some->progress]]
```

A `[timestamp …]` line at the start of any passage renders as a chip above the message (it also resets message grouping, as a time gap should). Alternatively, tag a whole passage `timestamp` to render its text as chips. Timestamps are purely presentational — write whatever fits your story's clock.

### Notifications

- `story.config.sounds = true` enables subtle synthesized send/receive sounds (no audio files needed). Browsers allow sound only after the player's first interaction, so the very first messages are always silent.
- While the tab is hidden, incoming messages update the title to `(2) Your Story Name` and it resets when the player returns (`story.config.titleNotifications`, on by default).

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
