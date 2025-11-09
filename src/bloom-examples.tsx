import React from 'react';
import { View, ScrollView, Text, TouchableOpacity } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { useRouter } from 'expo-router';
import { CruxBloom } from '@/components/CruxBloom';
import { PRESET_THEMES, PRESET_GRADIENTS, createMonochromaticTheme } from '@/components/CruxBloom/types';

export default function BloomExamples() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>CruxBloom Gallery</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Section: Default */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Default</Text>
          <View style={styles.exampleCard}>
            <Text style={styles.exampleTitle}>Original Icon</Text>
            <Text style={styles.exampleDescription}>
              The default Crux Garden bloom with original colors
            </Text>
            <CruxBloom size={150} />
          </View>
        </View>

        {/* Section: Preset Themes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preset Themes</Text>
          {Object.entries(PRESET_THEMES).map(([key, theme]) => (
            <View key={key} style={styles.exampleCard}>
              <Text style={styles.exampleTitle}>{theme.name}</Text>
              <Text style={styles.exampleDescription}>{theme.description}</Text>
              <CruxBloom size={150} {...theme.config} />
            </View>
          ))}
        </View>

        {/* Section: Custom Examples */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Custom Examples</Text>

          {/* Rainbow Colors */}
          <View style={styles.exampleCard}>
            <Text style={styles.exampleTitle}>Rainbow</Text>
            <Text style={styles.exampleDescription}>
              Vibrant rainbow colors
            </Text>
            <CruxBloom
              size={150}
              primary={{ fill: '#e74c3c' }}
              secondary={{ fill: '#f39c12' }}
              tertiary={{ fill: '#2ecc71' }}
              quaternary={{ fill: '#3498db' }}
            />
          </View>

          {/* Glowing Rings */}
          <View style={styles.exampleCard}>
            <Text style={styles.exampleTitle}>Glowing Rings</Text>
            <Text style={styles.exampleDescription}>
              Dark background with bright borders
            </Text>
            <CruxBloom
              size={150}
              primary={{ fill: '#1a1a1a', stroke: '#00ffff', strokeWidth: 6, opacity: 0.8 }}
              secondary={{ fill: '#1a1a1a', stroke: '#00ff00', strokeWidth: 5, opacity: 0.85 }}
              tertiary={{ fill: '#1a1a1a', stroke: '#ffff00', strokeWidth: 4, opacity: 0.9 }}
              quaternary={{ fill: '#ffffff', stroke: '#ff00ff', strokeWidth: 3 }}
            />
          </View>

          {/* Monochromatic Blue */}
          <View style={styles.exampleCard}>
            <Text style={styles.exampleTitle}>Monochromatic Blue</Text>
            <Text style={styles.exampleDescription}>
              Generated using the monochromatic theme helper
            </Text>
            <CruxBloom
              size={150}
              {...createMonochromaticTheme('Blue', '#3498db', { lighten: true }).config}
            />
          </View>

          {/* Multiple Gradients */}
          <View style={styles.exampleCard}>
            <Text style={styles.exampleTitle}>Gradient Mix</Text>
            <Text style={styles.exampleDescription}>
              Different gradient on each circle
            </Text>
            <CruxBloom
              size={150}
              gradients={[
                PRESET_GRADIENTS.sunset,
                PRESET_GRADIENTS.ocean,
                PRESET_GRADIENTS.forest,
                PRESET_GRADIENTS.lavender,
              ]}
              primary={{ fill: 'url(#sunset)' }}
              secondary={{ fill: 'url(#ocean)' }}
              tertiary={{ fill: 'url(#forest)' }}
              quaternary={{ fill: 'url(#lavender)' }}
            />
          </View>

          {/* Neon Glow */}
          <View style={styles.exampleCard}>
            <Text style={styles.exampleTitle}>Neon Glow</Text>
            <Text style={styles.exampleDescription}>
              Bright neon colors with opacity layers
            </Text>
            <CruxBloom
              size={150}
              primary={{ fill: '#ff0080', opacity: 0.3 }}
              secondary={{ fill: '#00ffff', opacity: 0.5 }}
              tertiary={{ fill: '#ffff00', opacity: 0.7 }}
              quaternary={{ fill: '#00ff00', opacity: 1 }}
            />
          </View>

          {/* Aurora Gradient */}
          <View style={styles.exampleCard}>
            <Text style={styles.exampleTitle}>Aurora Gradient</Text>
            <Text style={styles.exampleDescription}>
              Aurora gradient with varying opacity
            </Text>
            <CruxBloom
              size={150}
              gradients={[PRESET_GRADIENTS.aurora]}
              primary={{ fill: 'url(#aurora)', opacity: 0.5 }}
              secondary={{ fill: 'url(#aurora)', opacity: 0.65 }}
              tertiary={{ fill: 'url(#aurora)', opacity: 0.8 }}
              quaternary={{ fill: 'url(#aurora)', opacity: 1 }}
            />
          </View>

          {/* Sunset Gradient */}
          <View style={styles.exampleCard}>
            <Text style={styles.exampleTitle}>Sunset Gradient</Text>
            <Text style={styles.exampleDescription}>
              Warm sunset colors blending together
            </Text>
            <CruxBloom
              size={150}
              gradients={[{
                id: 'customSunset',
                stops: [
                  { color: '#ff6b6b', offset: '0%' },
                  { color: '#feca57', offset: '100%' }
                ],
                angle: 135
              }]}
              primary={{ fill: 'url(#customSunset)', opacity: 0.4 }}
              secondary={{ fill: 'url(#customSunset)', opacity: 0.6 }}
              tertiary={{ fill: 'url(#customSunset)', opacity: 0.8 }}
              quaternary={{ fill: 'url(#customSunset)', opacity: 1 }}
            />
          </View>

          {/* Gradient with Borders */}
          <View style={styles.exampleCard}>
            <Text style={styles.exampleTitle}>Gradient with Borders</Text>
            <Text style={styles.exampleDescription}>
              Ocean gradient with white borders
            </Text>
            <CruxBloom
              size={150}
              gradients={[PRESET_GRADIENTS.ocean]}
              primary={{ fill: 'url(#ocean)', opacity: 0.5, stroke: '#ffffff', strokeWidth: 4 }}
              secondary={{ fill: 'url(#ocean)', opacity: 0.65, stroke: '#ffffff', strokeWidth: 3 }}
              tertiary={{ fill: 'url(#ocean)', opacity: 0.8, stroke: '#ffffff', strokeWidth: 2 }}
              quaternary={{ fill: 'url(#ocean)', opacity: 1 }}
            />
          </View>

          {/* Monochrome */}
          <View style={styles.exampleCard}>
            <Text style={styles.exampleTitle}>Monochrome</Text>
            <Text style={styles.exampleDescription}>
              Dark to light grayscale progression
            </Text>
            <CruxBloom
              size={150}
              primary={{ fill: '#34495e', opacity: 0.7 }}
              secondary={{ fill: '#2c3e50', opacity: 0.8 }}
              tertiary={{ fill: '#1a252f', opacity: 0.9 }}
              quaternary={{ fill: '#0d1318' }}
            />
          </View>

          {/* Pastel Rainbow */}
          <View style={styles.exampleCard}>
            <Text style={styles.exampleTitle}>Pastel Rainbow</Text>
            <Text style={styles.exampleDescription}>
              Soft pastel colors with subtle borders
            </Text>
            <CruxBloom
              size={150}
              primary={{ fill: '#ffeaa7', stroke: '#ffffff', strokeWidth: 2 }}
              secondary={{ fill: '#fab1a0', stroke: '#ffffff', strokeWidth: 2 }}
              tertiary={{ fill: '#a29bfe', stroke: '#ffffff', strokeWidth: 2 }}
              quaternary={{ fill: '#74b9ff', stroke: '#ffffff', strokeWidth: 2 }}
            />
          </View>

          {/* Ocean Depths */}
          <View style={styles.exampleCard}>
            <Text style={styles.exampleTitle}>Ocean Depths</Text>
            <Text style={styles.exampleDescription}>
              Deep blue gradient simulating ocean layers
            </Text>
            <CruxBloom
              size={150}
              gradients={[{
                id: 'oceanDepths',
                stops: [
                  { color: '#00b4d8', offset: '0%' },
                  { color: '#0077b6', offset: '50%' },
                  { color: '#023e8a', offset: '100%' }
                ],
                angle: 180
              }]}
              primary={{ fill: 'url(#oceanDepths)', opacity: 0.4 }}
              secondary={{ fill: 'url(#oceanDepths)', opacity: 0.6 }}
              tertiary={{ fill: 'url(#oceanDepths)', opacity: 0.8 }}
              quaternary={{ fill: 'url(#oceanDepths)', opacity: 1 }}
            />
          </View>

          {/* Fire Bloom */}
          <View style={styles.exampleCard}>
            <Text style={styles.exampleTitle}>Fire Bloom</Text>
            <Text style={styles.exampleDescription}>
              Hot fire colors with glow effect
            </Text>
            <CruxBloom
              size={150}
              primary={{ fill: '#ff0a54', opacity: 0.3 }}
              secondary={{ fill: '#ff477e', opacity: 0.5 }}
              tertiary={{ fill: '#ff7096', opacity: 0.7 }}
              quaternary={{ fill: '#ffa8c5', opacity: 1 }}
            />
          </View>
        </View>

        {/* Section: Borders & Strokes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Borders & Strokes</Text>

          {/* Thick Borders */}
          <View style={styles.exampleCard}>
            <Text style={styles.exampleTitle}>Thick Borders</Text>
            <Text style={styles.exampleDescription}>
              Classic colors with bold white borders
            </Text>
            <CruxBloom
              size={150}
              primary={{ fill: '#2a3d2c', stroke: '#ffffff', strokeWidth: 8 }}
              secondary={{ fill: '#426046', stroke: '#e0e0e0', strokeWidth: 6 }}
              tertiary={{ fill: '#58825e', stroke: '#c0c0c0', strokeWidth: 4 }}
              quaternary={{ fill: '#73a079', stroke: '#a0a0a0', strokeWidth: 2 }}
            />
          </View>

          {/* Colored Borders */}
          <View style={styles.exampleCard}>
            <Text style={styles.exampleTitle}>Colored Borders</Text>
            <Text style={styles.exampleDescription}>
              Each circle with a contrasting border color
            </Text>
            <CruxBloom
              size={150}
              primary={{ fill: '#9b59b6', stroke: '#f39c12', strokeWidth: 6 }}
              secondary={{ fill: '#3498db', stroke: '#e74c3c', strokeWidth: 5 }}
              tertiary={{ fill: '#2ecc71', stroke: '#9b59b6', strokeWidth: 4 }}
              quaternary={{ fill: '#f39c12', stroke: '#3498db', strokeWidth: 3 }}
            />
          </View>

          {/* Outline Only */}
          <View style={styles.exampleCard}>
            <Text style={styles.exampleTitle}>Outline Only</Text>
            <Text style={styles.exampleDescription}>
              Transparent fills with colored strokes
            </Text>
            <CruxBloom
              size={150}
              primary={{ fill: 'transparent', stroke: '#e74c3c', strokeWidth: 8 }}
              secondary={{ fill: 'transparent', stroke: '#3498db', strokeWidth: 6 }}
              tertiary={{ fill: 'transparent', stroke: '#2ecc71', strokeWidth: 4 }}
              quaternary={{ fill: '#f39c12' }}
            />
          </View>
        </View>

        {/* Section: Minimal */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Minimal</Text>

          {/* Minimal Black */}
          <View style={styles.exampleCard}>
            <Text style={styles.exampleTitle}>Minimal Black</Text>
            <Text style={styles.exampleDescription}>
              Simple, clean design with subtle borders
            </Text>
            <CruxBloom
              size={150}
              primary={{ fill: '#ffffff', stroke: '#000000', strokeWidth: 2, opacity: 0.1 }}
              secondary={{ fill: '#ffffff', stroke: '#000000', strokeWidth: 2, opacity: 0.3 }}
              tertiary={{ fill: '#ffffff', stroke: '#000000', strokeWidth: 2, opacity: 0.6 }}
              quaternary={{ fill: '#000000' }}
            />
          </View>

          {/* Minimal Color */}
          <View style={styles.exampleCard}>
            <Text style={styles.exampleTitle}>Minimal Color</Text>
            <Text style={styles.exampleDescription}>
              Single color with opacity variations
            </Text>
            <CruxBloom
              size={150}
              primary={{ fill: '#4dd9b8', opacity: 0.2 }}
              secondary={{ fill: '#4dd9b8', opacity: 0.4 }}
              tertiary={{ fill: '#4dd9b8', opacity: 0.7 }}
              quaternary={{ fill: '#4dd9b8', opacity: 1 }}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1214',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: '#1a1f24',
    borderBottomWidth: 1,
    borderBottomColor: '#2a3138',
  },
  backButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 12,
  },
  backButtonText: {
    color: '#4dd9b8',
    fontSize: 16,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#e8eef2',
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#4dd9b8',
    marginBottom: 16,
    paddingBottom: 8,
    borderBottomWidth: 2,
    borderBottomColor: '#4dd9b8',
  },
  exampleCard: {
    backgroundColor: '#1a1f24',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a3138',
  },
  exampleTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#e8eef2',
    marginBottom: 8,
  },
  exampleDescription: {
    fontSize: 14,
    color: '#8b9298',
    marginBottom: 16,
    textAlign: 'center',
  },
});
