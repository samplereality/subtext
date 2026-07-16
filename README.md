<p align="center"><img src="src/icon.svg" alt="Subtext logo"></p>
<h1 align="center">Subtext</h1>

Subtext is a story format for [Twine 2](https://twinery.org/) that turns a branching narrative into an interactive chat or text-message story.

**Docs:** https://samplereality.github.io/subtext/  
**Play the demo:** https://samplereality.github.io/subtext/demo.html

Subtext is a successor to [Trialogue](https://github.com/phivk/trialogue) by Philo van Kemenade. The name is what chat fiction runs on: the message left on *Delivered*, the *Read* with no reply, the typing that starts and stops — everything underneath what's actually said. The lineage runs Subtext → Trialogue → [Paloma](http://mcdemarco.net/tools/scree/paloma/) → [Snowman](https://github.com/videlais/snowman).

## Table of contents

**Getting started** — [Add Subtext to Twine](#add-subtext-to-twine) · [Your first passage](#your-first-passage) · [Using Tweego](#using-tweego) · [Building from source](#building-from-source)

**Reference** — [Special passages](#special-passages) · [Passage tags](#passage-tags) · [The design language](#the-design-language) · [Story state](#story-state) · [Configuration](#configuration) · [Utility functions](#utility-functions) · [API index](#api-index) · [Events](#events)

**Messages** — [Photo messages](#photo-messages) · [Voice memos](#voice-memos) · [Location sharing](#location-sharing) · [Timestamps](#timestamps) · [System messages](#system-messages) · [Deleted messages](#deleted-messages) · [Read receipts](#read-receipts) · [Reactions](#reactions) · [Message chains and montages](#message-chains-and-montages)

**Narration** — [Narration modes](#narration) · [Asides](#asides)

**Player input** — [Reply pills and sent text](#reply-pills-and-sent-text) · [Timed responses](#timed-responses) · [Free text input](#free-text-input)

**Speakers and appearance** — [Speaker profiles](#speaker-profiles) · [Theming](#theming)

**Story structure** — [Clearing the thread](#clearing-the-thread) · [Multiple conversations](#multiple-conversations) · [Saving](#saving)

**Interface** — [Notifications](#notifications) · [Page chrome and menus](#page-chrome-and-menus) · [Debug mode](#debug-mode)

**More** — [Extending Subtext](#extending-subtext) · [Recipes](#recipes) · [Accessibility](#accessibility) · [Migrating from Trialogue](#migrating-from-trialogue) · [Changelog](#changelog) · [Credits](#credits)

## Getting started

Subtext's one big idea: **every passage is a message.** Tag a passage with who's speaking, write what they say, and offer the player some replies — the format handles the bubbles, the typing indicator, the timing, and the read receipts.

### Add Subtext to Twine

In Twine 2: **Twine → Story Formats → Add a New Format** and paste:

```
https://samplereality.github.io/subtext/format.js
```

(That URL is the copy of `dist/Twine2/Subtext/format.js` published by this repository's GitHub Pages site, redeployed automatically on every push to `main`.) Then set it as your story's format under **Story → Details**.

### Your first passage

Tag a passage `speaker-<name>` to say who sends it:

```
:: Start [speaker-detective]
Something doesn't add up here.

Meet me at the docks in an hour?

[[on my way]]
[[why the docks?]]
```

- Each paragraph (blank-line separated) becomes its own bubble.
- `[[links]]` become the player's quick-reply choices. The usual Twine link forms work: `[[display|target]]`, `[[display->target]]`, `[[target<-display]]`. A pill can also send different text than it shows — see [Reply pills and sent text](#reply-pills-and-sent-text).
- A passage **without** a `speaker-` tag belongs to the narrator — see [Narration](#narration) for the ways it can be presented.
- Speaker names get an avatar automatically (initial + a stable color derived from the name). Multi-word names use dashes: `speaker-happy-bot` displays as "happy bot".
- Markdown, inline HTML, and Snowman-style `<%= s.variable %>` templates are all supported. Story state lives in `s` (an alias for `window.story.state`).

That's a complete, playable story. Everything below adds to it.

### Using Tweego

Prefer writing Twee in a text editor? Subtext works with [Tweego](https://www.motoslave.net/tweego/), the command-line Twine compiler.

**1. Install the format where Tweego can find it.** Tweego looks for story formats in a `storyformats` directory — next to your project, next to the `tweego` binary, or anywhere listed in the `TWEEGO_PATH` environment variable. Each format lives in its own subdirectory containing a `format.js`:

```bash
mkdir -p storyformats/subtext
curl -o storyformats/subtext/format.js https://samplereality.github.io/subtext/format.js
```

(Or copy `dist/Twine2/Subtext/` from a clone of this repository into `storyformats/`.) Confirm it's visible — and note its ID — with:

```bash
tweego --list-formats
```

**2. Declare the format in your StoryData passage** so both Tweego and Twine select it automatically:

```
:: StoryData
{
  "ifid": "YOUR-STORY-IFID",
  "format": "Subtext",
  "format-version": "2.7.1"
}
```

(Every story needs its own unique IFID — Tweego generates one for you if the field is missing, and prints it so you can paste it in.)

**3. Compile:**

```bash
tweego -o story.html story.twee
```

If you skip the StoryData declaration, pass the format explicitly with `-f subtext` (the ID from `--list-formats`). Other handy invocations:

```bash
tweego -w -o story.html story.twee    # watch mode: recompile on every save
tweego -t -o story.html story.twee    # test build: enables the debug panel
tweego -d -o story.twee story.html    # decompile a published story back to Twee
```

Watch mode pairs beautifully with [debug mode](#debug-mode): run `tweego -w -t`, open the output in a live-preview browser tab, and every save recompiles while the story keeps your place.

This repository's demo story, [`docs/subtext-demo.twee`](docs/subtext-demo.twee), is a ready-made example of a Tweego-compatible Subtext project.

### Building from source

```
npm install
npm run build   # build dist/Twine2/Subtext/format.js
npm run demo    # build + compile docs/subtext-demo.twee to docs/subtext-demo.html
npm test        # build + demo + headless-browser smoke test
```

The demo compiler (`scripts/build-demo.js`) is a minimal Twee-to-HTML stand-in for Tweego, so you can iterate on the format without external tools. Tweego works too — see [Using Tweego](#using-tweego), pointing `storyformats/subtext/` at the freshly built `dist/Twine2/Subtext/`.

## Special passages

A handful of passage *names* have special meaning (the Twine convention). Most are optional.

| Passage | Purpose |
| --- | --- |
| `StoryTitle` | The story's name (Twine standard) |
| `StoryData` | IFID and format metadata (Twine standard) |
| `StorySubtitle` | Subtitle shown with the story title (place via [`titlePlacement`](#page-chrome-and-menus)) |
| `StoryAuthor` | Author credit shown with the subtitle (same placement) |
| `StoryColophon` | Appended as a meta message when a passage tagged `End` is shown |
| `StorySpeakers` | Speaker display names, avatars, and colors — see [Speaker profiles](#speaker-profiles) |
| `StoryImages` | The photo gallery — see [Photo messages](#photo-messages) |
| `StoryThreads` | Conversation list; its presence enables [Multiple conversations](#multiple-conversations) |
| tag `script` | Story JavaScript (Twine's Edit Story JavaScript also works) |
| tag `stylesheet` | Story CSS (Twine's Edit Story Stylesheet also works) |

## Passage tags

And a handful of passage *tags* change how a passage behaves. Tags combine freely (`[speaker-sam thread-mom clear]`).

| Tag | Effect | Section |
| --- | --- | --- |
| `speaker-<id>` | Marks who sends the message | [Your first passage](#your-first-passage) |
| `thread-<id>` | Routes the passage to a conversation | [Multiple conversations](#multiple-conversations) |
| `seed` | Renders the passage into its thread as pre-existing, read history | [Multiple conversations](#multiple-conversations) |
| `meta-chat` / `meta-overlay` / `meta-notification` | Overrides the narration mode for one passage | [Narration](#narration) |
| `aside-left` / `aside-right` | Renders narration as a margin note | [Asides](#asides) |
| `aside-beats-<n>` / `aside-hold` / `aside-up-<n>` / `aside-down-<n>` | Tune an aside's lifetime and placement | [Asides](#asides) |
| `instant` | The passage arrives with no typing indicator (with an explicit delay: a silent wait) | [Message chains and montages](#message-chains-and-montages) |
| `clear` | Wipes the visible thread before rendering | [Clearing the thread](#clearing-the-thread) |
| `timestamp` | Renders the passage's text as timestamp chips | [Timestamps](#timestamps) |
| `read` / `unread` | Forces or suppresses the read receipt | [Read receipts](#read-receipts) |
| `unlinked` | Marks a deliberately unlinked passage so the debug story check stays quiet | [Debug mode](#debug-mode) |
| `failed` | Marks the player's last message *Not Delivered* | [Read receipts](#read-receipts) |
| `End` (or `end`) | Appends `StoryColophon` when shown | [Special passages](#special-passages) |

## The design language

Everything you write in a passage falls into one of three shapes, each with one job:

1. **`[directive …]` on its own line** puts something *inside* a message — `[timestamp …]`, `[system …]`, `[voice …]`, `[location …]`, `[react …]`, `[deliver …]`, `[tombstone]`. Square brackets, lowercase, one line.
2. **`prefix:` at the start of a link label** makes a special *kind* of reply — `photo:`, `location:`, `react:`, `input:`, `timeout:`. (Bare `photo`, `location`, and `input` work as shorthand for the argument-less form.)
3. **`(send: …)` at the end of a link label** *modifies* an ordinary reply — what it sends, or whether it sends anything.

There's a symmetry running through the first two: **incoming is a directive, outgoing is a link prefix.** `[react ❤️]` is the speaker reacting; `react:👍` is the player reacting. `[location …]` is a pin they send; `location:` is the player sharing theirs. If you remember that, you can usually guess the syntax you've never looked up.

## Story state

Everything the format tracks automatically lives in `s` (alias of `story.state`), participates in undo and save/restore, and is watchable live in [debug mode](#debug-mode):

| `s` value | Is | Set by |
| --- | --- | --- |
| `s.lastChoice` | Label of the last reply pill tapped | any choice — [details](#reply-pills-and-sent-text) |
| `s.previousPassage` | Name of the passage shown before this one | every passage |
| `s.replySeconds` | Seconds the player deliberated over the last choice | any response |
| `s.timedOut` | Whether the last transition came from an expired timer | [timed responses](#timed-responses) |
| `s.lastInput` / `s.inputs` | Last typed text / every entry | [free text input](#free-text-input) |
| `s.lastPhoto` / `s.sentPhotos` | Last photo sent / every photo | [photo messages](#photo-messages) |
| `s.playerLocation` | `{ lat, lon, accuracy }` or `null` | [location sharing](#location-sharing) |
| `s.lastReaction` | Emoji of the player's last tapback | [reactions](#reactions) |

For values that should *survive* restart, see [remembering across playthroughs](#remember-across-playthroughs).

## Messages

A message can carry more than text. Each of these is written as a `[directive …]` line or a special link, and each is its own bubble.

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

- `[[photo:*->Target]]` (or bare `[[photo->Target]]`) offers the whole gallery
- `[[photo:sunny->Target]]` offers a single image
- `[[photo:sunny,rainy->Target]]` offers a subset
- Several `photo:` links with different targets can branch per image

**Tracking what was sent:** the choice is recorded in story state, so passages can react to it:

```
:: photo-reply [speaker-1]
<% if (s.lastPhoto === 'sunny') { %>enjoy the sunshine!<% } else { %>stay dry!<% } %>

you've sent <%= s.sentPhotos.length %> photo(s)
```

`s.lastPhoto` is the most recently sent image name; `s.sentPhotos` is an array of every image sent. Both participate in undo and save/restore like any other state, and a `photosent` event fires on every send (see [Events](#events)). Related config: `story.config.photoButtonLabel`, `story.config.photoPickerTitle`, and `story.config.preloadImages` (warms the browser cache for gallery images at startup, on by default).

**Viewing photos.** Every image in the chat — sent, received, or seeded — opens fullscreen in a lightbox on tap (dimmed backdrop; tap anywhere or press <kbd>Esc</kbd> to close). Images are keyboard-focusable, and an image's `alt` text labels it for screen readers. Opt an image out with `data-lightbox="off"` in its markup.

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

The player can share their **real** location. A `location:` link renders a pin button with the other choices; tapping it asks the browser for the player's coordinates (with the standard permission prompt):

```
:: where [speaker-sam]
where are you right now?

[[location:share my location->got-it]]
[[none of your business->got-it]]

:: got-it [speaker-sam]
<% if (s.playerLocation) { %>huh, <%= s.playerLocation.lat.toFixed(3) %>, <%= s.playerLocation.lon.toFixed(3) %>… that explains a lot<% } else { %>fine, keep your secrets<% } %>
```

If the player consents, their position is sent as an outgoing map card and stored in `s.playerLocation` (`{ lat, lon, accuracy }`); if they decline — or geolocation is unavailable — `s.playerLocation` is `null` and the story continues to the same target, so always write both branches. A `locationshared` event fires on success (see [Events](#events)). This opens the door to site-specific storytelling: distance-gated scenes, stories that only unlock in a particular place, or characters who react to where the reader actually is. (Browsers require HTTPS for geolocation; label defaults live in `story.config.locationButtonLabel` / `locationBubbleLabel`.)

### Timestamps

Add centered timestamp chips, like a conversation that unfolds over time:

```
:: morning [speaker-detective]
[timestamp Tuesday 9:41 AM]
any progress on the case?

[[some->progress]]
```

A `[timestamp …]` line at the start of any passage renders as a chip above the message (it also resets message grouping, as a time gap should). Alternatively, tag a whole passage `timestamp` to render its text as chips. Timestamps are purely presentational — write whatever fits your story's clock. When a chip leads a speaker's reply, it appears the moment the reply starts "typing," the way it would on a real phone.

### System messages

The connective tissue of a real messaging app — departures, joins, missed calls, group renames — gets its own chip:

```
:: sam-goes-dark [speaker-sam]
I've said too much already

[system Sam has left the conversation]

[[wait—->gone]]
```

`[system …]` renders as a centered, italic event chip (style it via `.chat-system`). It differs from a timestamp in two deliberate ways: a chip *after* the message lands below it — a departure follows the last word — and it is **never shown early** while the reply is still typing; events land in sequence, only clocks may front-run. Works in [seeds](#multiple-conversations) too, for history like *"Missed call"*.

### Deleted messages

Real chat apps don't erase a deleted message — they leave a scar: *"This message was deleted."* Subtext does the same, in both directions:

**Deleting live.** `story.redactMessage()` turns the newest message into a tombstone in place — the bubble stays, its content becomes the italic ghost. `redactMessage('out')` (the default) targets the player's newest message in the current thread, `redactMessage('in')` the other side's; calling it again deletes the one before, and so on. Wire it to a reply pill and the player can do the deleting:

```
:: regret [speaker-you]
[[Delete message (send:)->they noticed]]
[[leave it->brazen it out]]

:: they noticed [speaker-sam]
<% story.redactMessage('out') %>um. I saw that before you deleted it

[[you saw nothing->denial]]
```

Tapping **Delete message** posts nothing, the player's last text collapses into the tombstone, and Sam reacts — which is the point: a delete another character notices is a *scene*. A `redact` event fires, and deletions participate in undo and save/restore. The wording comes from `story.config.redactedLabel`; pass a one-off override as the second argument — `story.redactMessage('out', 'You deleted this message')`.

**Seeding old deletions.** In pre-existing history (or anywhere else), the `[tombstone]` directive renders a message that was already deleted before the story began:

```
:: family-history [thread-family speaker-matt seed]
[tombstone]
```

Bare `[tombstone]` uses the configured wording; `[tombstone You deleted this message]` overrides it. A tombstone among the old texts is a question the player can't ask anyone — use accordingly.

(Why redaction instead of removal: the conversation is a screen-reader live region, and removing nodes from it makes assistive tech re-announce the log. The tombstone keeps the DOM stable and reads exactly like the real thing.)

### Read receipts

Player messages show a **Delivered** status that flips to **Read** the moment a speaker's reply is *queued* — before the typing indicator starts, the way a real phone orders it: they read your message, then they started typing. (Only the most recent message displays its receipt, iMessage-style.) The receipt participates in undo and save/restore.

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

### Message chains and montages

A passage can send the next one itself — no reply pill in between — by calling `story.showDelayed()` from a template:

```
:: Hobby 1 [speaker-jo]
[timestamp Mar 14, 2011]
picked up a ukulele at a yard sale. how hard can it be

<% story.showDelayed('Hobby 2') %>

:: Hobby 2 [speaker-jo]
[timestamp Aug 2, 2014]
update: the ukulele is now decorative

<% story.showDelayed('Hobby 3', 500) %>

:: Hobby 3 [speaker-jo]
[timestamp Jan 9, 2019]
guess who just joined a ukulele band

[[Eight years, three texts.->Hobby Reflection]]
```

With no second argument each link in the chain paces itself like any reply: the typing indicator runs for a duration based on the message's length, and a leading `[timestamp …]` chip appears while the dots bounce. Pass a number of milliseconds to set the pace yourself — **`0` shows the next message instantly, with no typing indicator at all**, which turns a chain like the one above into a time-lapse montage: years of texts landing beat after beat. The chips stay glued to their messages either way, and the chain survives saving, undo, and reloading mid-flight.

The same call works anywhere story JavaScript runs — `story.showDelayed('Jo', 2000)` from an event listener recreates Trialogue's old `_.delay(...)` idiom in one line.

To let the *player* pace the montage instead — a beat between texts so each one can be read — put a silent pill between passages and tag each incoming passage `instant`, so tapping the pill lands the next message immediately, with no typing indicator:

```
:: Hobby 1 [speaker-jo]
[timestamp Mar 14, 2011]
picked up a ukulele at a yard sale. how hard can it be

[[and then?(send:)->Hobby 2]]

:: Hobby 2 [speaker-jo instant]
[timestamp Aug 2, 2014]
update: the ukulele is now decorative

[[and then?(send:)->Hobby 3]]
```

The `instant` tag means "this message never shows typing dots," however the passage is reached — a pill, a chain, a `story.show()`, a `story.deliver()`. The tag and an explicit delay compose: the delay says *when* the message arrives, the tag says *how*. So `<% story.showDelayed('later', 10000) %>` targeting an `instant`-tagged passage is a **silent wait** — ten quiet seconds, no typing indicator, then the message just lands. Without the tag, the same call shows the speaker typing for the whole delay. `story.deliver()` follows the same grammar: it paces by message length (with a "typing…" state in the inbox), an `instant`-tagged target lands at once, and a numeric second argument — `story.deliver('jan6 2', 2000)` — sets the pace yourself.

## Narration

Speakerless passages are the narrator's voice, and you choose where that voice lives relative to the fiction of the text exchange:

```js
story.config.metaStyle = 'chat';         // default
story.config.metaStyle = 'overlay';
story.config.metaStyle = 'notification';
story.config.metaStyle = 'aside';
```

- **`chat`** — centered system-style text inside the conversation (the original Trialogue behavior Subtext inherits). Tight and contained, reads like an iMessage system message.
- **`overlay`** — the narration floats over the blurred, dimmed chat, like the camera pulling back from the phone. The player's choices stay visible and tappable below it, and the veil lifts as soon as they choose or the next message arrives. Best for scene breaks and interiority that shouldn't pretend to be part of the phone.
- **`notification`** — the narration drops in as a phone-style notification banner (labeled with the story name by default; change it with `story.config.metaNotificationLabel`). It stays inside the device's fiction — the narrator as an app pinging you. Tapping the banner dismisses it.
- **`aside`** — the narration appears as a note in the margin *beside* the phone, level with the latest message, and rides along as the chat scrolls — marginalia from a narrator standing entirely outside the device. See [Asides](#asides) below.

Mix modes within one story by tagging individual passages `meta-chat`, `meta-overlay`, `meta-notification`, or `meta-aside` — a tag beats the global setting. Overlay and notification narration is ephemeral by design (it leaves no trace in the transcript), but it still participates in undo and save/restore, and the `read`/`unread` receipt tags work from any mode — narration saying *"hours pass"* over a message stuck on Delivered is exactly the kind of thing this is for.

### Asides

Asides complete the spectrum of narrative distance: `chat` narration lives inside the conversation, `notification` inside the phone's OS, `overlay` interrupts the device — and an aside stands outside it altogether, a serif note pinned in the margin that comments on the exchange without touching it.

Tag a speakerless passage with a side and it becomes an aside:

```
:: the-observer [aside-right]
She has no idea who she's really texting.

[[keep reading->next-message]]
```

The note appears level with the most recent message, tracks it as new messages push the chat upward, and fades away after a few beats (a beat = any new message in that conversation). Fine-tune with additional tags:

| tag | effect |
| --- | --- |
| `aside-left` / `aside-right` | which margin the note appears in |
| `aside-beats-5` | how many messages it survives (default `3`, or `story.config.asideBeats`) |
| `aside-hold` | never expires on its own — stays until it scrolls off, is replaced, or the thread is cleared |
| `aside-up-2` / `aside-down-2` | nudge the note up or down by N rem for fine placement |

One aside per side can be live at a time; a new one replaces the old. In multi-conversation stories an aside belongs to the thread it fired in and hides while the player is elsewhere. Asides are ephemeral commentary: they vanish on undo and are not replayed from saves (the passage still records in history, so `hasVisited()` works).

**On phones there is no margin**, so the note floats over the chat's edge instead — translucent and slightly tilted, like a sticky note stuck on the glass. If you'd rather it degrade to a centered in-chat chip on small screens, set `story.config.asideMobile = 'chip'`.

For screen readers the aside layer is a polite live region and each note is announced as it appears, so visually-marginal narration is never lost.

## Player input

Beyond tapping a reply pill, the player can be given the clock, a keyboard, or a pill that says one thing and sends another.

### Reply pills and sent text

By default a pill's label is also what gets sent as the player's message. Add a `(send: …)` suffix to the label to send something different — great for a terse pill that reads fuller in the thread, or a "start" button that shouldn't literally say "start":

```
[[sure (send: sure, that works — see you at midnight)->meet]]
[[start (send:)->intro]]      // pill says "start", sends nothing
```

An empty `(send:)` sends no bubble at all — the story just advances. (From code, `story.choose(target, text)` does the same; pass an empty string to advance silently.) The suffix works in every link form, including the shorthand where the label is the target: `[[what? (send: what? || tell me)]]` targets the passage named `what?`.

And `||` inside the sent text breaks it into separate bubbles, fired off in quick succession — one tap, a flurry of texts:

```
[[what happened (send: ok || here's the thing || promise you won't be mad)->confession]]
```

**Tracking which pill was tapped.** Every choice records its pill label in `s.lastChoice`, so several pills can share a target and the passage can still tell them apart:

```
:: Start [speaker-you]
[[hey (send:)->roomie replies]]
[[did you eat my leftovers (send:)->roomie replies]]

:: roomie replies [speaker-jesse]
<% if (s.lastChoice === 'did you eat my leftovers') { %>...i can explain<% } else { %>oh hey what's up<% } %>
```

The *label* is what's recorded (not the `(send:)` text), even when nothing is sent at all. Matching is exact, so mind capitalization — or compare with `s.lastChoice.toLowerCase()`. Like all state it participates in undo and save/restore. Timed-out forced replies don't overwrite it; check `s.timedOut` for those. (Photos, locations, reactions, and typed input have their own trackers: `s.lastPhoto`, `s.playerLocation`, `s.lastReaction`, `s.lastInput`.)

### Timed responses

Put the player on the clock. A `timeout:` link arms a timer while the choices are showing. The thin rule above the reply panel becomes a meter, filling left to right and reddening as time runs out:

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

For the moments when picking from a list won't do, like passwords, names, incantations, there's a free text input option. An `input:` link renders a real message composer (text field + send button) in the reply panel:

```
:: gatekeeper [speaker-sam]
what's the password? hint: it's where my servers live

[[input:type the password…->password-check]]

:: password-check [speaker-sam]
<% if ((s.lastInput || '').trim().toLowerCase() === 'amsterdam') { %>✅ you're in<% } else { %>❌ nope. think geography<% } %>

<% if ((s.lastInput || '').trim().toLowerCase() === 'amsterdam') { %>[[continue]]<% } else { %>[[input:try again…->password-check]]<% } %>
```

The text after `input:` is the field's placeholder. Whatever the player types is sent as their message and stored in `s.lastInput` (with every entry kept in `s.inputs`), so the target passage does the checking with ordinary template logic — exact match, `.includes()`, regular expressions, whatever the puzzle calls for. Conditional links (as above) let wrong guesses loop back for another try. A `textinput` event fires on every send. One composer per passage; it can sit alongside regular choice chips ("type the answer, or [[give up]]").

## Speakers and appearance

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

## Story structure

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

### Multiple conversations

Weave several chats at once — a contacts inbox with unread badges, messages that arrive while the player is talking to someone else, the whole mystery/epistolary toolkit. **This is entirely opt-in:** a story with no `StoryThreads` passage behaves exactly as everything above describes — one conversation, no inbox, nothing to think about. Add a `StoryThreads` passage and the format switches on multi-conversation mode.

Declare your conversations like speakers (same `name`/`avatar`/`color` fields):

```
:: StoryThreads
sam: Sam
mom: Mom
unknown: Unknown Number; color: #52525e
```

Assign passages to a thread by tagging them `thread-<id>`. Untagged passages stay in whatever thread the story is currently in, so you only tag the *switches*:

```
:: Start [thread-sam speaker-sam]
you up? something happened at the lab

[[what happened??->reply]]

:: reply [speaker-sam]
not over text. I'm checking something
```

Three things move the story between threads:

- **A link to a passage in another thread** pulls the whole conversation there — the player follows the story's cursor, and the header shows the new contact. This is the normal way to advance.
- **`[deliver passage-name]`** drops a passage into *its* thread **without** moving the story. The conversation the player is in keeps its choices; the other thread just lights up with a new message and an unread badge. This is the epistolary engine — while you're texting Sam, Mom's thread fills up in the background:

  ```
  :: reply [speaker-sam]
  stay put. and whatever you do, don't answer unknown numbers

  [deliver unknown-1]

  [[why?->reply-2]]

  :: unknown-1 [thread-unknown speaker-unknown]
  I know you're awake.
  ```

  If the delivered passage offers reply pills of its own, the story's pending choices travel with it: they appear when the player opens that thread, and the reply lands there. That makes `[deliver]` a way to *hand the story off* to another conversation — end a beat with no pills, deliver a message that has them, and the player follows the notification to answer it. (If several pending passages offer pills, the last to arrive wins.)

  Deliveries pace themselves by message length, with a "typing…" state on the thread's inbox row. The target's `instant` tag skips both, and `story.deliver('name', 2000)` sets an explicit delay — the same [pacing grammar](#message-chains-and-montages) as `showDelayed()`.

  A delivered message keeps its own sender. Any speaker can text into any thread, so group chats work: in a `thread-family` conversation, a passage tagged `speaker-matt` shows Matt's name and color on the bubble, and the notification banner and inbox preview read "Matt: …" under the thread's name — the way a real phone attributes group messages.

- **The player**, by opening the inbox (the ‹ chevron on the header's left) or tapping a notification banner, can read any thread at any time. The chevron itself is yours to stage: `story.config.inboxButton = false` starts the story feeling like a single conversation, and `<% story.showInboxButton() %>` in a later passage reveals that there was a whole inbox all along (`hideInboxButton()` reverses it). Only the thread holding the story's pending choices shows reply chips; a parked thread shows a grayed-out composer instead — *"Nothing to say right now"* — so the read-only state stays inside the fiction (wording via `story.config.threadIdleHint`; set `''` for none).

The **inbox** lists every thread with its avatar, a preview of the last message, a live "typing…" indicator, and an unread count, sorted by most recent activity. Unread badges accumulate on conversations the player isn't looking at and clear when they open them. Banners behave like real notifications: long messages are cut off with an ellipsis, media-only messages read as their kind (`📷 Photo`, `🎤 Voice message`, `📍 Location` — wording via `config.previewLabels`), several arrivals **queue** and show one at a time (`config.bannerSeconds` each; a newer message from the same thread updates its banner in place), and inbox previews follow the same rules.

**Group chats.** Give a thread `members:` — a comma-separated list of speaker ids — and it becomes a group conversation:

```
:: StoryThreads
family: The Fam; members: mom, matt
```

The members appear under the thread's name in the header, the inbox row shows a cluster of the first two members' avatars, and every notification banner and inbox preview names its sender ("Matt: …"), the way a real phone attributes group messages. Inside the thread nothing special is required — any `speaker-*` can text into any thread, and each message carries its own name and color.

**Hidden threads.** Declare a thread `hidden: true` and it stays out of the inbox until its first message arrives — no spoiling the Unknown Number that won't text until act two:

```
:: StoryThreads
sam: Sam
unknown: Unknown Number; color: #52525e; hidden: true
```

The thread reveals itself the moment anything lands in it (a `[deliver]`, the story moving there, a seed) — or reveal it manually with `story.revealThread('unknown')`. Reveal state rides on thread activity, so undo and save/restore handle it automatically.

**Seeding old messages.** A real inbox has history — if Mom's in your contacts, there are old texts from Mom. Tag passages `seed` and they render into their threads at story start: instant, already read, no badges or banners. Seeds alternate speakers freely, so a whole past exchange works:

```
:: mom-old-1 [thread-mom speaker-mom seed]
Did you eat today? You never answer me.

:: mom-old-2 [thread-mom speaker-you seed]
yes mom. going to bed, talk tomorrow ❤️
```

A seeded player message honors the receipt tags — `unread` leaves it sitting on **Delivered**, `failed` on **Not Delivered**, `read` on **Read** — so an old text that never got an answer can open the story already aching:

```
:: mom-old-2 [thread-mom speaker-you seed unread]
yes mom. going to bed, talk tomorrow ❤️
```

(Use the tags rather than `<% story.markUnread() %>` in a seed — during seeding there's no "last sent message" for the JavaScript form to target.)

Old tapbacks work too: a `[react …]` inside a seed lands on the previous seeded message from the other side. A seed can even be *only* a reaction — no bubble, just the player's old 👍 on an old text:

```
:: mom-old-1 [thread-mom speaker-mom seed]
Did you eat today? You never answer me.

:: mom-old-1-react [thread-mom speaker-you seed]
[react 👍]
```

Seeds follow passage order, survive save/restore, and stay put under undo (they're history, not moves). Note that seeding a hidden thread reveals it — old messages mean the contact isn't a surprise.

**The Trash.** Conversations can be archived — out of the main inbox, never deleted. A **Trash** section appears at the bottom of the inbox; the player can open it and read everything inside. Declare a thread `archived: true` to start it there (old spam, dead group chats — inbox texture that rewards snoops), or move one mid-story:

```
:: unknown-leaves [thread-unknown speaker-unknown]
you know everything you need to know

[system Unknown Number has left the conversation]

<% $(function() { story.archiveThread('unknown'); }) %>
```

(Archive your *own* thread inside the `$(…)` ready-helper, as above — a plain `<% story.archiveThread(…) %>` runs before the passage's own message lands, which would immediately recover it.)

Recovery is symmetric with hidden threads: **any message landing in an archived conversation pulls it out of the Trash** — a contact you archived texting back is exactly the beat that deserves it — or call `story.restoreThread(id)`. `threadarchived` / `threadrestored` events fire for scripting; undo and save/restore carry Trash state like everything else; the section label localizes via `story.config.trashLabel`.

State for branching: nothing is required, but the runtime tracks it all — `story.unread` (per-thread counts), `story.threads`, and the active thread are saved and restored, and undo rewinds thread-by-thread. Config: `story.config.threadNotifications = false` silences the cross-thread banners (the inbox badges still update).

A complete example is [`docs/subtext-inbox-demo.twee`](docs/subtext-inbox-demo.twee) — a three-thread thriller — playable at [the inbox demo](https://samplereality.github.io/subtext/inbox-demo.html).

### Saving

- `story.save()` writes progress into the URL hash — players can bookmark or share it, and loading that URL replays the whole conversation.
- `story.config.autosave = true` additionally saves after every message and resumes automatically on the next visit. Restart clears the autosave.

## Interface

### Notifications

- `story.config.sounds = true` enables subtle synthesized send/receive sounds (no audio files needed). Browsers allow sound only after the player's first interaction, so the very first messages are always silent.
- While the tab is hidden, incoming messages update the title to `(2) Your Story Name` and it resets when the player returns (`story.config.titleNotifications`, on by default).

### Page chrome and menus

The story presents as a phone — a single chat column, full-bleed on small screens and a framed phone-width card on larger ones (width via `--t-chat-width`). Supplementary content lives in a Menu modal; fill it from your story JavaScript:

```js
story.setMenu('<h3>About</h3><p>…</p>');          // content of the Menu modal
story.setMenu('<p>…</p>', 'About');               // …and retitle the dialog while you're at it
story.setRestartDialog('Leave?', '<p>Progress will be lost.</p>');
story.config.hint = 'Choose an option to continue';  // text above the choices
```

The menu dialog's heading defaults to "Menu"; set it with `story.config.menuTitle` or `setMenu`'s second argument. The hint is smarter than a static label: `story.config.inputHint` shows different text while a free-text composer is up (e.g. *"Type your reply to continue"*), and `story.config.hintFadeAfter = 4` retires the helper text entirely once the player has made that many moves — training wheels off. (`null` keeps hints forever; `0` never shows them.)

The Menu button (☰) only appears once the menu has content. The header includes an Undo button (↩, appears once there is something to undo — disable it with `story.config.undoButton = false` for stories where choices are final) and the menu holds the light/dark toggle and a Restart button that asks for confirmation.

> **Legacy helpers.** The Trialogue-era globals still work as aliases: `inject_menu(html, title)` → `setMenu`, `inject_modal(title, body, footer)` → `setRestartDialog`, `inject_hint(text)` → `config.hint`, plus `inject_nav_menu(label)` (custom label for the ☰ button) and `inject_nav_back(html)` (a back link in the header). `inject_left_sidebar` / `inject_right_sidebar` / `fade_in_content_containers` are gone — they served a page layout that no longer exists.

**Where the story's identity lives.** By default `StoryTitle`, `StorySubtitle`, and `StoryAuthor` render in the chat header. `story.config.titlePlacement` moves them:

```js
story.config.titlePlacement = 'header';  // default
story.config.titlePlacement = 'menu';    // tucked at the top of the menu dialog
story.config.titlePlacement = 'none';    // handled by you
```

**The header is a stage, not a label.** Repurpose it mid-story with `story.setHeader()` — chapter titles, in-fiction app names, a slow reveal:

```
:: chapter-two [speaker-sam clear]
<% story.setHeader('Part Two', 'three weeks later') %>
[timestamp Three weeks later]

you didn't call
```

`setHeader(title, subtitle)` overrides either field (pass `null` to leave one alone, `''` to blank it; a custom subtitle replaces the author credit on that line). It's stored in story state, so undo and save/restore keep the header in step with the story. In multi-conversation stories the thread screens still show the contact's name — the custom title appears on the inbox screen instead.

## Debug mode

While you're writing, Subtext can run with a debug panel — a devtools-style drawer that stays deliberately outside the story's fiction. Enable it any of four ways:

- **Twine's Test button** (it publishes with `options="debug"`)
- **`tweego -t`** (Tweego's test mode, same mechanism)
- **`?debug`** appended to any story's URL
- **`story.config.debug = true`** in story JavaScript

A `🐛 debug` button appears in the corner; it opens a panel that stays open until you close it — across reloads too — with:

- **Where you are** — current passage, thread, and turn count, always in view.
- **Variables** — a live table of everything in `s`, refreshed as passages show, plus a console line that runs any JavaScript (`s.suspicion = 9`, `story.markRead()`, …).
- **Timeline** — a dropdown of every moment so far; pick one and **rewind** to it. The conversation rebuilds up to that point by replaying it — then *pauses right there*, even mid-`showDelayed`-chain (pending chain timers are dropped, so the future doesn't immediately play itself back in).
- **Jump to passage** — a dropdown of every passage (alphabetical, current one selected; type while it's open to seek by name); pick one and **jump** to fast-forward straight to it. A jump is a *clean teleport*: the transcript resets to the target while `s` is kept, so jumps never pile up in the log or the autosave. To go backwards, use the timeline.
- **Story check** — a static lint of the whole story: pill links to passages that don't exist, `[deliver]` and `showDelayed()`/`show()` names that don't resolve, `speaker-*` tags with no `StorySpeakers` profile, `thread-*` tags never declared in `StoryThreads`, and passages nothing points to. Each finding links to the offending passage. It reads source without running it, so dynamic names (`<% %>`) are skipped rather than guessed at; a passage you reach only through dynamic means can opt out of the orphan check with the `unlinked` tag. Also callable as `story.lint()` — it returns the findings as an array.
- **Transcript** — one click flattens the visible conversation (every thread, chips and narration included) to a Markdown file and downloads it. Reading a chat story as prose is a surprisingly good proofreading pass. Also callable as `story.exportTranscript()`, which returns the Markdown string.
- **Memory** — what the story has `remember()`ed across playthroughs, with a forget-all button.

**Your place survives rebuilds.** Debug mode turns on autosave and — crucially — saves your position by passage *name* rather than id. So with `tweego -w` watching your Twee files and a live-preview browser tab reloading on every rebuild, the story resumes exactly where you were, even after the rebuild renumbers every passage. Combined with jump, this makes the edit-preview loop instant: save the file, the tab reloads, you're still standing in the scene you're editing. (Restart, in the menu or the debug panel, clears the autosave when you *do* want a clean run.)

Players never see any of this: without one of the four switches above, the debug code adds no UI at all.

## Configuration

Adjust behavior from your story's JavaScript, any time before or during play:

```js
story.config.msPerChar = 30;
story.config.metaStyle = 'overlay';
story.config.autosave = true;
```

**Timing and bubbles**

| Option | Default | Purpose |
| --- | --- | --- |
| `typing` | `true` | Show the typing indicator before a speaker's messages |
| `msPerChar` | `20` | Simulated typing speed, milliseconds per character |
| `minTypingDelay` | `500` | Floor for the typing delay (ms) |
| `maxTypingDelay` | `4000` | Ceiling for the typing delay (ms) |
| `metaDelay` | `800` | Delay before a narration passage appears (ms). Skipped when the player taps directly into narration with a silent `(send:)` pill |
| `splitBubbles` | `true` | Render each paragraph as its own bubble |
| `bubbleStagger` | `140` | Gap between bubbles of one passage (ms) |

**Receipts and reactions**

| Option | Default | Purpose |
| --- | --- | --- |
| `readReceipts` | `true` | Show Delivered/Read under the player's last message |
| `autoRead` | `true` | A speaker's reply marks the last message read |
| `receiptLabels` | `{ delivered, read, failed }` | Receipt wording — localize or restyle |
| `redactedLabel` | `'This message was deleted'` | What a deleted message's tombstone says |

**Narration**

| Option | Default | Purpose |
| --- | --- | --- |
| `metaStyle` | `'chat'` | Narration mode: `chat`, `overlay`, `notification`, or `aside` |
| `metaNotificationLabel` | `''` | App-name label on notification narration (defaults to the story name) |
| `asideBeats` | `3` | How many messages an aside survives by default |
| `asideMobile` | `'float'` | Aside fallback with no margin: `float` or `chip` |

**Media and location**

| Option | Default | Purpose |
| --- | --- | --- |
| `preloadImages` | `true` | Warm the browser cache for `StoryImages` at startup |
| `photoButtonLabel` | `'Send a photo'` | Accessible label on the camera button |
| `photoPickerTitle` | `'Send a photo'` | Heading of the photo picker |
| `locationButtonLabel` | `'Share my location'` | Label on the location-share button |
| `locationBubbleLabel` | `'My location'` | Label under a shared-location map card |

**Input and hints**

| Option | Default | Purpose |
| --- | --- | --- |
| `timers` | `true` | Honor `timeout:` links (set `false` for unlimited time) |
| `timerLabel` | `'You have %s seconds to reply'` | Screen-reader announcement when a timer starts |
| `inputSendLabel` | `'Send'` | Accessible label on the free-text send button |
| `hint` | `''` | Helper text above the choice chips |
| `inputHint` | `''` | Helper text above the free-text composer |
| `hintFadeAfter` | `null` | Retire hints after N moves (`null` never; `0` never shows) |

**Sound, notifications, threads, theme, language**

| Option | Default | Purpose |
| --- | --- | --- |
| `sounds` | `false` | Subtle synthesized send/receive sounds (needs a user gesture) |
| `titleNotifications` | `true` | Show `(2) Story Name` in the tab title while hidden |
| `threadNotifications` | `true` | Announce cross-thread messages with a banner |
| `bannerSeconds` | `5` | How long each notification banner stays up; queued banners follow in order |
| `previewLabels` | `{ photo, voice, location }` | What banners and inbox previews say for media-only messages (`📷 Photo`, …) |
| `threadIdleHint` | `'Nothing to say right now'` | Placeholder in the disabled composer on parked threads (`''` for none) |
| `trashLabel` | `'Trash'` | Label on the inbox's archived-conversations section |
| `themeToggle` | `true` | Show the light/dark toggle in the header |
| `undoButton` | `true` | Show the header undo button (set `false` to make choices final) |
| `inboxButton` | `true` | Show the inbox chevron; reveal later with `story.showInboxButton()` |
| `titlePlacement` | `'header'` | Where StoryTitle/Subtitle/Author render: `header`, `menu`, or `none` |
| `menuTitle` | `'Menu'` | Heading of the menu dialog |
| `lang` | `''` | Interface language, applied to `<html lang>` (empty = `en`) |
| `typingLabel` | `'%s is typing'` | Screen-reader announcement while a speaker types |
| `autosave` | `false` | Persist progress to `localStorage` after every message |
| `debug` | `false` | Force [debug mode](#debug-mode) on (Twine Test, `tweego -t`, and `?debug` also enable it) |

## Utility functions

### The story and passage globals

Two globals from the Snowman lineage are always available — bare, no `window.` needed — inside `<% %>` templates and story JavaScript:

- **`story`** — the running story: `story.name` (the StoryTitle), `story.ifid`, `story.history`, `story.passages`, `story.state` (aliased as `s`), plus every `story.*` method in these docs. `story.passage('name')` fetches any passage object.
- **`passage`** — the passage currently showing: `passage.name`, `passage.tags`, `passage.source`, `passage.id`.

So a message can quote its own frame: `<%= story.name %>` drops the story's title into a bubble, and `<% if (passage.tags.indexOf('finale') > -1) { %>…<% } %>` branches on the current passage's own tags.

### Snowman helpers

Several Snowman utility functions are built in (reimplemented without jQuery/Underscore), so snippets from Snowman documentation work in Subtext:

```js
either('hey!', 'yo!', ['hiya!', 'hello hello'])  // random pick; arrays are flattened
hasVisited('some passage')                       // true once shown (array/multiple args = all of them)
visited('some passage')                          // number of times shown
renderToSelector('#somewhere', 'passage name')   // render a passage into any element
getStyles('extra.css')                           // load stylesheet(s); returns a Promise
```

`either()` is especially handy for introducing variety into responses:

```
:: ok [speaker-sam]
<%= either('how are you doing?', 'how are things?', "how's life?") %>
```

And `hasVisited()`/`visited()` pair naturally with thread clearing — history persists across a `clear`, so characters can reference scenes the player saw in a flashback.

### API index

Every public `story.*` method, alphabetically — each links to the section that documents it:

| Method | What it does | Section |
| --- | --- | --- |
| `archiveThread(id)` / `restoreThread(id)` | Move a conversation into or out of the Trash | [Multiple conversations](#multiple-conversations) |
| `choose(target, sent, label)` | Make a reply from code, exactly as if a pill were tapped | [Recipes](#a-delete-thread-reply-pill) |
| `clearThread(id)` | Wipe a conversation's visible messages (history survives) | [Clearing the thread](#clearing-the-thread) |
| `debugJump(name)` | Teleport to a passage on a clean transcript | [Debug mode](#debug-mode) |
| `debugRewind(count)` | Replay the timeline up to an entry | [Debug mode](#debug-mode) |
| `deliver(name)` | Drop a passage into its thread without moving the story | [Multiple conversations](#multiple-conversations) |
| `enableDebug()` | Turn on the debug panel from code | [Debug mode](#debug-mode) |
| `exportTranscript()` | The visible conversation, flattened to Markdown | [Debug mode](#debug-mode) |
| `lint()` | The story check's findings, as an array | [Debug mode](#debug-mode) |
| `markRead()` / `markUnread()` / `markFailed()` | Set the receipt on the player's last message | [Read receipts](#read-receipts) |
| `openInbox()` / `openThread(id)` | Switch between the inbox and a conversation | [Multiple conversations](#multiple-conversations) |
| `passage(idOrName)` | Fetch a passage object | [The story and passage globals](#the-story-and-passage-globals) |
| `react(emoji, direction)` | Land a tapback on the last message | [Reactions](#reactions) |
| `redactMessage(direction, label)` | Delete a message: the bubble stays, a tombstone replaces it | [Deleted messages](#deleted-messages) |
| `remember(key, value)` / `recall(key, fallback)` / `forget(key)` | Cross-playthrough memory (survives restart) | [Recipes](#remember-across-playthroughs) |
| `revealThread(id)` | Bring a hidden thread into the inbox | [Multiple conversations](#multiple-conversations) |
| `save()` / `restore(hash)` | Write progress to the URL / replay a save | [Saving](#saving) |
| `setHeader(title, subtitle)` | Repurpose the header mid-story | [Page chrome and menus](#page-chrome-and-menus) |
| `setMenu(html, title)` | Fill (and retitle) the menu dialog | [Page chrome and menus](#page-chrome-and-menus) |
| `setRestartDialog(html)` | Reword the restart confirmation | [Page chrome and menus](#page-chrome-and-menus) |
| `show(name)` | Show a passage immediately | [Message chains and montages](#message-chains-and-montages) |
| `showDelayed(name, delay)` | Show a passage after a delay (0 = instantly, no dots) | [Message chains and montages](#message-chains-and-montages) |
| `showInboxButton()` / `hideInboxButton()` | Stage the inbox chevron's reveal | [Multiple conversations](#multiple-conversations) |

## Events

Every story event is a plain DOM `CustomEvent` dispatched on `window`; read its payload from `event.detail`.

```js
window.addEventListener('photosent', function (e) {
  console.log(e.detail.name, 'sent to', e.detail.target);
});
```

| Event | Fires when… | `detail` |
| --- | --- | --- |
| `startstory` | the story is about to show its first passage | `{ story }` |
| `showpassage` | a passage is about to render | `{ passage }` |
| `showpassage:after` | a passage has rendered and is on screen | `{ passage }` |
| `hidepassage` | the current passage is leaving | `{ passage }` |
| `choice` | the player picks a reply pill (or code calls `story.choose`) | `{ label, sent, target, story }` |
| `photosent` | the player sends a photo | `{ name, target, story }` |
| `locationshared` | the player shares real coordinates | `{ lat, lon, story }` |
| `reaction` | the player reacts with a tapback | `{ emoji, story }` |
| `redact` | a message is deleted via `redactMessage` | `{ direction, story }` |
| `timeout` | a response timer expires | `{ target, text, story }` |
| `textinput` | the player sends free-text input | `{ text, target, story }` |
| `threadarchived` | a conversation moves to the Trash | `{ thread, story }` |
| `threadrestored` | a conversation leaves the Trash | `{ thread, story }` |
| `save` | progress is written to a save | `{ story }` |
| `restore` | a save begins replaying | `{ story }` |
| `restore:after` | a save finishes replaying | `{ story }` |
| `restorefailed` | a save can't be parsed | `{ error }` |

The Snowman 2 names (`sm.story.started`, `sm.passage.showing`, `sm.passage.shown`, `sm.passage.hidden`, `sm.story.saved`, `sm.restore.success`, `sm.restore.failed`, `sm.story.error`) are dispatched as aliases, so snippets written against Snowman 2 documentation work too.

## Extending Subtext

Not every idea needs to live in the format. Subtext is extendable from story JavaScript the same way SugarCube is — through three surfaces, in escalating order of power:

1. **[Events](#events)** — observe everything that happens (`choice`, `photosent`, `threadarchived`, `showpassage:after`, …) and react from a listener.
2. **The `story.*` API** — every documented method is callable from your code: `deliver`, `archiveThread`, `setHeader`, `remember`, `debugJump`, all of it. Features like the Trash are deliberately *API-first*: the format supplies the UI, your story drives it with the same verbs an extension would use.
3. **Prototype wrapping** — `window.Story.prototype` and `window.Passage.prototype` are exposed, so story JavaScript can wrap any method and change how the format itself behaves.

### What's stable

Everything *documented* is contract: the events table, the `story.*` methods and `config` keys in these docs, the `s.*` trackers, the passage tags and directives, and the styling hooks (`--t-*` variables, `data-speaker` / `data-thread` attributes, and the class names shown throughout: `.chat-passage`, `.chat-timestamp`, `.chat-system`, `.user-response`, `.inbox-row`, `.thread-log`, …). Properties and methods with a leading underscore (`_threadActivity`, `_hotThread`) are internals — they can change in any release, so an extension that touches them is living dangerously.

### Example: a custom directive, no format changes

Wrap the passage renderer to invent your own `[shrug]` markup:

```js
var render = Passage.prototype.render;

Passage.prototype.render = function () {
	return render.call(this).replace(/\[shrug\]/g, '¯\\_(ツ)_/¯');
};
```

Every passage now understands `[shrug]` — in live messages, seeds, and deliveries alike, because they all flow through the same renderer.

### Example: behavior from events

Invent a `cleanup` passage tag that sweeps every *other* conversation into the Trash, using only public API:

```js
window.addEventListener('showpassage:after', function (e) {
	if (e.detail.passage.tags.indexOf('cleanup') === -1) { return; }

	var here = story.getPassageThread(e.detail.passage);

	story.threadOrder.forEach(function (id) {
		if (id !== here) { story.archiveThread(id); }
	});
});
```

One rule of thumb for what belongs where: **if it changes what the story does, write it in story JavaScript; if it changes what the phone *is*, it belongs in the format** — [open an issue](https://github.com/samplereality/subtext/issues). UI that touches the transcript needs care the format already takes for you (messages are never removed from the `role="log"` live region, or screen readers re-announce the whole conversation — build on `story.*` verbs rather than editing the chat DOM directly).

## Recipes

Common patterns, built from the pieces documented above. Everything here works today — copy, paste, adapt. Most lean on the automatic trackers in [Story state](#story-state).

### Branch on how the player arrived

`s.previousPassage` holds the name of the passage shown before this one, so a hub that several routes funnel into can react to *where the player came from* — no per-route bookkeeping:

```
:: back at the office [speaker-boss clear]
<% if (s.previousPassage === 'the confrontation') { %>that was quite a scene you made
<% } else { %>you're late<% } %>
```

### Notice hesitation

`s.replySeconds` records how long the player sat on the choices before answering — the invisible cousin of the visible [response timer](#timed-responses). No meter, no pressure; the story just *knows*:

```
:: alibi [speaker-detective]
<% if (s.replySeconds > 4) { %>…why'd you have to think about that one?<% } else { %>uh huh. go on<% } %>
```

### Fire sound or analytics on any choice

The [`choice` event](#events) fires on every pill tap (and every `story.choose` call) with `{ label, sent, target }`:

```js
window.addEventListener('choice', function (e) {
  gtag('event', 'reply', { label: e.detail.label });
});
```

### Affinity and stat meters

Plain arithmetic in a template is all a relationship or suspicion meter needs; branch on it anywhere:

```
:: help them [speaker-you]
<% s.trust = (s.trust || 0) + 1 %>okay, I've got your back

:: later [speaker-sam]
<% if ((s.trust || 0) >= 3) { %>I know I can count on you<% } else { %>I'm still not sure about you<% } %>
```

### A hub whose choices disappear as you use them

`hasVisited()` reports whether a passage has been shown, so a menu can drop options the player has already exhausted — wrap each pill in a conditional and send the player back to the hub:

```
:: interrogation [speaker-detective]
ask me anything.

<% if (!hasVisited('the-knife')) { %>[[the knife->the-knife]]<% } %>
<% if (!hasVisited('the-alibi')) { %>[[the alibi->the-alibi]]<% } %>
[[that's all I need->done]]
```

(The same `<% if (…) { %>[[…]]<% } %>` shape gates any pill — behind a password, a stat, a `recall()`, whatever.)

### A "Delete Thread" reply pill

The Trash verbs compose with reply pills into a player-facing delete. Three pieces: an empty `(send:)` so tapping posts no bubble, a target passage in *another* thread (the pill's consequence is someone else reacting), and the deferred archive-and-exit:

```
:: unknown-final [thread-unknown speaker-unknown]
I know what you did.

[[Delete Thread (send:)->deleted-it]]
[[who is this?->unknown-2]]

:: deleted-it [thread-sam speaker-sam]
<% $(function() {
	story.archiveThread('unknown');
	story.openInbox();
}) %>did you seriously just delete that whole thread??

[[it felt right->sam-2]]
```

Tapping **Delete Thread** sends nothing, Sam's reaction pulls the story to Sam's conversation, and once it lands the Unknown thread sweeps into the Trash and the player is standing in the inbox — deleted thread grayed out below, Sam's fresh message waiting above. The player can still dig the "deleted" conversation out of the Trash and reread it, which is exactly the guilt a delete button should carry. (The `$()` wrapper matters: it defers the archive until after the passage's own message lands, which would otherwise recover the thread immediately.)

### Remember across playthroughs

`story.remember(key, value)` / `story.recall(key, fallback)` persist per-story in `localStorage` and survive **restart** — unlike `s`, which resets. This is how a story counts endings the player has found, unlocks New Game+ content, or has a character remember the last run:

```
:: the good ending [speaker-sam clear]
<% var seen = story.recall('endings', []); if (seen.indexOf('good') === -1) { story.remember('endings', seen.concat('good')); } %>
you made it. maybe we both did.

<% if (story.recall('endings', []).length > 1) { %>[timestamp You've found <%= story.recall('endings', []).length %> of 3 endings]<% } %>
```

```
:: Start [speaker-unknown]
<% if (story.recall('endings', []).indexOf('bad') > -1) { %>back again? you didn't learn last time.
<% } else { %>who is this?<% } %>
```

`story.forget(key)` drops one value; `story.forget()` wipes the story's whole memory. (Restart clears the ordinary save but deliberately leaves memory intact — call `forget()` yourself if you want a true reset.)

The natural home for the running tally is `StoryColophon` — it renders (templates included) at the bottom of every `End`-tagged passage, so one snippet covers every ending:

```
:: StoryColophon
<% var seen = story.recall('endings', []); %>
You've found <%= seen.length %> of 3 endings.<% if (seen.length < 3) { %> Restart to look for the others.<% } %>
```

## Accessibility

- **Screen readers:** the conversation is a `role="log"` live region, and messages are never moved or re-inserted in the DOM, so each one is announced exactly once. The typing indicator announces *"Sam is typing"* (localize via `story.config.typingLabel`), narration overlays and notifications are polite status regions, restoring a save replays silently instead of flooding the reader, and reactions, receipts, voice memos, and location cards all carry proper labels.
- **Keyboard:** every control is a real button or link with a visible focus indicator; after choosing a reply, focus stays anchored on the reply panel; dialogs are native `<dialog>` elements (focus trapping and Escape included).
- **Contrast & motion:** default palettes meet AA contrast in both themes, `prefers-contrast: more` adds stronger bubble boundaries, and `prefers-reduced-motion` disables animations.
- **Language:** the page declares `lang="en"` by default — set `story.config.lang = 'fr'` (etc.) for stories in other languages.

What authors should still do: write alt text in image HTML (`<img src="…" alt="…">`), give gallery images meaningful names (the photo picker uses them as labels), keep meaningful information out of color alone, and remember voice memos have no captions — pair important audio with text.

## Migrating from Trialogue

Stories authored for Trialogue work unchanged in most cases — speaker tags, links, special passages, templates, `inject_*` helpers, and the old CSS variable names are all still supported. Differences to be aware of:

- jQuery and Underscore are no longer bundled. Story JavaScript that used `$(…)` or `_.…` directly needs to be rewritten in plain JavaScript. (The `$` helper *inside passages* — `<% $(function() { … }) %>` — still works, and the Snowman utility functions `either()`, `hasVisited()`, `visited()`, `renderToSelector()`, and `getStyles()` are built in.)
- `inject_left_sidebar()` / `inject_right_sidebar()` / `fade_in_content_containers()` were removed — they served a desktop page layout that no longer exists. Move sidebar content into the menu with `story.setMenu()`. The other `inject_*` helpers still work as aliases for the `story.*` methods (see [Page chrome and menus](#page-chrome-and-menus)).
- Story events are now plain DOM `CustomEvent`s on `window` — see [Events](#events). The Snowman 2 event-name aliases are dispatched too.
- Passages are one bubble per paragraph by default; set `story.config.splitBubbles = false` for the old one-bubble-per-passage behavior.
- Twine 1 documents are no longer supported.

## Changelog

### Version 2.7.1

- **Fixed: undo went dead after every reload.** Restoring a save (including the debug autosave that fires on each `tweego -w` rebuild) wiped the checkpoint stack; the replay now rebuilds a checkpoint per player move, so undo works immediately after a reload, a restore, or a timeline rewind.
- **Fixed: rewinding the timeline into a `showDelayed` chain overshot.** The replayed chain re-armed its next message, which immediately streamed the rest of the chain back in; a rewind now pauses exactly at the picked moment. (A normal reload still carries an in-flight chain forward.)
- **The debug panel got compact.** Timeline and Jump-to-passage are one-line dropdowns with `rewind`/`jump` buttons instead of tall scrolling lists.
- **Fixed: `story.deliver()` ignored the target's `instant` tag** — a tagged passage still waited out the typing delay. Deliveries now follow the same pacing grammar as `showDelayed()`: pace by message length (with the inbox "typing…" state), land at once when the target is tagged `instant`, or take an explicit delay — `story.deliver('name', 2000)`.

### Version 2.7

- **Group chats.** Declare `members:` on a thread and it becomes a group conversation: the member list under the header title, a clustered inbox avatar, and sender-named previews throughout. See [Multiple conversations](#multiple-conversations).
- **Photos open in a lightbox.** Tap any chat image to view it fullscreen; tap again or press Esc to close. Keyboard- and screen-reader-accessible; opt out per image with `data-lightbox="off"`.
- **Media previews.** Banners and inbox previews for media-only messages now read as their kind — `📷 Photo`, `🎤 Voice message`, `📍 Location` (wording via `config.previewLabels`) — instead of arriving blank.
- **Banners queue.** Several messages arriving at once announce themselves one banner at a time (`config.bannerSeconds` each) instead of overwriting each other; a newer message from the same thread updates its banner in place.
- **Deleted messages.** `story.redactMessage()` deletes a message the way real chat apps do — the bubble stays, its content becomes a *"This message was deleted"* tombstone (wording via `config.redactedLabel`; `'out'`/`'in'` picks whose message). The `[tombstone]` directive seeds a message that was already deleted before the story began. Deletions fire a `redact` event and participate in undo and save/restore. See [Deleted messages](#deleted-messages).
- **The story check.** Debug mode now lints the whole story on load: broken pill targets, unresolved `[deliver]`/`showDelayed()` names, speakers without profiles, undeclared threads, and orphaned passages (opt out per passage with the `unlinked` tag). Each finding links to the passage. Also callable as `story.lint()`.
- **Transcript export.** One debug-panel click flattens the visible conversation — every thread, chips and narration included — to a downloadable Markdown file; also `story.exportTranscript()`. Read your chat story as prose to proofread it.
- **An [API index](#api-index)**: every public `story.*` method in one alphabetical table, each linked to its docs.

### Version 2.6.2

- **The `instant` passage tag** — a tagged passage never shows typing dots, however it's reached: on its own it arrives immediately (a silent "and then?" pill paging through a montage), and combined with an explicit `showDelayed()` delay it becomes a silent wait — the pause happens, then the message just lands. See [Message chains and montages](#message-chains-and-montages).
- **Delivered messages carry their reply pills.** A `[deliver]`ed passage with links used to discard them; now the story's pending choices travel with the message and appear when the player opens its thread — `[deliver]` can hand the story off to another conversation.
- **Fixed: group messages are attributed to their sender.** A cross-speaker delivery (`speaker-matt` into `thread-family`) used to look like it came from the whole thread; the notification banner and inbox preview now read "Matt: …" under the thread's name, like a real phone.

### Version 2.6.1

- **Fixed:** a `[timestamp]` leading a delivered message no longer leaks into its notification banner — the banner shows the message body only.
- **Fixed (game-breaking):** opening the inbox while a narration overlay was up stranded the player under the veil with nothing clickable. The inbox chevron now hides while an overlay is showing.
- **`story.showInboxButton()` / `hideInboxButton()`** (and `config.inboxButton`) stage the inbox reveal — start the story as one conversation, disclose the wider inbox when the moment lands.
- The "Delete Thread" reply-pill recipe (missed the 2.6 merge).
- **Fixed:** a silent `[[Continue (send:)->…]]` pill into narration now shows the narration immediately instead of waiting out `metaDelay` — tapping straight into an overlay feels responsive. (`metaDelay` still paces narration that follows a sent message or a speaker's reply.)
- **Fixed:** the docs described the inbox button with a ☰ glyph; it's a ‹ chevron.
- **`story.showDelayed()` takes a delay** — `story.showDelayed('next', 0)` shows the next message instantly (no typing indicator), any other number paces it in milliseconds. See [Message chains and montages](#message-chains-and-montages).
- **Fixed:** chaining passages with `<% story.showDelayed(…) %>` doubled and shuffled the chain's `[timestamp]` chips — the next passage's early chip could land above the current message *and* knock out the bookkeeping that stops the current chip from rendering twice. Chips now stay glued to their messages, once each.
- **Fixed:** reloading mid-chain duplicated messages — the save replay re-ran each passage's `showDelayed` call on top of the messages already in the timeline. Echoes are now dropped; a chain that was still in flight when the save was made picks up where it left off.

### Version 2.6

- **The Trash.** Conversations can be archived — `archived: true` in `StoryThreads`, or `story.archiveThread(id)` mid-story — into a Trash section at the bottom of the inbox where the player can still read them. Any message landing in an archived thread recovers it (or `story.restoreThread(id)`); `threadarchived`/`threadrestored` events fire. See [Multiple conversations](#multiple-conversations).
- **An [Extending Subtext](#extending-subtext) chapter**: the stable API contract, and worked examples of adding features from story JavaScript — custom directives via prototype wrapping, behavior via events.
- **Inbox previews fixed** for conversations whose last message carries a receipt or is followed by a `[system]` chip.

### Version 2.5

- **Hidden threads.** `hidden: true` in a `StoryThreads` declaration keeps a conversation out of the inbox until its first message arrives (or `story.revealThread(id)`) — the Unknown Number stays a surprise.
- **Seeded history.** Passages tagged `seed` render into their threads at story start as old, already-read messages — a conversation that visibly existed before the story began. Seeded player messages honor the `read`/`unread`/`failed` receipt tags (an old text can open the story still sitting on Delivered), and `[react …]` in a seed lands an old tapback on the previous seeded message.
- **Diegetic read-only threads.** Viewing a conversation the story isn't in shows a grayed-out composer — *"Nothing to say right now"* (`story.config.threadIdleHint`) — instead of an empty reply area.
- **Cross-thread banners truncate** long messages with an ellipsis, like real notifications.
- **`[system …]` event chips** — *"Sam has left the conversation"*, missed calls, group renames. Like a timestamp chip but never shown early while a reply is typing, and a trailing one lands below its message. See [System messages](#system-messages).

### Version 2.4.2

- **`(send:)` now works in shorthand links.** `[[what? (send: what? || tell me)]]` correctly targets the passage named `what?` — previously the suffix stayed glued to the target and broke the link.
- **`story.config.undoButton = false`** hides the header undo button, for stories where choices should be final.
- **Documented the `story` and `passage` globals** — `<%= story.name %>` and friends, straight down the Snowman lineage.

### Version 2.4

- **The story keeps score.** `s.lastChoice` (which pill was tapped), `s.previousPassage` (how the player arrived), `s.replySeconds` (how long they deliberated), and a `choice` event on every reply — the automatic trackers that let several pills share a target and still branch. See [Reply pills and sent text](#reply-pills-and-sent-text) and [Recipes](#recipes).
- **Cross-playthrough memory.** `story.remember()` / `story.recall()` / `story.forget()` persist values per story across restarts — endings-seen counters, New Game+ unlocks, characters who remember your last run.
- **A [Recipes](#recipes) section** collecting common patterns: arrival-based branching, hesitation, affinity meters, disappearing hub choices, and playthrough memory.
- **A sturdier debug panel.** The timeline now sits front and center with every passage tappable to *rewind* to that moment; jumping to a passage is a clean teleport (transcript resets, `s` is kept) instead of piling passages into the log; the panel stays open across reloads; and a Memory section shows what the story has `remember()`ed.
- **Read receipts flip like a real phone's.** *Delivered* becomes *Read* the moment the reply is queued — before the typing dots — not when the message lands. `read`/`unread`/`failed` tags still override.
- **The header is a stage.** `story.setHeader('Part Two', 'three weeks later')` repurposes the title line mid-story (undo- and save-aware); `story.config.titlePlacement` moves the StoryTitle/Subtitle/Author identity into the menu (or nowhere); `story.config.menuTitle` / `inject_menu(content, 'About')` retitle the menu dialog.
- **Trialogue's `inject_left_sidebar()` / `inject_right_sidebar()` / `fade_in_content_containers()` are gone** — there are no side columns on a phone. Use the menu.
- **A coherence pass over the whole authoring surface.** Canonical camelCase APIs (`story.setMenu`, `story.setRestartDialog`) with the `inject_*` names kept as legacy aliases; a stated [design language](#the-design-language) (directives = in-message content, `prefix:` links = reply kinds, `(send:)` = reply modifier); a complete [Story state](#story-state) reference; bare `[[photo->x]]` shorthand; `end` accepted alongside `End`; `meta-aside` completes the narration-tag family.

### Version 2.3

- **Debug mode.** Twine's Test button, `tweego -t`, or `?debug` opens a devtools-style panel: watch variables live, run JavaScript, jump to any passage (fast-forward), rewind, and inspect the timeline. Debug autosaves keep your place across `tweego -w` rebuilds — the live-preview tab reloads and you're still in the scene you're editing, even when the rebuild renumbers every passage. See [Debug mode](#debug-mode).
- **Multi-bubble sends.** `||` in a `(send: …)` label breaks the sent text into separate bubbles fired in quick succession — one tap, a flurry of texts. See [Reply pills and sent text](#reply-pills-and-sent-text).

### Version 2.2

- **Asides — narration in the margins.** A fourth narration style: tag a speakerless passage `aside-left` or `aside-right` and it appears as a note *outside* the phone, level with the latest message, riding along as the chat scrolls and fading after a few beats. On phones it floats over the chat's edge like a sticky note on the glass. See [Asides](#asides).
- **Reply pills can send different text than they show.** `[[sure (send: sure, that works — see you at midnight)->meet]]` shows a terse pill but sends the full line; an empty `(send:)` advances the story without posting a message at all (perfect for a "start" button). See [Reply pills and sent text](#reply-pills-and-sent-text).
- **New conversations fill from the top** of the screen, like a real messaging app, and only pin to the bottom once the chat overflows; the typing indicator now sits directly beneath the last message.
- **Timestamps appear while typing.** A timestamp chip leading a speaker's reply now shows as soon as the typing indicator starts, the way it would on a real phone.

### Version 2.1

- **Multiple conversations.** An opt-in contacts inbox lets one story weave several chats at once — unread badges, per-conversation threads, live "typing…" states, and messages that arrive in the background while the player is talking to someone else. Perfect for mystery and epistolary structures. Single-conversation stories are completely unaffected: no `StoryThreads` passage, no inbox, no overhead. See [Multiple conversations](#multiple-conversations).
- **A tidier header.** Controls are now split by register: in-story navigation (the inbox chevron, back link) sits on the left, app controls (undo, menu) on the right. The light/dark toggle and Restart moved into the menu.

### Version 2.0

**A modern messaging look**

- Message bubbles are grouped by speaker with iMessage-style corner shaping, a speaker name above each group, and an auto-colored avatar beside it.
- Each paragraph of a passage becomes its own bubble, so longer passages read like a real text exchange.
- Outgoing (player) messages render as accent-colored bubbles on the right; choices appear as quick-reply pill buttons.
- Passages containing only an image render frameless, like a photo message.
- Players can send photos from a picker; stories can branch on which image was sent.
- Voice-memo bubbles with a real player (waveform, play/pause, duration) via `[voice file.mp3]`.
- Location map cards via `[location lat,lon Label]`, and players can share their *real* coordinates for the story to react to.
- Read receipts (Delivered/Read) under the player's last message, with author control for dramatic effect, including a permanent, red "Not Delivered" failed state.
- Message reactions: speakers can tapback the player's messages, and players can react as a choice.
- Optional timed responses (a subtle meter runs as time runs out—hesitate and the story moves without you) and free-text input for password/puzzle beats, with the typed answer available to template logic.
- Thread clearing for flashbacks and scene changes (`clear` tag + timestamp chips).
- Optional multi-conversation mode: a contacts inbox with unread badges and background message delivery, for weaving several chats at once (single-conversation stories are unaffected).
- Timestamp chips, speaker profiles (display names, avatar images, bubble colors), optional message sounds, and a tab-title unread badge.
- Refined typing indicator, message entrance animations (disabled for players who prefer reduced motion), and automatic dark mode with a player-facing theme toggle.
- The story renders as a phone: full-bleed on mobile, a centered phone-width frame on larger screens.

**A more robust format**

- The runtime was rewritten in dependency-free vanilla JavaScript. jQuery, Underscore, and the Bootstrap/jQuery CDN links are not necessary. Published stories are fully self-contained and work offline.
- Save/restore now replays the entire conversation, not just the last passage, and an optional autosave keeps progress across reloads.
- Undo restores story state correctly (state snapshots are deep-copied per choice).
- Broken links, render errors, and script errors surface as readable messages in the chat instead of failing silently.
- The Grunt/Browserify toolchain was replaced with a single esbuild-based build script, plus a built-in Twee compiler and headless-browser smoke test.

# Credits

Subtext is developed by [Mark Sample](https://www.samplereality.com) and builds on [Trialogue](https://github.com/phivk/trialogue) by [Philo van Kemenade](https://github.com/phivk), which in turn is based on [Paloma](http://mcdemarco.net/tools/scree/paloma/) by M. C. DeMarco, a Jonah-style story format based on [Snowman](https://github.com/videlais/snowman) by [Chris Klimas](https://github.com/klembot) and [Dan Cox](https://videlais.com/).
