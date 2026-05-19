import os
import re
import json
import requests
from dotenv import load_dotenv

load_dotenv()

TOKEN = os.environ["GITHUB_TOKEN"]
HEADERS = {"Authorization": f"token {TOKEN}"}
BASE = "https://api.github.com/repos/microsoft/vscode"

releases = requests.get(f"{BASE}/releases?per_page=5", headers=HEADERS).json()
with open("data/releases.json", "w") as f:
    json.dump(releases, f)

oldest_release_date = min(r["published_at"] for r in releases)
print(f"Cubriendo desde: {oldest_release_date}")

prs = []
for page in range(1, 21):
    batch = requests.get(
        f"{BASE}/pulls?state=closed&per_page=100&page={page}",
        headers=HEADERS
    ).json()
    if not batch:
        break
    prs.extend(batch)
    oldest_in_batch = min(
        (pr["merged_at"] for pr in batch if pr.get("merged_at")),
        default=None
    )
    print(f"  Página {page}: {len(batch)} PRs, más viejo mergeado: {oldest_in_batch}")
    if oldest_in_batch and oldest_in_batch < oldest_release_date:
        break

with open("data/prs.json", "w") as f:
    json.dump(prs, f)


open_prs = requests.get(
    f"{BASE}/pulls?state=open&per_page=100", headers=HEADERS
).json()
with open("data/open_prs.json", "w") as f:
    json.dump(open_prs, f)


referenced_nums = set()
for pr in prs + open_prs:
    if pr.get("body"):
        matches = re.findall(r"(?:closes|fixes|resolves)\s+#(\d+)",
                             pr["body"], re.IGNORECASE)
        referenced_nums.update(int(m) for m in matches)

issues = requests.get(
    f"{BASE}/issues?state=closed&per_page=100", headers=HEADERS
).json()
issues = [i for i in issues if "pull_request" not in i]

existing_nums = {i["number"] for i in issues}
for num in referenced_nums - existing_nums:
    resp = requests.get(f"{BASE}/issues/{num}", headers=HEADERS)
    if resp.status_code == 200:
        issue = resp.json()
        if "pull_request" not in issue:
            issues.append(issue)

with open("data/issues.json", "w") as f:
    json.dump(issues, f)

print(f"\nDescargado: {len(releases)} releases, {len(prs)} PRs cerrados, "
      f"{len(open_prs)} PRs abiertos, {len(issues)} issues")
