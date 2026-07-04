<p align="center"><img src="src/icon.svg" alt="Chatbook logo"></p>
<h1 align="center">Chatbook</h1>

Chatbook is a story format for [Twine 2](https://twinery.org/) that turns a branching narrative into an interactive chat story. Write a non-linear story in the Twine editor, select Chatbook as the story format, and play your story back as a modern text-message exchange.

👉 **Docs:** https://samplereality.github.io/chatbook/ · **Play the demo:** https://samplereality.github.io/chatbook/demo.html

Chatbook is a modernized successor to [Trialogue](https://github.com/phivk/trialogue) by Philo van Kemenade — its name a small homage to Twine's [Chapbook](https://klembot.github.io/chapbook/) format. The lineage runs Chatbook → Trialogue → [Paloma](http://mcdemarco.net/tools/scree/paloma/) → [Snowman](https://github.com/videlais/snowman).

## What's new in 2.0

**A modern messaging look**

- Message bubbles are grouped by speaker with iMessage-style corner shaping, a speaker name above each group, and an auto-colored avatar beside it.
- Each paragraph of a passage becomes its own bubble, so longer passages read like a real text exchange.
- Outgoing (player) messages render as accent-colored bubbles on the right; choices appear as quick-reply pill buttons.
- Passages containing only an image render frameless, like a photo message.
- Players can send photos from a picker; stories can branch on which image was sent.
- Voice-memo bubbles with a real player (waveform, play/pause, duration) via `[voice file.mp3]`.
- Location map cards via `[location lat,lon Label]`, and players can share their *real* coordinates for the story to react to.
- Read receipts (Delivered/Read) under the player's last message, with author control for dramatic effect — including a permanent, red "Not Delivered" failed state.
- Message reactions: speakers can tapback the player's messages, and players can react as a choice.
- Timed responses (a subtle meter reddens as time runs out — hesitate and the story moves without you) and free-text input for password/riddle beats, with the typed answer available to template logic.
- Thread clearing for flashbacks and scene changes (`clear` tag + timestamp chips).
- Timestamp chips, speaker profiles (display names, avatar images, bubble colors), optional message sounds, and a tab-title unread badge.
- Refined typing indicator, message entrance animations (disabled for players who prefer reduced motion), and automatic dark mode with a player-facing theme toggle.
- The story renders as a phone: full-bleed on mobile, a centered phone-width frame on larger screens.

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
- A passage **without** a `speaker-` tag belongs to the narrator — see [Narration](#narration) for the three ways it can be presented.
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

### Utility functions

The Snowman utility functions are built in (reimplemented without jQuery/Underscore), so snippets from Snowman documentation work in Chatbook:

```js
either('hey!', 'yo!', ['hiya!', 'hello hello'])  // random pick; arrays are flattened
hasVisited('some passage')                       // true once shown (array/multiple args = all of them)
visited('some passage')                          // number of times shown
renderToSelector('#somewhere', 'passage name')   // render a passage into any element
getStyles('extra.css')                           // load stylesheet(s); returns a Promise
```

`either()` is especially handy for making speakers less robotic:

```
:: ok [speaker-sam]
<%= either('how are you doing?', 'how are things?', "how's life?") %>
```

And `hasVisited()`/`visited()` pair naturally with thread clearing — history persists across a `clear`, so characters can reference scenes the player saw in a flashback.

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

### Voice memos

Put a `[voice …]` line in any passage to send an audio message with a proper voice-note player — play/pause button, waveform, and duration read from the file:

```
:: reply [speaker-sam]
I can explain everything

[voice audio/explanation.mp3]

[[go on]]
```

Any audio URL works, including data URIs for self-contained stories. Each memo is its own bubble; only one plays at a time. (A raw `<audio>` tag still works too — this just looks like a text exchange instead of a browser control.)

### Location sharing

Send a place as a map card with a `[location lat,lon Label]` line — it renders with a pin and opens OpenStreetMap when tapped:

```
:: meet [speaker-sam]
meet me here at midnight

[location 52.3676,4.9041 Amsterdam Centraal]

[[i'll be there]]
```

And the player can share their **real** location. A `location` link renders a pin button with the other choices; tapping it asks the browser for the player's coordinates (with the standard permission prompt):

```
:: where [speaker-sam]
where are you right now?

[[location:share my location->got-it]]
[[none of your business->got-it]]

:: got-it [speaker-sam]
<% if (s.playerLocation) { %>huh, <%= s.playerLocation.lat.toFixed(3) %>, <%= s.playerLocation.lon.toFixed(3) %>… that explains a lot<% } else { %>fine, keep your secrets<% } %>
```

If the player consents, their position is sent as an outgoing map card and stored in `s.playerLocation` (`{ lat, lon, accuracy }`); if they decline — or geolocation is unavailable — `s.playerLocation` is `null` and the story continues to the same target, so always write both branches. A `locationshared` event fires on success. This opens the door to site-specific storytelling: distance-gated scenes, stories that only unlock in a particular place, or characters who react to where the reader actually is. (Browsers require HTTPS for geolocation; label defaults live in `story.config.locationButtonLabel` / `locationBubbleLabel`.)

### Narration

Speakerless passages are the narrator's voice, and you choose where that voice lives relative to the fiction of the text exchange:

```js
story.config.metaStyle = 'chat';         // default
story.config.metaStyle = 'overlay';
story.config.metaStyle = 'notification';
```

- **`chat`** — centered system-style text inside the conversation (the classic Trialogue behavior Chatbook inherits). Tight and contained, reads like an iMessage system message.
- **`overlay`** — the narration floats over the blurred, dimmed chat, like the camera pulling back from the phone. The player's choices stay visible and tappable below it, and the veil lifts as soon as they choose or the next message arrives. Best for scene breaks and interiority that shouldn't pretend to be part of the phone.
- **`notification`** — the narration drops in as a phone-style notification banner (labeled with the story name by default; change it with `story.config.metaNotificationLabel`). It stays inside the device's fiction — the narrator as an app pinging you. Tapping the banner dismisses it.

Mix modes within one story by tagging individual passages `meta-chat`, `meta-overlay`, or `meta-notification` — a tag beats the global setting. Overlay and notification narration is ephemeral by design (it leaves no trace in the transcript), but it still participates in undo and save/restore, and the `read`/`unread` receipt tags work from any mode — narration saying *"hours pass"* over a message stuck on Delivered is exactly the kind of thing this is for.

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

**Failed to send.** Tag a passage `failed` (or call `story.markFailed()`) and the player's last message shows **Not Delivered** in red. Unlike other receipts, it stays visible on that message forever — a bounced message sits in the scrollback like a small wound — and automatic read receipts will never quietly override it. Good for dead numbers, no signal, blocked contacts, and messages sent to people who no longer exist.

### Reactions

Tapback badges, in both directions:

- **A speaker reacts to the player.** Put `[react ❤️]` on its own line in a passage and the emoji pops onto the corner of the player's last message when that passage shows. (From code: `story.react('❤️')`, or `story.react('😂', 'in')` to react to the speaker's own last message.)
- **The player reacts as a choice.** A `[[react:👍->Target]]` link renders as an emoji chip with the other responses. Choosing it sends *no bubble* — the tapback lands on the speaker's message, `s.lastReaction` records the emoji for branching, a `reaction` event fires, and the story continues to the target:

```
:: sam-reacts [speaker-sam]
[react ❤️]

right back at you

[[react:👍->reply]]
[[see you around->reply]]

:: reply [speaker-sam]
<% if (s.lastReaction === '👍') { %>a 👍 from you is all I need<% } else { %>see you around 👋<% } %>
```

One reaction per message; a newer one replaces it. Reactions participate in undo and save/restore.

### Timed responses

Put the player on the clock. A `timeout:` link arms a timer while the choices are showing — the thin rule above the reply panel becomes a meter, filling left to right and reddening as time runs out:

```
:: interrogation [speaker-detective]
well?? who were you with last night?

[[someone you don't know->alibi]]
[[no one->alone]]
[[timeout:8 …I need a lawyer->lawyer]]
```

Two flavors, depending on what expiry means:

- `[[timeout:8 some text->Target]]` — after 8 seconds, *an option is chosen for you*: the text is sent as the player's message, then the story continues to the target.
- `[[timeout:8->Target]]` — after 8 seconds, *the sender loses patience*: no player message is sent; the story simply moves to the target ("you still there??").

Any manual choice cancels the timer. `s.timedOut` is `true` when the last transition came from an expired timer (and `false` after any deliberate choice), so passages can call out the hesitation. A `timeout` event fires on expiry. Undo returns to the moment before — with the clock running again.

Accessibility: the time limit is announced to screen readers when the timer starts, and `story.config.timers = false` disables all timers — worth offering to players for whom time pressure is a barrier (the timeout link is simply ignored, leaving the ordinary choices).

### Free text input

For the moments when picking from a list won't do — passwords, names, incantations — let the player type. An `input:` link renders a real message composer (text field + send button) in the reply panel:

```
:: gatekeeper [speaker-sam]
what's the password? hint: it's where my servers live

[[input:type the password…->password-check]]

:: password-check [speaker-sam]
<% if ((s.lastInput || '').trim().toLowerCase() === 'amsterdam') { %>✅ you're in<% } else { %>❌ nope. think geography<% } %>

<% if ((s.lastInput || '').trim().toLowerCase() === 'amsterdam') { %>[[continue]]<% } else { %>[[input:try again…->password-check]]<% } %>
```

The text after `input:` is the field's placeholder. Whatever the player types is sent as their message and stored in `s.lastInput` (with every entry kept in `s.inputs`), so the target passage does the checking with ordinary template logic — exact match, `.includes()`, regular expressions, whatever the puzzle calls for. Conditional links (as above) let wrong guesses loop back for another try. A `textinput` event fires on every send. One composer per passage; it can sit alongside regular choice chips ("type the answer, or [[give up]]").

### Clearing the thread

For flashbacks, scene changes, or switching who the player is texting, tag a passage `clear` and the visible conversation wipes before it renders. Pair it with a timestamp for a clean cut:

```
:: flashback [speaker-sam clear]
[timestamp Three years earlier]

hey. you don't know me yet

[[who is this?->no-answer]]

:: back-to-now [speaker-sam clear]
[timestamp Today]

see? we go way back
```

`story.clearThread()` does the same from code. Story state and the save timeline are untouched (saves replay the whole route, clears included) — but undo deliberately cannot reach back across a cleared thread, so each scene's history is self-contained.

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

Dark mode follows the player's system preference until they pick a side with the header's sun/moon toggle — their choice is remembered per story (hide the toggle with `story.config.themeToggle = false`). Authors can force a scheme with `<html data-theme="dark">` (or `light`). The Trialogue 1.x variable names (`--bg-color`, `--user-color`, `--passage-bg-color`, `--passage-text-color`, `--navbar-bg-color`, `--speaker-color`) are still honored, and `--t-page-bg` themes the page behind the phone frame.

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

The story presents as a phone — a single chat column, full-bleed on small screens and a framed phone-width card on larger ones (width via `--t-chat-width`). Supplementary content lives in a Menu modal; fill it from your story JavaScript:

```js
inject_menu('<h3>About</h3><p>…</p>');           // content of the Menu modal
inject_nav_menu('about');                        // custom label for the Menu button (replaces the ☰ icon)
inject_hint('Choose an option to continue');     // text above the choices (same as story.config.hint)
inject_modal('Leave?', '<p>Progress will be lost.</p>', '<button data-dismiss="modal">Stay</button>');
inject_nav_back('← back');                       // shows a back link in the header
```

The hint is smarter than a static label: `story.config.inputHint` shows different text while a free-text composer is up (e.g. *"Type your reply to continue"*), and `story.config.hintFadeAfter = 4` retires the helper text entirely once the player has made that many moves — training wheels off. (`null` keeps hints forever; `0` never shows them.)

The Menu button (☰) only appears once the menu has content. The Trialogue 1.x helpers `inject_left_sidebar()` / `inject_right_sidebar()` — which used to render desktop side columns — still work as deprecated aliases, each filling an additional section of the menu. The header always includes an Undo button (↩, appears once there is something to undo), a light/dark toggle, and a Restart button that asks for confirmation.

### Saving

- `story.save()` writes progress into the URL hash — players can bookmark or share it, and loading that URL replays the whole conversation.
- `story.config.autosave = true` additionally saves after every message and resumes automatically on the next visit. Restart clears the autosave.

## Accessibility

Chatbook is built to WCAG 2.1 AA and tested with axe-core on every run of the test suite. What players get:

- **Screen readers:** the conversation is a `role="log"` live region, and messages are never moved or re-inserted in the DOM, so each one is announced exactly once. The typing indicator announces *"Sam is typing"* (localize via `story.config.typingLabel`), narration overlays and notifications are polite status regions, restoring a save replays silently instead of flooding the reader, and reactions, receipts, voice memos, and location cards all carry proper labels.
- **Keyboard:** every control is a real button or link with a visible focus indicator; after choosing a reply, focus stays anchored on the reply panel; dialogs are native `<dialog>` elements (focus trapping and Escape included).
- **Contrast & motion:** default palettes meet AA contrast in both themes, `prefers-contrast: more` adds stronger bubble boundaries, and `prefers-reduced-motion` disables animations.
- **Language:** the page declares `lang="en"` by default — set `story.config.lang = 'fr'` (etc.) for stories in other languages.

What authors should still do: write alt text in image HTML (`<img src="…" alt="…">`), give gallery images meaningful names (the photo picker uses them as labels), keep meaningful information out of color alone, and remember voice memos have no captions — pair important audio with text.

## Using the format in Twine

In Twine 2: **Twine → Story Formats → Add a New Format** and paste:

```
https://samplereality.github.io/chatbook/format.js
```

(That URL is the copy of `dist/Twine2/Chatbook/format.js` published by this repository's GitHub Pages site, redeployed automatically on every push to `main`.)

## Development

```
npm install
npm run build   # build dist/Twine2/Chatbook/format.js
npm run demo    # build + compile docs/chatbook-demo.twee to docs/chatbook-demo.html
npm test        # build + demo + headless-browser smoke test
```

The demo compiler (`scripts/build-demo.js`) is a minimal Twee-to-HTML stand-in for [Tweego](https://www.motoslave.net/tweego/), so you can iterate on the format without external tools. Tweego still works too:

```
tweego --output=story.html story.twee --format=./dist/Twine2/Chatbook
```

## Migrating from Trialogue

Stories authored for Trialogue work unchanged in most cases — speaker tags, links, special passages, templates, `inject_*` helpers, and the old CSS variable names are all still supported. Differences to be aware of:

- jQuery and Underscore are no longer bundled. Story JavaScript that used `$(…)` or `_.…` directly needs to be rewritten in plain JavaScript. (The `$` helper *inside passages* — `<% $(function() { … }) %>` — still works, and the Snowman utility functions `either()`, `hasVisited()`, `visited()`, `renderToSelector()`, and `getStyles()` are built in.)
- Story events (`startstory`, `showpassage`, `showpassage:after`, …) are now plain DOM `CustomEvent`s on `window`: `window.addEventListener('showpassage', e => …)` with data in `e.detail`. The Snowman 2 event names (`sm.story.started`, `sm.passage.showing`, `sm.passage.shown`, `sm.passage.hidden`, `sm.story.saved`, `sm.restore.success`, `sm.restore.failed`, `sm.story.error`) are dispatched as aliases, so snippets written for Snowman 2 documentation work too.
- Passages are one bubble per paragraph by default; set `story.config.splitBubbles = false` for the old one-bubble-per-passage behavior.
- Twine 1 documents are no longer supported.

# Credits

Chatbook builds on [Trialogue](https://github.com/phivk/trialogue) by [Philo van Kemenade](https://github.com/phivk), which is based on [Paloma](http://mcdemarco.net/tools/scree/paloma/) by M. C. DeMarco, a Jonah-style story format based on [Snowman](https://github.com/videlais/snowman) by [Chris Klimas](https://github.com/klembot) and [Dan Cox](https://videlais.com/). The name is an homage to Klimas's [Chapbook](https://klembot.github.io/chapbook/) format.
