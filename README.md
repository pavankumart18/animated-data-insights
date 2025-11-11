# Treemap Transitions with D3

This project demonstrates a responsive treemap dashboard built with **D3.js**. It renders synthetic usage data for several U.S. regions, animating between states with smooth transitions and FLIP-inspired entry effects.

## Getting Started

1. Open `index.html` in any modern browser (Chrome, Edge, Safari, or Firefox).
2. Use the region dropdown in the header to switch datasets. Tiles animate into their new positions and display both the category name and its percentage contribution.
3. Resize the browser window to see the responsive layout adapt.

No build step is required—everything runs directly in the browser using the CDN-hosted D3 v7 bundle.

## Files

- `index.html` — main HTML page containing styles, data, and D3 rendering logic.
- `README.md` — this file.

## Customization Tips

- **Data**: Expand or replace the `DATA` object inside `index.html` to visualize different hierarchies. Each node expects an id, name, value, and category.
- **Colors**: Adjust the `color` ordinal scale to introduce or remap categories.
- **Animation**: Tweak transition durations/easing in `renderTreemap` to achieve different motion profiles.

Feel free to remix the layout or drop this treemap into your own dashboards. If you extend it, consider extracting the D3 code into separate modules for easier reuse.

