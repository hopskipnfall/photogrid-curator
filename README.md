# PhotoGrid Curator

🔗 **Live Site:** [hopskipnfall.github.io/photogrid-curator](https://hopskipnfall.github.io/photogrid-curator/)

A simple single-page web application designed for photographers to compose, crop, arrange, and export a 3x3 photo grid.

This curator was specifically designed and used to compile photo entries for the [東京カメラ部 (Tokyo Camera Club) 3x3 Contest](https://tokyocameraclub.com/special/3x3/).

Built using Gemini 3.5 Flash.

<img width="1167" height="669" alt="スクリーンショット 2026-06-04 8 09 39" src="https://github.com/user-attachments/assets/5988c4a0-cedf-490a-8d90-2bc780db58d6" />


---

## Key Features

1. **Mosaic Grouping**: Merge arbitrary, non-contiguous grid squares into a single large cell framing a single backing photo. The gaps/borders between the grid remain visible, acting as window frames that slice the single backing photo.
2. **Coordinate-Matching Ungrouping**: Split a grouped layout back into individual squares. To prevent images from jumping, the app uses coordinate-matching projection math to copy and crop the image exactly where it was, allowing you to pan and zoom them independently.
3. **Double-Axis Panning & Zooming**: 
   - Portrait images automatically fit cell width and pan vertically.
   - Landscape images fit cell height and pan horizontally.
   - Zooming in enables multi-axis panning in any direction.
4. **Image & Group Pinning**: Lock photos in place on any slot or group. Pinned cells display a persistent `📌` badge and are completely ignored by the layout randomizer, allowing you to lock in parts of your layout while shuffling the rest.
5. **Interactive Undo History**: Keeps a historical stack of the last 15 actions. Easily revert placements, swaps, groupings, panning, zooms, or randomizations using the sidebar **Undo** button or the standard keyboard shortcut (`Cmd+Z` / `Ctrl+Z`).
6. **Dual-Language Localization**: Instant toggle between English (**EN**) and Japanese (**JA**) translation files.
7. **Ultra-High Resolution Export**: Renders your custom layout to an offscreen 3000 x 3000px canvas, generating pixel-perfect crops from your original high-resolution JPEGs with pure white spacing gaps.
8. **Responsive 3-Column Layout**: A modern slate-dark, glassmorphic layout optimized for wide desktop screens and Firefox drag-and-drop compatibility.

---

## Project Structure

- `index.html`: Structural semantic layout, language selectors, and social sidebar footers.
- `index.css`: Layout constraints, design tokens, typography, custom sliders, overlays, and animations.
- `app.js`: Core application controller managing history states, math projection coordinates, drag-and-drop file swapping, and localized language translation dictionaries.

---

## Getting Started

Since this is a client-side static application, there are no databases or backend installation requirements.

### Run Locally
You can double-click `index.html` to open it directly in any browser, or host a local development server using Python:

```bash
# Start a simple HTTP server in the project folder
python3 -m http.server 8000
```
Then navigate to `http://localhost:8000` in your web browser.

---

## Social Links

Feel free to connect and follow my work:
- **Instagram**: [@hopskipnfall](https://instagram.com/hopskipnfall)
- **Twitter**: [@jonn_photo](https://twitter.com/jonn_photo)
