# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Zigzag CipherLab is an educational web tool for the Zigzag Cipher, a geometric cipher where plaintext letters are plotted as points along an alphabet key and connected into a zigzag polyline. The polyline alone is the ciphertext. This is part of the "100 Security Tools with Generative AI" project (Day 072).

Note: in English, "zigzag cipher" usually means the rail fence cipher (a transposition). This tool implements a different, substitution-like cipher (Edogawa Rampo's "line substitution" category).

## Tech Stack

- Vanilla JavaScript, HTML5, CSS3. No build tools, no dependencies, no CDN
- Visualization: SVG (`createElementNS`), no Canvas
- Tests: `node --test` (Node 22+), run by GitHub Actions on push and pull_request
- Deployment: GitHub Pages (https://ipusiron.github.io/zigzag-cipherlab/)

## File Structure

- `index.html` - Single page with 4 tabs (鍵生成, 暗号化, 復号, 座学). Loads `js/zz-core.js`, `js/messages.js`, `script.js` in that order
- `js/zz-core.js` - Pure computation (`globalThis.ZZCore`, no DOM): key normalization/stats, point coordinates, plaintext preparation, column choice (RNG injected), points text parse/format, nearest column, decrypt, shuffle, standalone SVG document
- `js/messages.js` - UI strings (`globalThis.ZZMessages`, `t(key, vars)`). `script.js` must not contain Japanese string literals
- `script.js` - DOM handling only (drawing, events, theme, tab keyboard navigation, SVG fitting and follow-scroll)
- `style.css` - Dark theme by default, light theme via `[data-theme="light"]`, CSS variables (`--low/--medium/--high/--accent-text/--on-primary`), responsive media queries, `--viz-max` for the figure box height
- `test/` - `core.test.js`, `html.test.js`, `contrast.test.js`, `format.test.js`, `readme.test.js` (+ `load.js` helper that runs the plain scripts with `vm.runInThisContext`)

## Key Behaviours

- Coordinates: `x = 40 + 40 * columnIndex`, `y = 100 + 24 * rowIndex`. The viewBox width grows with the key length (min 1200) and the height with the number of rows
- Limits are aligned (`ZZCore.LIMITS`): key 1,000 letters, plaintext 1,000 letters that exist in the key, points 1,000, points text 50,000 chars. Anything this tool encrypts can be decrypted by it
- Plaintext: only ASCII letters are uppercased and used. Letters missing from the key and non-letters are skipped and reported (`#encNotice`). Empty key is reported (`#keyNotice`, decode error)
- Duplicate letters in the key: one column is chosen with `crypto.getRandomValues` (rejection sampling, `randomIndex`). Choices are cached per plaintext position (`state.enc.selectedIndices`) so redraws and step playback show the same polyline
- Decrypt: sort by y (stable), nearest column by x (ties go to the lower index), lowercase output
- SVG download: built by `ZZCore.svgDocument`. With the key hidden, the SVG contains only the polyline and points (no `display:none` key text)
- Figure rendering: natural size (1 unit = 1px) scaled down to the box width but not below 0.55; the `.viz-wrap` box scrolls and follows the current point during step playback
- Tabs: WAI-ARIA tabs (role, aria-selected, aria-controls, arrow keys). Switching tabs stops running step timers
- CSP: `default-src 'self'; style-src 'self'` (no `unsafe-inline`). Do not add inline handlers or `style` attributes; use `hidden` / class toggles

## Development Commands

```bash
npm test                      # all tests (node --test)
python -m http.server 8000    # serve locally (file:// also works)
```

Screenshots in `assets/` are taken with a Playwright script kept outside this repository (viewport 1280x800, light theme; `screenshot4.png` is dark). `README.md` has a `readme.test.js` that checks the HELLOWORLD example, the limits table, the directory tree and the images, so update README and tests together.

## Conventions

- Japanese text: 本文はですます調、箇条書きはである調. Use 長音 (サーバー, ユーザー, ブラウザー), 「わかる」 not 「分かる」, 「すべて」 not 「全て」 (checked by `readme.test.js`)
- Keep README YAML front matter structure (keys and order) intact; only values may change
- Keep the series footer (「生成AIで作るセキュリティツール100」, page_id=42163)
