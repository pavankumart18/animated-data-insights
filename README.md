# Animated Data Insights — Treemap Dashboard

A lightweight, single‑page dashboard that visualizes how people use Claude across US states and world countries. It renders an animated treemap, fits to the viewport, and preserves selection in the URL for natural Back/Forward navigation.

## Quick Start
1) Build data files (writes to repo root)

```
# Easiest: no env prep
uv run fetch_data.py --output-dir .

# Or: Python + pip
python -m venv .venv
.venv\Scripts\pip install -U pip pandas huggingface_hub
.venv\Scripts\python fetch_data.py --output-dir .
```

2) Serve locally (fetch requires HTTP)

```
python -m http.server 8000
# or
npx serve . -l 8000
```

3) Open `http://localhost:8000` and use the Mode + Place controls.

Defaults: States → CA, Countries → USA (overridden by URL/localStorage).

## Features
- Single HTML + D3 treemap with smooth transitions.
- Two modes: States and Countries, each with its own dropdown.
- URL state: `?mode=states&code=CA` for deep‑links and navigation.
- Viewport‑fit layout: treemap fills the screen; topics list scrolls.
- Resilient JSON parsing; graceful fallback to a built‑in sample when opened via `file://`.

## Build Data (fetch_data.py)
The included script fetches the Anthropic/EconomicIndex dataset and produces the compact JSON files consumed by the app.

Basic usage

```
uv run fetch_data.py --output-dir .
```

Options
- `--repo-id` (default `Anthropic/EconomicIndex`) – dataset repo on Hugging Face
- `--release` – specific `release_YYYY_MM_DD` (default: latest)
- `--output-dir` – where to write `countries_all.json` and `states_all.json`
- `--min-observations` – privacy threshold (default: 50)
- `--top-topics` – number of topics to include (default: 10)
- `--compact` – write minified JSON

Notes
- The script downloads a snapshot, builds the two JSON files, then removes the local dataset folder.
- Internet access to `huggingface.co` is required (configure your proxy if applicable).

## Data Schema (expected)
The app loads these two files from the site root:
- `states_all.json`
- `countries_all.json`

Each is an array of objects. Minimal shape:

```
// states_all.json
[
  {
    "state_code": "CA",
    "state": "California",
    "usage_index": 1.0,
    "total_observations": 1000,
    "most_frequent_topics": [ { "text": "...", "share": 12.7 } ],
    "job_groups": [ { "name": "Computer and Mathematical", "value": 33.3 } ]
  }
]

// countries_all.json
[
  {
    "country_code": "USA",
    "country": "United States",
    "usage_index": 1.0,
    "total_observations": 10000,
    "most_frequent_topics": [ { "text": "...", "share": 15.0 } ],
    "job_groups": [ { "name": "Educational Instruction and Library", "value": 12.0 } ]
  }
]
```

The loader tolerates minor shape differences (arrays or single objects) and normalizes missing fields where possible.

## Project Structure
- `index.html` – App shell, styles, and D3 boot loader
- `script.js` – Treemap controller, data loader, rendering, interactions
- `fetch_data.py` – Builds `countries_all.json` and `states_all.json`
- `states_all.json` / `countries_all.json` – Consolidated datasets used by the app
- `states.json` / `countries.json` – Optional legacy datasets (not used by the app)
- `prompts.md` – Paraphrased prompts and outcomes
- `LICENSE` – MIT

## Troubleshooting
- Blank dropdowns – Run a local server; opening via `file://` blocks fetch.
- D3 failed to load – Some networks block CDNs. The page tries alternate CDNs and shows a friendly error. Serving locally usually works.
- Odd colors/labels – Ensure `job_groups[].name` and numeric `share`/`value` fields exist.

## Optional: Legacy JSONs
If you need smaller `states.json`/`countries.json` files from a `release_*` folder, you can generate them with the PowerShell snippet previously included. The app itself does not read these files.

## License
MIT. See `LICENSE`.

