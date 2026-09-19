(() => {
  "use strict";

  const DS = window.DragonScriptQoL;
  const TAG_PARAM_BASE = "public_characters_alias/sort/_text_match(buckets: 3):desc,num_messages_24h:desc[refinementList][tags]";

  function settings() {
    return DS.state?.settings || {};
  }

  function cleanTag(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function sameTag(a, b) {
    return cleanTag(a).toLocaleLowerCase() === cleanTag(b).toLocaleLowerCase();
  }

  function uniqueTags(values) {
    const out = [];
    for (const value of values || []) {
      const tag = cleanTag(value);
      if (!tag || out.some(existing => sameTag(existing, tag))) continue;
      out.push(tag);
    }
    return out;
  }

  function directTagButtons(container) {
    return [...(container?.children || [])].filter(el => {
      if (el.tagName !== "BUTTON" || el.classList.contains("ds-chat-tag-add")) return false;
      const cls = String(el.className || "");
      const text = cleanTag(el.textContent);
      return cls.includes("rounded-full") && cls.includes("h-[32px]") && text && text.length <= 45;
    });
  }

  function isBeforeFirstMessage(el) {
    const firstMessage = DS.qs?.("[id^='message-']");
    if (!firstMessage || !el) return true;
    return !!(el.compareDocumentPosition(firstMessage) & Node.DOCUMENT_POSITION_FOLLOWING);
  }

  function findTagContainer() {
    const candidates = (DS.qsa?.("div.flex-wrap.justify-center, div[class*='flex-wrap'][class*='justify-center']") || [])
      .filter(el => !el.closest?.("nav, header, footer, #ds-qol-panel, #ds-chat-export-modal"))
      .filter(isBeforeFirstMessage)
      .map(el => ({ el, buttons: directTagButtons(el) }))
      .filter(item => item.buttons.length > 0)
      .sort((a, b) => b.buttons.length - a.buttons.length);

    return candidates[0] || null;
  }

  function buildHomeTagUrl(clickedTag) {
    const s = settings();
    const includes = uniqueTags([...(s.includeTags || []), clickedTag]);
    const excludes = uniqueTags(s.excludeTags || []).filter(tag => !includes.some(include => sameTag(include, tag)));
    const url = new URL("/", location.origin);
    let index = 0;

    for (const tag of includes) {
      url.searchParams.append(`${TAG_PARAM_BASE}[${index++}]`, tag);
    }
    for (const tag of excludes) {
      url.searchParams.append(`${TAG_PARAM_BASE}[${index++}]`, `-${tag}`);
    }

    return url.href;
  }

  async function addTagToSavedIncludes(tag, addButton) {
    const current = settings();
    const includeTags = uniqueTags([...(current.includeTags || []), tag]);
    const excludeTags = uniqueTags(current.excludeTags || []).filter(item => !sameTag(item, tag));
    const nextSettings = { ...current, includeTags, excludeTags };

    DS.state.settings = nextSettings;
    await DS.storageSet?.({ settings: nextSettings });

    if (addButton) {
      const title = `${tag} is in the saved include tags`;
      if (addButton.textContent !== "✓") addButton.textContent = "✓";
      if (addButton.dataset.dsTagSaved !== "1") addButton.dataset.dsTagSaved = "1";
      if (addButton.title !== title) addButton.title = title;
      if (addButton.getAttribute("aria-label") !== title) addButton.setAttribute("aria-label", title);
    }
  }

  function cleanup() {
    (DS.qsa?.(".ds-chat-tag-add") || []).forEach(button => button.remove());
    (DS.qsa?.(".ds-chat-tag-link") || []).forEach(button => {
      button.classList.remove("ds-chat-tag-link");
      delete button.dataset.dsChatTag;
      if (button.dataset.dsChatTagTitle === "1") {
        button.removeAttribute("title");
        delete button.dataset.dsChatTagTitle;
      }
    });
  }

  function ensureEvents() {
    if (DS.state.chatTagEventsInstalled) return;
    DS.state.chatTagEventsInstalled = true;

    document.addEventListener("click", event => {
      const add = event.target?.closest?.(".ds-chat-tag-add");
      if (add) {
        event.preventDefault();
        event.stopPropagation();
        addTagToSavedIncludes(add.dataset.dsChatTag || "", add);
        return;
      }

      const tagButton = event.target?.closest?.(".ds-chat-tag-link");
      if (!tagButton) return;

      const tag = tagButton.dataset.dsChatTag || cleanTag(tagButton.textContent);
      if (!tag) return;

      event.preventDefault();
      event.stopPropagation();
      location.href = buildHomeTagUrl(tag);
    }, true);
  }

  DS.applyChatTagTools = function applyChatTagTools() {
    const token = DS.diagOperationStart?.("chat-tags", "scan");
    let scanned = 0;
    let changed = 0;
    let skipped = 0;
    ensureEvents();

    const s = settings();
    const active = !!s.enabled && DS.isSingleChatPage?.() && (s.showChatTagLinks || s.showChatTagAddButtons);

    if (!active) {
      const before = (DS.qsa?.(".ds-chat-tag-add") || []).length + (DS.qsa?.(".ds-chat-tag-link") || []).length;
      cleanup();
      DS.diagOperationEnd?.(token, { scanned: before, changed: before, skipped: 0 });
      return;
    }

    const found = findTagContainer();
    if (!found) {
      DS.diagOperationEnd?.(token, { scanned: 0, changed: 0, skipped: 0 });
      return;
    }

    for (const tagButton of found.buttons) {
      scanned++;
      const tag = cleanTag(tagButton.textContent);
      if (!tag) { skipped++; continue; }

      if (s.showChatTagLinks) {
        if (!tagButton.classList.contains("ds-chat-tag-link")) { tagButton.classList.add("ds-chat-tag-link"); changed++; }
        if (tagButton.dataset.dsChatTag !== tag) { tagButton.dataset.dsChatTag = tag; changed++; }
        if (!tagButton.hasAttribute("title")) {
          tagButton.title = `Open Home with ${tag}`;
          tagButton.dataset.dsChatTagTitle = "1";
          changed++;
        }
      } else {
        tagButton.classList.remove("ds-chat-tag-link");
        delete tagButton.dataset.dsChatTag;
        if (tagButton.dataset.dsChatTagTitle === "1") {
          tagButton.removeAttribute("title");
          delete tagButton.dataset.dsChatTagTitle;
        }
      }

      const next = tagButton.nextElementSibling;
      if (s.showChatTagAddButtons) {
        let add = next?.classList?.contains("ds-chat-tag-add") ? next : null;
        const alreadySaved = uniqueTags(s.includeTags || []).some(item => sameTag(item, tag));

        if (!add) {
          add = document.createElement("button");
          add.type = "button";
          add.className = "ds-chat-tag-add";
          DS.markQolOwned?.(add, "chat-tags");
          tagButton.insertAdjacentElement("afterend", add);
          changed++;
        } else {
          DS.markQolOwned?.(add, "chat-tags");
        }

        const savedValue = alreadySaved ? "1" : "0";
        const icon = alreadySaved ? "✓" : "+";
        const title = alreadySaved
          ? `${tag} is in the saved include tags`
          : `Add ${tag} to the saved include tags`;
        if (add.dataset.dsChatTag !== tag) { add.dataset.dsChatTag = tag; changed++; }
        if (add.dataset.dsTagSaved !== savedValue) { add.dataset.dsTagSaved = savedValue; changed++; }
        if (add.textContent !== icon) { add.textContent = icon; changed++; }
        if (add.title !== title) { add.title = title; changed++; }
        if (add.getAttribute("aria-label") !== title) { add.setAttribute("aria-label", title); changed++; }
      } else if (next?.classList?.contains("ds-chat-tag-add")) {
        next.remove();
        changed++;
      }
    }
    DS.diagOperationEnd?.(token, { scanned, changed, skipped });
  };
})();
