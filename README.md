# Animated Data Insights

A small set of single-file dashboards demonstrating animated D3.js treemaps with FLIP (First/Last/Invert/Play) transitions. Built for quick prototyping and comparison between US states and world countries datasets.

## Files
- index.html — US states treemap with animated transitions.
- index2.html — World countries treemap with similar layout and animations.
- prompts.md — Full prompt/output log for this session.
- prompts-only.md — Extracted prompts only (one per line).

## Quick Start
1. Open index.html (US states) or index2.html (countries) in a modern browser.
2. Use the dropdown to switch datasets and observe in-place FLIP transitions.
3. Tweak data inside the <script> block to prototype new scenarios.

## Tech Notes
- D3.js v7 for treemap layout and joins.
- FLIP technique to animate rectangle movement/resizing instead of fade.
- Pure HTML/CSS/JS — no build step.

## Editing Data
- Each page defines a DATA object with categories and values.
- Update 	opics and 	ree.children entries to reflect new data.

## Next Steps
- Add more datasets (states or countries).
- Tune animation duration/easing to taste.
- Consider extracting shared JS into a separate file if desired.

## Credits
- Built collaboratively via Codex CLI.
