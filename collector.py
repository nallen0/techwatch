import os
import requests
import json
import pandas as pd
from datetime import datetime
from dotenv import load_dotenv
import logging
import time

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

load_dotenv()

FRED_API_KEY = os.getenv('FRED_API_KEY')
EIA_API_KEY = os.getenv('EIA_API_KEY')
NCBI_API_KEY = os.getenv('NCBI_API_KEY')
GITHUB_TOKEN = os.getenv('GITHUB_TOKEN')

CATEGORY_MAPPING = {
    "personalized_medicine": {"cpc": "C12Q", "keywords": ["personalized", "precision medicine"]},
    "antibodies": {"cpc": "C07K", "keywords": ["antibody", "monoclonal"]},
    "orphan_drugs": {"cpc": "A61P", "keywords": ["orphan drug", "rare disease"]},
    "medical_devices": {"cpc": "A61B", "keywords": ["medical device", "implant"]},
    "space_biology": {"cpc": "B64G", "keywords": ["space biology", "astrographics"]}
}

def get_last_24_months():
    today = datetime.now()
    year, month = today.year, today.month
    months = []
    for _ in range(24):
        months.append(f"{year}-{month:02d}")
        month -= 1
        if month == 0:
            month = 12
            year -= 1
    return sorted(months)

def fetch_fda_hardened(month, keywords):
    start_date = month.replace('-', '') + '01'
    year, m = month.split('-')
    end_date = f"{int(year)+1}0101" if m == '12' else f"{year}{int(m)+1:02d}01"
    search_query = "+OR+".join([f"\"{k}\"" for k in keywords])
    url = f"https://api.fda.gov/drug/drugsfda.json?search=submissions.approval_date:[{start_date}+TO+{end_date}]+AND+({search_query})&limit=1"
    try:
        response = requests.get(url, timeout=10)
        if response.status_code == 200:
            return response.json().get('meta', {}).get('results', {}).get('total', 0)
    except:
        pass
    return 0

def fetch_fred_indicator(series_id):
    if not FRED_API_KEY:
        return {}
    url = f"https://api.stlouisfed.org/fred/series/observations?series_id={series_id}&api_key={FRED_API_KEY}&file_type=json"
    try:
        response = requests.get(url, timeout=10)
        if response.status_code == 200:
            data = response.json().get('observations', [])
            return {obs['date'][:7]: float(obs['value']) for obs in data if obs['value'] != '.'}
    except:
        pass
    return {}

def fetch_eia_renewables():
    if not EIA_API_KEY:
        return {}
    url = (
        f"https://api.eia.gov/v2/electricity/electric-power-operational-data/data/"
        f"?api_key={EIA_API_KEY}&frequency=monthly&data[]=generation"
        f"&facets[fueltypeid][]=AOR&length=48"
    )
    try:
        response = requests.get(url, timeout=10)
        if response.status_code == 200:
            data = response.json().get('response', {}).get('data', [])
            return {obs['period']: float(obs['generation']) for obs in data if obs.get('generation') is not None}
        else:
            logger.error(f"EIA API Error: {response.status_code} - {response.text}")
    except Exception as e:
        logger.error(f"EIA Fetch Error: {e}")
    return {}

def fetch_arxiv_indicator(month, keywords):
    year, m = month.split('-')
    import calendar
    last_day = calendar.monthrange(int(year), int(m))[1]
    start_date = f"{year}{m}010000"
    end_date = f"{year}{m}{last_day}2359"
    query_parts = [f'all:"{k}"' for k in keywords]
    search_query = "+OR+".join(query_parts)
    url = f"http://export.arxiv.org/api/query?search_query=({search_query})+AND+submittedDate:[{start_date}+TO+{end_date}]&max_results=0"
    try:
        time.sleep(3)
        response = requests.get(url, timeout=10)
        if response.status_code == 200:
            import xml.etree.ElementTree as ET
            root = ET.fromstring(response.content)
            total = root.find('{http://a9.com/-/spec/opensearch/1.1/}totalResults')
            if total is not None:
                return int(total.text)
    except Exception as e:
        logger.error(f"ArXiv Fetch Error: {e}")
    return 0

def fetch_pubmed_indicator(month, keywords):
    year, m = month.split('-')
    import calendar
    last_day = calendar.monthrange(int(year), int(m))[1]
    start_date = f"{year}/{m}/01"
    end_date = f"{year}/{m}/{last_day}"
    query = " OR ".join([f'"{k}"[TW]' for k in keywords])
    url = f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=({query})+AND+{start_date}[PDAT]:{end_date}[PDAT]&rettype=count"
    if NCBI_API_KEY:
        url += f"&api_key={NCBI_API_KEY}"
    try:
        time.sleep(0.1 if NCBI_API_KEY else 0.5)
        r = requests.get(url, timeout=10)
        if r.status_code == 200:
            import xml.etree.ElementTree as ET
            root = ET.fromstring(r.content)
            count = root.find('Count')
            return int(count.text) if count is not None else 0
    except Exception as e:
        logger.error(f"PubMed Fetch Error: {e}")
    return 0

def fetch_clinical_trials_indicator(month, keywords):
    year, m = month.split('-')
    import calendar
    last_day = calendar.monthrange(int(year), int(m))[1]
    start = f"{year}-{m}-01"
    end = f"{year}-{m}-{last_day}"
    query = " OR ".join([f'"{k}"' for k in keywords])
    # v2 API uses filter.advanced with Essie AREA[StartDate]RANGE syntax
    params = {
        'query.term': query,
        'filter.advanced': f'AREA[StartDate]RANGE[{start},{end}]',
        'countTotal': 'true',
        'pageSize': '0',
    }
    try:
        r = requests.get("https://clinicaltrials.gov/api/v2/studies", params=params, timeout=10)
        if r.status_code == 200:
            return r.json().get('totalCount', 0)
    except Exception as e:
        logger.error(f"ClinicalTrials Fetch Error: {e}")
    return 0

def fetch_github_indicator(month, keywords):
    year, m = month.split('-')
    import calendar
    last_day = calendar.monthrange(int(year), int(m))[1]
    start = f"{year}-{m}-01"
    end = f"{year}-{m}-{last_day}"
    query = " OR ".join([f'"{k}"' for k in keywords])
    url = f"https://api.github.com/search/repositories?q={query}+created:{start}..{end}"
    headers = {"Accept": "application/vnd.github.v3+json"}
    if GITHUB_TOKEN:
        headers["Authorization"] = f"token {GITHUB_TOKEN}"
    try:
        time.sleep(2)
        r = requests.get(url, headers=headers, timeout=10)
        if r.status_code == 200:
            return r.json().get('total_count', 0)
    except Exception as e:
        logger.error(f"GitHub Fetch Error: {e}")
    return 0

def fetch_openalex_indicator(month, keywords):
    year, m = month.split('-')
    import calendar
    last_day = calendar.monthrange(int(year), int(m))[1]
    start = f"{year}-{m}-01"
    end = f"{year}-{m}-{last_day}"
    query = "|".join([f'"{k}"' for k in keywords])
    url = f"https://api.openalex.org/works?filter=default_search:{query},from_publication_date:{start},to_publication_date:{end}"
    try:
        r = requests.get(url, timeout=10)
        if r.status_code == 200:
            return r.json().get('meta', {}).get('count', 0)
    except Exception as e:
        logger.error(f"OpenAlex Fetch Error: {e}")
    return 0

def main():
    logger.info("Collecting TechWatch indicators...")
    months = get_last_24_months()

    indpro_data = fetch_fred_indicator('INDPRO')
    # BEA R&D expenditures via FRED (quarterly; forward-filled for off-quarter months)
    rd_exp_data = fetch_fred_indicator('A829RC1Q027SBEA')
    eia_data = fetch_eia_renewables()
    # FRED AMTMNO: Manufacturers' New Orders: Durable Goods (replaces broken Census endpoint)
    manufacturing_data = fetch_fred_indicator('AMTMNO')

    results = []

    prev_values = {
        "industrial_production": 0,
        "census_manufacturing_orders": 0,
        "renewable_energy_share": 0,
        "rd_expenditure": 0,
    }

    data_dir = os.path.join(os.path.expanduser('~'), 'Library', 'Application Support', 'TechWatch')
    os.makedirs(data_dir, exist_ok=True)
    output_json = os.path.join(data_dir, 'indicators.json')
    existing_data = {}
    if os.path.exists(output_json):
        try:
            with open(output_json, 'r') as f:
                existing_rows = json.load(f)
                for row in existing_rows:
                    if "month" in row:
                        # Migrate legacy rows to current schema
                        row.setdefault('collected_at', 'legacy')
                        row.setdefault('is_partial_month', False)
                        existing_data[row["month"]] = row
            logger.info(f"Loaded {len(existing_data)} existing records from cache.")
        except Exception as e:
            logger.error(f"Failed to load existing data cache: {e}")

    today_month = datetime.now().strftime('%Y-%m')

    # Ensure the current month is always re-fetched (data grows during the month)
    # and has is_partial_month correctly set
    if today_month in existing_data:
        logger.info(f"Evicting cached {today_month} for refresh (partial month).")
        del existing_data[today_month]

    # Correct is_partial_month on any migrated rows (setdefault defaulted to False)
    for m, row in existing_data.items():
        row['is_partial_month'] = (m == today_month)

    for month in months:
        if month in existing_data:
            logger.info(f"Skipping {month} (cached)...")
            results.append(existing_data[month])
            for key in prev_values:
                val = existing_data[month].get(key, 0)
                if val != 0:
                    prev_values[key] = val
            continue

        logger.info(f"Processing {month}...")

        layer_stats = {"research": {}, "trial": {}, "development": {}}

        for cat, params in CATEGORY_MAPPING.items():
            arxiv = fetch_arxiv_indicator(month, params['keywords'])
            pubmed = fetch_pubmed_indicator(month, params['keywords'])
            openalex = fetch_openalex_indicator(month, params['keywords'])
            layer_stats["research"][cat] = arxiv + pubmed + openalex

            fda = fetch_fda_hardened(month, params['keywords'])
            trials = fetch_clinical_trials_indicator(month, params['keywords'])
            layer_stats["trial"][cat] = fda + trials

            github = fetch_github_indicator(month, params['keywords'])
            layer_stats["development"][cat] = github

        total_research = sum(layer_stats["research"].values())
        total_trial = sum(layer_stats["trial"].values())
        total_dev = sum(layer_stats["development"].values())

        indpro = indpro_data.get(month, 0)
        rd_exp = rd_exp_data.get(month, 0)
        renewable = eia_data.get(month, 0)
        mfg_orders = manufacturing_data.get(month, 0)

        row = {
            "month": month,
            "collected_at": datetime.now().isoformat(),
            "is_partial_month": (month == today_month),
        }

        if indpro == 0 and prev_values["industrial_production"] != 0:
            row["industrial_production"] = prev_values["industrial_production"]
            row["industrial_production_is_imputed"] = True
        else:
            row["industrial_production"] = float(round(indpro, 2))
            row["industrial_production_is_imputed"] = False
            if indpro != 0:
                prev_values["industrial_production"] = indpro

        if mfg_orders == 0 and prev_values["census_manufacturing_orders"] != 0:
            row["census_manufacturing_orders"] = prev_values["census_manufacturing_orders"]
            row["census_manufacturing_orders_is_imputed"] = True
        else:
            row["census_manufacturing_orders"] = int(mfg_orders)
            row["census_manufacturing_orders_is_imputed"] = False
            if mfg_orders != 0:
                prev_values["census_manufacturing_orders"] = int(mfg_orders)

        if renewable == 0 and prev_values["renewable_energy_share"] != 0:
            row["renewable_energy_share"] = prev_values["renewable_energy_share"]
            row["renewable_energy_share_is_imputed"] = True
        else:
            row["renewable_energy_share"] = float(round(renewable, 2))
            row["renewable_energy_share_is_imputed"] = False
            if renewable != 0:
                prev_values["renewable_energy_share"] = renewable

        # R&D is quarterly; forward-fill intra-quarter months
        if rd_exp == 0 and prev_values["rd_expenditure"] != 0:
            row["rd_expenditure"] = prev_values["rd_expenditure"]
        else:
            row["rd_expenditure"] = int(rd_exp)
            if rd_exp != 0:
                prev_values["rd_expenditure"] = int(rd_exp)

        row["total_research"] = int(total_research)
        row["total_trial"] = int(total_trial)
        row["total_development"] = int(total_dev)

        for cat in CATEGORY_MAPPING:
            row[f"res_{cat}"] = int(layer_stats["research"][cat])
            row[f"tri_{cat}"] = int(layer_stats["trial"][cat])
            row[f"dev_{cat}"] = int(layer_stats["development"][cat])

        results.append(row)

    with open(output_json, 'w') as f:
        json.dump(results, f, indent=2)

    pd.DataFrame(results).to_csv(os.path.join(data_dir, 'report.csv'), index=False)
    logger.info(f"Done. {len(results)} months saved to {output_json}")

if __name__ == "__main__":
    main()
