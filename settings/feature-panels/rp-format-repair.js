// Settings panel owned by rp-format-repair. Optional feature code, with no HTML parsing.
(() => {
  'use strict';
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) &&
      !profile.features.includes("rp-format-repair")) return;
  const host = document.getElementById("ds-feature-panel-rp-format-repair");
  if (!host) return;
  const make = (entry) => {
    if (typeof entry === 'string') return document.createTextNode(entry);
    const [tag, attributes, ...children] = entry;
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attributes)) {
      if (value === null || value === undefined) continue;
      node.setAttribute(key, value);
    }
    for (const child of children) node.appendChild(make(child));
    return node;
  };
  host.replaceWith(make(["section",{"class":"card","id":"rpFormatRepairCard"},"\n",["h2",{},"RP Format Repair"],"\n",["p",{"class":"hint"},"Tired of people not using your preferred formatting for their bots? RP Format Repair cleans up messy bot responses and reformats them into the style you prefer."],"\n",["label",{"class":"row"},["input",{"id":"enableRpFormatRepair","type":"checkbox"}],["span",{},"Enable RP Format Repair for AI messages"]],"\n",["label",{"class":"row"},["input",{"id":"rpFormatRepairAuto","type":"checkbox"}],["span",{},"Automatically show repaired formatting when a response appears"]],"\n",["label",{},"Formatting style\n          ",["select",{"id":"rpFormatStyle"},"\n",["option",{"value":"clean"},"Clean RP — actions in *asterisks*, dialogue plain"],"\n",["option",{"value":"quoted"},"Quoted dialogue — actions in *asterisks*, dialogue in quotes"],"\n"],"\n"],"\n",["label",{},"Detection strength\n          ",["select",{"id":"rpFormatDetection"},"\n",["option",{"value":"conservative"},"Conservative — obvious formatting problems only"],"\n",["option",{"value":"balanced"},"Balanced — use formatting plus narration/dialogue clues"],"\n",["option",{"value":"aggressive"},"Aggressive — also guess unformatted narration"],"\n"],"\n"],"\n",["label",{"class":"row"},["input",{"id":"rpFormatConvertBoldActions","type":"checkbox"}],["span",{},"Treat bold narration like ",["code",{},"**action**"]," as an action"]],"\n",["label",{"class":"row"},["input",{"id":"rpFormatRemoveActionParens","type":"checkbox"}],["span",{},"Remove unnecessary parentheses around action blocks"]],"\n",["label",{"class":"row"},["input",{"id":"rpFormatPreserveInlineEmphasis","type":"checkbox"}],["span",{},"Preserve inline emphasis inside dialogue"]],"\n",["label",{"class":"row"},["input",{"id":"rpFormatPreserveSemanticQuotes","type":"checkbox"}],["span",{},"Keep meaningful quotes inside speech, such as repeating someone else's words"]],"\n",["label",{"class":"row"},["input",{"id":"rpFormatPreserveBackticks","type":"checkbox"}],["span",{},"Preserve backtick / alternate dialogue instead of treating it like narration"]],"\n",["label",{"class":"row"},["input",{"id":"rpFormatShowMessageButtons","type":"checkbox"}],["span",{},"Show an RP toggle on AI messages so you can compare repaired/original formatting"]],"\n",["p",{"class":"hint"},"Visual/local only: this does not silently edit or save the AI response. Toggle a message back to Original at any time. Repaired generations are cached in the page so swiping between responses does not need a full chat rescan."],"\n"]));
})();
