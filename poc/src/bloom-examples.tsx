import React from 'react';
import { useRouter } from 'expo-router';
import { Container, ScrollView, View, Text, Button, Panel } from '@/components';
import { CruxBloom } from '@/components/CruxBloom';
import { PRESET_THEMES, createMonochromaticTheme } from '@/components/CruxBloom/types';
import { useTheme } from '@/contexts/ThemeContext';

export default function BloomExamples() {
  const router = useRouter();
  const { tokens, transitionDuration } = useTheme();

  return (
    <View style={{ flex: 1 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: tokens.spacing.lg,
          paddingTop: 60,
          paddingBottom: tokens.spacing.lg,
          borderBottomWidth: 1,
          borderBottomColor: tokens.borders.color,
        }}
        variant="panel"
      >
        <Button
          title="← Back"
          variant="ghost"
          onPress={() => router.back()}
          style={{ marginRight: tokens.spacing.md }}
        />
        <Text variant="heading" weight="bold" style={{ flex: 1 }}>
          CruxBloom Gallery
        </Text>
      </View>

      <ScrollView>
        <Container padded>
          {/* Section: Default */}
          <View style={{ marginBottom: tokens.spacing.xxl }}>
            <Text
              variant="heading"
              weight="bold"
              style={{
                color: tokens.colors.buttonBackground,
                marginBottom: tokens.spacing.lg,
                paddingBottom: tokens.spacing.sm,
                borderBottomWidth: 2,
                borderBottomColor: tokens.colors.buttonBackground,
              }}
            >
              Default
            </Text>
            <Panel style={{ alignItems: 'center', marginBottom: tokens.spacing.md }}>
              <Text weight="bold" style={{ marginBottom: tokens.spacing.sm }}>
                Original Icon
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  opacity: 0.7,
                  marginBottom: tokens.spacing.md,
                  textAlign: 'center',
                }}
              >
                The default Crux Garden bloom with original colors
              </Text>
              <CruxBloom size={150} transitionDuration={transitionDuration} />
            </Panel>
          </View>

          {/* Section: Preset Themes */}
          <View style={{ marginBottom: tokens.spacing.xxl }}>
            <Text
              variant="heading"
              weight="bold"
              style={{
                color: tokens.colors.buttonBackground,
                marginBottom: tokens.spacing.lg,
                paddingBottom: tokens.spacing.sm,
                borderBottomWidth: 2,
                borderBottomColor: tokens.colors.buttonBackground,
              }}
            >
              Preset Themes
            </Text>
            {Object.entries(PRESET_THEMES).map(([key, theme]) => (
              <Panel key={key} style={{ alignItems: 'center', marginBottom: tokens.spacing.md }}>
                <Text weight="bold" style={{ marginBottom: tokens.spacing.sm }}>
                  {theme.name}
                </Text>
                <Text
                  style={{
                    fontSize: 14,
                    opacity: 0.7,
                    marginBottom: tokens.spacing.md,
                    textAlign: 'center',
                  }}
                >
                  {theme.description}
                </Text>
                <CruxBloom size={150} {...theme.config} transitionDuration={transitionDuration} />
              </Panel>
            ))}
          </View>

          {/* Section: Custom Examples */}
          <View style={{ marginBottom: tokens.spacing.xxl }}>
            <Text
              variant="heading"
              weight="bold"
              style={{
                color: tokens.colors.buttonBackground,
                marginBottom: tokens.spacing.lg,
                paddingBottom: tokens.spacing.sm,
                borderBottomWidth: 2,
                borderBottomColor: tokens.colors.buttonBackground,
              }}
            >
              Custom Examples
            </Text>

            {/* Rainbow Colors */}
            <Panel style={{ alignItems: 'center', marginBottom: tokens.spacing.md }}>
              <Text weight="bold" style={{ marginBottom: tokens.spacing.sm }}>
                Rainbow
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  opacity: 0.7,
                  marginBottom: tokens.spacing.md,
                  textAlign: 'center',
                }}
              >
                Vibrant rainbow colors
              </Text>
              <CruxBloom
                size={150}
                primary={{ fill: '#e74c3c' }}
                secondary={{ fill: '#f39c12' }}
                tertiary={{ fill: '#2ecc71' }}
                quaternary={{ fill: '#3498db' }}
                transitionDuration={transitionDuration}
              />
            </Panel>

            {/* Glowing Rings */}
            <Panel style={{ alignItems: 'center', marginBottom: tokens.spacing.md }}>
              <Text weight="bold" style={{ marginBottom: tokens.spacing.sm }}>
                Glowing Rings
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  opacity: 0.7,
                  marginBottom: tokens.spacing.md,
                  textAlign: 'center',
                }}
              >
                Dark background with bright borders
              </Text>
              <CruxBloom
                size={150}
                primary={{ fill: '#1a1a1a', stroke: '#00ffff', strokeWidth: 6, opacity: 0.8 }}
                secondary={{ fill: '#1a1a1a', stroke: '#00ff00', strokeWidth: 5, opacity: 0.85 }}
                tertiary={{ fill: '#1a1a1a', stroke: '#ffff00', strokeWidth: 4, opacity: 0.9 }}
                quaternary={{ fill: '#ffffff', stroke: '#ff00ff', strokeWidth: 3 }}
                transitionDuration={transitionDuration}
              />
            </Panel>

            {/* Monochromatic Blue */}
            <Panel style={{ alignItems: 'center', marginBottom: tokens.spacing.md }}>
              <Text weight="bold" style={{ marginBottom: tokens.spacing.sm }}>
                Monochromatic Blue
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  opacity: 0.7,
                  marginBottom: tokens.spacing.md,
                  textAlign: 'center',
                }}
              >
                Generated using the monochromatic theme helper
              </Text>
              <CruxBloom
                size={150}
                {...createMonochromaticTheme('Blue', '#3498db', { lighten: true }).config}
                transitionDuration={transitionDuration}
              />
            </Panel>

            {/* More examples... (keeping the same pattern) */}
          </View>
        </Container>
      </ScrollView>
    </View>
  );
}
