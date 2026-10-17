#!/usr/bin/env python3
"""Export real Custom feature contracts as a browser-friendly selectable catalog.

Run from the repo root:
    python scripts/export_custom_feature_catalog.py

This only reads the Custom source and writes build/feature-catalog.json.
It does NOT alter Full QoL. Package/browser stability is still experimental.
"""
from __future__ import annotations
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "build/feature-catalog.json"

BLOCKING = {"bot-blocking", "bulk-blocking"}
FILTERING = {"language-filter", "local-tag-matching", "smart-filter-presets",
             "rulebook-filter", "lorebook-filter", "lorebook-search-filter",
             "tags-nsfw"}
ORGANIZING = {"bot-organizer", "chat-organizer", "chat-tags", "chat-index",
              "favorite-bots", "later-bots", "saved-lists-overlay", "saved-chat-actions",
              "opened-chats", "persona-organizer", "persona-full-backup"}
DISCOVERY = {"cards", "card-workflow", "recommendation-helpers", "list-fill",
             "pagination-tools", "card-token-info", "creator-favorites", "creator-following"}
LABELS = {
    "bot-blocking": "Bot Blocking & Quick Block",
    "bulk-blocking": "Bulk Blocking",
    "language-filter": "Language Filter",
    "local-tag-matching": "Tag Matching",
    "smart-filter-presets": "Saved Filter Presets",
    "rulebook-filter": "Rulebook Filters",
    "lorebook-filter": "Lorebook Filters",
    "lorebook-search-filter": "Lorebook Search",
    "ooc": "OOC Presets & Composer Button",
    "bot-status": "Bot Status Center",
    "chat-index": "Chat Index",
    "opened-chats": "Opened Chat Tracking",
    "chat-search": "Chat Search",
    "chat-organizer": "Chat Folders & Organization",
    "later-bots": "Later Bot List",
    "favorite-bots": "Favorite Bot Tools",
}
DESCRIPTIONS = {
    "bot-blocking": "Hide bots and use the blocking controls on listings and cards.",
    "bulk-blocking": "Blocking actions for multiple bots.",
    "language-filter": "Filter bot listings by language.",
    "local-tag-matching": "Match listing tags using local filtering rules.",
    "smart-filter-presets": "Save and reuse filtering choices.",
    "ooc": "Manage OOC presets and insert them from the chat composer.",
    "bot-status": "Check and manage your saved bot status records.",
    "chat-index": "Organize and search your imported conversation index.",
    "opened-chats": "Remember which chatbots or chats you already opened.",
    "chat-search": "Find text and messages inside a conversation.",
    "chat-organizer": "Tools to organize your conversations.",
}

def read_json(p):
    return json.loads(p.read_text(encoding="utf-8"))

def section_for(fid, category):
    if fid in BLOCKING: return "Blocking"
    if fid in FILTERING: return "Filtering"
    if fid in ORGANIZING: return "Organization"
    if fid in DISCOVERY: return "Discovery"
    return {
        "chat":"Chat Tools", "chatList":"Chat List", "listings":"Discovery",
        "creator":"Creator Tools", "lorebook":"Lorebooks",
        "profiles":"Profiles", "personas":"Personas",
        "interface":"Interface", "core":"Core & Compatibility"
    }.get(category,"Other Tools")

def unique_strings(value, desc):
    if not isinstance(value,list) or any(not isinstance(x,str) or not x for x in value):
        raise ValueError("Invalid " + desc)
    return list(dict.fromkeys(value))

def export():
    manifest=read_json(ROOT/"manifest.json")
    modules=read_json(ROOT/"build/modules.json")
    contracts={}
    for path in sorted((ROOT/"build/features").glob("*.json")):
        entry=read_json(path)
        fid=entry.get("id")
        if fid!=path.stem or not re.fullmatch(r"[a-z][a-z0-9-]*",fid or "") or fid in contracts:
            raise ValueError("Invalid feature ID "+str(path))
        contracts[fid]=entry
    if not contracts: raise ValueError("No feature contracts")
    ownership={}
    for group,meta in modules["bundles"].items():
        for path in meta["files"]:
            ownership.setdefault(path,set()).add(group)
    features=[]
    all_script_owners=set()
    all_style_owners=set()
    for fid,entry in contracts.items():
        category=entry.get("category","core")
        if category not in modules["bundles"]:
            raise ValueError(fid+" has unknown category "+str(category))
        required=unique_strings(entry.get("requiredFeatures",[]),fid+" dependencies")
        for dep in required:
            if dep not in contracts:raise ValueError(fid+" needs unknown "+dep)
        scripts=unique_strings(entry.get("runtimeScripts",[]),fid+" runtimeScripts")
        styles=unique_strings(entry.get("cssFiles",[]),fid+" cssFiles")
        for path in scripts+styles:
            if not (ROOT/path).is_file():raise ValueError(fid+" missing "+path)
        all_script_owners.update(scripts)
        all_style_owners.update(styles)
        features.append({
            "id":fid,"label":LABELS.get(fid,entry.get("label") or fid.replace("-"," ").title()),
            "description":DESCRIPTIONS.get(fid,"Includes the "+str(entry.get("label") or fid.replace("-"," "))+" tools and their available settings."),
            "section":section_for(fid,category),"group":category,
            "requiredFeatures":required,"runtimeScripts":scripts,
            "cssFiles":styles,
            "settingsScripts":unique_strings(entry.get("settingsScripts",[]),fid+" settingsScripts"),
            "backgroundServices":unique_strings(entry.get("backgroundServices",[]),fid+" backgroundServices"),
            "settingKeys":unique_strings(entry.get("settingKeys",[]),fid+" settingKeys"),
            "customBuildStatus":entry.get("customBuildStatus","blocked"),
            "fullRuntimeStatus":entry.get("fullRuntimeStatus","unverified"),
            "blockers":unique_strings(entry.get("blockers",[]),fid+" blockers"),
        })
    # Common runtime scripts remain until their ownership is explicitly
    # identified; never silently omit a helper because its name is unfamiliar.
    manifest_js={p for block in manifest["content_scripts"] for p in block.get("js",[])}
    shared=sorted(manifest_js-all_script_owners)
    all_script_paths=sorted(manifest_js)
    for path in all_script_paths:
        if not (ROOT/path).is_file():raise ValueError("Manifest JS missing "+path)
    styles={p for block in manifest["content_scripts"] for p in block.get("css",[])}
    common_css=sorted(styles-all_style_owners)
    result={
        "schema":"sqol-custom-feature-catalog/v1",
        "version":manifest["version"],"sourceBranch":"qol-custom",
        "status":"experimental-unverified",
        "featureCount":len(features),
        "sections":sorted(set(f["section"] for f in features)),
        "groups":modules["bundleOrder"],
        "sharedRuntimeScripts":shared,
        "sharedStyles":common_css,
        "allContentScriptPaths":all_script_paths,
        "features":features,
        "disclaimer":"Individual feature builds are experimental. Shared Settings and background code are not fully separated."
    }
    OUTPUT.write_text(json.dumps(result,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    print(f"Exported {len(features)} feature contracts, {len(shared)} shared JS and {len(common_css)} shared CSS to {OUTPUT.relative_to(ROOT)}")
    for sec,count in sorted(Counter(f["section"] for f in features).items()):
        print(" ",sec,count)

if __name__=="__main__":
    export()
