import type { CatalogMigration } from "./types";

const ENSHROUDED_APP_ID = 2278520;

const CUSTOM_ONLY = ' Only used when gameSettingsPreset is "Custom".';

/**
 * `gameSettings` keys Keen's 1.0 readme lists under "SERVER SETTINGS" rather
 * than the difficulty settings, so their docs make no claim about the preset.
 */
const NOT_PRESET_GATED: ReadonlySet<string> = new Set(["flameLevelFogRemoval"]);

const TAG_OPTIONS =
  "LookingForPlayers, English, German, French, Italian, Japanese, Korean, Polish, Portuguese, Russian, Spanish, Thai, Turkish, Ukrainian, Chinese, Taiwanese, BaseBuilding, Exploration, Roleplay";

/**
 * Top-level, role and ban keys of `enshrouded_server.json`. Key paths use
 * `*` for array entries (`userGroups.*.canKickBan`).
 */
const SERVER_DOCS: ReadonlyArray<readonly [string, string]> = [
  [
    "name",
    'Server name shown in the in-game Join list; players find a dedicated server by this name. Default: "Enshrouded Server".',
  ],
  [
    "password",
    'Legacy (pre-Update 2) server password. No longer used as the join password: if set, the server creates a "default" user group with Friend permissions using it. Use userGroups instead.',
  ],
  [
    "saveDirectory",
    'Folder where the world savegame is stored. Default: "./savegame" (next to the server executable). Backups made by this app always copy the savegame folder next to the server, so moving it breaks backups.',
  ],
  ["logDirectory", 'Folder for the server log files. Default: "./logs".'],
  [
    "ip",
    'IPv4 address the server binds to. Default: "0.0.0.0" (all interfaces). Only change it with a specific reason.',
  ],
  [
    "queryPort",
    "UDP port the server listens on; the 1.0 server reports it as its game port too. Default: 15637. Open it in your firewall/router and change it with caution. Live ops and Admin query this port.",
  ],
  ["slotCount", "Maximum number of players. Range: 1–16. Default: 16."],
  [
    "tags",
    `Server-browser filter tags that help players find a fitting server. Options: ${TAG_OPTIONS}. Default: none.`,
  ],
  ["tags.*", `One server-browser filter tag. Options: ${TAG_OPTIONS}.`],
  [
    "voiceChatMode",
    'Voice chat range: "Proximity" (nearby players) or "Global" (server-wide). Default: "Proximity".',
  ],
  [
    "enableVoiceChat",
    "Turns voice chat on or off for the server. Default: false.",
  ],
  [
    "enableTextChat",
    "Turns text chat on or off for the server. Default: false.",
  ],
  [
    "gameSettingsPreset",
    'Difficulty preset. Options: Default, Relaxed (fewer enemies, more resources and loot), Hard (more and more aggressive enemies), Survival (Hard plus extra survival mechanics), Custom (use the individual gameSettings values). Default: "Default".',
  ],
  [
    "gameSettings",
    'Individual difficulty and gameplay values, only used when gameSettingsPreset is "Custom". Numbers outside a setting\'s range are replaced by its minimum or maximum; invalid text stops the server from booting and shows the bad value in its console.',
  ],
  [
    "userGroups",
    "Player roles. Each role has a password that grants its permissions to whoever joins with it. A fresh config has Admin, Friend, Guest and Visitor with random passwords; you can add your own roles.",
  ],
  ["userGroups.*", "One player role: name, password and permissions."],
  ["userGroups.*.name", "Role name."],
  [
    "userGroups.*.password",
    "Password that grants this role when joining. Keep it set: Keen's help center says a server without a password can be joined by any player.",
  ],
  [
    "userGroups.*.canKickBan",
    "Allows kicking and permanently banning players (in game, from the Social tab). Recommended for admin roles only.",
  ],
  [
    "userGroups.*.canAccessInventories",
    "Allows using chests, workstations, collections and other containers in player bases. Does not affect treasure chests in the open world.",
  ],
  [
    "userGroups.*.canEditWorld",
    "Allows terraforming or destroying the open world outside bases. Turn it off for visitor roles to prevent griefing.",
  ],
  [
    "userGroups.*.canEditBase",
    "Allows building, removing and terraforming inside player bases, including adding or removing water.",
  ],
  [
    "userGroups.*.canExtendBase",
    "Allows placing, removing and upgrading Flame Altars.",
  ],
  [
    "userGroups.*.reservedSlots",
    "Slots held for this role: when only reserved slots are left, the server shows as full to players joining with other roles. Default: 0.",
  ],
  [
    "bannedAccounts",
    "Permanently banned players. Managed in game from the Social tab; edit here only while the server is stopped.",
  ],
  ["bannedAccounts.*", "One banned player."],
  [
    "bannedAccounts.*.accountIDHash",
    "Hashed Steam account ID of the banned player (identifies the account without storing the raw ID).",
  ],
  ["bannedAccounts.*.displayName", "Steam account name of the banned player."],
  ["bannedAccounts.*.characterName", "Character name of the banned player."],
  ["bannedAccounts.*.banDate", "When the ban was made, as a Unix timestamp."],
];

/** `gameSettings.*` keys; each gets the custom-preset note appended. */
const GAME_SETTING_DOCS: ReadonlyArray<readonly [string, string]> = [
  [
    "playerHealthFactor",
    "Scales players' max health (shown in game as a percentage). Range: 0.25–4. Default: 1.",
  ],
  ["playerManaFactor", "Scales players' max mana. Range: 0.25–4. Default: 1."],
  [
    "playerStaminaFactor",
    "Scales players' max stamina. Range: 0.25–4. Default: 1.",
  ],
  [
    "playerBodyHeatFactor",
    "Scales players' body heat against cold; higher lets them stay longer in very cold areas before hypothermia. Range: 0.5–2. Default: 1.",
  ],
  [
    "playerDivingTimeFactor",
    "Scales players' starting oxygen, i.e. time underwater. Range: 0.5–2. Default: 1.",
  ],
  ["enableDurability", "When false, weapons no longer break. Default: true."],
  [
    "enableStarvingDebuff",
    "Enables hunger and starvation: starving players lose health over time until they eat or drink. Default: false.",
  ],
  [
    "foodBuffDurationFactor",
    "Scales how long food buffs last. Range: 0.5–2. Default: 1.",
  ],
  [
    "fromHungerToStarving",
    "How long the hungry state lasts before starvation, in nanoseconds (shown in game as minutes). Range: 5–20 minutes (300000000000–1200000000000). Default: 600000000000 (10 minutes).",
  ],
  [
    "shroudTimeFactor",
    "Scales how long characters can stay inside the Shroud. Range: 0.5–2. Default: 1.",
  ],
  [
    "tombstoneMode",
    'What players lose on death; lost items go to a tombstone where they can be recovered. Options: AddBackpackMaterials (lose materials only), Everything (lose all backpack items), NoTombstone (keep everything). Default: "AddBackpackMaterials".',
  ],
  [
    "enableGliderTurbulences",
    "When false, air turbulence no longer affects the glider (as in earlier versions). Default: true.",
  ],
  [
    "weatherFrequency",
    'How often new weather events appear. Options: Disabled, Rare, Normal, Often. Default: "Normal".',
  ],
  [
    "fishingDifficulty",
    'How strong fish are in the fishing minigame; stronger fish make it last longer. Options: VeryEasy, Easy, Normal, Hard, VeryHard. Default: "Normal".',
  ],
  [
    "miningDamageFactor",
    "Scales mining damage: more terraforming and more resources per hit. Range: 0.5–2. Default: 1.",
  ],
  [
    "plantGrowthSpeedFactor",
    "Scales plant growth speed. Range: 0.25–2. Default: 1.",
  ],
  [
    "resourceDropStackAmountFactor",
    "Scales the amount of materials per loot stack (chests, defeated enemies, etc.). Range: 0.25–2. Default: 1.",
  ],
  [
    "factoryProductionSpeedFactor",
    "Scales production times at workstations. Range: 0.25–2. Default: 1.",
  ],
  [
    "perkUpgradeRecyclingFactor",
    "Share of Runes returned when salvaging upgraded weapons. Range: 0–1. Default in a fresh config: 0.5.",
  ],
  [
    "perkCostFactor",
    "Scales the Runes needed to upgrade weapons. Range: 0.25–2. Default: 1.",
  ],
  [
    "experienceCombatFactor",
    "Scales XP from combat. Range: 0.25–2. Default: 1.",
  ],
  [
    "experienceMiningFactor",
    "Scales XP from mining resources. Range: 0–2. Default: 1.",
  ],
  [
    "experienceExplorationQuestsFactor",
    "Scales XP from exploring and completing quests. Range: 0.25–2. Default: 1.",
  ],
  [
    "randomSpawnerAmount",
    'How many enemies spawn in the world. Options: Few, Normal, Automatic, Many, Extreme. Automatic (new in 1.0) scales the amount of enemies to the size of the party in multiplayer. Default in a fresh 1.0 config: "Automatic".',
  ],
  [
    "aggroPoolAmount",
    'How many enemies may attack at the same time. Options: Few, Normal, Many, Extreme. Default: "Normal".',
  ],
  [
    "enemyDamageFactor",
    "Scales damage from all enemies except bosses. Range: 0.25–5. Default: 1. The values behind this setting were reworked in 1.0, so the same number can feel different than in Early Access.",
  ],
  [
    "enemyHealthFactor",
    "Scales health of all enemies except bosses. Range: 0.25–4. Default: 1.",
  ],
  [
    "enemyStaminaFactor",
    "Scales enemy stamina (higher takes longer to stun), except bosses. Range: 0.5–2. Default: 1.",
  ],
  [
    "enemyPerceptionRangeFactor",
    "Scales how far enemies (not bosses) can see and hear players. Range: 0.5–2. Default: 1.",
  ],
  ["bossDamageFactor", "Scales boss attack damage. Range: 0.2–5. Default: 1."],
  ["bossHealthFactor", "Scales boss health. Range: 0.2–5. Default: 1."],
  [
    "threatBonus",
    "Scales how often enemies (not bosses) attack. Range: 0.25–4. Default: 1.",
  ],
  [
    "pacifyAllEnemies",
    "When true, enemies (not bosses) don't attack until they are attacked. Default: false.",
  ],
  [
    "tamingStartleRepercussion",
    'What happens to taming progress (hearts) when wildlife is startled. Options: KeepProgress, LoseSomeProgress, LoseAllProgress. Default: "LoseSomeProgress".',
  ],
  [
    "dayTimeDuration",
    "Length of daytime in nanoseconds (shown in game as minutes). Range: 2–60 minutes (120000000000–3600000000000). Default: 1800000000000 (30 minutes).",
  ],
  [
    "nightTimeDuration",
    "Length of nighttime in nanoseconds (shown in game as minutes). Range: 2–60 minutes (120000000000–3600000000000). Default: 720000000000 (12 minutes).",
  ],
  [
    "curseModifier",
    'Chance of the Shroud curse from certain enemies\' attacks. Options: Easy (turns the curse off), Normal, Hard (double the chance). Default: "Normal".',
  ],
  [
    "flameLevelFogRemoval",
    "Flame level required before Flame Altars can be placed inside the Shroud (new in 1.0). Range: 0–20. Default: 11.",
  ],
];

/**
 * Config editor tooltips for Enshrouded (`enshrouded_server.json`).
 *
 * Sources (checked 2026-10-15): the `enshrouded_server_readme.txt` shipped
 * with the 1.0 dedicated server (build 25936466, "Version: 1.0.0.0"), Keen's
 * help-center "Server Gameplay Settings" / "Server Roles Configuration"
 * articles, and the 1.0 changelog (Steam, 2026-10-14). Specific claims:
 * - `randomSpawnerAmount` Automatic: changelog — "the amount of enemies is
 *   scaled depending on the size of the party in a multiplayer game".
 * - `enemyDamageFactor` rework: changelog — "Reworked the values for the
 *   enemy damage slider in the server difficulty settings".
 * - Role password: help center (Server Roles Configuration) — "Every player
 *   can see the server and can access it, if no password is set."
 * - Clamping / invalid text (gameSettings): help center (Server Gameplay
 *   Settings).
 * - `saveDirectory` backup note: this app's catalog fixes the Enshrouded save
 *   location to `savegame` (migration 002).
 * Where sources disagree, the config the 1.0 server generates wins: the ban
 * list key is `bannedAccounts` (readme prose says `bans`), a fresh config
 * defaults `randomSpawnerAmount` to "Automatic" (the readme's sample JSON
 * says "Normal") and `perkUpgradeRecyclingFactor` to 0.5 (readme prose says
 * 0.1).
 */
export const migration005EnshroudedSettingDocs: CatalogMigration = {
  version: 5,
  name: "enshrouded_setting_docs",
  up(db) {
    db.exec(`
      CREATE TABLE server_setting_docs (
        app_id INTEGER NOT NULL,
        key_path TEXT NOT NULL,
        description TEXT NOT NULL,
        PRIMARY KEY (app_id, key_path),
        FOREIGN KEY (app_id) REFERENCES servers(app_id) ON DELETE CASCADE
      );
    `);

    const insert = db.prepare(`
      INSERT INTO server_setting_docs (app_id, key_path, description)
      VALUES (@app_id, @key_path, @description)
    `);

    for (const [keyPath, description] of SERVER_DOCS) {
      insert.run({
        app_id: ENSHROUDED_APP_ID,
        key_path: keyPath,
        description,
      });
    }
    for (const [key, description] of GAME_SETTING_DOCS) {
      insert.run({
        app_id: ENSHROUDED_APP_ID,
        key_path: `gameSettings.${key}`,
        description: NOT_PRESET_GATED.has(key)
          ? description
          : `${description}${CUSTOM_ONLY}`,
      });
    }
  },
};
