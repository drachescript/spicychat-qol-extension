// Passive snapshot only: reads SpicyChat's currently visible Rulebook HUD.
// Never infer a missing/unlisted Rulebook from an absent HUD or export
// creator-only influence instructions.
if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";
  const tidy = value => String(value || "").replace(/\s+/g, " ").trim();
  function snapshot() {
    const panel = document.querySelector('[data-testid="RulebookMeterPanel"]');
    if (!panel) return null;
    const meters = [...panel.querySelectorAll('[data-testid^="RulebookMeterPanel-Meter-"]')].map(node => {
      const id = String(node.getAttribute("data-testid") || "").replace("RulebookMeterPanel-Meter-", "");
      const labelValue = tidy(node.getAttribute("aria-label"));
      const valueText = tidy(node.querySelector(`[data-testid="RulebookMeterPanel-Value-${CSS.escape(id)}"]`)?.textContent);
      const numericValue = Number(valueText);
      const meter = { id, label: tidy(labelValue.replace(/:\s*[-+]?\d+(?:\.\d+)?\s*$/, "")) };
      if (valueText && Number.isFinite(numericValue)) meter.value = numericValue;
      return meter;
    }).filter(meter => meter.id && meter.label);
    const foot = tidy(document.querySelector('[data-testid="RulebookExplanationSheet-RulebookLine"]')?.textContent);
    const name = foot.match(/Rulebook:\s*(.+?)\s+v\d+\s+by\s+@/i)?.[1] || null;
    const id = tidy(panel.getAttribute("data-rulebook-id") || panel.closest("[data-rulebook-id]")?.getAttribute("data-rulebook-id"));
    const status = tidy(document.querySelector('[data-testid="RulebookStatusLine"], [data-testid="RulebookHud-StatusLine"], [data-rulebook-status-line]')?.textContent);
    return { source: "visible-rulebook-hud-at-export", capturedAt: new Date().toISOString(),
      ...(name ? { name } : {}), ...(id ? { id } : {}), ...(status ? { status } : {}), meters };
  }
  window.DragonScriptQoL ||= {};
  window.DragonScriptQoL.snapshotVisibleRulebook = snapshot;
})();
}
