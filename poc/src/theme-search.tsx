import { useState, useEffect } from 'react';
import { Alert, SectionList } from 'react-native';
import { useRouter } from 'expo-router';
import { Container, View, Text, Button, Loading, Pressable, ThemePreview } from '@/components';
import { useTheme, DEFAULT_THEME } from '@/contexts/ThemeContext';
import { api, type Theme as ApiTheme } from './lib/api';
import type { Theme } from '@/utils/designTokens';
import { computeDesignTokens } from '@/utils/designTokens';
import { useApp } from './lib/_AppContext';

interface ThemeSection {
  title: string;
  data: Theme[];
}

// Helper to map font family to actual Expo font names
const mapFontFamily = (fontFamily: string): string => {
  const fontMap: { [key: string]: string } = {
    'IBMPlexSans-Regular': 'IBMPlexSans_400Regular',
    'IBMPlexSans-SemiBold': 'IBMPlexSans_600SemiBold',
    'IBMPlexSerif-Regular': 'IBMPlexSerif_400Regular',
    'IBMPlexSerif-SemiBold': 'IBMPlexSerif_600SemiBold',
    'IBMPlexMono-Regular': 'IBMPlexMono_400Regular',
    'IBMPlexMono-SemiBold': 'IBMPlexMono_600SemiBold',
  };
  return fontMap[fontFamily] || fontFamily;
};

export default function ThemeSearchScreen() {
  const router = useRouter();
  const { tokens, theme: activeTheme, setTheme, resolvedMode } = useTheme();
  const { account } = useApp();
  const [sections, setSections] = useState<ThemeSection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSelecting, setIsSelecting] = useState(false);

  useEffect(() => {
    loadThemes();
  }, []);

  const loadThemes = async () => {
    try {
      setIsLoading(true);
      const apiThemes = await api.getThemes();

      // Separate API themes into built-in and user-created using system boolean
      const builtInApiThemes = apiThemes.filter((t: ApiTheme) => t.system);
      const userApiThemes = apiThemes.filter((t: ApiTheme) => !t.system);

      // Convert to app Theme format (include system and authorId fields)
      const builtInThemes: Theme[] = builtInApiThemes.map((apiTheme: ApiTheme) => ({
        key: apiTheme.key,
        title: apiTheme.title,
        description: apiTheme.description,
        type: apiTheme.type,
        kind: apiTheme.kind,
        meta: apiTheme.meta,
        system: apiTheme.system,
        authorId: apiTheme.authorId,
      }));

      const userThemes: Theme[] = userApiThemes.map((apiTheme: ApiTheme) => ({
        key: apiTheme.key,
        title: apiTheme.title,
        description: apiTheme.description,
        type: apiTheme.type,
        kind: apiTheme.kind,
        meta: apiTheme.meta,
        system: apiTheme.system,
        authorId: apiTheme.authorId,
      }));

      // Create sections
      const themeSections: ThemeSection[] = [
        {
          title: 'Built-in Themes',
          data: builtInThemes,
        },
      ];

      // Only add "Your Themes" section if user has themes
      if (userThemes.length > 0) {
        themeSections.push({
          title: 'Your Themes',
          data: userThemes,
        });
      }

      setSections(themeSections);
    } catch (error) {
      console.error('Failed to load themes:', error);
      Alert.alert('Error', 'Failed to load themes. Please try again.');
      // Empty sections on error - user can retry
      setSections([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectTheme = async (theme: Theme) => {
    try {
      setIsSelecting(true);

      // If selecting default theme, set to null
      const themeToSet = theme.key === 'default' ? null : theme;

      await setTheme(themeToSet);

      Alert.alert('Success', `Theme changed to "${theme.title}"`, [
        {
          text: 'OK',
          onPress: () => router.back(),
        },
      ]);
    } catch (error) {
      console.error('Failed to set theme:', error);
      Alert.alert('Error', 'Failed to change theme. Please try again.');
    } finally {
      setIsSelecting(false);
    }
  };

  const handleDeleteTheme = async (theme: Theme) => {
    console.log('handleDeleteTheme called for:', theme.title, theme.key);

    // Use window.confirm for web compatibility
    const confirmed = window.confirm(
      `Are you sure you want to delete "${theme.title}"? This action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      setIsSelecting(true);
      await api.deleteTheme(theme.key);
      // Remove from sections
      setSections((prevSections) =>
        prevSections
          .map((section) => ({
            ...section,
            data: section.data.filter((t) => t.key !== theme.key),
          }))
          .filter((section) => section.data.length > 0)
      );
      Alert.alert('Success', 'Theme deleted successfully');
    } catch (error) {
      console.error('Failed to delete theme:', error);
      Alert.alert('Error', 'Failed to delete theme. Please try again.');
    } finally {
      setIsSelecting(false);
    }
  };

  const renderThemeItem = ({ item }: { item: Theme }) => {
    const isActive = item.key === (activeTheme?.key || 'default');
    const isOwner = (item as any).authorId === account?.author?.id;
    const canEdit = isOwner && !(item as any).system;

    // Compute tokens for THIS theme (not the active theme)
    const itemTokens = computeDesignTokens(item, resolvedMode);

    return (
      <View
        backgroundColor={itemTokens.colors.panel}
        style={{
          padding: tokens.spacing.md,
          borderRadius: 12,
          borderWidth: isActive ? 2 : 1,
          borderColor: itemTokens.colors.border,
          marginBottom: tokens.spacing.md,
          opacity: isSelecting ? 0.5 : 1,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ width: 100 }}>
            <ThemePreview theme={item} size="small" showDetails={false} />
          </View>
          <View style={{ flex: 1, marginLeft: tokens.spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text
                color={itemTokens.colors.text}
                style={{
                  fontFamily: mapFontFamily(itemTokens.typography.fontFamily.heading),
                  fontSize: 16,
                  fontWeight: '600',
                  flex: 1,
                }}
              >
                {item.title}
              </Text>
              {isActive && (
                <Text
                  color={itemTokens.colors.primary}
                  style={{
                    fontFamily: mapFontFamily(itemTokens.typography.fontFamily.body),
                    fontSize: 12,
                    fontWeight: '600',
                    marginLeft: 8,
                  }}
                >
                  ACTIVE
                </Text>
              )}
            </View>
            {item.description && (
              <Text
                color={itemTokens.colors.text}
                style={{
                  fontFamily: mapFontFamily(itemTokens.typography.fontFamily.body),
                  fontSize: 13,
                  opacity: 0.7,
                  marginTop: 4,
                }}
                numberOfLines={2}
              >
                {item.description}
              </Text>
            )}
            {(item as any).system && (
              <Text
                color={itemTokens.colors.text}
                style={{
                  fontFamily: mapFontFamily(itemTokens.typography.fontFamily.body),
                  fontSize: 11,
                  opacity: 0.5,
                  fontStyle: 'italic',
                  marginTop: 4,
                }}
              >
                System Theme
              </Text>
            )}
          </View>
        </View>

        {/* Action Buttons */}
        <View style={{ flexDirection: 'row', marginTop: tokens.spacing.md, flexWrap: 'wrap' }}>
          {/* Apply Button */}
          <Pressable
            onPress={() => handleSelectTheme(item)}
            disabled={isSelecting || isActive}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 16,
              borderRadius: 8,
              backgroundColor: isActive
                ? 'transparent'
                : itemTokens.colors.buttonBackground.type === 'solid'
                  ? itemTokens.colors.buttonBackground.value
                  : itemTokens.colors.primary,
              borderWidth: isActive ? 1 : 0,
              borderColor: itemTokens.colors.border,
              opacity: isSelecting || isActive ? 0.5 : 1,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: tokens.spacing.sm,
              marginBottom: tokens.spacing.sm,
            }}
          >
            <Text
              color={isActive ? itemTokens.colors.text : itemTokens.colors.buttonText}
              style={{
                fontFamily: mapFontFamily(itemTokens.typography.fontFamily.body),
                fontSize: 14,
                fontWeight: '600',
              }}
            >
              Apply
            </Text>
          </Pressable>

          {/* Edit button (only for owned non-system themes) */}
          {canEdit && (
            <Pressable
              onPress={() => router.push(`/theme-builder?themeKey=${item.key}`)}
              disabled={isSelecting}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 16,
                borderRadius: 8,
                backgroundColor: 'transparent',
                borderWidth: 1,
                borderColor: itemTokens.colors.border,
                opacity: isSelecting ? 0.5 : 1,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: tokens.spacing.sm,
                marginBottom: tokens.spacing.sm,
              }}
            >
              <Text
                color={itemTokens.colors.text}
                style={{
                  fontFamily: mapFontFamily(itemTokens.typography.fontFamily.body),
                  fontSize: 14,
                  fontWeight: '600',
                }}
              >
                Edit
              </Text>
            </Pressable>
          )}

          {/* Clone button (for everyone) */}
          <Pressable
            onPress={() => router.push(`/theme-builder?cloneFrom=${item.key}`)}
            disabled={isSelecting}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 16,
              borderRadius: 8,
              backgroundColor: 'transparent',
              borderWidth: 1,
              borderColor: itemTokens.colors.border,
              opacity: isSelecting ? 0.5 : 1,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: tokens.spacing.sm,
              marginBottom: tokens.spacing.sm,
            }}
          >
            <Text
              color={itemTokens.colors.text}
              style={{
                fontFamily: mapFontFamily(itemTokens.typography.fontFamily.body),
                fontSize: 14,
                fontWeight: '600',
              }}
            >
              Clone
            </Text>
          </Pressable>

          {/* Delete button (only for owned non-system themes) */}
          {canEdit && (
            <Pressable
              onPress={() => handleDeleteTheme(item)}
              disabled={isSelecting}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 16,
                borderRadius: 8,
                backgroundColor: 'transparent',
                borderWidth: 1,
                borderColor: '#e63946',
                opacity: isSelecting ? 0.5 : 1,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: tokens.spacing.sm,
              }}
            >
              <Text
                color="#e63946"
                style={{
                  fontFamily: mapFontFamily(itemTokens.typography.fontFamily.body),
                  fontSize: 14,
                  fontWeight: '600',
                }}
              >
                Delete
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  };

  if (isLoading) {
    return (
      <Container padded>
        <View style={{ marginBottom: tokens.spacing.lg }}>
          <Button
            title="← Back"
            variant="ghost"
            onPress={() => router.back()}
            style={{ alignSelf: 'flex-start', marginBottom: tokens.spacing.md }}
          />
          <Text variant="heading" weight="bold">
            Theme Search
          </Text>
        </View>
        <Loading size="large" />
      </Container>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: tokens.colors.background }}>
      <Container padded>
        <View style={{ marginBottom: tokens.spacing.lg }}>
          <Button
            title="← Back"
            variant="ghost"
            onPress={() => router.back()}
            style={{ alignSelf: 'flex-start', marginBottom: tokens.spacing.md }}
          />
          <Text variant="heading" weight="bold">
            Theme Search
          </Text>
          <Text style={{ marginTop: tokens.spacing.sm, opacity: 0.7 }}>
            Choose a theme to customize your Crux Garden experience
          </Text>
        </View>

        <SectionList
          sections={sections}
          renderItem={renderThemeItem}
          renderSectionHeader={({ section: { title } }) => (
            <View
              style={{
                paddingVertical: tokens.spacing.md,
                paddingTop: tokens.spacing.lg,
              }}
            >
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: '700',
                  color: tokens.colors.text,
                }}
              >
                {title}
              </Text>
            </View>
          )}
          keyExtractor={(item) => item.key}
          contentContainerStyle={{ paddingBottom: tokens.spacing.xl }}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
        />
      </Container>
    </View>
  );
}
