#!/usr/bin/env python3
"""Export v0.2.52 Custom Lite feature contracts into a browser-ready catalog.

The exporter reads Full QoL's physical feature ownership declarations on the
Custom branch, preserving its new dependency and helper metadata. It does NOT
change Full QoL's main branch or certify untested browser combinations.
"""
from __future__ import annotations
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "build/feature-catalog.json"

BLOCKING = {"bot-blocking", "auto-blocking", "bulk-blocking"}
FILTERING = {"language-filter", "local-tag-matching", "smart-filter-presets",
             "rulebook-filter", "lorebook-filter", "lorebook-search-filter",
             "tags-nsfw", "tag-aliases"}
ORGANIZING = {"bot-organizer", "chat-organizer", "chat-tags", "chat-index",
              "favorite-bots", "later-bots", "saved-lists-overlay", "saved-chat-actions",
              "opened-chats", "persona-organizer", "persona-full-backup"}
DISCOVERY = {"cards", "card-workflow", "recommendation-helpers", "list-fill",
             "pagination-tools", "card-token-info", "creator-favorites", "creator-following"}
PICTURES = {"chat-backgrounds", "character-pictures", "persona-pictures",
            "picture-library", "auto-images"}
LABELS = {
    "bot-blocking":"Bot Blocking & Quick Block",
    "auto-blocking":"Auto Blocking by Words & Tags",
    "bulk-blocking":"Bulk Blocking",
    "language-filter":"Language Filter",
    "local-tag-matching":"Tag Matching",
    "smart-filter-presets":"Saved Filter Presets",
    "rulebook-filter":"Rulebook Filters",
    "lorebook-filter":"Lorebook Filters",
    "lorebook-search-filter":"Lorebook Search",
    "ooc":"OOC Presets & Composer Button",
    "bot-status":"Bot Status Center",
    "chat-index":"Chat Index",
    "opened-chats":"Opened Chat Tracking",
    "chat-search":"Chat Search",
    "chat-organizer":"Chat Folders & Organization",
    "later-bots":"Later Bot List",
    "favorite-bots":"Favorite Bot Tools",
    "auto-images":"Automatic Images",
    "auto-voice":"Automatic Voice",
    "chat-backgrounds":"Chat Backgrounds",
    "character-pictures":"Character Pictures",
    "persona-pictures":"Persona Pictures",
    "picture-library":"Picture Library"
}
DESCRIPTIONS = {
    "bot-blocking":"Block bots from listings or cards using individual block controls.",
    "auto-blocking":"Automatically block bots matching saved words or tags.",
    "bulk-blocking":"Apply blocking actions to multiple bots at once.",
    "language-filter":"Filter bot listings by language.",
    "local-tag-matching":"Match listing tags using your local rules.",
    "smart-filter-presets":"Save and reuse filtering choices.",
    "ooc":"Manage OOC presets and insert them from the chat composer.",
    "bot-status":"Check and manage the status of saved bots.",
    "chat-index":"Organize and search your imported conversation index.",
    "opened-chats":"Remember which chats or bots u already opened.",
    "chat-search":"Search messages inside a conversation.",
    "chat-organizer":"Organize your chats.",
    "auto-images":"Optional image controls in chat, separately from voice.",
    "auto-voice":"Automatic voice playback tools, separately from images.",
    "chat-backgrounds":"Choose custom backgrounds for chats.",
    "character-pictures":"Manage custom pictures for characters.",
    "persona-pictures":"Manage custom pictures for personas.",
    "picture-library":"Manage your stored picture library.",
}
SPECIAL_GROUPS = {
    "chat-backgrounds":"chat", "character-pictures":"chat",
    "persona-pictures":"chat", "picture-library":"chat",
    "auto-images":"chat", "auto-voice":"chat",
    "auto-afk":"core", "tag-aliases":"core",
    "auto-blocking":"listings", "chat-scene-notes":"chat",
    "my-creations-auto-load":"creator",
    "lorebook-connections":"lorebook", "story-reading-layout":"chat",
    "rulebook-diagnostics":"chat",
}
SECTIONS = {
    "chat":"Chat Tools", "chatList":"Chat List",
    "listings":"Discovery", "creator":"Creator Tools",
    "lorebook":"Lorebooks", "profiles":"Profiles",
    "personas":"Personas", "interface":"Interface",
    "core":"Core & Compatibility"
}
def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))

def strings(value, field):
    if value is None: value=[]
    if not isinstance(value,list) or any(not isinstance(x,str) or not x for x in value):
        raise ValueError("Invalid "+field)
    return list(dict.fromkeys(value))

def section_for(fid, group):
    if fid in BLOCKING:return "Blocking"
    if fid in FILTERING:return "Filtering"
    if fid in ORGANIZING:return "Organization"
    if fid in DISCOVERY:return "Discovery"
    if fid in PICTURES:return "Pictures"
    return SECTIONS.get(group,"Other Tools")

def export():
    manifest=read_json(ROOT/"manifest.json")
    modules=read_json(ROOT/"build/modules.json")
    contracts={}
    for path in sorted((ROOT/"build/features").glob("*.json")):
        item=read_json(path)
        fid=item.get("id")
        if (fid!=path.stem or not isinstance(fid,str) or
            not re.fullmatch(r"[a-z][a-z0-9-]*",fid) or fid in contracts):
            raise ValueError("Invalid feature contract: "+str(path))
        contracts[fid]=item
    if not contracts:raise ValueError("No feature contracts")

    by_path={}
    for group,meta in modules["bundles"].items():
        for asset in meta["files"]:
            by_path.setdefault(asset,group)
    runtime={p for cs in manifest["content_scripts"] for p in cs.get("js",[])}
    css={p for cs in manifest["content_scripts"] for p in cs.get("css",[])}
    owned_primary=set()
    owned_helpers=set()
    owned_css=set()
    features=[]
    for fid,item in sorted(contracts.items()):
        primary=item.get("primary")
        if not primary and item.get("runtimeScripts"):
            primary=item["runtimeScripts"][0]
        kind=item.get("type","content")
        # The 0.2.52 inventory may include non-content declarations; avoid
        # representing them as standalone browser-injected switches.
        if kind!="content" or not isinstance(primary,str) or not primary:
            continue
        if not (ROOT/primary).is_file():
            raise ValueError("Missing primary for "+fid+": "+primary)
        group=SPECIAL_GROUPS.get(fid) or by_path.get(primary)
        if group is None:
            if fid.startswith(("chat-","generation-","message-","rp-","story-")):group="chat"
            elif fid.startswith(("lorebook-","wiki-lorebook")):group="lorebook"
            elif fid.startswith(("persona-","personas")):group="personas"
            elif fid.startswith(("creator-","my-creations","bot-editor","creation-")):group="creator"
            elif fid.startswith(("bot-","auto-blocking","language-","card-")):group="listings"
            else:group="core"
        deps=strings(item.get("dependencies",item.get("requiredFeatures",[])),fid+" dependencies")
        helpers=strings(item.get("requiredHelpers",[]),fid+" requiredHelpers")
        styles=strings(item.get("styleFiles",item.get("cssFiles",[])),fid+" styleFiles")
        settings_files=strings(item.get("settingsFiles",item.get("settingsScripts",[])),fid+" settingsFiles")
        background_files=strings(item.get("backgroundFiles",[]),fid+" backgroundFiles")
        setting_keys=strings(item.get("settingsKeys",item.get("settingKeys",[])),fid+" settingsKeys")
        for path in [primary,*helpers,*styles,*settings_files,*background_files]:
            if not (ROOT/path).is_file():
                raise ValueError("Missing "+fid+" resource: "+path)
        owned_primary.add(primary)
        owned_helpers.update(helpers)
        owned_css.update(styles)
        features.append({
            "id":fid,
            "label":LABELS.get(fid,item.get("label") or fid.replace("-"," ").title()),
            "description":DESCRIPTIONS.get(fid,"Adds the "+(item.get("label") or fid.replace("-"," "))+" tools."),
            "section":section_for(fid,group),"group":group,
            "requiredFeatures":deps,
            "runtimeScripts":strings(item.get("runtimeScripts",[primary]),fid+" runtimeScripts"),
            "requiredHelpers":helpers,
            "cssFiles":styles,
            "settingsScripts":settings_files,
            "backgroundFiles":background_files,
            "backgroundServices":strings(item.get("backgroundServices",[]),fid+" backgroundServices"),
            "settingKeys":setting_keys,
            "customBuildStatus":"validated" if (
                item.get("browserVerified") and item.get("settingsIsolated") and
                item.get("stylesIsolated") and item.get("backgroundIsolated")
            ) else "experimental-unverified",
            "fullRuntimeStatus":"lifecycle-gated",
            "blockers":[] if item.get("browserVerified") else [
                "Independent browser and package behavior has not been verified."
            ],
            "isolation":{
                "settings":bool(item.get("settingsIsolated")),
                "styles":bool(item.get("stylesIsolated")),
                "background":bool(item.get("backgroundIsolated")),
                "browserVerified":bool(item.get("browserVerified"))
            }
        })
    actual_ids={f["id"] for f in features}
    for feature in features:
        missing=set(feature["requiredFeatures"])-actual_ids
        if missing:raise ValueError(feature["id"]+" references missing features: "+",".join(sorted(missing)))
    if len(features)<118:raise ValueError(f"Unexpectedly small v0.2.52 feature inventory: {len(features)}")
    for path in runtime|css:
        if not (ROOT/path).is_file():raise ValueError("Manifest resource missing: "+path)
    # True core is anything with no physical feature owner or helper owner.
    # Required helpers are selected only when their feature is selected.
    shared=sorted(runtime-owned_primary-owned_helpers)
    common_css=sorted(css-owned_css)
    result={
        "schema":"sqol-custom-feature-catalog/v1",
        "version":manifest["version"],"sourceBranch":"qol-custom",
        "status":"experimental-unverified",
        "featureCount":len(features),
        "sections":sorted({f["section"] for f in features}),
        "groups":modules["bundleOrder"],
        "sharedRuntimeScripts":shared,
        "sharedStyles":common_css,
        "allContentScriptPaths":sorted(runtime),
        "features":features,
        "disclaimer":"Individual feature builds remain experimental. Shared Settings and background code are not fully separated."
    }
    OUTPUT.write_text(json.dumps(result,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    print(f"Exported {len(features)} features; {len(shared)} shared JS and {len(common_css)} shared CSS")
    for category,count in sorted(Counter(f["section"] for f in features).items()):
        print(" ",category,count)

if __name__=="__main__":
    export()
