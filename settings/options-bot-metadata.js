// Bot, Lorebook and saved-list identity/field metadata.
const managerAnimatedImageState = new Map();
let managerAnimationGuardInstalled = false;



















// Converts common Unicode "fancy text" letters and digits to ASCII even on
// older Android WebViews where String.normalize("NFKC") can be incomplete.


const SMALL_CAP_LATIN_MAP = new Map(Object.entries({
  "ᴀ":"a", "ʙ":"b", "ᴄ":"c", "ᴅ":"d", "ᴇ":"e", "ꜰ":"f", "ɢ":"g", "ʜ":"h",
  "ɪ":"i", "ᴊ":"j", "ᴋ":"k", "ʟ":"l", "ᴍ":"m", "ɴ":"n", "ᴏ":"o", "ᴘ":"p",
  "ʀ":"r", "ꜱ":"s", "ᴛ":"t", "ᴜ":"u", "ᴠ":"v", "ᴡ":"w", "ʏ":"y", "ᴢ":"z"
}));





























































































// OOC template/editor helpers live in settings/options-ooc.js.











































const BOT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BOT_AVAILABILITY_STATUSES = new Set(["available", "unavailable", "restricted", "unknown"]);
const BOT_UPDATE_STATUSES = new Set(["current", "updated"]);
const BOT_DUPLICATE_LEVELS = new Set(["exact", "likely", "possible"]);
const BOT_SNAPSHOT_FIELDS = ["name", "title", "description", "greeting", "personality", "scenario", "exampleDialogues", "tags", "visibility", "creator", "image"];
const BOT_ARCHIVE_FIELDS = [
  "name", "title", "description", "greeting", "personality", "scenario",
  "exampleDialogues", "tags", "visibility", "creator", "image",
  "messageCount", "rating", "tokenCount"
];
const BOT_VERSION_FIELDS = ["name", "title", "greeting", "personality", "scenario", "exampleDialogues", "tags", "image"];
const BOT_VERSION_LABELS = {
  name: "Name",
  title: "Title",
  greeting: "Greeting",
  personality: "Personality",
  scenario: "Scenario",
  exampleDialogues: "Example Dialogues",
  tags: "Tags",
  image: "Avatar / image",
  lorebook: "Lorebook"
};
const BOT_ARCHIVE_LABELS = {
  name: "Name",
  title: "Title",
  description: "Description",
  greeting: "Greeting",
  personality: "Personality",
  scenario: "Scenario",
  exampleDialogues: "Example Dialogues",
  tags: "Tags",
  visibility: "Visibility",
  creator: "Creator",
  image: "Avatar / image",
  messageCount: "Messages",
  rating: "Rating",
  tokenCount: "Profile tokens"
};

const BOT_SNAPSHOT_LABELS = {
  name: "Name",
  title: "Title",
  description: "Description",
  greeting: "Greeting",
  personality: "Personality",
  scenario: "Scenario",
  exampleDialogues: "Example Dialogues",
  tags: "Tags",
  visibility: "Visibility",
  creator: "Creator",
  image: "Avatar / image"
};











































































































































let lorebookCenterRows = [];
let lorebookCenterVisibleCount = 20;



























































