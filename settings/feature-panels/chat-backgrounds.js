// Settings markup for chat-backgrounds; safe to omit from a Custom Lite package.
(() => {
  'use strict';
  const profile = window.__DSQ_BUILD_PROFILE__;
  if (profile?.generated && Array.isArray(profile.features) &&
      !profile.features.includes("chat-backgrounds")) return;
  const target = document.getElementById("ds-chat-backgrounds-settings-slot");
  if (!target) return;
  // Build the settings panel from fixed, extension-owned element data.
  // No HTML strings are parsed; this avoids Firefox AMO's unsafe HTML warning.
  const createNode = (spec) => {
    if (typeof spec === 'string') return document.createTextNode(spec);
    const [tag, attributes, ...children] = spec;
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    for (const child of children) node.appendChild(createNode(child));
    return node;
  };
  const layout = [
    "section",
    {
      "class": "card",
      "id": "chatBackgroundsCard"
    },
    [
      "h2",
      {},
      "Custom Pictures → Backgrounds"
    ],
    [
      "p",
      {
        "class": "hint"
      },
      [
        "strong",
        {},
        "Early version / experimental:"
      ],
      " Chat backgrounds are still being refined. Image placement, sizing and compatibility may change as we test them."
    ],
    [
      "label",
      {
        "class": "row"
      },
      [
        "input",
        {
          "id": "enableChatBackgrounds",
          "type": "checkbox"
        }
      ],
      [
        "span",
        {},
        "Enable local custom chat backgrounds"
      ]
    ],
    [
      "label",
      {
        "class": "row"
      },
      [
        "input",
        {
          "id": "chatSceneGalleriesEnabled",
          "type": "checkbox"
        }
      ],
      [
        "span",
        {},
        "Enable scene galleries per conversation (manual image imports, optional)"
      ]
    ],
    [
      "p",
      {
        "class": "hint"
      },
      "Open the QoL extension popup on a chat and choose Custom Pictures to set a picture or switch scenes. Import generated images by saving their files first; QoL does not call SpicyChat's image generator. Six images per chat, at most 1.5 MB each and a global gallery budget of 24 MB."
    ],
    [
      "label",
      {
        "class": "row"
      },
      [
        "input",
        {
          "id": "chatBackgroundUseAvatar",
          "type": "checkbox"
        }
      ],
      [
        "span",
        {},
        "Automatically use the chat character avatar when no custom image is set"
      ]
    ],
    [
      "label",
      {
        "class": "row"
      },
      [
        "input",
        {
          "id": "chatBackgroundAnimateAvatar",
          "type": "checkbox"
        }
      ],
      [
        "span",
        {},
        "Allow animated character backgrounds (may use more CPU/GPU)"
      ]
    ],
    [
      "label",
      {},
      "Chat message opacity (%) ",
      [
        "input",
        {
          "id": "chatBackgroundBubbleOpacity",
          "type": "number",
          "min": "25",
          "max": "100",
          "value": "100"
        }
      ]
    ],
    [
      "p",
      {
        "class": "hint"
      },
      "Avatar mode uses the original character image from SpicyChat's CDN when available (not the tiny chat-header thumbnail). This may download a larger image. Adjust its displayed size or optionally repeat the avatar into the left and right sides of the screen from each chat’s BG menu. Custom images take priority."
    ],
    [
      "p",
      {
        "class": "hint"
      },
      "Imported backgrounds and scenes are stored locally; avatar images are displayed from the CDN without saving a copy. Global backgrounds apply unless overridden for a chat. QoL does not upload background images to SpicyChat."
    ],
    [
      "label",
      {},
      "Background dimming (%) ",
      [
        "input",
        {
          "id": "chatBackgroundDim",
          "max": "90",
          "min": "0",
          "step": "5",
          "type": "number",
          "value": "45"
        }
      ]
    ],
    [
      "label",
      {},
      "Background blur (px) ",
      [
        "input",
        {
          "id": "chatBackgroundBlur",
          "max": "30",
          "min": "0",
          "step": "1",
          "type": "number",
          "value": "0"
        }
      ]
    ],
    [
      "label",
      {},
      "Image fit ",
      [
        "select",
        {
          "id": "chatBackgroundFit"
        },
        [
          "option",
          {
            "value": "cover"
          },
          "Cover"
        ],
        [
          "option",
          {
            "value": "contain"
          },
          "Contain"
        ],
        [
          "option",
          {
            "value": "tile"
          },
          "Tile / repeat"
        ]
      ]
    ],
    [
      "label",
      {},
      "Image position ",
      [
        "select",
        {
          "id": "chatBackgroundPosition"
        },
        [
          "option",
          {
            "value": "center"
          },
          "Center"
        ],
        [
          "option",
          {
            "value": "top"
          },
          "Top"
        ],
        [
          "option",
          {
            "value": "bottom"
          },
          "Bottom"
        ],
        [
          "option",
          {
            "value": "left"
          },
          "Left"
        ],
        [
          "option",
          {
            "value": "right"
          },
          "Right"
        ]
      ]
    ],
    [
      "h3",
      {},
      "Global background"
    ],
    [
      "div",
      {
        "class": "button-row"
      },
      [
        "label",
        {
          "class": "button-link",
          "for": "chatBackgroundGlobalUpload"
        },
        "Choose image"
      ],
      [
        "input",
        {
          "accept": "image/*",
          "hidden": "",
          "id": "chatBackgroundGlobalUpload",
          "type": "file"
        }
      ],
      [
        "button",
        {
          "id": "clearGlobalChatBackground",
          "type": "button"
        },
        "Clear global background"
      ],
      [
        "button",
        {
          "id": "clearPerChatBackgrounds",
          "type": "button"
        },
        "Clear per-chat overrides"
      ]
    ],
    [
      "div",
      {
        "class": "ds-bg-url-entry"
      },
      [
        "label",
        {
          "for": "chatBackgroundGlobalUrl"
        },
        "Or paste an image URL (HTTPS)"
      ],
      [
        "input",
        {
          "id": "chatBackgroundGlobalUrl",
          "type": "url",
          "placeholder": "https://example.com/background.png",
          "autocomplete": "url"
        }
      ],
      [
        "select",
        {
          "id": "chatBackgroundGlobalUrlMode",
          "aria-label": "Image URL storage mode"
        },
        [
          "option",
          {
            "value": "local"
          },
          "Download and save locally (default)"
        ],
        [
          "option",
          {
            "value": "link"
          },
          "Keep URL only (no local copy)"
        ]
      ],
      [
        "button",
        {
          "id": "useGlobalChatBackgroundUrl",
          "type": "button"
        },
        "Use image URL"
      ],
      [
        "button",
        {
          "id": "refreshGlobalChatBackgroundUrl",
          "type": "button"
        },
        "Refresh saved image from original URL"
      ],
      [
        "p",
        {
          "class": "hint",
          "id": "chatBackgroundGlobalUrlStatus",
          "role": "status"
        },
        "Local copies preserve their original URL. Downloading from a new host may require permission; URL-only images depend on the host."
      ]
    ],
    [
      "p",
      {
        "class": "hint",
        "id": "chatBackgroundGlobalStatus"
      },
      "No global image saved."
    ],
    [
      "div",
      {
        "class": "chat-background-preview",
        "hidden": "",
        "id": "chatBackgroundGlobalPreview"
      }
    ],
    [
      "p",
      {
        "class": "hint"
      },
      "Images up to 8 MB can be stored locally. Per-chat overrides are managed from Custom Pictures inside an open conversation. Background image bytes are excluded from normal lightweight QoL backups and are listed separately in Storage Usage."
    ]
  ];
  target.appendChild(createNode(layout));

})();
