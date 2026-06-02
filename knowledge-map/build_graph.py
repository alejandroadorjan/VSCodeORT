# Copyright (c) Microsoft Corporation. All rights reserved.

import json
import re
import math

releases  = json.load(open("data/releases.json"))
from datetime import datetime
from statistics import mean, median

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
        matches = re.findall(r"(?:closes|fixes|resolves)\s+#(\d+)", pr["body"], re.IGNORECASE)
        for issue_number in matches:
            num = int(issue_number)
            if num in issue_map:
                pr_closes.setdefault(pr["number"], []).append(num)

open_pr_closes = {}
for pr in open_prs:
    if pr.get("body"):
        matches = re.findall(r"(?:closes|fixes|resolves)\s+#(\d+)", pr["body"], re.IGNORECASE)
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
            "id": rid,
            "type": "release",
            "state": "closed",
            "title": r["name"],
            "url": r["html_url"],
            "date": r["published_at"],
        })

for pr_num in connected_pr_nums:
    pr = pr_map[pr_num]
    nodes.append({
        "id": f"pr-{pr_num}",
        "type": "pr",
        "state": "merged",
        "title": pr["title"],
        "url": pr["html_url"],
        "number": pr_num,
        "merged_at": pr.get("merged_at"),
        "labels": [l["name"] for l in pr.get("labels", [])],
        "author": pr.get("user", {}).get("login"),
        "author_avatar": pr.get("user", {}).get("avatar_url"),
    })

for pr_num in open_pr_nums:
    pr_data = next((p for p in open_prs if p["number"] == pr_num), None)
    if pr_data:
        nodes.append({
            "id": f"pr-{pr_num}",
            "type": "pr",
            "state": "open",
            "title": pr_data["title"],
            "url": pr_data["html_url"],
            "number": pr_num,
            "labels": [l["name"] for l in pr_data.get("labels", [])],
            "author": pr_data.get("user", {}).get("login"),
            "author_avatar": pr_data.get("user", {}).get("avatar_url"),
        })

all_issue_nums = connected_issue_nums | open_issue_nums
for issue_num in all_issue_nums:
    issue = issue_map[issue_num]
    nodes.append({
        "id": f"issue-{issue_num}",
        "type": "issue",
        "state": issue.get("state", "open"),
        "title": issue["title"],
        "url": issue["html_url"],
        "number": issue_num,
        "labels": [l["name"] for l in issue.get("labels", [])],
        "author": issue.get("user", {}).get("login"),
        "author_avatar": issue.get("user", {}).get("avatar_url"),
    })

edges = []

for pr_num in connected_pr_nums:
    for issue_num in pr_closes[pr_num]:
        edges.append({
            "from": f"pr-{pr_num}",
            "to": f"issue-{issue_num}",
            "label": "resuelve",
            "state": "merged",
        })

for pr_num in connected_pr_nums:
    release_id = assign_release_id(pr_map[pr_num].get("merged_at"))
    if release_id:
        edges.append({
            "from": release_id,
            "to": f"pr-{pr_num}",
            "label": "incluye",
            "state": "merged",
        })

for pr_num in open_pr_nums:
    for issue_num in open_pr_closes[pr_num]:
        edges.append({
            "from": f"pr-{pr_num}",
            "to": f"issue-{issue_num}",
            "label": "resuelve",
            "state": "open",
        })

for pr_num in open_pr_nums:
    edges.append({
        "from": latest_release_id,
        "to": f"pr-{pr_num}",
        "label": "pendiente",
        "state": "open",
    })

release_to_prs = {}
pr_to_issues   = {}

for e in edges:
    if e["label"] in ("incluye", "pendiente"):
        release_to_prs.setdefault(e["from"], []).append(e["to"])
    elif e["label"] == "resuelve":
        pr_to_issues.setdefault(e["from"], []).append(e["to"])

release_nodes_sorted = sorted([n for n in nodes if n["type"] == "release"], key=lambda n: n.get("date", ""))

PANEL_W, PR_COLS, PR_COL_W, PR_ROW_H, PR_Y0, ISSUE_DY = 2200, 4, 380, 480, 400, 280
positions = {}

for ri, rel in enumerate(release_nodes_sorted):
    cx = ri * PANEL_W
    positions[rel["id"]] = (cx, 0)
    pr_ids = release_to_prs.get(rel["id"], [])
    for pi, pr_id in enumerate(pr_ids):
        col, row = pi % PR_COLS, pi // PR_COLS
        pr_x = cx + (col - (PR_COLS - 1) / 2) * PR_COL_W
        pr_y = PR_Y0 + row * PR_ROW_H
        positions[pr_id] = (pr_x, pr_y)
        for ii, issue_id in enumerate(pr_to_issues.get(pr_id, [])):
            offset_x = (ii - (len(pr_to_issues.get(pr_id, [])) - 1) / 2) * 160
            positions[issue_id] = (pr_x + offset_x, pr_y + ISSUE_DY)

node_map = {n["id"]: n for n in nodes}
for nid, (x, y) in positions.items():
    if nid in node_map:
        node_map[nid]["x"], node_map[nid]["y"] = round(x), round(y)

for n in nodes:
    if n["type"] == "pr":
        n["metrics"] = {"issues_closed": len(pr_to_issues.get(n["id"], []))}
    elif n["type"] == "release":
        n["metrics"] = {"prs_included": len(release_to_prs.get(n["id"], []))}

merge_times = []
for pr_num in connected_pr_nums:
    pr = pr_map[pr_num]
    if pr.get("created_at") and pr.get("merged_at"):
        created = datetime.fromisoformat(pr["created_at"].replace("Z", "+00:00"))
        merged = datetime.fromisoformat(pr["merged_at"].replace("Z", "+00:00"))
        days = (merged - created).days
        merge_times.append(days)

avg_merge_time = round(mean(merge_times)) if merge_times else 0
median_merge_time = round(median(merge_times)) if merge_times else 0
issues_per_release = len(connected_issue_nums) / len(used_release_ids) if used_release_ids else 0
avg_prs_per_release = len(connected_pr_nums) / len(used_release_ids) if used_release_ids else 0

stats = {
    "total_releases": len(used_release_ids),
    "total_prs_merged": len(connected_pr_nums),
    "total_issues_closed": len(connected_issue_nums),
    "total_prs_open": len(open_pr_nums),
    "total_issues_open": len(open_issue_nums),
    "avg_merge_days": avg_merge_time,
    "median_merge_days": median_merge_time,
    "avg_issues_per_release": round(issues_per_release, 1),
    "avg_prs_per_release": round(avg_prs_per_release, 1),
}

graph = {
    "nodes": nodes,
    "edges": edges,
    "stats": stats,
}

with open("graph.json", "w") as f:
    json.dump(graph, f, indent=2)

print(f"Grafo generado: {len(nodes)} nodos, {len(edges)} conexiones")
print(f"  Mergeados: {len(connected_pr_nums)} PRs, {len(connected_issue_nums)} issues")
print(f"  Pendientes: {len(open_pr_nums)} PRs, {len(open_issue_nums)} issues")
print(f"  Stats: {avg_merge_time}d promedio, {avg_prs_per_release:.1f} PRs/release")

