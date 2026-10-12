// Settings page module. Loaded before options.js.
function applyOptionsPerformancePreferences(settings = {}) {
  const reduce = !!settings.reduceOptionsAnimations;
  if (document.documentElement.classList.contains("ds-options-reduced-motion") !== reduce) {
    document.documentElement.classList.toggle("ds-options-reduced-motion", reduce);
  }
  let style = document.getElementById("ds-options-performance-style");
  if (reduce && !style) {
    style = document.createElement("style");
    style.id = "ds-options-performance-style";
    style.textContent = `.ds-options-reduced-motion *, .ds-options-reduced-motion *::before, .ds-options-reduced-motion *::after { animation-duration: 0.001ms !important; animation-iteration-count: 1 !important; transition-duration: 0.001ms !important; scroll-behavior: auto !important; }`;
    document.head.appendChild(style);
  } else if (!reduce) {
    style?.remove();
  }
}

const SETTINGS_READING_FONTS = {
  native: "",
  arial: "Arial, Helvetica, sans-serif",
  verdana: "Verdana, Geneva, sans-serif",
  trebuchet: "'Trebuchet MS', Arial, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  monospace: "Consolas, 'Courier New', monospace",
  dyslexia: "OpenDyslexic, Verdana, Arial, sans-serif"
};
const SETTINGS_READING_LINE_SPACING = ["native", "comfortable", "spacious"];
const SETTINGS_READING_LETTER_SPACING = ["native", "slight", "wide"];
const SETTINGS_READING_SIZES = [100, 110, 125, 150];
function settingsReadingValuesFromControls() {
  return {
    qolInterfaceScale: Number(value("qolInterfaceScale", "100")) || 100,
    settingsReadingFont: value("settingsReadingFont", "native"),
    settingsReadingSize: Number(value("settingsReadingSize", "100")) || 100,
    settingsReadingLineSpacing: value("settingsReadingLineSpacing", "native"),
    settingsReadingLetterSpacing: value("settingsReadingLetterSpacing", "native"),
    settingsReadingContrast: checked("settingsReadingContrast"),
    settingsReadingLargerControls: checked("settingsReadingLargerControls")
  };
}
function applyOptionsAccessibilityPreview(settings = {}) {
  const baseScale = SETTINGS_READING_SIZES.includes(Number(settings.qolInterfaceScale))
    ? Number(settings.qolInterfaceScale) : 100;
  const settingsScale = SETTINGS_READING_SIZES.includes(Number(settings.settingsReadingSize))
    ? Number(settings.settingsReadingSize) : 100;
  // The original QoL interface-size setting still works. The new multiplier
  // only applies here in Settings; no SpicyChat page gets this setting.
  const scale = (baseScale * settingsScale) / 10000;
  document.documentElement.style.zoom = scale === 1 ? "" : String(scale);
  const font = SETTINGS_READING_FONTS[settings.settingsReadingFont] || "";
  const root = document.documentElement;
  root.classList.toggle("ds-options-reading-font", !!font);
  if (font) root.style.setProperty("--ds-options-reading-font", font);
  else root.style.removeProperty("--ds-options-reading-font");
  for (const [className, enabled] of [
    ["ds-options-reading-contrast", !!settings.settingsReadingContrast],
    ["ds-options-reading-large-controls", !!settings.settingsReadingLargerControls],
    ["ds-options-reading-line-comfortable", settings.settingsReadingLineSpacing === "comfortable"],
    ["ds-options-reading-line-spacious", settings.settingsReadingLineSpacing === "spacious"],
    ["ds-options-reading-letter-slight", settings.settingsReadingLetterSpacing === "slight"],
    ["ds-options-reading-letter-wide", settings.settingsReadingLetterSpacing === "wide"]
  ]) root.classList.toggle(className, enabled);
}

