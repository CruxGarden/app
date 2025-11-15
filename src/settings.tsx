import { useState } from 'react';
import { Switch, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from './lib/_AppContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Container, ScrollView, View, Text, Button, Panel, Section, ThemePreview } from '@/components';
import { useTheme, DEFAULT_THEME } from '@/contexts/ThemeContext';
import { computeDesignTokens } from '@/utils/designTokens';

export default function SettingsScreen() {
  const router = useRouter();
  const { account, logout } = useApp();
  const { tokens, theme, resolvedMode } = useTheme();

  // App preferences (stored locally)
  const [enableNotifications, setEnableNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const [autoSave, setAutoSave] = useState(true);

  const handleToggleSetting = async (key: string, value: boolean) => {
    try {
      await AsyncStorage.setItem(`@settings:${key}`, JSON.stringify(value));
    } catch (error) {
      console.error('Failed to save setting:', error);
      Alert.alert('Error', 'Failed to save setting');
    }
  };

  const handleClearCache = async () => {
    Alert.alert('Clear Cache', 'Are you sure you want to clear the app cache?', [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Clear',
        onPress: async () => {
          try {
            // Clear all non-auth data
            const keys = await AsyncStorage.getAllKeys();
            const cacheKeys = keys.filter(
              (key) => !key.startsWith('@cruxgarden:') && !key.startsWith('@settings:')
            );
            await AsyncStorage.multiRemove(cacheKeys);
            Alert.alert('Success', 'Cache cleared successfully');
          } catch (error) {
            console.error('Failed to clear cache:', error);
            Alert.alert('Error', 'Failed to clear cache');
          }
        },
      },
    ]);
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Sign Out',
        onPress: () => {
          logout();
          router.replace('/');
        },
      },
    ]);
  };

  return (
    <ScrollView>
      <Container padded>
        <View style={{ marginBottom: tokens.spacing.lg }}>
          <Button
            title="← Back"
            variant="ghost"
            onPress={() => router.back()}
            style={{ alignSelf: 'flex-start', marginBottom: tokens.spacing.md }}
          />
          <Text variant="heading" weight="bold">
            Settings
          </Text>
        </View>

        {/* User Information */}
        <Section title="User Information">
          <View style={{ gap: tokens.spacing.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ opacity: 0.7 }}>Email:</Text>
              <Text>{account?.email}</Text>
            </View>
            {account?.author && (
              <>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ opacity: 0.7 }}>Username:</Text>
                  <Text>@{account.author.username}</Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ opacity: 0.7 }}>Display Name:</Text>
                  <Text>{account.author.displayName}</Text>
                </View>
              </>
            )}
            <Button
              title="Manage Account →"
              variant="ghost"
              onPress={() => router.push('/account')}
              style={{ alignSelf: 'flex-start', marginTop: tokens.spacing.sm }}
            />
          </View>
        </Section>

        {/* Active Theme */}
        <Section title="Active Theme">
          {(() => {
            const previewTheme = theme || DEFAULT_THEME;
            const previewTokens = computeDesignTokens(previewTheme, resolvedMode);

            return (
              <>
                <View
                  style={{
                    backgroundColor: previewTokens.colors.panel,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor: previewTokens.colors.border,
                    padding: tokens.spacing.md,
                    marginBottom: tokens.spacing.md,
                  }}
                >
                  <ThemePreview theme={previewTheme} size="medium" showDetails={true} />
                </View>
                <Button
                  title="Change Theme →"
                  variant="secondary"
                  onPress={() => router.push('/theme-search')}
                  fullWidth
                />
              </>
            );
          })()}
        </Section>

        {/* App Preferences */}
        <Section title="App Preferences">
          <View style={{ gap: tokens.spacing.lg }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <View style={{ flex: 1, marginRight: tokens.spacing.md }}>
                <Text style={{ marginBottom: 4 }}>Dark Mode</Text>
                <Text style={{ fontSize: 12, opacity: 0.7 }}>
                  Use dark theme (currently always enabled)
                </Text>
              </View>
              <Switch
                value={darkMode}
                onValueChange={(value) => {
                  setDarkMode(value);
                  handleToggleSetting('darkMode', value);
                }}
                trackColor={{
                  false: tokens.colors.border,
                  true: tokens.colors.buttonBackground.type === 'solid'
                    ? tokens.colors.buttonBackground.value
                    : tokens.colors.primary
                }}
                thumbColor={tokens.colors.panel}
              />
            </View>

            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <View style={{ flex: 1, marginRight: tokens.spacing.md }}>
                <Text style={{ marginBottom: 4 }}>Enable Notifications</Text>
                <Text style={{ fontSize: 12, opacity: 0.7 }}>Receive updates and alerts</Text>
              </View>
              <Switch
                value={enableNotifications}
                onValueChange={(value) => {
                  setEnableNotifications(value);
                  handleToggleSetting('notifications', value);
                }}
                trackColor={{
                  false: tokens.colors.border,
                  true: tokens.colors.buttonBackground.type === 'solid'
                    ? tokens.colors.buttonBackground.value
                    : tokens.colors.primary
                }}
                thumbColor={tokens.colors.panel}
              />
            </View>

            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <View style={{ flex: 1, marginRight: tokens.spacing.md }}>
                <Text style={{ marginBottom: 4 }}>Auto-Save</Text>
                <Text style={{ fontSize: 12, opacity: 0.7 }}>Automatically save your work</Text>
              </View>
              <Switch
                value={autoSave}
                onValueChange={(value) => {
                  setAutoSave(value);
                  handleToggleSetting('autoSave', value);
                }}
                trackColor={{
                  false: tokens.colors.border,
                  true: tokens.colors.buttonBackground.type === 'solid'
                    ? tokens.colors.buttonBackground.value
                    : tokens.colors.primary
                }}
                thumbColor={tokens.colors.panel}
              />
            </View>
          </View>
        </Section>

        {/* Storage & Cache */}
        <Section title="Storage & Cache">
          <Button
            title="Clear Cache"
            variant="secondary"
            onPress={handleClearCache}
            fullWidth
          />
        </Section>

        {/* About */}
        <Section title="About">
          <View style={{ gap: tokens.spacing.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ opacity: 0.7 }}>Version:</Text>
              <Text>1.0.0</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ opacity: 0.7 }}>Platform:</Text>
              <Text>Crux Garden</Text>
            </View>
          </View>
        </Section>

        {/* Sign Out */}
        <Panel>
          <Button
            title="Sign Out"
            variant="secondary"
            onPress={handleLogout}
            fullWidth
          />
        </Panel>
      </Container>
    </ScrollView>
  );
}
