import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Switch, Alert } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { useRouter } from 'expo-router';
import { useApp } from './lib/_AppContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function SettingsScreen() {
  const router = useRouter();
  const { account, logout } = useApp();

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
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
      </View>

      {/* User Information */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>User Information</Text>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Email:</Text>
          <Text style={styles.value}>{account?.email}</Text>
        </View>
        {account?.author && (
          <>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Username:</Text>
              <Text style={styles.value}>@{account.author.username}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Display Name:</Text>
              <Text style={styles.value}>{account.author.displayName}</Text>
            </View>
          </>
        )}
        <TouchableOpacity style={styles.linkButton} onPress={() => router.push('/account')}>
          <Text style={styles.linkText}>Manage Account →</Text>
        </TouchableOpacity>
      </View>

      {/* App Preferences */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>App Preferences</Text>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Dark Mode</Text>
            <Text style={styles.settingDescription}>Use dark theme (currently always enabled)</Text>
          </View>
          <Switch
            value={darkMode}
            onValueChange={(value) => {
              setDarkMode(value);
              handleToggleSetting('darkMode', value);
            }}
            trackColor={{ false: '#2d3339', true: '#4dd9b8' }}
            thumbColor={darkMode ? '#0f1214' : '#a0aab5'}
          />
        </View>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Enable Notifications</Text>
            <Text style={styles.settingDescription}>Receive updates and alerts</Text>
          </View>
          <Switch
            value={enableNotifications}
            onValueChange={(value) => {
              setEnableNotifications(value);
              handleToggleSetting('notifications', value);
            }}
            trackColor={{ false: '#2d3339', true: '#4dd9b8' }}
            thumbColor={enableNotifications ? '#0f1214' : '#a0aab5'}
          />
        </View>

        <View style={styles.settingRow}>
          <View style={styles.settingInfo}>
            <Text style={styles.settingLabel}>Auto-Save</Text>
            <Text style={styles.settingDescription}>Automatically save your work</Text>
          </View>
          <Switch
            value={autoSave}
            onValueChange={(value) => {
              setAutoSave(value);
              handleToggleSetting('autoSave', value);
            }}
            trackColor={{ false: '#2d3339', true: '#4dd9b8' }}
            thumbColor={autoSave ? '#0f1214' : '#a0aab5'}
          />
        </View>
      </View>

      {/* Storage & Cache */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Storage & Cache</Text>
        <TouchableOpacity style={styles.actionButton} onPress={handleClearCache}>
          <Text style={styles.actionButtonText}>Clear Cache</Text>
        </TouchableOpacity>
      </View>

      {/* About */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Version:</Text>
          <Text style={styles.value}>1.0.0</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Platform:</Text>
          <Text style={styles.value}>Crux Garden</Text>
        </View>
      </View>

      {/* Sign Out */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: '#0F1214',
  },
  container: {
    padding: 24,
  },
  header: {
    marginBottom: 24,
  },
  backButton: {
    marginBottom: 16,
  },
  backButtonText: {
    color: '#4dd9b8',
    fontSize: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#e8eef2',
  },
  section: {
    marginBottom: 24,
    padding: 16,
    backgroundColor: '#1a1f24',
    borderRadius: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#e8eef2',
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    color: '#a0aab5',
  },
  value: {
    fontSize: 14,
    color: '#e8eef2',
  },
  linkButton: {
    marginTop: 8,
  },
  linkText: {
    color: '#4dd9b8',
    fontSize: 14,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    fontSize: 16,
    color: '#e8eef2',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 12,
    color: '#a0aab5',
  },
  actionButton: {
    backgroundColor: '#2d3339',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#e8eef2',
    fontSize: 16,
    fontWeight: '600',
  },
  logoutButton: {
    backgroundColor: '#e63946',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
