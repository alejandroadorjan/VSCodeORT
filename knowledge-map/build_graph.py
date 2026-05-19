import json
import re
import math

releases  = json.load(open("data/releases.json"))
prs       = json.load(open("data/prs.json"))
open_prs  = json.load(open("data/open_prs.json"))
issues    = json.load(open("data/issues.json"))

issue_map = {i["number"]: i for i in issues if "pull_request" not in i}
pr_map    = {pr["number"]: pr for pr in prs}

releases_sorted = sorted(releases, key=lambda r: r["published_at"])

def assign_release_id(merged_at):
    if not merged_at:
        return None
    for r in releases_sorted:
        if merged_at <= r["published_at"]:
            return f"release-{r['id']}"
    return f"release-{releases_sorted[-1]['id']}"


pr_closes = {}
for pr in prs:
    if pr.get("body") and pr.get("merged_at"):
        matches = re.findall(r"(?:closes|fixes|resolves)\s+#(\d+)",
                             pr["body"], re.IGNORECASE)
        for issue_number in matches:
            num = int(issue_number)
            if num in issue_map:
                pr_closes.setdefault(pr["number"], []).append(num)


open_pr_closes = {}
for pr in open_prs:
    if pr.get("body"):
        matches = re.findall(r"(?:closes|fixes|resolves)\s+#(\d+)",
                             pr["body"], re.IGNORECASE)
        for issue_number in matches:
            num = int(issue_number)
            if num in issue_map:
                open_pr_closes.setdefault(pr["number"], []).append(num)

connected_pr_nums    = set(pr_closes.keys())
connected_issue_nums = {n for nums in pr_closes.values() for n in nums}
open_pr_nums         = set(open_pr_closes.keys())
open_issue_nums      = {n for nums in open_pr_closes.values() for n in nums}


used_release_ids = set()
for pr_num in connected_pr_nums:
    rid = assign_release_id(pr_map[pr_num].get("merged_at"))
    if rid:
        used_release_ids.add(rid)

latest_release_id = f"release-{releases_sorted[-1]['id']}"


nodes = []

for r in releases:
    rid = f"release-{r['id']}"
    if rid in used_release_ids:
        nodes.append({
            "id":    rid,
            "type":  "release",
            "state": "closed",
            "title": r["name"],
            "url":   r["html_url"],
            "date":  r["published_at"],
        })

for pr_num in connected_pr_nums:
    pr = pr_map[pr_num]
    nodes.append({
        "id":        f"pr-{pr_num}",
        "type":      "pr",
        "state":     "merged",
        "title":     pr["title"],
        "url":       pr["html_url"],
        "number":    pr_num,
        "merged_at": pr.get("merged_at"),
        "labels":    [l["name"] for l in pr.get("labels", [])],
    })

for pr_num in open_pr_nums:
    pr_data = next((p for p in open_prs if p["number"] == pr_num), None)
    if not pr_data:
        continue
    nodes.append({
        "id":     f"pr-{pr_num}",
        "type":   "pr",
        "state":  "open",
        "title":  pr_data["title"],
        "url":    pr_data["html_url"],
        "number": pr_num,
        "labels": [l["name"] for l in pr_data.get("labels", [])],
    })

all_issue_nums = connected_issue_nums | open_issue_nums
for issue_num in all_issue_nums:
    issue = issue_map[issue_num]
    nodes.append({
        "id":     f"issue-{issue_num}",
        "type":   "issue",
        "state":  issue.get("state", "open"),
        "title":  issue["title"],
        "url":    issue["html_url"],
        "number": issue_num,
        "labels": [l["name"] for l in issue.get("labels", [])],
    })


edges = []

for pr_num in connected_pr_nums:
    for issue_num in pr_closes[pr_num]:
        edges.append({"from": f"pr-{pr_num}", "to": f"issue-{issue_num}",
                      "label": "resuelve", "state": "merged"})

for pr_num in connected_pr_nums:
    release_id = assign_release_id(pr_map[pr_num].get("merged_at"))
    if release_id:
        edges.append({"from": release_id, "to": f"pr-{pr_num}",
                      "label": "incluye", "state": "merged"})

for pr_num in open_pr_nums:
    for issue_num in open_pr_closes[pr_num]:
        edges.append({"from": f"pr-{pr_num}", "to": f"issue-{issue_num}",
                      "label": "resuelve", "state": "open"})

for pr_num in open_pr_nums:
    edges.append({"from": latest_release_id, "to": f"pr-{pr_num}",
                  "label": "pendiente", "state": "open"})

release_to_prs = {}
pr_to_issues   = {}

for e in edges:
    if e["label"] in ("incluye", "pendiente"):
        release_to_prs.setdefault(e["from"], []).append(e["to"])
    elif e["label"] == "resuelve":
        pr_to_issues.setdefault(e["from"], []).append(e["to"])

release_nodes_sorted = sorted(
    [n for n in nodes if n["type"] == "release"],
    key=lambda n: n.get("date", "")
)

PANEL_W   = 2200
PR_COLS   = 4
PR_COL_W  = 380
PR_ROW_H  = 480
PR_Y0     = 400
ISSUE_DY  = 280

positions = {}

for ri, rel in enumerate(release_nodes_sorted):
    cx = ri * PANEL_W
    positions[rel["id"]] = (cx, 0)

    pr_ids = release_to_prs.get(rel["id"], [])
    for pi, pr_id in enumerate(pr_ids):
        col = pi % PR_COLS
        row = pi // PR_COLS
        pr_x = cx + (col - (PR_COLS - 1) / 2) * PR_COL_W
        pr_y = PR_Y0 + row * PR_ROW_H
        positions[pr_id] = (pr_x, pr_y)

        issue_ids = pr_to_issues.get(pr_id, [])
        for ii, issue_id in enumerate(issue_ids):
            offset_x = (ii - (len(issue_ids) - 1) / 2) * 160
            positions[issue_id] = (pr_x + offset_x, pr_y + ISSUE_DY)


node_map = {n["id"]: n for n in nodes}
for nid, (x, y) in positions.items():
    if nid in node_map:
        node_map[nid]["x"] = round(x)
        node_map[nid]["y"] = round(y)


graph = {"nodes": nodes, "edges": edges}
with open("graph.json", "w") as f:
    json.dump(graph, f, indent=2)

print(f"Grafo generado: {len(nodes)} nodos, {len(edges)} conexiones")
print(f"  Mergeados: {len(connected_pr_nums)} PRs, {len(connected_issue_nums)} issues")
print(f"  Pendientes: {len(open_pr_nums)} PRs, {len(open_issue_nums)} issues")
