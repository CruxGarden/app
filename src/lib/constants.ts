export const APP_NAME = 'Crux Garden';
export const BG_CSS_VAR = '--background-type';

/** Prefix for per-provider BYOK API keys (localStorage / OS keychain only). */
export const API_KEY_PREFIX = 'cruxgarden:apiKey:';

/**
 * Secrets must never reach the SQLite settings table: the garden backup,
 * sync, and export surfaces serialize that table wholesale (`db.export()`),
 * so exclusion happens here, by construction, not per-consumer.
 */
export function isSecretSettingKey(key: string): boolean {
  return (
    key.startsWith(API_KEY_PREFIX) ||
    key === 'apiKey:anthropic' || // legacy unprefixed SQLite row
    key === SettingsKey.AccessToken ||
    key === SettingsKey.RefreshToken ||
    key === SettingsKey.LegacyAnthropicApiKey
  );
}

/** All settings keys used in getSetting/setSetting. */
export enum SettingsKey {
  // Identity
  LocalAuthorId = 'cruxgarden:localAuthorId',
  LocalAuthorIdLegacy = 'cruxgarden:local:authorId',
  LocalHomeId = 'cruxgarden:local:homeId',
  Backend = 'cruxgarden:backend',

  // Auth tokens (localStorage only, not in SQLite)
  AccessToken = 'cruxgarden:accessToken',
  RefreshToken = 'cruxgarden:refreshToken',

  // Theme & background
  Theme = 'cruxgarden:theme',
  Tint = 'cruxgarden:tint',
  BackgroundType = 'cruxgarden:backgroundType',
  BackgroundImage = 'cruxgarden:backgroundImage',
  BackgroundBlockSize = 'cruxgarden:backgroundBlockSize',

  // Mood
  MoodPresetDark = 'cruxgarden:moodPresetDark',
  MoodPresetLight = 'cruxgarden:moodPresetLight',
  ActiveMoodId = 'cruxgarden:activeMoodId',
  /** Custom theme token overrides layered on the active preset, per mode (JSON) */
  MoodThemeDark = 'cruxgarden:moodThemeDark',
  MoodThemeLight = 'cruxgarden:moodThemeLight',
  /** Presets the user saved from the Mood Builder (JSON array) */
  MoodUserPresets = 'cruxgarden:moodUserPresets',

  // Sound — the Mood's track (see audio/track.ts)
  /** The track the Mood plays (JSON: fingerprint or url, name, type) */
  SoundTrack = 'cruxgarden:soundTrack',
  /** Sound switched on for this Mood ('' = off) */
  SoundEnabled = 'cruxgarden:soundEnabled',
  ResonanceVolume = 'cruxgarden:resonanceVolume',
  ResonanceOptIn = 'cruxgarden:resonanceOptIn',
  ResonancePlaying = 'cruxgarden:resonancePlaying',
  MoodDockState = 'cruxgarden:moodDockState',
  ResonanceCues = 'cruxgarden:resonanceCues',
  /** Installed Mood Packages (JSON array, binaries by fingerprint in the Blob Store) */
  MoodPackages = 'cruxgarden:moodPackages',
  /** Back a crux up to crux.garden whenever it is shared ('true'); set from the share-time prompt */
  BackupOnShare = 'cruxgarden:backupOnShare',
  /** Automatic backup: quiet cruxes and the garden once a day ('true') */
  AutoBackup = 'cruxgarden:autoBackup',
  /** Why automatic backups are paused (a plan limit), or '' */
  AutoBackupPaused = 'cruxgarden:autoBackupPaused',
  /** ISO time of the last automatic garden backup */
  LastGardenBackupAt = 'cruxgarden:lastGardenBackupAt',
  /** The Mood Package last applied in the app (bundled or installed id); the Gateway wears it before services init */
  WornMoodId = 'cruxgarden:wornMoodId',
  /** The bundled Mood the public website wears (localStorage; The Keeper until the visitor picks another) */
  PublicMoodId = 'cruxgarden:publicMoodId',
  /** Index of files the user brought into their Mood (bytes in the Blob Store) */
  MoodAssets = 'cruxgarden:moodAssets',
  /** Cover image fingerprint for the next saved Mood */
  MoodCover = 'cruxgarden:moodCover',
  Persona = 'cruxgarden:persona',
  /** Garden Memory (ADR 0013): one editable memory.md per garden, read into every conversation */
  GardenMemory = 'cruxgarden:memory',

  // AI
  AiEnabled = 'cruxgarden:aiEnabled',
  DefaultModel = 'cruxgarden:defaultModel',
  ApiKeyAnthropic = 'cruxgarden:apiKey:anthropic',

  // Layout
  GlobalLayout = 'cruxgarden:layout:global',

  // Keeper console
  KeeperModel = 'cruxgarden:keeper-model',
  KeeperConversations = 'cruxgarden:keeper-conversations',

  // Misc
  TutorialSeeded = 'cruxgarden:tutorialSeeded',
  ApiKeyBannerDismissed = 'cruxgarden:apiKeyBannerDismissed',

  // Legacy (migration only)
  LegacyAnthropicApiKey = 'cruxgarden:anthropicApiKey',
  LegacyUi = 'cruxgarden:ui',
  LegacyMoodPreset = 'cruxgarden:moodPreset',
  LegacyMoodOverrides = 'cruxgarden:moodOverrides',
  LegacyKeeperHistory = 'cruxgarden:keeper-history',
}
