# Project Notes - TechWatch

> Intended for Claude CLI sessions. Read this before touching any code.
> Last updated: 2026-05-22

---

## What's Done

### Data pipeline (`collector.py`)
- Pulls 24 rolling months of data from 8 public APIs across 3 signal layers (research, trial, development) and 5 biomedical categories
- **Month iteration fixed** — was using `timedelta(days=i*30)` which skipped February; now uses correct year/month arithmetic
- **ClinicalTrials.gov API fixed** — was using invalid `filter.studyStartDate=ge:...,le:...` params; now uses correct v2 Essie syntax: `filter.advanced=AREA[StartDate]RANGE[start,end]`. Trials now return real data (~800–1000/month)
- **Manufacturing orders fixed** — Census EITS endpoint was always returning 0; replaced with FRED `AMTMNO` (Manufacturers' New Orders: Durable Goods, monthly). Now live ~620K/month
- **R&D expenditure fixed** — `RDEXPN` was returning nothing (wrong/invalid series); replaced with BEA series via FRED: `A829RC1Q027SBEA`. Quarterly data, forward-filled intra-quarter
- **Month gap filled** — 2026-02 was missing from the dataset due to the iteration bug; has now been fetched and added
- **Schema additions**: `collected_at` (ISO timestamp on new rows, `"legacy"` for pre-fix rows), `is_partial_month` (bool)
- **Current month always re-fetched** — cache is evicted for the current month on every run so partial-month data stays fresh
- **Forward-fill with imputation flags** — `_is_imputed: true` set on fields carried forward from prior periods; shown as "(Est.)" in dashboard tooltips

### Electron app packaging (`dashboard/electron/main.cjs`)
- Wraps the built Vite app in a native macOS window via Electron
- Uses `protocol.handle` with a custom `app://` scheme to serve static files — no Express or external server needed
- `window-all-closed` → `app.quit()` ensures the process fully exits when the window closes
- **Data architecture**: data lives at `~/Library/Application Support/TechWatch/` outside the bundle. App reads via IPC (`preload.cjs` → `contextBridge` → `ipcMain`). No rebuild needed when data updates — just run `collector.py`.
- **Bootstrap**: on first run, `bootstrapData()` copies seed data from `dist/data/indicators.json` to userData if not already present.
- Build scripts:
  - `npm run electron` — builds Vite then launches the Electron window (quick test)
  - `npm run dist` — builds Vite then packages `TechWatch.app` into `release/mac-arm64/`
- **Signing**: disabled (`"identity": null` in package.json build config). Ad-hoc codesign was failing on the Electron binaries due to xattr detritus. Unsigned is fine for personal use.
- **Gatekeeper**: First launch requires right-click → Open. Subsequent launches work normally.
- **Build time**: ~2-3 min. Was 20+ min when node_modules was included in asar. Fixed with `"!node_modules/**"` in files array.

### Dashboard (`dashboard/src/App.jsx`)
- **4 tabs**: Overview, Deep Dive, Momentum (new), Economy
- **Overview**: 3 KPI cards (research papers, trial starts, GitHub repos) with MoM/QoQ growth; Innovation Pipeline area chart (research/trial/dev over time); Latest Category Mix radar chart
- **Deep Dive**: Per-category pipeline timeline — research, trial, dev lines over time; category switcher dropdown; single-category radar showing current-month layer mix
- **Momentum tab (new)**: Z-score heatmap, all 5 categories × 24 months. Z-scores normalise against each category's own history so high-volume (Antibodies) and low-volume (Space Biology) fields are comparable. Toggle between research / trial / development layers. Anomaly markers (`▲▲` / `▼▼`) for cells >|2σ|, amber border for partial month. Hover tooltips show raw value, z-score, MoM %. Callout cards explain the two known structural anomalies
- **Economy tab**: Industrial Production (INDPRO) line chart; Renewable Generation area chart (label and Y-axis fixed — was showing `[0,100]` for data that's ~1100)
- **Data Health panel** (sidebar): live/no-data status dots for research, manufacturing, and trials
- **"⚠ Partial Month" badge** in header when viewing current month
- **Monthly / Quarterly frequency toggle** — aggregates across the whole app
- **Export RAW** button — downloads `report.csv`
- **Hooks violation fixed** — `heatMetric` (useState) and `heatmapData` (useMemo) were declared after the early `if (loading) return`, breaking React's Rules of Hooks and causing a blank render. Both are now hoisted above the early return alongside the other state declarations.

---

## Current Issues / Context

### EIA API timing out
- `api.eia.gov` is timing out consistently (10s timeout hit on every run)
- Renewable generation data is forward-filled from the last good value (2026-01: ~1103 thousand MWh)
- May be a transient network issue or the endpoint requires a different request format
- The EIA key is set in `.env` — worth testing manually: `curl "https://api.eia.gov/v2/electricity/electric-power-operational-data/data/?api_key=KEY&frequency=monthly&data[]=generation&facets[fueltypeid][]=AOR&length=3"`

### April 2026 data is stale
- The 2026-04 row was cached before the ClinicalTrials and AMTMNO fixes were applied
- It shows `total_trial: 0` and `census_manufacturing_orders: 0` — both wrong
- To fix: delete the `2026-04` entry from `dashboard/public/data/indicators.json` and re-run `collector.py`

### R&D expenditure mostly zero
- `A829RC1Q027SBEA` is quarterly so 3 out of 4 months show 0 before forward-fill kicks in
- Historical rows (pre-fix, with `collected_at: "legacy"`) all have `rd_expenditure: 0`
- Only newly fetched months (2026-02, 2026-05 so far) will have real values; the rest need a cache bust to backfill
- Not currently displayed on the dashboard — just in the CSV export

### Space Biology category is very low signal
- Keywords are `["space biology", "astrographics"]` — "astrographics" is oddly specific and may be pulling noise
- GitHub October 2025 shows 137 repos (vs. 1–4 normally) — almost certainly a single-event dump (course, hackathon, bulk upload). No research or trial corroboration
- Consider broadening keywords or dropping "astrographics"

### PatentsView not used
- `fetch_patents_hardened` is still in the codebase but its output isn't stored anywhere in `main()`
- The API requires an ODP key and was returning 410 Gone
- Either wire it up properly or remove the dead function

---

## Next Steps

### High priority
- **Fix April 2026 cache**: delete `2026-04` from `indicators.json` and re-run collector
- **EIA investigation**: figure out why the API is timing out and fix or increase timeout

### Features in flight / discussed
- **Pipeline Conversion Funnel** — show research → trial → dev conversion ratio per category. The core insight of the multi-layer architecture that isn't yet visualised directly. Would reveal which fields are "all papers, no trials" vs. moving to implementation
- **Research-to-Trial Lag analysis** — shift research series forward 6 and 12 months, overlay with trial series. Turns the dashboard into a leading indicator tool
- **Formal anomaly detection** — statistical flagging (>2σ) already exists in the heatmap z-score logic; could surface flagged months more prominently in a dedicated "Alerts" panel

### Collector improvements
- Remove the dead `fetch_patents_hardiv` function or wire it up
- Consider scheduling the collector with a cron job (monthly, first weekend of each month)
- Increase EIA timeout to 20s and add a retry

### Dashboard improvements
- The quarterly aggregation in `processData()` uses a running-average formula for `industrial_production` that resets the accumulator to 0 — check the math is correct for multi-month quarters
- Add a "last collected" timestamp to the sidebar using `collected_at` from the latest JSON row
