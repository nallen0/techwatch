# TechWatch

**Live site:** [nallen0.github.io/techwatch](https://nallen0.github.io/techwatch/)

A biomedical innovation intelligence dashboard that tracks activity across the full research-to-market pipeline — from academic papers and clinical trials through to open-source development — and overlays macroeconomic context.

---

## Contributing

1. Fork the repo and clone locally
2. `cd dashboard && npm install && npm run dev` — the dashboard loads with committed data immediately, no API keys needed
3. To refresh the data yourself: copy `.env.example` → `.env`, fill in your keys, run `python3 collector.py`, then commit the updated `dashboard/public/data/indicators.json`
4. Open a PR against `main`

Data is updated monthly by the maintainer. If you spot a data quality issue (wrong zeros, stale imputation, broken API), open an issue.

---

## What It Does

TechWatch pulls data monthly from eight public APIs, organises it into three signal layers across five research categories, and presents it as an interactive dashboard.

**Signal layers**
| Layer | Sources | What it measures |
|---|---|---|
| Research | PubMed, ArXiv, OpenAlex | Academic paper volume — earliest leading indicator |
| Trial | ClinicalTrials.gov, FDA | Studies starting and drug approvals — translation signal |
| Development | GitHub | Open-source repository creation — implementation signal |

**Categories tracked**
- Personalized / Precision Medicine
- Antibodies & Monoclonals
- Orphan Drugs & Rare Disease
- Medical Devices & Implants
- Space Biology

**Economic context** (from FRED / EIA)
- Industrial Production Index (INDPRO)
- Manufacturers' New Orders: Durable Goods (AMTMNO)
- Renewable Energy Generation (EIA all-renewables)
- R&D Expenditure (BEA via FRED — A829RC1Q027SBEA, quarterly)

---

## Project Structure

```
TechWatch/
├── collector.py              # Data pipeline — fetches, caches, and outputs indicators
├── report.csv                # Flat CSV export (mirrors indicators.json)
├── .env                      # API keys (not committed)
├── .env.example              # Key reference template
├── dashboard/
│   ├── public/
│   │   ├── report.csv        # CSV served for the Export RAW button
│   │   └── data/
│   │       └── indicators.json   # Primary data file read by the dashboard
│   └── src/
│       ├── App.jsx           # All dashboard views and logic
│       └── index.css         # Dark glass theme
└── scratch/                  # Throwaway exploration scripts
```

---

## Setup

### 1. Python environment

```bash
python3 -m venv venv
source venv/bin/activate
pip install requests pandas python-dotenv
```

### 2. API keys

Copy `.env.example` to `.env` and fill in your keys.

```
FRED_API_KEY=        # https://fred.stlouisfed.org/docs/api/api_key.html
EIA_API_KEY=         # https://www.eia.gov/opendata/
NCBI_API_KEY=        # https://www.ncbi.nlm.nih.gov/account/ (optional, raises rate limit)
GITHUB_TOKEN=        # https://github.com/settings/tokens (optional, raises rate limit)
```

Census and PatentsView keys are no longer used (replaced with FRED series).

### 3. Dashboard dependencies

```bash
cd dashboard
npm install
```

---

## Running

### Collect / refresh data

```bash
source venv/bin/activate
python3 collector.py
```

The collector caches by month — it will only fetch months not already present in `indicators.json`, **except** the current month, which is always re-fetched (it's a partial month in progress). A full 24-month backfill takes ~10–15 minutes due to ArXiv and GitHub rate-limit sleeps. Incremental monthly runs take under 2 minutes.

### Launch the dashboard

```bash
cd dashboard
npm run dev
```

Opens at `http://localhost:5173` (or `5174` if that port is taken).

---

## Dashboard Tabs

| Tab | What's there |
|---|---|
| **Overview** | Top-line metric cards (research, trials, dev), innovation pipeline area chart, latest-month radar by category |
| **Deep Dive** | Per-category pipeline timeline; switch between categories with the dropdown |
| **Momentum** | Z-score heatmap — all categories × all months, coloured by deviation from each category's own baseline. Toggle between research / trial / development layers. Anomaly markers flag statistically unusual cells. |
| **Economy** | FRED industrial production and EIA renewable generation time series |

---

## Data Notes

- **Caching**: `indicators.json` is the cache. Delete a month's entry to force a re-fetch.
- **Imputation**: FRED and EIA series lag by 4–6 weeks. When the current value is zero the previous known value is forward-filled; imputed cells carry an `_is_imputed: true` flag and are labelled "(Est.)" in tooltips.
- **Renewable energy unit**: The EIA figure is total all-renewables generation in **thousand MWh**, not a percentage share. The label in the Economy tab reflects this.
- **R&D expenditure**: The BEA series (A829RC1Q027SBEA) is quarterly. Off-quarter months are forward-filled.
- **January publishing bulge**: Academic sources consistently show a ~2× spike every January due to journal publication calendars flushing Q4 backlog. This is a structural calendar artifact, not a real trend signal. The Momentum heatmap's z-score colouring de-weights it automatically since it's a known pattern, but the `▲▲` anomaly marker will still appear.
- **Partial month**: The current calendar month is always marked `is_partial_month: true` in the JSON and flagged with a "⚠ Partial Month" badge in the dashboard header.
