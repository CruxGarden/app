export const APP_NAME = 'Crux Garden';
export const BG_CSS_VAR = '--background-type';

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
  Persona = 'cruxgarden:persona',

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
