/**
 * Theme Builder Route
 *
 * A route for creating and editing themes using the ThemeBuilder component
 */

import React, { useState, useEffect } from 'react';
import { Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { View, Text, Loading } from '@/components';
import { ThemeBuilder, dtoToFormData } from '@/components/ThemeBuilder';
import type { ThemeDto } from '@/components/ThemeBuilder';
import { api } from '@/src/lib/api';
import { useTheme } from '@/contexts/ThemeContext';

export default function ThemeBuilderRoute() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { tokens } = useTheme();
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

  const handleSave = async (theme: ThemeDto, key?: string) => {
    try {
      if (key) {
        // Update existing theme
        const result = await api.updateTheme(key, theme);
        console.log('Update successful:', result);
        alert('Theme updated successfully!');
      } else {
        // Create new theme
        const created = await api.createTheme(theme);
        console.log('Create successful:', created);
        alert('Theme created successfully!');
      }
    } catch (err) {
      throw err;
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
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: tokens.spacing.lg }}>
        <Loading />
        <Text style={{ marginTop: tokens.spacing.md, opacity: 0.7 }}>Loading theme...</Text>
      </View>
    );
  }

  // Show error state if theme failed to load
  if (loadError) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: tokens.spacing.lg }}>
        <Text style={{ color: '#e63946', fontSize: 18, marginBottom: tokens.spacing.sm, textAlign: 'center' }}>
          Error: {loadError}
        </Text>
        <Text style={{ opacity: 0.7, textAlign: 'center' }}>Please try again or go back</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ThemeBuilder
        initialData={initialData}
        themeKey={themeKey}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    </View>
  );
}
