// Feature-owned options helpers: release-notes. Full QoL and Custom use the same source.
// Shared storage/settings state remains in the core controller for now.

async function markUpdatesSeen() {
  const version = chrome.runtime.getManifest?.().version || "";
  if (!version) return;
  await storageSet({ [LAST_SEEN_VERSION_KEY]: version, [RELEASE_NOTICE_KEY]: null });
  applyFeatureChangeBadges(version);
  showSettingsToast("New/updated setting markers cleared.");
}

function promiseWithTimeout(promise, timeoutMs, label = "operation") {
  let timer = 0;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
    })
  ]).finally(() => clearTimeout(timer));
}

async function readBundledOptionsText(name) {
  const filename = String(name || "").trim();
  if (!filename) throw new Error("Missing bundled text filename");

  // Android Options is rendered from an in-memory HTML document. Older
  // WebView builds can leave fetch(CHANGELOG.md) pending forever even though
  // the APK already exposes the file through optionsReadBundledText. Prefer
  // that native path directly instead of depending on fetch interception.
  if (window.__spicyChatQolAndroidWebView || window.__spicyChatQolAndroidApp) {
    try {
      const bridge = window.flutter_inappwebview;
      if (bridge?.callHandler) {
        const text = await promiseWithTimeout(
          bridge.callHandler("optionsReadBundledText", filename),
          3500,
          `Android ${filename} bridge`
        );
        if (typeof text === "string" && text.trim()) return text;
      }
    } catch (error) {
      console.warn(`[DS Options] Native ${filename} read failed; trying packaged fetch.`, error);
    }
  }

  const url = chrome.runtime?.getURL?.(filename) || filename;
  const response = await promiseWithTimeout(
    fetch(url, { cache: "no-store" }),
    5000,
    `${filename} fetch`
  );
  if (!response?.ok) throw new Error(`${filename} returned HTTP ${response?.status || 0}`);
  return await promiseWithTimeout(response.text(), 3000, `${filename} text read`);
}

async function loadChangelog({ force = false } = {}) {
  const host = $("changelogContent");
  if (!host || (!force && host.dataset.loaded === "1")) return;
  if (!force && host.dataset.loading === "1") return;

  host.dataset.loading = "1";
  if (force) {
    delete host.dataset.loaded;
    host.textContent = "Loading changelog...";
  }

  try {
    const text = await readBundledOptionsText("CHANGELOG.md");
    const blocks = text
      .split(/\n(?=##\s+)/g)
      .map(block => block.trim())
      .filter(block => /^##\s+/.test(block));

    const plainReleaseText = value => String(value || "")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .trim();

    const nodes = blocks.map(block => {
      const lines = block.split(/\n+/).map(line => line.trim()).filter(Boolean);
      const title = plainReleaseText(lines.shift().replace(/^##\s+/, ""));
      const items = lines
        .map(line => plainReleaseText(line.replace(/^[-*]\s+/, "").trim()))
        .filter(Boolean);
      const wrapper = makeElement("div", { className: "changelog-version" });
      wrapper.appendChild(makeElement("h3", { text: title }));
      const list = makeElement("ul");
      items.forEach(item => list.appendChild(makeElement("li", { text: item })));
      wrapper.appendChild(list);
      return wrapper;
    });

    if (nodes.length) {
      const recentLimit = 10;
      const recent = nodes.slice(0, recentLimit);
      const older = nodes.slice(recentLimit);
      if (older.length) {
        const more = makeElement("details", { className: "changelog-older" });
        const summary = makeElement("summary", { text: `Read older updates (${older.length})` });
        const olderList = makeElement("div", { className: "changelog-older-list" });
        older.forEach(node => olderList.appendChild(node));
        more.append(summary, olderList);
        host.replaceChildren(...recent, more);
      } else {
        host.replaceChildren(...recent);
      }
    } else {
      host.textContent = "No changelog entries yet.";
    }

    host.dataset.loaded = "1";
  } catch (error) {
    console.error("[DS Options] Could not load changelog", error);
    const message = makeElement("span", { text: "Could not load the changelog. " });
    const retry = makeElement("button", { text: "Retry", attrs: { type: "button" } });
    retry.addEventListener("click", () => loadChangelog({ force: true }));
    host.replaceChildren(message, retry);
  } finally {
    delete host.dataset.loading;
  }
}
