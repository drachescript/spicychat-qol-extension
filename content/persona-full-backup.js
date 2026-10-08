(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  const BUTTON_ID = "ds-full-persona-backup";
  let active = false;

  function listPage() { return /^\/personas\/?$/.test(location.pathname); }
  function clean(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
  function entries() {
    const seen = new Set();
    const result = [];
    for (const link of document.querySelectorAll("a[aria-label='edit-persona'][href*='/personas/edit/']")) {
      const id = String(link.href || "").match(/\/personas\/edit\/([^/?#]+)/i)?.[1] || "";
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const card = link.closest("div[tabindex='-1'][class*='rounded-large'],div[tabindex='-1'],div[class*='rounded-large']");
      const saved = (DS.state?.savedPersonas || []).find(item => String(item?.id || "") === id) || {};
      const name = clean(card?.querySelector("span.font-bold")?.textContent || card?.querySelector("img[alt]")?.alt || saved.name || id);
      const text = String(card?.querySelector("span.line-clamp-3,span[class*='line-clamp-3']")?.textContent || saved.highlights || saved.description || "").trim();
      const image = String(card?.querySelector("img[src]")?.src || saved.avatar || "");
      const defaultBadge = [...(card?.querySelectorAll("span,button") || [])].some(el => /^default$/i.test(clean(el.textContent)));
      result.push({ id, name, description: text, highlights: text, avatar: image, avatarDataUrl: saved.avatarDataUrl || "", isDefault: defaultBadge });
    }
    return result;
  }

  // ZIP (stored, no compression) so the backup is self-contained and readable
  // without relying on Creator tools or third-party JS bundles.
  let crcTable;
  function crc32(bytes) {
    if (!crcTable) {
      crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        return c >>> 0;
      });
    }
    let crc = 0xffffffff;
    for (const b of bytes) crc = crcTable[(crc ^ b) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  function zipBlob(files) {
    const local = [], central = [];
    let offset = 0;
    const encoder = new TextEncoder();
    const d = new Date();
    const date = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    for (const file of files) {
      const name = encoder.encode(file.name);
      const bytes = encoder.encode(file.content);
      const crc = crc32(bytes);
      const header = new Uint8Array(30 + name.length);
      const h = new DataView(header.buffer);
      h.setUint32(0, 0x04034b50, true);
      h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true);
      h.setUint16(10, time, true); h.setUint16(12, date, true);
      h.setUint32(14, crc, true); h.setUint32(18, bytes.length, true); h.setUint32(22, bytes.length, true);
      h.setUint16(26, name.length, true); header.set(name, 30);
      local.push(header, bytes);
      const cd = new Uint8Array(46 + name.length);
      const c = new DataView(cd.buffer);
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true);
      c.setUint16(8, 0x0800, true); c.setUint16(12, time, true); c.setUint16(14, date, true);
      c.setUint32(16, crc, true); c.setUint32(20, bytes.length, true); c.setUint32(24, bytes.length, true);
      c.setUint16(28, name.length, true); c.setUint32(42, offset, true); cd.set(name, 46);
      central.push(cd); offset += header.length + bytes.length;
    }
    const end = new Uint8Array(22);
    const e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, central.reduce((sum, b) => sum + b.length, 0), true);
    e.setUint32(16, offset, true);
    return new Blob([...local, ...central, end], { type: "application/zip" });
  }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = name; anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function start(button) {
    if (active) return;
    const source = entries();
    if (!source.length) { DS.setQuickStatus?.("No Personas found on this page yet."); return; }
    if (typeof DS.readCurrentPersonaForBackup !== "function") {
      DS.setQuickStatus?.("Persona backup reader is unavailable."); return;
    }
    active = true;
    button.disabled = true;
    const files = [];
    const manifest = {
      format: "spicychat-qol-full-personas", version: 1,
      exportedAt: new Date().toISOString(), expected: source.length,
      complete: 0, partial: 0, failed: 0, personas: []
    };
    try {
      for (let index = 0; index < source.length; index++) {
        const item = source[index];
        button.textContent = `Backup ${index + 1}/${source.length}...`;
        try {
          const live = await DS.readCurrentPersonaForBackup(item);
          const avatarDataUrl = String(live.avatarDataUrl || "");
          const avatarUrl = String(live.avatar || "");
          const imageComplete = !avatarUrl || avatarDataUrl.startsWith("data:image/");
          const record = {
            id: item.id, name: live.name, highlights: String(live.highlights ?? live.description ?? ""),
            description: String(live.highlights ?? live.description ?? ""),
            isDefaultOnList: item.isDefault,
            avatar: avatarUrl, avatarDataUrl,
            source: "current-persona-editor", exportedAt: manifest.exportedAt,
            completeness: { editor: true, avatar: imageComplete }
          };
          files.push({ name: `personas/${item.id}.json`, content: JSON.stringify(record, null, 2) + "\n" });
          const status = imageComplete ? "complete" : "partial-avatar";
          manifest.personas.push({ id: item.id, name: live.name, status });
          if (imageComplete) manifest.complete++; else manifest.partial++;
        } catch (error) {
          manifest.failed++;
          manifest.personas.push({ id: item.id, name: item.name, status: "failed", reason: String(error?.message || error).slice(0, 180) });
        }
      }
      if (!files.length) {
        DS.setQuickStatus?.(`Persona backup failed: no current Persona editors could be read (${manifest.failed} failed).`);
        return;
      }
      files.unshift({ name: "manifest.json", content: JSON.stringify(manifest, null, 2) + "\n" });
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      download(zipBlob(files), `spicychat-personas-${stamp}.zip`);
      const msg = `Persona backup: ${manifest.complete} complete, ${manifest.partial} missing avatar data, ${manifest.failed} failed. See manifest.json.`;
      DS.setQuickStatus?.(msg);
      button.title = msg;
    } finally {
      active = false;
      button.disabled = false;
      button.textContent = "Backup all Personas";
    }
  }

  DS.applyPersonaFullBackup = function applyPersonaFullBackup() {
    const allowed = DS.state?.settings?.enabled && DS.state?.settings?.personaFullBackupEnabled && listPage();
    const existing = document.getElementById(BUTTON_ID);
    if (!allowed) { existing?.remove(); return; }
    if (existing) return;
    const create = document.querySelector("a[href$='/personas/create']");
    const host = create?.parentElement || document.querySelector("input[placeholder='Search...']")?.closest("div.flex");
    if (!host) return;
    const button = document.createElement("button");
    button.id = BUTTON_ID; button.type = "button"; button.dataset.dsOwned = "1";
    button.textContent = "Backup all Personas";
    button.className = "ds-persona-backup-button";
    button.style.cssText = "padding:8px 12px;border:1px solid #64748b;border-radius:10px;font-weight:600;font-size:12px;cursor:pointer;";
    button.addEventListener("click", () => start(button));
    host.insertBefore(button, create || null);
  };
})();
