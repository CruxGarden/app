/**
 * Theme Builder Route
 *
 * A route for creating and editing themes using the ThemeBuilder component
 */

import React, { useState, useEffect } from 'react';
import { View, Alert, ActivityIndicator, Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ThemeBuilder, dtoToFormData } from '@/components/ThemeBuilder';
import type { ThemeDto } from '@/components/ThemeBuilder';
import { api } from '@/src/lib/api';

export default function ThemeBuilderRoute() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const themeKey = typeof params.themeKey === 'string' ? params.themeKey : undefined;

  const [initialData, setInitialData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(!!themeKey);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Fetch theme data if editing
  useEffect(() => {
    if (themeKey) {
      loadTheme();
    }
  }, [themeKey]);

  const loadTheme = async () => {
    try {
      setIsLoading(true);
      const theme = await api.getTheme(themeKey!);
      const formData = dtoToFormData(theme);
      setInitialData(formData);
    } catch (error) {
      console.error('Failed to load theme:', error);
      setLoadError(error instanceof Error ? error.message : 'Failed to load theme');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (theme: ThemeDto) => {
    try {
      if (themeKey) {
        // Update existing theme
        await api.updateTheme(themeKey, theme);
        Alert.alert(
          'Success',
          'Theme updated successfully!',
          [
            {
              text: 'OK',
              onPress: () => router.back(),
            },
          ]
        );
      } else {
        // Create new theme
        const created = await api.createTheme(theme);
        Alert.alert(
          'Success',
          'Theme created successfully!',
          [
            {
              text: 'OK',
              onPress: () => router.back(),
            },
          ]
        );
      }
    } catch (error) {
      console.error('Failed to save theme:', error);
      throw error;
    }
  };

  const handleCancel = () => {
    Alert.alert(
      'Cancel',
      'Are you sure you want to discard your changes?',
      [
        {
          text: 'No',
          style: 'cancel',
        },
        {
          text: 'Yes',
          style: 'destructive',
          onPress: () => router.back(),
        },
      ]
    );
  };

  // Show loading state while fetching theme
  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#4dd9b8" />
        <Text style={styles.loadingText}>Loading theme...</Text>
      </View>
    );
  }

  // Show error state if theme failed to load
  if (loadError) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorText}>Error: {loadError}</Text>
        <Text style={styles.errorHint}>Please try again or go back</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ThemeBuilder
        initialData={initialData}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1214',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#8b9298',
  },
  errorText: {
    fontSize: 18,
    color: '#e74c3c',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorHint: {
    fontSize: 14,
    color: '#8b9298',
    textAlign: 'center',
  },
});
