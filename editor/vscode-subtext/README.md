# Subtext syntax highlighting for VS Code

Syntax highlighting for Subtext twee source. It colors:

- **Passage headers** — `:: name [tags]`, with `speaker-*` and `thread-*` tags distinguished from other tags
- **Directives** — `[timestamp …]`, `[system …]`, `[voice …]`, `[sound …]`, `[location …]`, `[react …]`, `[deliver …]`, `[then …]`, `[tombstone]`, including quoted passage names and the `in 2s` / `in 500ms` delay clause
- **Reply pills** — `[[label->target]]` with the arrow, target, `(send: …)` text, and the `photo:` / `location:` / `react:` / `input:` / `timeout:` reply kinds
- **Templates** — `<% … %>` and `<%= … %>` highlighted as embedded JavaScript
- **Special passages** — `Story JavaScript [script]` as JavaScript, `[stylesheet]` passages as CSS, `StoryData` as JSON
- **Comments** — `/* … */` and line-leading `//`, plus `[text]{.class}` span shorthand

## Install

**Copy it in (quickest).** Copy this folder into VS Code's extensions
directory and reload:

```sh
cp -r editor/vscode-subtext ~/.vscode/extensions/subtext-syntax
```

Then run **Developer: Reload Window** from the command palette. Any
`.twee` or `.tw` file now opens as "Subtext (Twee)".

**Or package a VSIX.** From this folder:

```sh
npx @vscode/vsce package
```

and install the produced `.vsix` via **Extensions: Install from
VSIX…** in the command palette.

## Coexisting with Twee 3 Language Tools

The [Twee 3 Language Tools](https://marketplace.visualstudio.com/items?itemName=cyrusfirheir.twee3-language-tools)
extension also claims `.twee` files (it adds a passage outline and
generic twee support, but doesn't know Subtext's directives). If both
are installed, pick per file with **Change Language Mode** in the
status bar, or pin it in your settings:

```json
"files.associations": { "*.twee": "subtext-twee" }
```
