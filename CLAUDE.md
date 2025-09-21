# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Zigzag CipherLab is a fully implemented educational web tool for demonstrating the Zigzag Cipher, a geometric cipher method where plaintext letters are plotted as points and connected into a zigzag polyline. This is part of the "100 Security Tools with Generative AI" project (Day 072).

## Tech Stack

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Visualization**: SVG-based rendering (no Canvas)
- **Deployment**: GitHub Pages (https://ipusiron.github.io/zigzag-cipherlab/)
- **No build tools or dependencies** - Pure static files

## Architecture

### File Structure
- `index.html` - Single-page application with 4 tabs (鍵生成, 暗号化, 復号, 座学)
- `script.js` - Core logic for cipher operations and SVG visualization
- `style.css` - Dark theme styling with CSS variables

### Key Components

1. **State Management** (`script.js`):
   - Global `state` object manages key, visualization parameters, encryption/decryption state
   - No frameworks - direct DOM manipulation via helper functions

2. **Visualization System**:
   - SVG-based rendering using `createElementNS`
   - Dynamic polyline generation from coordinate points
   - Real-time preview with toggle for performance

3. **Cipher Algorithm**:
   - Maps plaintext characters to x,y coordinates based on key position
   - Y coordinate increases for each character (creates zigzag effect)
   - Decryption maps points back to nearest key column

## Development Commands

No build or development server needed - open `index.html` directly in browser or serve with any static file server:

```bash
# Simple Python server
python -m http.server 8000

# Or Node.js server
npx http-server
```

## Testing Approach

Manual testing via browser - no test framework currently configured. Key test scenarios:
- Custom key generation and shuffling
- Real-time encryption visualization
- Point export/import for decryption
- Step-by-step decryption playback

## Key Implementation Details

- **Coordinate System**: Fixed 1200x600 SVG viewBox with responsive scaling
- **Layout**: Column-based with 40px gaps, starting at marginX=40
- **Export Format**: Space-separated coordinates like "120,160 195,220"
- **Key Constraints**: Accepts any uppercase letters, duplicates allowed