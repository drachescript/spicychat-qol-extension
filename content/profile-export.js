(() => {
  "use strict";
  const DS = window.DragonScriptQoL;
  if (!DS) return;
  const BTN_ID = "ds-profile-export-button";
  const MODAL_ID = "ds-profile-export-modal";

  const clean = value => String(value || "").replace(/\s+/g, " ").trim();
  const rawText = node => String(node?.innerText || node?.textContent || "").trim();
  const esc = value => String(value || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

  function publicSchema() {
    for (const script of document.querySelectorAll("script[type='application/ld+json']")) {
      try {
        const parsed = JSON.parse(script.textContent || "{}");
        const graph = Array.isArray(parsed?.["@graph"]) ? parsed["@graph"] : [parsed];
        const page = graph.find(item => item?.["@type"] === "WebPage");
        if (page) return page;
      } catch {}
    }
    return null;
  }

  function botId() { return location.pathname.match(/^\/(?:[a-z]{2}\/)?chatbot\/([0-9a-f-]{20,})(?:[/?#]|$)/i)?.[1] || ""; }
  function section(labels) {
    const wanted = labels.map(value => value.toLowerCase());
    const tidy = value => String(value || "").replace(/\n?\s*SHOW (?:LESS|MORE)\s*$/i, "").trim();
    for (const heading of document.querySelectorAll("h1,h2,h3,h4,p,strong,span")) {
      const label = clean(heading.textContent).toLowerCase();
      if (!wanted.includes(label)) continue;

      const direct = heading.nextElementSibling;
      const directText = tidy(rawText(direct));
      if (directText && directText.length < 20000) return directText;

      const container = heading.parentElement;
      if (container) {
        const children = [...container.children];
        const index = children.indexOf(heading);
        for (const sibling of children.slice(index + 1)) {
          const text = tidy(rawText(sibling));
          if (text && text.length < 20000 && !/^SHOW (?:LESS|MORE)$/i.test(text)) return text;
        }
      }
    }
    return "";
  }
  function collect() {
    const id = botId();
    const schema = publicSchema();
    const h1 = clean(document.querySelector("h1")?.textContent || schema?.name);
    const creator = clean(document.querySelector("a[aria-label='creator-profile'], a[href*='/creator/']")?.textContent || schema?.author?.name);
    const image = document.querySelector("meta[property='og:image']")?.content || schema?.image?.url || schema?.image?.contentUrl || document.querySelector("img[alt='avatar image']")?.src || "";
    const description = clean(schema?.description || document.querySelector("meta[name='description']")?.content || "");
    const tags = [...document.querySelectorAll("[data-testid^='TagSuggestionItem-'], a[aria-label^='tag-']")]
      .map(el => clean(el.textContent)).filter(Boolean).filter((v,i,a) => a.indexOf(v)===i).filter(v => v.length < 80);
    const data = {
      id, name: h1 || clean(document.title.replace(/\s*-\s*Explore.*$/i,"")), creator,
      profileUrl: location.href.split("?")[0], image, description,
      tags,
      greeting: section(["Greeting"]),
      personality: section(["Personality"]),
      scenario: section(["Scenario"]),
      exampleDialogue: section(["Example Dialogue","Example Dialogues"]),
      exportedAt: new Date().toISOString(), source: "SpicyChat public profile"
    };
    return data;
  }
  function markdown(d) {
    const lines = [`# ${d.name || "SpicyChat bot"}`, "", d.creator ? `Creator: ${d.creator}` : "", `Profile: ${d.profileUrl}`, d.tags.length ? `Tags: ${d.tags.join(", ")}` : "", ""];
    for (const [label,key] of [["Description","description"],["Greeting","greeting"],["Personality","personality"],["Scenario","scenario"],["Example Dialogue","exampleDialogue"]]) if (d[key]) lines.push(`## ${label}`, "", d[key], "");
    return lines.filter((line,i,a)=>line!=="" || a[i-1]!=="").join("\n");
  }
  function html(d) {
    const block = (label,value) => value ? `<section><h2>${esc(label)}</h2><div class="text">${esc(value).replace(/\n/g,"<br>")}</div></section>` : "";
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(d.name)}</title><style>body{max-width:900px;margin:40px auto;padding:0 20px;background:#111;color:#eee;font:16px/1.55 system-ui}a{color:#8ab4ff}.tags{display:flex;gap:6px;flex-wrap:wrap}.tags span{padding:3px 8px;background:#26262b;border-radius:999px}section{border-top:1px solid #333;margin-top:22px;padding-top:10px}.text{white-space:pre-wrap}</style></head><body><h1>${esc(d.name)}</h1>${d.creator?`<p>${esc(d.creator)}</p>`:""}<p><a href="${esc(d.profileUrl)}">Original SpicyChat profile</a></p>${d.tags.length?`<div class="tags">${d.tags.map(t=>`<span>${esc(t)}</span>`).join("")}</div>`:""}${block("Description",d.description)}${block("Greeting",d.greeting)}${block("Personality",d.personality)}${block("Scenario",d.scenario)}${block("Example Dialogue",d.exampleDialogue)}<p><small>Exported ${esc(d.exportedAt)}</small></p></body></html>`;
  }
  function filename(name, ext) { return `${clean(name||"spicychat-bot").replace(/[^a-z0-9._-]+/gi,"-").replace(/^-+|-+$/g,"") || "spicychat-bot"}.${ext}`; }
  function download(text, name, type) { const blob=new Blob([text],{type}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000); }
  function open() {
    document.getElementById(MODAL_ID)?.remove();
    const d=collect(); const modal=document.createElement("div"); modal.id=MODAL_ID;
    Object.assign(modal.style,{position:"fixed",inset:"0",zIndex:"1000000",background:"rgba(0,0,0,.55)",display:"flex",alignItems:"center",justifyContent:"center",padding:"16px"});
    DS.setSafeMarkup?.(modal, `<div style="width:min(760px,96vw);max-height:90vh;overflow:auto;background:#17181b;color:#f5f5f5;border:1px solid #444;border-radius:14px;padding:18px;font:14px system-ui"><div style="display:flex;justify-content:space-between;gap:10px"><div><h2 style="margin:0 0 6px">Export bot profile</h2><div style="opacity:.75">Exports only fields SpicyChat exposes on this profile. Hidden/private definition fields are not guessed.</div></div><button data-close>×</button></div><p data-summary></p><div style="display:flex;gap:8px;flex-wrap:wrap"><button data-json>JSON</button><button data-md>Markdown</button><button data-html>HTML archive</button><button data-copy>Copy Markdown</button></div><pre data-preview style="white-space:pre-wrap;max-height:45vh;overflow:auto;border:1px solid #333;padding:10px;border-radius:8px"></pre></div>`);
    const summary = modal.querySelector("[data-summary]");
    const strong = document.createElement("strong"); strong.textContent = d.name || "SpicyChat bot";
    summary.append(strong, document.createTextNode(` · ${d.tags.length} visible tags`));
    modal.querySelector("[data-preview]").textContent = markdown(d);
    document.documentElement.appendChild(modal);
    modal.querySelector("[data-close]").onclick=()=>modal.remove(); modal.onclick=e=>{if(e.target===modal)modal.remove();};
    modal.querySelector("[data-json]").onclick=()=>download(JSON.stringify(d,null,2),filename(d.name,"json"),"application/json;charset=utf-8");
    modal.querySelector("[data-md]").onclick=()=>download(markdown(d),filename(d.name,"md"),"text/markdown;charset=utf-8");
    modal.querySelector("[data-html]").onclick=()=>download(html(d),filename(d.name,"html"),"text/html;charset=utf-8");
    modal.querySelector("[data-copy]").onclick=async()=>{try{await navigator.clipboard.writeText(markdown(d)); DS.setQuickStatus?.("Profile Markdown copied.");}catch{}};
  }
  function cleanup(){document.getElementById(BTN_ID)?.remove();document.getElementById(MODAL_ID)?.remove();}
  DS.applyProfileExport = function(){ const s=DS.state.settings||{}; if(!s.enabled||!s.enableProfileExport||!DS.isBotProfilePage?.()) return cleanup(); let b=document.getElementById(BTN_ID); if(b)return; const h=document.querySelector("h1"); if(!h)return; b=document.createElement("button");b.id=BTN_ID;b.type="button";b.textContent="Export";b.title="Export the visible public profile as JSON, Markdown, or HTML";b.style.cssText="margin-left:8px;border:1px solid rgba(148,163,184,.35);border-radius:7px;background:transparent;color:inherit;padding:5px 9px;cursor:pointer;font:600 12px system-ui";b.onclick=e=>{e.preventDefault();e.stopPropagation();open();};h.insertAdjacentElement("afterend",b);};
  DS.removeProfileExport=cleanup;
})();
