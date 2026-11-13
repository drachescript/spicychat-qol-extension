// Local, review-first reusable memory packs. No native writes happen here.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  const STORE = "dsMemoryPacksV1";
  const MAX_PACKS = 80;
  const MAX_MEMORIES = 1000;
  const LIMIT = 250;
  let busy = false;
  const newId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const clean = (value, cap = 500) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, cap);
  const make = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text !== undefined) el.textContent = text;
    return el;
  };
  function button(text, fn) {
    const el = make("button", "", text);
    el.type = "button";
    el.addEventListener("click", fn);
    return el;
  }
  function input(value = "", placeholder = "", max = 200) {
    const el = make("input");
    el.type = "text";
    el.value = value;
    el.placeholder = placeholder;
    el.maxLength = max;
    return el;
  }
  function field(title, element) {
    const label = make("label", "ds-pack-field");
    label.append(make("span", "", title), element);
    return label;
  }
  function normalizeEntry(row, index) {
    if (typeof row === "string") row = { content: row };
    if (!row || typeof row !== "object") throw Error(`Memory ${index + 1} is invalid.`);
    const content = clean(row.content ?? row.text ?? row.memory, 20000);
    if (!content) throw Error(`Memory ${index + 1} has no content.`);
    if ([...content].length > LIMIT) throw Error(`Memory ${index + 1} is over ${LIMIT} characters (${[...content].length}). Split or shorten it first.`);
    return {
      id: clean(row.id, 100) || `memory-${index + 1}`,
      content,
      entities: (Array.isArray(row.entities) ? row.entities : String(row.entities || "").split(",")).map(x => clean(x, 70)).filter(Boolean).slice(0, 12),
      category: clean(row.category, 60),
      group_id: clean(row.group_id ?? row.groupId, 80),
      version: Math.max(1, Math.min(9999, Math.floor(Number(row.version) || 1))),
      priority: row.priority === "manual" ? "manual" : "normal",
      pinned: row.pinned === true
    };
  }
  function normalizePack(raw) {
    const source = raw?.pack && typeof raw.pack === "object" ? raw.pack : raw;
    if (!source || typeof source !== "object") throw Error("Not a memory pack JSON.");
    const rows = source.memories ?? source.entries;
    if (!Array.isArray(rows) || !rows.length) throw Error("This pack has no memories.");
    if (rows.length > MAX_MEMORIES) throw Error(`A pack cannot exceed ${MAX_MEMORIES} memories.`);
    const memories = rows.map(normalizeEntry);
    const ids = new Set();
    for (const entry of memories) {
      if (ids.has(entry.id)) throw Error(`Duplicate memory ID: ${entry.id}. Change it before importing.`);
      ids.add(entry.id);
    }
    return {
      id: clean(source.id, 100) || newId(),
      name: clean(source.name ?? source.pack, 100) || "Untitled pack",
      version: Math.max(1, Math.min(9999, Math.floor(Number(source.version) || 1))),
      updatedAt: new Date().toISOString(),
      memories
    };
  }
  const load = async () => {
    const obj = await chrome.storage.local.get(STORE);
    return Array.isArray(obj?.[STORE]) ? obj[STORE] : [];
  };
  const persist = async (packs) => {
    if (packs.length > MAX_PACKS) throw Error(`Maximum ${MAX_PACKS} packs. Export or remove one first.`);
    await chrome.storage.local.set({ [STORE]: packs });
  };
  const fileName = (value) => clean(value, 70).replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "memories";
  async function downloadPack(pack) {
    const payload = {
      format: "spicychat-qol-memory-pack", format_version: 1,
      pack: pack.name, id: pack.id, name: pack.name, version: pack.version,
      memories: pack.memories.map(x => ({ ...x }))
    };
    if (typeof DS.downloadTextFile !== "function") throw Error("The QoL file exporter is unavailable.");
    const result = await DS.downloadTextFile(JSON.stringify(payload, null, 2),
      `${fileName(pack.name)}-memory-pack.json`, "application/json;charset=utf-8", { requestPermission: true });
    if (!result?.ok) throw Error(result?.error || "The pack export could not be verified.");
  }
  function textSplitter(raw) {
    const paragraphs = String(raw || "").replace(/\r/g, "").split(/\n\s*\n|\n/).map(x => x.trim()).filter(Boolean);
    const pieces = [];
    for (const para of paragraphs) {
      // Prefer sentence boundaries; never discard original content.
      const segments = para.match(/[^.!?]+[.!?]*(?:\s+|$)/g) || [para];
      let current = "";
      const push = () => { if (current) { pieces.push(current); current = ""; } };
      for (let segment of segments) {
        segment = segment.trim();
        while ([...segment].length > LIMIT) {
          push();
          const chars = [...segment];
          const part = chars.slice(0, LIMIT).join("");
          const breakAt = part.lastIndexOf(" ");
          const at = breakAt > 70 ? breakAt : LIMIT;
          pieces.push(chars.slice(0, at).join("").trim());
          segment = chars.slice(at).join("").trim();
        }
        if (!segment) continue;
        if ([...(current ? `${current} ${segment}` : segment)].length > LIMIT) push();
        current = current ? `${current} ${segment}` : segment;
      }
      push();
    }
    return pieces;
  }
  function open() {
    if (!DS.state?.settings?.enabled || !DS.state?.settings?.enableBulkMemoryManager) return;
    document.getElementById("ds-memory-pack-screen")?.remove();
    const shade = make("div", "ds-memory-pack-screen");
    shade.id = "ds-memory-pack-screen";
    shade.dataset.dsOwned = "1";
    const panel = make("section", "ds-memory-pack-panel");
    const header = make("div", "ds-memory-pack-head");
    const title = make("strong", "", "Memory packs");
    const close = button("Close", () => shade.remove());
    header.append(title, close);
    const intro = make("p", "ds-memory-pack-hint", "Packs are saved locally in QoL and can be reused in other chats. Categories, character tags, and groups stay in the pack; SpicyChat only receives the memory text you choose to import. Imported facts are manually added memories, which SpicyChat keeps rather than automatically replacing. Pin important facts when you need them included in context immediately; the native memory system controls when unpinned facts are recalled.");
    const controls = make("div", "ds-memory-pack-actions");
    const message = make("p", "ds-memory-pack-status");
    message.setAttribute("aria-live", "polite");
    const content = make("div", "ds-memory-pack-content");
    panel.append(header, intro, controls, message, content);
    shade.append(panel);
    document.body.appendChild(shade);
    const say = (s, error = false) => { message.textContent = s; message.dataset.error = error ? "1" : "0"; };
    async function persistPack(pack, isNew = false) {
      const packs = await load();
      const at = packs.findIndex(x => x.id === pack.id);
      if (at >= 0 && isNew) throw Error("That pack ID already exists. Edit or remove the existing pack instead.");
      if (at >= 0) {
        if ((packs[at].version || 1) > pack.version) throw Error("A newer version of this pack is already saved. Export it before replacing.");
        packs[at] = pack;
      } else packs.push(pack);
      await persist(packs);
    }
    const refresh = async () => {
      controls.replaceChildren();
      controls.append(
        button("New pack", () => edit({ id: newId(), name: "New pack", version: 1, updatedAt: new Date().toISOString(), memories: [] }, true)),
        button("From selected memories", async () => {
          const rows = DS.getMemoryPackSourceRows?.() || [];
          if (!rows.length) return say("Select memories in SpicyChat's Memory Manager first.", true);
          edit({ id: newId(), name: "Saved memories", version: 1, updatedAt: new Date().toISOString(), memories: rows.map((m, i) => normalizeEntry({ content: m.text, pinned: m.pinned, id: `memory-${i + 1}` }, i)) }, true);
        }),
        button("Import pack JSON", pickFile),
      );
      content.replaceChildren();
      const packs = await load();
      if (!packs.length) content.append(make("p", "ds-memory-pack-hint", "No packs saved yet. Create one from selected memories or import a pack JSON."));
      for (const pack of packs) {
        const line = make("div", "ds-memory-pack-card");
        const meta = make("span", "", `${pack.name} · ${pack.memories.length} memories · v${pack.version}`);
        const actions = make("div", "ds-memory-pack-actions");
        actions.append(
          button("Review / edit", () => edit(pack, false)),
          button("Use in this chat", () => {
            if (!DS.hasNativeMemoryManagerForPacks?.()) return say("Open SpicyChat's Memory Manager to use a pack.", true);
            const rows = pack.memories.map((e, index) => ({ text: e.content, order: index, pinned: e.pinned }));
            shade.remove();
            DS.openMemoryPackImportPreview?.(rows, pack.name);
          }),
          button("Export", async () => { try { await downloadPack(pack); say(`Export saved: ${pack.name}`); } catch (error) { say(error.message, true); } }),
          button("Delete", async () => {
            if (!confirm(`Delete the local memory pack “${pack.name}”? This does not delete native memories.`)) return;
            await persist((await load()).filter(x => x.id !== pack.id));
            refresh().catch(error => say(error.message, true));
          })
        );
        line.append(meta, actions); content.append(line);
      }
    };
    function pickFile() {
      const picker = make("input");
      picker.type = "file"; picker.accept = ".json,application/json"; picker.hidden = true;
      picker.addEventListener("change", async () => {
        picker.remove();
        if (!picker.files?.[0]) return;
        try {
          const raw = JSON.parse(await picker.files[0].text());
          // Preserve metadata and permit either one pack or an array of packs.
          if (Array.isArray(raw?.packs)) {
            if (!raw.packs.length) throw Error("No packs in this file.");
            const incoming = raw.packs.map(normalizePack);
            const current = await load();
            const ids = new Set(current.map(p => p.id));
            for (const pack of incoming) {
              if (ids.has(pack.id)) throw Error(`Pack already saved: ${pack.name}. No packs imported.`);
              ids.add(pack.id);
            }
            await persist([...current, ...incoming]);
            await refresh();
            say(`Saved ${incoming.length} packs locally.`);
          } else edit(normalizePack(raw), true);
        } catch (error) { say(`Import failed: ${error.message}`, true); }
      }, { once: true });
      document.body.append(picker); picker.click();
    }
    function edit(pack, newPack) {
      content.replaceChildren(); controls.replaceChildren();
      const name = input(pack.name, "Pack name", 100);
      const version = make("input"); version.type = "number"; version.min = "1"; version.max = "9999"; version.value = pack.version;
      const meta = make("div", "ds-memory-pack-fields");
      meta.append(field("Pack name", name), field("Version", version));
      const lines = make("div", "ds-memory-pack-entries");
      const editable = pack.memories.map(x => ({ ...x }));
      function renderLines() {
        lines.replaceChildren();
        editable.forEach((item, index) => {
          const card = make("div", "ds-memory-pack-entry");
          const top = make("div", "ds-memory-pack-entry-top");
          const number = make("strong", "", `Memory ${index + 1}`);
          const count = make("span", "ds-memory-pack-count");
          const remove = button("Remove", () => { editable.splice(index, 1); renderLines(); });
          top.append(number, count, remove);
          const body = make("textarea"); body.rows = 3; body.value = item.content;
          const update = () => { item.content = body.value; const size = [...body.value.trim()].length; count.textContent = `${size}/${LIMIT}`; count.dataset.error = size > LIMIT || !size ? "1" : "0"; };
          body.addEventListener("input", update); update();
          const category = input(item.category, "Category (e.g. Appearance)", 60);
          const entities = input(item.entities.join(", "), "Character tags (comma-separated)", 240);
          const group = input(item.group_id, "Group ID (e.g. captain-ship)", 80);
          const id = input(item.id, "Memory ID", 100);
          const priority = make("select");
          for (const value of ["normal", "manual"]) { const opt = make("option", "", value === "manual" ? "Curated / manual" : "Normal"); opt.value = value; priority.append(opt); }
          priority.value = item.priority;
          const pinned = make("input"); pinned.type = "checkbox"; pinned.checked = item.pinned;
          const fields = make("div", "ds-memory-pack-fields");
          fields.append(field("Category", category), field("Characters / entities", entities), field("Group ID", group), field("Memory ID", id), field("Priority", priority), field("Pin on import", pinned));
          const sync = () => { item.category = category.value; item.entities = entities.value.split(",").map(v => v.trim()).filter(Boolean); item.group_id = group.value; item.id = id.value; item.priority = priority.value; item.pinned = pinned.checked; };
          for (const el of [category, entities, group, id, priority]) el.addEventListener("input", sync);
          pinned.addEventListener("change", sync);
          card.append(top, body, fields);
          lines.append(card);
        });
      }
      renderLines();
      const actions = make("div", "ds-memory-pack-actions");
      const add = button("Add memory", () => { if (editable.length >= MAX_MEMORIES) return say("Pack is full.", true); editable.push({id:`memory-${editable.length+1}`, content:"", entities:[], category:"", group_id:"", version:1, priority:"normal", pinned:false}); renderLines(); });
      const paste = button("Split text into memories", () => {
        const inputText = make("textarea"); inputText.placeholder = "Paste paragraphs or long character notes here; review the suggested 250-character pieces before saving."; inputText.rows = 5;
        const popup = make("div", "ds-memory-pack-split");
        popup.append(inputText, button("Add split pieces", () => {
          const pieces = textSplitter(inputText.value);
          if (!pieces.length) return say("Paste some text first.", true);
          if (editable.length + pieces.length > MAX_MEMORIES) return say(`Only ${MAX_MEMORIES} memories per pack.`, true);
          for (const piece of pieces) editable.push({id:`memory-${editable.length+1}`, content:piece, entities:[], category:"", group_id:"", version:1, priority:"normal", pinned:false});
          popup.remove(); renderLines(); say(`Added ${pieces.length} pieces for review. Nothing sent to SpicyChat.`);
        }), button("Cancel", () => popup.remove()));
        actions.after(popup);
      });
      const save = button("Save pack locally", async () => {
        if (busy) return; busy = true;
        try {
          const next = normalizePack({ ...pack, name:name.value, version:Number(version.value), memories: editable });
          if (!next.memories.length) throw Error("Add at least one memory before saving.");
          await persistPack(next, newPack);
          say(`Saved “${next.name}” locally (${next.memories.length} memories).`);
          await refresh();
        } catch (error) { say(error.message, true); } finally { busy = false; }
      });
      actions.append(add, paste, save, button("Back", () => refresh().catch(error => say(error.message, true))));
      content.append(meta, actions, lines);
    }
    refresh().catch(error => say(error.message, true));
  }
  DS.openMemoryPacksPanel = open;
  // Pure helpers exposed for extension regression tests; no network or writes.
  DS.memoryPackTools = Object.freeze({ normalizePack, textSplitter });
})();
}
