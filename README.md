# Animated Data Insights - Treemap Dashboard

A small, single-page dashboard that visualizes how people use Claude across US states and world countries. It renders an animated treemap, fits cleanly to the viewport, and keeps your selection in the URL so Back/Forward works naturally.

## Overview
- Single HTML file with a lightweight D3 treemap and smooth transitions.
- Two modes: States and Countries, each with its own place selector.
- URL state (`?mode=states&code=CA`) and local history so Back/Forward navigates selections.
- Robust data loading that prefers consolidated “_all” files and gracefully handles mixed JSON shapes.

## Features
- Viewport-fit layout: treemap fills the screen; the topics list scrolls within the left panel.
- FLIP-style animations when changing mode/place.
- Resilient JSON parsing for arrays/objects and missing fields.
- Fallback sample data when opened via `file://` so the UI still works.

## Project Structure
- `index.html` - App shell, styles, and D3 boot loader.
- `script.js` - Treemap controller, data loader, rendering, and interactions.
- `states_all.json`/`countries_all.json` - Preferred consolidated datasets (optional).
- `states.json`/`countries.json` - Fallback consolidated datasets.
- `prompts.md` - Paraphrased prompts and outcomes.
- `LICENSE` - MIT.

## Getting Started
- Serve the folder (fetch requires HTTP):
  - Python: `python -m http.server 8000`
  - Node: `npx serve . -l 8000`
- Open `http://localhost:8000`.
- Use “Mode” to switch between States/Countries; pick a place in the rightmost select.
- Defaults: States -> CA, Countries -> USA (overridden by URL/localStorage).

## Data Loading
- File preference order:
  - States: `states_all.json` -> `states.json`
  - Countries: `countries_all.json` -> `countries.json`
- The loader normalizes these fields even if shapes vary by file:
  - `most_frequent_topics`: array or single object; uses `text` + `share`/`value`.
  - `job_groups`: array or single object; collects all groups into the color domain.
- If both fetches fail (e.g., opened via `file://`), the app renders a small built‑in sample and shows a notice.

## Regenerate Consolidated Data (latest `release_*`)
Run from the repo root to regenerate sorted `states.json` and `countries.json` from the newest `release_*` folder:

```
$ErrorActionPreference='Stop'
function Find-LatestReleasePath { param([string]$root)
  $dirs = Get-ChildItem -Directory -Path $root | Where-Object { $_.Name -like 'release_*' }
  if (-not $dirs) { throw 'No release* directories found.' }
  ($dirs | Sort-Object { $_.Name -replace '[^0-9]','' } -Descending)[0].FullName
}

$root = (Get-Location).Path
$latest = Find-LatestReleasePath -root $root
$statesSrc = Join-Path $latest 'data\output\states_all.json'
$countriesSrc = Join-Path $latest 'data\output\countries_all.json'
if (-not (Test-Path $statesSrc)) { $statesSrc = Get-ChildItem -Recurse -Path $latest -Filter 'states*.json' | Select-Object -First 1 -ExpandProperty FullName }
if (-not (Test-Path $countriesSrc)) { $countriesSrc = Get-ChildItem -Recurse -Path $latest -Filter 'countries*.json' | Select-Object -First 1 -ExpandProperty FullName }
if (-not (Test-Path $statesSrc) -or -not (Test-Path $countriesSrc)) { throw 'Could not locate source JSON files.' }

$states = Get-Content $statesSrc -Raw | ConvertFrom-Json
$countries = Get-Content $countriesSrc -Raw | ConvertFrom-Json

$statesSorted = $states | Sort-Object -Property @{Expression={ if($null -ne $_.usage_index){[double]$_.usage_index}else{0} } ; Descending=$true}
$countriesSorted = $countries | Sort-Object -Property @{Expression={ if($null -ne $_.usage_index){[double]$_.usage_index}else{0} } ; Descending=$true}

$statesSorted   | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 -Path 'states.json'
$countriesSorted| ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 -Path 'countries.json'
Write-Host "Generated states.json and countries.json from $latest"
```

## Troubleshooting
- Blank dropdowns: run a local server (see Getting Started). Opening via `file://` blocks fetch.
- D3 failed to load: corporate networks may block CDNs. The page includes a fallback loader and a friendly error; serving locally generally resolves it.
- Wrong or missing colors/labels: ensure your JSON uses `name` for group labels and `share`/`value` for numeric values.

## License
MIT. See `LICENSE`.

