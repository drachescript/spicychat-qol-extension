if (!window.__DSQ_TAB_GATE__?.paused) {
(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  if (!DS) return;

  const OUTPUT_CLASS = "ds-rp-repair-output";
  const ORIGINAL_HIDDEN_CLASS = "ds-rp-repair-original-hidden";
  const BUTTON_CLASS = "ds-rp-repair-toggle";
  const EDIT_BUTTON_CLASS = "ds-rp-repair-edit";
  const NATIVE_FORMAT_CLASS = "ds-rp-native-format";
  const MESSAGE_SELECTOR = "div[id^='message-']";

  let observer = null;
  let lastSettingsHash = "";
  let initializedRoute = "";
  const pendingMessages = new Set();
  const PENDING_CHUNK_SIZE = 8;
  let deferredFlushTimer = null;
  let flushScheduled = false;

  const ACTION_VERBS = [
    "pauses", "turns", "looks", "glances", "stares", "meets", "nods", "shakes", "sighs", "exhales",
    "inhales", "smiles", "grins", "smirks", "frowns", "scoffs", "snorts", "laughs", "chuckles", "sniffles",
    "swallows", "freezes", "steps", "walks", "moves", "crosses", "leans", "reaches", "folds", "raises", "lowers",
    "shifts", "tilts", "grips", "clutches", "taps", "stomps", "pushes", "pulls", "sits", "stands", "kneels",
    "paces", "watches", "studies", "blinks", "winces", "shrugs", "gestures", "points", "whips", "throws",
    "rubs", "bites", "presses", "runs", "slams", "opens", "closes", "enters", "leaves", "lingers", "hovers",
    "says", "asks", "replies", "whispers", "murmurs", "speaks", "shouts", "mutters",
    "looked", "glanced", "stared", "nodded", "shook", "sighed", "smiled", "grinned", "laughed",
    "leaned", "reached", "stepped", "walked", "moved", "turned", "took", "gave", "placed",
    "picked", "set", "said", "asked", "replied", "whispered", "murmured", "watched", "noticed", "sat", "stood",
    "opened", "closed", "echoed", "appeared", "followed", "darted", "flinched", "flickered", "flushed", "curled", "breathed", "lingered", "widened"
  ];
  const ACTION_VERB_PATTERN = ACTION_VERBS.join('|');
  const ACTOR_ACTION_RE = new RegExp(`^(?:[A-Z][\\p{L}'-]{1,30}|she|he|they|it|you)\\s+(?:${ACTION_VERB_PATTERN})\\b`, 'iu');
  const ANY_ACTION_RE = new RegExp(`\\b(?:${ACTION_VERB_PATTERN})\\b`, 'iu');

  function settings() {
    return DS.getEffectiveRpFormatSettings?.() || DS.state?.settings || {};
  }

  function settingsHash(s) {
    return [
      s.rpFormatStyle, s.rpFormatDetection, s.rpFormatConvertBoldActions !== false,
      s.rpFormatRemoveActionParens !== false, s.rpFormatPreserveInlineEmphasis !== false,
      s.rpFormatPreserveSemanticQuotes !== false, s.rpFormatPreserveBackticks !== false,
      s.rpFormatShowMessageButtons !== false, s.rpFormatRepairAuto !== false
    ].join("|");
  }

  function isAiMessage(message) {
    return !!message?.querySelector?.('[data-chat-bubble-side="bot"], [data-chat-side="bot"]') ||
      !!message?.querySelector?.("a[href*='/chatbot/']");
  }

  function getMessageParts(message) {
    const content = message?.querySelector?.('[data-chat-side="bot"][data-testid="ChatMessageContentV2"]');
    const bubble = content?.closest?.('[data-testid="ChatBubble-Column"]') ||
      message?.querySelector?.('[data-chat-bubble-side="bot"]');
    const body = bubble?.children?.[1] || null;
    // SpicyChat mounts greetings and generated replies in the same V2 content
    // element. Select that element, not the first unrelated span in the bubble.
    const contentHost = content || body?.querySelector?.('[data-chat-side="bot"]') || null;
    if (!(body instanceof HTMLElement) || !(contentHost instanceof HTMLElement)) return {};
    return {bubble, body, contentHost};
  }

  function stripVisibleMarkdown(text) {
    let value = String(text || "");
    value = value.replace(/^\s*\*{1,3}(?=\s|$)/, "");
    value = value.replace(/\*{1,3}\s*$/g, "");
    return value;
  }

  function cleanActionText(text, s) {
    let value = stripVisibleMarkdown(text).replace(/\s+/g, " ").trim();
    if (s.rpFormatRemoveActionParens !== false && /^\([\s\S]+\)$/.test(value)) {
      value = value.slice(1, -1).trim();
    }
    return value;
  }

  function normalizeSemanticQuotes(text, s) {
    let value = stripVisibleMarkdown(text);
    if (s.rpFormatPreserveSemanticQuotes !== false && s.rpFormatStyle === "clean") {
      // SpicyChat already removed the outer dialogue quotes when it rendered <q>.
      // In Clean RP, a leading single-quoted phrase is therefore usually a quote
      // *inside* speech, so keep that semantic quote while dropping dialogue quotes.
      value = value.replace(/^'([^'\n]{1,180})'/, '"$1"');
    }
    return value;
  }

  function looksLikeNarration(text, strength) {
    const value = String(text || "").replace(/\s+/g, " ").trim();
    if (!value) return false;
    if (/^["“‘`]|^(?:[—–-]\s+|(?:OOC|SYSTEM|META)\s*:)/i.test(value)) return false;
    const lower = value.toLowerCase();
    if (ACTOR_ACTION_RE.test(value)) return true;
    if (/^(?:from|outside|inside|across|nearby|meanwhile|elsewhere|a beat|silence|footsteps|the doorbell|the door|the room|the hallway|the night|the air)\b/i.test(value)) return true;
    if (strength === 'conservative') return false;

    // Openings like "One quiet evening" and "At Maple Court" are common in
    // greetings, even when the author forgot the Markdown action markers.
    if (/^(?:one (?:quiet|late|cold|warm|rainy|sunny|ordinary|early) (?:morning|evening|night|afternoon|day)|\b(?:moments?|minutes?|hours?|days?) later\b|the moment\b|as soon as\b|meanwhile\b|suddenly\b|for a moment\b)/i.test(value)) return true;
    if (/^(?:at|in|by|behind|beside|near|outside|inside|under|across)\s+(?:the\s+)?[A-Z][\p{L}'-]{2,}/u.test(value) && /[.,]|\b(?:was|were|stood|sat|lay)\b/i.test(value)) return true;
    if (/^(?:her|his|their|its|my|your|the|a|an)\s+[\p{L}'-]{2,}(?:\s+[\p{L}'-]{2,}){0,2}\s+(?:was|were|had|has|began|started|rose|fell|moved|stopped|shifted|twitched|raced|ached|fluttered|snapped|tightened|trembled|lifted|dropped|swung|opened|closed|caught|brushed|rested|turned|paused|widened|narrowed|slid|grew|echoed|lingered|followed)\b/iu.test(value)) return true;
    if (/^(?:a|the)\s+(?:sudden|sharp|quiet|loud|soft|faint)\s+(?:knock|noise|sound|footstep|voice|cry|sigh|bang|crash)\b/iu.test(value)) return true;
    if (/^(?:she|he|they|[A-Z][\p{L}'-]{1,30})\s+(?:had|has|was|were)\s+(?:been\s+)?(?:waiting|standing|sitting|walking|watching|looking|leaning|moving|fidgeting|staring|holding|shaking|turning|resting|wearing|smiling|trembling|blushing|trying)\b/iu.test(value)) return true;
    if (strength === 'aggressive') {
      if (ANY_ACTION_RE.test(value) && !/[?!]\s*$/.test(value) && !/^(?:i|we)\b/i.test(value)) return true;
      if (/^[A-Z][\p{L}'-]{1,30}\b/u.test(value) && /\b(?:her|his|their|the|toward|across|against|beside|behind|near)\b/i.test(lower)) return true;
    }
    return false;
  }

  // Convert plain Markdown in SpicyChat's native editor. This is deliberately
  // conservative and never saves or sends a message on its own. A user reviews
  // the before/after text before inserting the proposed edit into React's field.
  function looksLikeSceneProse(text, strength) {
    const v = String(text || '').replace(/\s+/g,' ').trim();
    if (!v || /^(?:["“‘`]|[—–-]\s+|(?:OOC|SYSTEM|META)\s*:|(?:I|we)\b)/i.test(v)) return false;
    if (looksLikeNarration(v,strength)) return true;
    if (/^[,;:]?\s*(?:she|he|they|you|it|[A-Z][\p{L}'-]{1,30})\s+(?:said|says|say|asked|asks|ask|replied|replies|reply|whispered|whispers|whisper|added|adds|add|answered|answers|answer|muttered|mutters|mutter|continued|continues|continue|laughed|laughs|laugh)\b/iu.test(v)) return true;
    if (/^(?:you(?:'re|'ve|'d|'ll)?|you\s+(?:are|were|have|had|find|found|look|take|took|walk|move|approach|knock|notice|turn|open|pull)\b)/i.test(v) && v.length>40 && /\b(?:been|walking|shopping|house|door|street|bag|garden|inside|outside|find|take|look|walk|approach|knock|turn|open|pull|you)\b/i.test(v)) return true;
    if (/^(?:not wanting|without|as (?:you|she|he|they)|when (?:you|she|he|they)|after (?:you|she|he|they))\b/i.test(v)) return true;
    if (/^(?:her|his|their|your|the|a|an)\s+[\p{L}'-]+(?:\s+[\p{L}'-]+){0,3}\s+(?:[\p{L}'-]+s|[\p{L}'-]+ed|was|were|had|is|are|has|began|started|shows|lights|looks|falls|opens|stands)\b/iu.test(v) && v.length>20) return true;
    if (/^[A-Z][\p{L}'-]{1,30}(?:\s+[A-Z][\p{L}'-]{1,30})?\s+(?:[\p{L}'-]{3,}s|[\p{L}'-]{3,}ed|is|was|has|had|looks|took|gave|found|went|stood|sat|came)\b/iu.test(v) && !/^[A-Z][\p{L}'-]{1,30},/.test(v)) return true;
    if (/^(?:it(?:'s| is| was)|there(?:'s| is| was)|the moment|a moment|the address|the photo)\b/i.test(v) && v.length>38) return true;
    return strength==='aggressive' && v.length>110 && (v.match(/[.!?](?=\s|$)/g)||[]).length>=2;
  }

  function prepareRpMarkdown(raw, s) {
    const original = String(raw || '');
    const strength = ['conservative','balanced','aggressive'].includes(s?.rpFormatDetection)
      ? s.rpFormatDetection : 'balanced';
    let changedLines = 0, inFence = false;
    const formatted = original.split(/(\r?\n)/).map(line => {
      if (/^\r?\n$/.test(line)) return line;
      if (/^\s*```/.test(line)) { inFence = !inFence; return line; }
      if (inFence || !line.trim() || /^(?:\s*[-*_]{3,}\s*|\s*#|\s*>|\s*\[(?:OOC|SYSTEM|META|DIRECTOR)\b)/i.test(line)) return line;
      if (/^\s*(?:[\p{L}][\p{L}0-9_' -]{0,35}\s*:\s+|[—–]\s+)/u.test(line)) return line;
      const tokens=[];
      const re=/(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`|"[^"\n]*"|“[^”\n]*”)/g;
      let m,cursor=0;
      while ((m=re.exec(line))) {
        if (m.index>cursor) tokens.push({fixed:false,text:line.slice(cursor,m.index)});
        tokens.push({fixed:true,text:m[0]});
        cursor=m.index+m[0].length;
      }
      if(cursor<line.length) tokens.push({fixed:false,text:line.slice(cursor)});
      if(!tokens.length) tokens.push({fixed:false,text:line});
      const unquoted=tokens.filter(t=>!t.fixed).map(t=>t.text).join(' ');
      const lineIsScene=looksLikeSceneProse(unquoted,strength);
      let changed=false;
      const result=tokens.map(t=>{
        if(t.fixed || !t.text.trim() || /^[\p{P}\p{S}]+$/u.test(t.text.trim())) return t.text;
        if(!lineIsScene && !looksLikeSceneProse(t.text,strength)) return t.text;
        const prefix=/^\s*[,;:]?\s*/.exec(t.text)?.[0]||'';
        const suffix=/\s*$/.exec(t.text)?.[0]||'';
        const content=t.text.slice(prefix.length,t.text.length-suffix.length);
        if(!content.trim()) return t.text;
        changed=true;
        return prefix+'*'+content+'*'+suffix;
      }).join('');
      if(changed && result!==line) changedLines++;
      return result;
    }).join('');
    return {original,formatted,changedLines};
  }

  function nativeEditor(root) {
    return root?.querySelector?.("[data-testid='MessageEditor-Input'] textarea, [data-testid='MessageEditor'] textarea, textarea") || null;
  }

  function insertIntoNativeEditor(field, text) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    if (setter) setter.call(field, text); else field.value = text;
    try { field.dispatchEvent(new InputEvent('input', {bubbles:true, inputType:'insertReplacementText', data:text})); }
    catch { field.dispatchEvent(new Event('input', {bubbles:true})); }
    field.dispatchEvent(new Event('change', {bubbles:true}));
  }

  function reviewNativeFormatting(root, field) {
    if (!root?.isConnected || !field?.isConnected || !root.contains(field)) return;
    const suggestion = prepareRpMarkdown(field.value, settings());
    if (!suggestion.changedLines) {
      DS.setQuickStatus?.('RP formatting: no clear missing narration markers. Original text left untouched.');
      return;
    }
    const dialog = document.createElement('dialog');
    dialog.className = 'ds-rp-native-preview';
    const title = document.createElement('h3'); title.textContent = `RP formatting preview · ${suggestion.changedLines} lines changed`;
    const note = document.createElement('p');
    note.textContent = 'Review carefully. This only places text in SpicyChat’s native editor; you must click SpicyChat Save yourself.';
    const beforeLabel = document.createElement('label'); beforeLabel.textContent = 'Original';
    const before = document.createElement('textarea'); before.rows = 5; before.readOnly = true; before.value = suggestion.original;
    const afterLabel = document.createElement('label'); afterLabel.textContent = 'Proposed edit (editable)';
    const after = document.createElement('textarea'); after.rows = 9; after.value = suggestion.formatted;
    const actions = document.createElement('div'); actions.className = 'ds-rp-native-preview-actions';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancel';
    const use = document.createElement('button'); use.type = 'button'; use.textContent = 'Insert into native editor';
    const status = document.createElement('p'); status.setAttribute('role', 'status');
    cancel.addEventListener('click', () => dialog.close());
    use.addEventListener('click', () => {
      if (!field.isConnected || !root.isConnected || !root.contains(field)) { status.textContent = 'Native editor closed. Nothing was changed.'; return; }
      if (field.value !== suggestion.original) { status.textContent = 'The native text changed while reviewing. Reopen the preview; nothing was replaced.'; return; }
      if (!after.value.trim()) { status.textContent = 'Empty edits are not allowed.'; return; }
      insertIntoNativeEditor(field, after.value);
      dialog.close();
      field.focus({preventScroll:true});
      DS.setQuickStatus?.('RP text inserted. Review it, then click SpicyChat Save (not saved yet).');
    });
    actions.append(cancel, use); beforeLabel.append(before); afterLabel.append(after);
    dialog.append(title, note, beforeLabel, afterLabel, actions, status);
    document.body.append(dialog);
    dialog.addEventListener('close', () => dialog.remove(), {once:true});
    try { dialog.showModal(); } catch { dialog.open = true; }
  }

  function ensureNativeFormatAction(root) {
    const s = settings();
    if (!s.enabled || !s.enableRpFormatRepair || !isAiMessage(root)) {
      root?.querySelector?.(`.${NATIVE_FORMAT_CLASS}`)?.remove();
      return;
    }
    const field = nativeEditor(root);
    if (!(field instanceof HTMLTextAreaElement) || !field.isConnected) return;
    if (root.querySelector(`.${NATIVE_FORMAT_CLASS}`)) return;
    const button = document.createElement('button'); button.type = 'button';
    button.className = NATIVE_FORMAT_CLASS;
    button.textContent = 'Format RP text…';
    button.title = 'Preview Markdown action markers, then insert into this message editor';
    button.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();
      const live = nativeEditor(root);
      if (live instanceof HTMLTextAreaElement) reviewNativeFormatting(root, live);
    });
    field.insertAdjacentElement('afterend', button);
  }

  function appendSegment(segments, segment) {
    if (!segment) return;
    if (segment.type === "action") {
      const text = String(segment.text || "");
      if (!text.trim()) return;
      const previous = segments[segments.length - 1];
      if (previous?.type === "action") {
        previous.text += text;
        return;
      }
    }
    segments.push(segment);
  }

  function appendPlainSegments(segments, value, strength) {
    const raw = stripVisibleMarkdown(value);
    // Quoted speech is distinct from the surrounding narration, even if the
    // model put both into one unformatted text node.
    const pattern = /("[^"\n]+"|“[^”\n]+”)/g;
    let cursor = 0, match;
    const addOutside = fragment => {
      if (!fragment.trim()) return;
      const type = looksLikeSceneProse(fragment, strength) ? 'action' : 'speech';
      appendSegment(segments, type === 'action' ? {type, text: fragment} : {type, sourceText: fragment});
    };
    while ((match = pattern.exec(raw))) {
      if (match.index > cursor) addOutside(raw.slice(cursor, match.index));
      const inner = match[0].slice(1,-1);
      appendSegment(segments,{type:'speech',sourceText:inner});
      cursor=match.index+match[0].length;
    }
    addOutside(raw.slice(cursor));
  }

  function extractSegments(span, s) {
    const children = [...span.childNodes];
    const strength = ["conservative", "balanced", "aggressive"].includes(s.rpFormatDetection) ? s.rpFormatDetection : "balanced";
    const segments = [];

    for (const node of children) {
      if (node.nodeType === Node.TEXT_NODE) {
        appendPlainSegments(segments,node.nodeValue || '',strength);
        continue;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const tag = node.tagName;

      if (tag === "BR") {
        segments.push({ type: "break" });
        continue;
      }

      if (tag === "Q") {
        segments.push({ type: "speech", sourceNode: node });
        continue;
      }

      if (tag === "CODE") {
        if (s.rpFormatPreserveBackticks !== false) {
          segments.push({ type: "alternate", sourceNode: node });
        } else {
          segments.push({ type: "speech", sourceText: node.textContent || "" });
        }
        continue;
      }

      if (tag === "EM") {
        appendSegment(segments, { type: "action", text: node.textContent || "" });
        continue;
      }

      if (tag === "STRONG") {
        const text = node.textContent || '';
        // Bold is also used for inner thoughts. Don't turn those into actions.
        if (s.rpFormatConvertBoldActions !== false && looksLikeNarration(text,strength)) {
          appendSegment(segments,{type:'action',text});
        } else {
          segments.push({type:'bold',sourceNode:node});
        }
        continue;
      }

      appendPlainSegments(segments,node.textContent || '',strength);
    }

    return segments;
  }

  function cloneSpeechChildren(sourceNode, s) {
    const fragment = document.createDocumentFragment();
    let firstText = true;

    const appendNode = node => {
      if (node.nodeType === Node.TEXT_NODE) {
        let text = node.nodeValue || "";
        if (firstText) {
          text = normalizeSemanticQuotes(text, s);
          firstText = false;
        } else {
          text = stripVisibleMarkdown(text);
        }
        fragment.appendChild(document.createTextNode(text));
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if ((node.tagName === "EM" || node.tagName === "I") && s.rpFormatPreserveInlineEmphasis !== false) {
        const em = document.createElement("em");
        em.className = "ds-rp-repair-emphasis";
        [...node.childNodes].forEach(child => {
          if (child.nodeType === Node.TEXT_NODE) em.appendChild(document.createTextNode(stripVisibleMarkdown(child.nodeValue || "")));
          else em.appendChild(document.createTextNode(child.textContent || ""));
        });
        fragment.appendChild(em);
        firstText = false;
        return;
      }
      [...node.childNodes].forEach(appendNode);
    };

    if (sourceNode) [...sourceNode.childNodes].forEach(appendNode);
    return fragment;
  }

  function firstVisibleChar(segment, s) {
    if (segment.type === "action") return cleanActionText(segment.text, s).charAt(0);
    if (segment.type === "alternate" || segment.type === "bold") return String(segment.sourceNode?.textContent || "").trim().charAt(0);
    if (segment.sourceText) return stripVisibleMarkdown(segment.sourceText).trim().charAt(0);
    return String(segment.sourceNode?.textContent || "").trim().charAt(0);
  }

  function lastVisibleChar(container) {
    const text = String(container.textContent || "").trimEnd();
    return text.charAt(text.length - 1);
  }

  function maybeSpace(container, nextSegment, s) {
    const last = lastVisibleChar(container);
    const first = firstVisibleChar(nextSegment, s);
    if (!last || !first) return;
    if (/\s/.test(last) || /^[,.;:!?)}\]]/.test(first)) return;
    container.appendChild(document.createTextNode(" "));
  }

  function renderSpan(span, s) {
    const output = document.createElement("span");
    output.className = span.className || "leading-6 mb-[10px] last:mb-0";
    output.classList.add("ds-rp-repair-line");
    const segments = extractSegments(span, s);

    for (const segment of segments) {
      if (segment.type === "break") {
        output.appendChild(document.createElement("br"));
        continue;
      }

      maybeSpace(output, segment, s);

      if (segment.type === "action") {
        const text = cleanActionText(segment.text, s);
        if (!text) continue;
        const em = document.createElement("em");
        em.className = "ds-rp-repair-action";
        em.textContent = text;
        output.appendChild(em);
        continue;
      }

      if (segment.type === 'bold') {
        const strong = document.createElement('strong');
        strong.textContent=segment.sourceNode?.textContent || '';
        output.appendChild(strong);
        continue;
      }

      if (segment.type === "alternate") {
        const code = document.createElement("code");
        code.className = "ds-rp-repair-alternate";
        code.textContent = segment.sourceNode?.textContent || "";
        output.appendChild(code);
        continue;
      }

      const speech = document.createElement("span");
      speech.className = "ds-rp-repair-speech";
      const quoted = s.rpFormatStyle === "quoted";
      if (quoted) speech.appendChild(document.createTextNode('"'));
      if (segment.sourceNode) {
        speech.appendChild(cloneSpeechChildren(segment.sourceNode, s));
      } else {
        speech.appendChild(document.createTextNode(normalizeSemanticQuotes(segment.sourceText || "", s).trim()));
      }
      if (quoted) speech.appendChild(document.createTextNode('"'));
      output.appendChild(speech);
    }

    return output;
  }

  function buildOutput(contentHost, s) {
    // Rich media and links must remain native. We can't rebuild those without
    // dropping behavior, so leave the entire message alone in that case.
    if (contentHost.querySelector('a, img, picture, video, audio, iframe, button, input, textarea, pre, table, ul, ol, svg, canvas')) return null;
    const output = document.createElement("div");
    output.className = `${OUTPUT_CLASS} flex flex-col w-full [overflow-wrap:anywhere]`;
    for (const child of [...contentHost.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        if (child.nodeValue?.trim()) return null;
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      if (child.tagName === "SPAN") output.appendChild(renderSpan(child, s));
      else if (child.tagName === "HR") output.appendChild(document.createElement("hr"));
      else if (child.textContent?.trim()) return null;
    }
    return output;
  }

  // Native chat layouts change independently of this optional formatter. Never
  // hide SpicyChat's text unless we can verify our replacement contains it.
  // A layout with nested DIV/P nodes previously produced empty blue bubbles
  // showing only the RP✓ toggle.
  function safeReplacement(body, contentHost, output) {
    if (!(body instanceof HTMLElement) || !(contentHost instanceof HTMLElement) || !(output instanceof HTMLElement)) return false;
    if (contentHost.closest(`.${OUTPUT_CLASS}`) || contentHost.querySelector(`.${BUTTON_CLASS}, .${OUTPUT_CLASS}`)) return false;
    const nativeText = (body.textContent || "").replace(/\s+/g, " ").trim();
    const sourceText = (contentHost.textContent || "").replace(/\s+/g, " ").trim();
    const resultText = (output.textContent || "").replace(/\s+/g, " ").trim();
    if (sourceText.length < 12 || resultText.length < 12) return false;
    // On later passes, the generated replacement is already attached inside
    // the native message body. Do not count its text as native message text:
    // that doubles the measured length and wrongly rejects valid repairs.
    const generatedLength = body.contains(output) ? resultText.length : 0;
    const nativeLength = Math.max(0, nativeText.length - generatedLength);
    // Refuse if the chosen source was only a narrow UI fragment, or conversion
    // stripped a substantial amount of the actual message.
    if (sourceText.length < nativeLength * 0.85) return false;
    if (resultText.length < sourceText.length * 0.75) return false;
    return true;
  }

  function isRepairedView(message, s) {
    if (message.dataset.dsRpView === "original") return false;
    if (message.dataset.dsRpView === "repaired") return true;
    return s.rpFormatRepairAuto !== false;
  }

  function updateButton(button, repaired) {
    if (!button) return;
    const text = repaired ? "RP✓" : "RP";
    const title = repaired ? "RP Format Repair is shown — click for original" : "Show RP Format Repair";
    if (button.textContent !== text) button.textContent = text;
    button.dataset.dsRpActive = repaired ? "1" : "0";
    if (button.title !== title) button.title = title;
    if (button.getAttribute("aria-label") !== title) button.setAttribute("aria-label", title);
  }

  function applyView(message, contentHost, output, s) {
    // Fail open: React may remove a generated replacement while preserving
    // the native content host. Never hide the native text without a live,
    // non-empty replacement attached to this exact message.
    const validOutput = output?.isConnected && message.contains(output) &&
      String(output.textContent || "").trim().length >= 12;
    const repaired = !!validOutput && isRepairedView(message, s);
    contentHost.classList.toggle(ORIGINAL_HIDDEN_CLASS, repaired);
    output.hidden = !repaired;
    updateButton(message.querySelector(`.${BUTTON_CLASS}:not(.${EDIT_BUTTON_CLASS})`), repaired);
  }

  function ensureEditShortcut(message, s) {
    if (!s.enabled || !s.enableRpFormatRepair) {
      message.querySelector(`.${EDIT_BUTTON_CLASS}`)?.remove();
      return;
    }
    let editButton = message.querySelector(`.${EDIT_BUTTON_CLASS}`);
    if (!editButton) {
      const dropdown = message.querySelector('button[aria-label="message-dropdown"]');
      const holder = dropdown?.parentElement;
      if (holder && message.contains(holder)) {
        editButton = document.createElement('button'); editButton.type = 'button';
        editButton.className = `${BUTTON_CLASS} ${EDIT_BUTTON_CLASS}`;
        editButton.textContent = 'RP✎';
        editButton.title = 'Open the native AI message editor to format and save RP text';
        editButton.setAttribute('aria-label', editButton.title);
        editButton.addEventListener('click', event => {
          event.preventDefault(); event.stopPropagation();
          if (!settings().enabled || !settings().enableRpFormatRepair) { cleanupMessage(message); return; }
          if (typeof DS.openNativeMessageEditorForRoot !== 'function') {
            DS.setQuickStatus?.('Use the native message menu → Edit, then choose Format RP text.');
            return;
          }
          void Promise.resolve(DS.openNativeMessageEditorForRoot(message)).then(ok => {
            if (ok) ensureNativeFormatAction(message);
            else DS.setQuickStatus?.('Open Edit from SpicyChat’s native message menu, then choose Format RP text.');
          }).catch(() => DS.setQuickStatus?.('Could not open native Edit; use the message menu.'));
        });
        holder.insertBefore(editButton, dropdown);
      }
    }
  }

  function ensureToggleButton(message, contentHost, output, s) {
    ensureEditShortcut(message, s);
    let button = message.querySelector(`.${BUTTON_CLASS}:not(.${EDIT_BUTTON_CLASS})`);
    if (!s.enabled || !s.enableRpFormatRepair || s.rpFormatShowMessageButtons === false) {
      button?.remove();
      return;
    }
    if (!button) {
      const dropdown = message.querySelector('button[aria-label="message-dropdown"]');
      const holder = dropdown?.parentElement || null;
      if (!holder || !message.contains(holder) || !message.contains(dropdown)) return;
      button = document.createElement('button');
      button.type = 'button';
      button.className = BUTTON_CLASS;
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        if (!settings().enabled || !settings().enableRpFormatRepair) {
          cleanupMessage(message);
          return;
        }
        const liveOutput = message.querySelector(`.${OUTPUT_CLASS}`);
        const liveContentHost = getMessageParts(message).contentHost;
        if (!(liveOutput instanceof HTMLElement) || !(liveContentHost instanceof HTMLElement)) return;
        const currentlyRepaired = !liveOutput.hidden;
        message.dataset.dsRpView = currentlyRepaired ? 'original' : 'repaired';
        applyView(message, liveContentHost, liveOutput, settings());
      });
      holder.insertBefore(button, dropdown);
    }
    updateButton(button, !output.hidden);
  }

  function processMessage(message, force = false) {
    const s = settings();
    if (!message?.isConnected || DS.isMessageEditPending?.(message) || !isAiMessage(message)) return;
    const { body, contentHost } = getMessageParts(message);
    if (!(contentHost instanceof HTMLElement) || contentHost.classList.contains(OUTPUT_CLASS)) {
      // Do not leave a hidden native message or an orphaned RP✓ toggle behind.
      if (message.querySelector(`.${OUTPUT_CLASS}, .${ORIGINAL_HIDDEN_CLASS}`)) cleanupMessage(message);
      return;
    }

    const hash = `${settingsHash(s)}|${contentHost.textContent || ""}`;
    if (!force && message.dataset.dsRpReady === hash && message.querySelector(`.${OUTPUT_CLASS}`)) {
      const output = message.querySelector(`.${OUTPUT_CLASS}`);
      if (!safeReplacement(body, contentHost, output)) {
        cleanupMessage(message);
        return;
      }
      applyView(message, contentHost, output, s);
      ensureToggleButton(message, contentHost, output, s);
      return;
    }

    message.querySelector(`.${OUTPUT_CLASS}`)?.remove();
    contentHost.classList.remove(ORIGINAL_HIDDEN_CLASS);
    const output = buildOutput(contentHost, s);
    if (!safeReplacement(body, contentHost, output)) {
      // Unsupported/partial native markup: keep the untouched SpicyChat body.
      message.querySelectorAll(`.${BUTTON_CLASS}:not(.${EDIT_BUTTON_CLASS})`).forEach(el => el.remove());
      ensureEditShortcut(message, s);
      delete message.dataset.dsRpReady;
      delete message.dataset.dsRpView;
      return;
    }
    contentHost.insertAdjacentElement("afterend", output);
    message.dataset.dsRpReady = hash;
    applyView(message, contentHost, output, s);
    ensureToggleButton(message, contentHost, output, s);
  }

  function historyBatchBusy() {
    return !!DS.state?.bulkChatHistoryLoadActive || Date.now() < Number(DS.state?.chatHistoryBatchUntil || 0);
  }

  function schedulePendingFlush(delay = 0) {
    if (flushScheduled || deferredFlushTimer) return;
    if (delay > 0) {
      deferredFlushTimer = setTimeout(() => {
        deferredFlushTimer = null;
        schedulePendingFlush();
      }, delay);
      return;
    }
    flushScheduled = true;
    requestAnimationFrame(flushPending);
  }

  function flushPending() {
    flushScheduled = false;
    if (!pendingMessages.size) return;
    if (historyBatchBusy()) {
      const counters = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
      counters.rpFormatHistoryDeferrals = Number(counters.rpFormatHistoryDeferrals || 0) + 1;
      const wait = Math.max(140, Number(DS.state?.chatHistoryBatchUntil || 0) - Date.now() + 100);
      schedulePendingFlush(Math.min(1700, wait));
      return;
    }
    const items = [...pendingMessages].slice(0, PENDING_CHUNK_SIZE);
    items.forEach(message => pendingMessages.delete(message));
    items.forEach(message => processMessage(message));
    const counters = DS.state.runtimePerformance || (DS.state.runtimePerformance = {});
    counters.rpFormatChunkPasses = Number(counters.rpFormatChunkPasses || 0) + 1;
    counters.rpFormatChunkMessages = Number(counters.rpFormatChunkMessages || 0) + items.length;
    if (pendingMessages.size) schedulePendingFlush();
  }

  function queueMessage(message) {
    if (!message || !isAiMessage(message)) return;
    pendingMessages.add(message);
    schedulePendingFlush();
  }

  function messageFromNode(node) {
    if (!(node instanceof Element)) return null;
    return node.matches(MESSAGE_SELECTOR) ? node : node.closest(MESSAGE_SELECTOR);
  }

  function ensureObserver() {
    if (observer) return;
    observer = new MutationObserver(mutations => {
      const s = settings();
      if (!s.enabled || !s.enableRpFormatRepair || !DS.isSingleChatPage?.()) return;
      for (const mutation of mutations) {
        if (DS.mutationIsQolOnly?.(mutation)) continue;
        const targetElement = mutation.target instanceof Element ? mutation.target : mutation.target?.parentElement;
        if (targetElement?.closest?.(`.${OUTPUT_CLASS}, .${BUTTON_CLASS}`)) continue;
        const ownMessage = messageFromNode(targetElement);
        if (ownMessage) {
          if (ownMessage.dataset.dsEditSavePending === '1' || nativeEditor(ownMessage)) {
            ensureNativeFormatAction(ownMessage);
          } else queueMessage(ownMessage);
        }
        mutation.addedNodes.forEach(node => {
          if (!(node instanceof Element) || DS.isQolOwnedNode?.(node) || node.closest?.(`.${OUTPUT_CLASS}, .${BUTTON_CLASS}`)) return;
          const direct = messageFromNode(node);
          if (direct) queueMessage(direct);
          node.querySelectorAll?.(MESSAGE_SELECTOR).forEach(queueMessage);
        });
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  }

  function disconnectObserver() {
    observer?.disconnect();
    observer = null;
    pendingMessages.clear();
    clearTimeout(deferredFlushTimer);
    deferredFlushTimer = null;
    flushScheduled = false;
  }

  function removeOrphanToggles() {
    // Earlier versions could insert the RP toggle directly into the page
    // layout because dropdown.closest('.relative') crossed the message root.
    // Remove only our own unmistakably orphaned controls, and only on route/
    // settings transitions rather than on every streaming message.
    document.querySelectorAll(`.${BUTTON_CLASS}`).forEach(button => {
      if (!button.closest(MESSAGE_SELECTOR)) button.remove();
    });
  }

  function cleanupMessage(message) {
    message.querySelectorAll(`.${OUTPUT_CLASS}`).forEach(el => el.remove());
    message.querySelectorAll(`.${BUTTON_CLASS}, .${NATIVE_FORMAT_CLASS}`).forEach(el => el.remove());
    message.querySelectorAll(`.${ORIGINAL_HIDDEN_CLASS}`).forEach(el => el.classList.remove(ORIGINAL_HIDDEN_CLASS));
    delete message.dataset.dsRpReady;
    delete message.dataset.dsRpView;
  }

  function cleanup() {
    disconnectObserver();
    removeOrphanToggles();
    document.querySelectorAll(MESSAGE_SELECTOR).forEach(cleanupMessage);
    lastSettingsHash = "";
    initializedRoute = "";
    DS.state.rpFormatRepairWasActive = false;
  }

  DS.applyRpFormatRepair = function applyRpFormatRepair() {
    const s = settings();
    if (DS.state?.chatExportLock?.active) return;
    if (!s.enabled || !s.enableRpFormatRepair || !DS.isSingleChatPage?.()) {
      if (DS.state.rpFormatRepairWasActive) cleanup();
      return;
    }

    DS.state.rpFormatRepairWasActive = true;
    ensureObserver();
    const nextHash = settingsHash(s);
    const route = String(location.pathname || "");
    const force = nextHash !== lastSettingsHash || initializedRoute !== route;
    lastSettingsHash = nextHash;
    ensureObserver();

    // The module observer handles individual message edits/streaming after the
    // initial pass. Avoid walking every old message again on each global QoL run.
    if (force || !initializedRoute) {
      removeOrphanToggles();
      const loaded = DS.getMessageEnhancerRoots?.({ newest: 24, margin: 1400 }) || DS.getLoadedMessageRoots?.() || Array.from(document.querySelectorAll(MESSAGE_SELECTOR));
      loaded.forEach(message => {
        if (!isAiMessage(message)) return;
        processMessage(message, true);
      });
      initializedRoute = route;
    } else {
      const candidates = DS.getMessageEnhancerRoots?.({ readyAttribute: "data-ds-rp-ready", newest: 24, margin: 1400 })
        || document.querySelectorAll(`${MESSAGE_SELECTOR}:not([data-ds-rp-ready])`);
      candidates.forEach(message => {
        if (isAiMessage(message)) processMessage(message, false);
      });
    }
  };

  DS.prepareRpFormatRepairMessageForEdit = function(root) {
    if (!settings().enabled || !settings().enableRpFormatRepair) return;
    cleanupMessage(root);
    ensureNativeFormatAction(root);
  };
  // Pure text transform is exposed for local regression tests only; no reads,
  // storage writes or chat network calls occur here.
  DS.previewRpMarkdown = prepareRpMarkdown;
  DS.removeRpFormatRepair = cleanup;
})();

}
