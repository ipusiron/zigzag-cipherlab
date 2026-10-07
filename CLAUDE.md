# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Zigzag CipherLab is an educational web tool for the Zigzag Cipher, a geometric cipher where plaintext letters are plotted as points along an alphabet key and connected into a zigzag polyline. The polyline alone is the ciphertext. This is part of the "100 Security Tools with Generative AI" project (Day 072).

Note: in English, "zigzag cipher" usually means the rail fence cipher (a transposition). This tool implements a different, substitution-like cipher (Edogawa Rampo's "line substitution" category). The Analyze tab shows that the polyline is a monoalphabetic substitution ciphertext in disguise.

## Tech Stack

- Vanilla JavaScript, HTML5, CSS3. No build tools, no dependencies, no CDN
- Visualization: SVG (`createElementNS`), no Canvas except for the PNG export
- Tests: `node --test` (Node 22+), run by GitHub Actions on push and pull_request
- Deployment: GitHub Pages (https://ipusiron.github.io/zigzag-cipherlab/)
- Interface in Japanese and English (`?lang=ja|en`, header button, saved in localStorage)

## File Structure

- `index.html` - Single page with 5 tabs (鍵生成/Key, 暗号化/Encrypt, 復号/Decrypt, 解析/Analyze, 座学/Learn). Loads `js/zz-core.js`, `js/messages.js`, `js/i18n.js`, `script.js` in that order. Every visible string carries `data-i18n` (textContent) or `data-i18n-attr` (attributes such as aria-label and placeholder)
- `js/zz-core.js` - Pure computation (`globalThis.ZZCore`, no DOM): key normalization/stats, point coordinates, plaintext preparation, column choice (RNG injected; `makeChooser('random'|'cycle'|'first')`), points text parse/format, nearest column, decrypt, shuffle, column counts/sequence/letters, Frequency Analyzer URL, share link (`#points=`), reading points from a hash or an SVG text, standalone SVG document
- `js/messages.js` - UI strings (`globalThis.ZZMessages`, `t(key, vars)`, `setLanguage`, `getLanguage`). `ja` and `en` have the same keys. `script.js` must not contain Japanese string literals
- `js/i18n.js` - `globalThis.ZZI18n`: initial language (`?lang=` → saved → browser), `applyStaticText(document)`, save/read of the choice (key `zigzag-cipherlab-lang`)
- `script.js` - DOM handling only (drawing, events, theme, language switch, tab keyboard navigation, SVG fitting and follow-scroll, PNG export via canvas, share link, SVG file loading, Analyze tab)
- `style.css` - Dark theme by default, light theme via `[data-theme="light"]`, CSS variables (`--low/--medium/--high/--accent-text/--on-primary`, `--viz-max`), responsive media queries
- `test/` - `core.test.js`, `html.test.js`, `contrast.test.js`, `format.test.js`, `i18n.test.js`, `readme.test.js` (+ `load.js` helper that runs the plain scripts with `vm.runInThisContext`)
- `README.md` (Japanese, with the YAML front matter used by hackinglab.online) and `README.en.md` (English, same headings in the same order). Screenshots in `assets/` (Japanese) and `assets/en/` (English)

## Key Behaviours

- Coordinates: `x = 40 + 40 * columnIndex`, `y = 100 + 24 * rowIndex`. The viewBox width grows with the key length (min 1200) and the height with the number of rows
- Limits are aligned (`ZZCore.LIMITS`): key 1,000 letters, plaintext 1,000 letters that exist in the key, points 1,000, points text 50,000 chars. Anything this tool encrypts can be decrypted by it
- Plaintext: only ASCII letters are uppercased and used. Letters missing from the key and non-letters are skipped and reported (`#encNotice`). Empty key is reported (`#keyNotice`, decode error)
- Duplicate letters in the key: `#dupMode` selects random (`crypto.getRandomValues`, rejection sampling), cycle (next column on each repeat of a letter) or first. Choices are cached per plaintext position (`state.enc.selectedIndices`) so redraws and step playback show the same polyline; changing the mode clears the cache
- Decrypt: sort by y (stable), nearest column by x (ties go to the lower index), lowercase output
- Analyze tab: `columnSequence` (column numbers in y order), `columnLetters` (A=0 … Z=25, null for keys longer than 26), bar charts of letter counts vs column counts, link to Frequency Analyzer with `#text=` (mapped text only, never the key)
- Exports without the key: `ZZCore.svgDocument` with `showKey:false` contains only the polyline and points; the PNG is rendered from that SVG as a `data:` URL image on a white canvas (capped at 16,000 px per side / 1e8 px area); the share link is `<page>#points=<encoded points>` and is read on load (`readPointsFromHash`) then removed with `history.replaceState`; "Load from SVG" reads the first `<polyline points="…">` with `pointsFromSvgText`
- Figure rendering: natural size (1 unit = 1px) scaled down to the box width but not below 0.55; the `.viz-wrap` box scrolls and follows the current point during step playback
- Tabs: WAI-ARIA tabs (role, aria-selected, aria-controls, arrow keys). Switching tabs stops running step timers; activating the Analyze tab recomputes it
- Language switch re-applies static text, the theme button label, notices (via `setKey`) and the Analyze chart titles
- CSP: `default-src 'self'; style-src 'self'; img-src 'self' data:` (no `unsafe-inline`). Do not add inline handlers or `style` attributes; use `hidden` / class toggles

## Development Commands

```bash
npm test                      # all tests (node --test)
python -m http.server 8000    # serve locally (file:// also works)
```

Screenshots in `assets/` and `assets/en/` are taken with a Playwright script kept outside this repository (viewport 1280x800, light theme; `screenshot4.png` is dark). `readme.test.js` checks the HELLOWORLD and Atbash examples, the limits table, the directory tree, the images and the heading structure of both READMEs, so update README.md, README.en.md and the tests together.

## Conventions

- Japanese text: 本文はですます調、箇条書きはである調. Use 長音 (サーバー, ユーザー, ブラウザー), 「わかる」 not 「分かる」, 「すべて」 not 「全て」 (checked by `readme.test.js`)
- New UI strings go into both `ja` and `en` in `js/messages.js` with the same key; static text in `index.html` gets `data-i18n` and must equal the `ja` value (checked by `i18n.test.js`)
- Keep README YAML front matter structure (keys and order) intact; only values may change
- Keep the series footer (「生成AIで作るセキュリティツール100」, page_id=42163)
