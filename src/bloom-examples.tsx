import React from 'react';
import { View, ScrollView, Text, TouchableOpacity } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { useRouter } from 'expo-router';
import { CruxBloom } from '@/components/CruxBloom';
import { AnimatedBloom } from '@/components/CruxBloom/AnimatedBloom';
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
              circle1={{ fill: '#e74c3c' }}
              circle2={{ fill: '#f39c12' }}
              circle3={{ fill: '#2ecc71' }}
              circle4={{ fill: '#3498db' }}
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
              circle1={{ fill: '#1a1a1a', stroke: '#00ffff', strokeWidth: 6, opacity: 0.8 }}
              circle2={{ fill: '#1a1a1a', stroke: '#00ff00', strokeWidth: 5, opacity: 0.85 }}
              circle3={{ fill: '#1a1a1a', stroke: '#ffff00', strokeWidth: 4, opacity: 0.9 }}
              circle4={{ fill: '#ffffff', stroke: '#ff00ff', strokeWidth: 3 }}
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
              circle1={{ fill: 'url(#sunset)' }}
              circle2={{ fill: 'url(#ocean)' }}
              circle3={{ fill: 'url(#forest)' }}
              circle4={{ fill: 'url(#lavender)' }}
            />
          </View>

          {/* Asymmetric */}
          <View style={styles.exampleCard}>
            <Text style={styles.exampleTitle}>Asymmetric</Text>
            <Text style={styles.exampleDescription}>
              Offset circles with varied sizes
            </Text>
            <CruxBloom
              size={150}
              circle1={{ fill: '#9b59b6', radius: 950, offsetX: -80 }}
              circle2={{ fill: '#3498db', radius: 650, offsetX: 60, offsetY: 180 }}
              circle3={{ fill: '#e74c3c', radius: 380, offsetX: -40, offsetY: 320 }}
              circle4={{ fill: '#f39c12', radius: 180, offsetX: 40, offsetY: 480 }}
            />
          </View>

          {/* Rotated */}
          <View style={styles.exampleCard}>
            <Text style={styles.exampleTitle}>Rotated</Text>
            <Text style={styles.exampleDescription}>
              Simple rotation effect
            </Text>
            <CruxBloom
              size={150}
              rotate={45}
              circle1={{ fill: '#34495e', opacity: 0.7 }}
              circle2={{ fill: '#2c3e50', opacity: 0.8 }}
              circle3={{ fill: '#1a252f', opacity: 0.9 }}
              circle4={{ fill: '#0d1318' }}
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
              circle1={{ fill: '#ff0080', opacity: 0.3 }}
              circle2={{ fill: '#00ffff', opacity: 0.5 }}
              circle3={{ fill: '#ffff00', opacity: 0.7 }}
              circle4={{ fill: '#00ff00', opacity: 1 }}
            />
          </View>

          {/* Gradient with Transform */}
          <View style={styles.exampleCard}>
            <Text style={styles.exampleTitle}>Aurora Rotated</Text>
            <Text style={styles.exampleDescription}>
              Aurora gradient with rotation
            </Text>
            <CruxBloom
              size={150}
              gradients={[PRESET_GRADIENTS.aurora]}
              rotate={25}
              circle1={{ fill: 'url(#aurora)', opacity: 0.5 }}
              circle2={{ fill: 'url(#aurora)', opacity: 0.65 }}
              circle3={{ fill: 'url(#aurora)', opacity: 0.8 }}
              circle4={{ fill: 'url(#aurora)', opacity: 1 }}
            />
          </View>
        </View>

        {/* Section: Shapes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Polygonal Shapes</Text>

          {/* Triangle */}
          <View style={styles.exampleCard}>
            <Text style={styles.exampleTitle}>Triangle Bloom</Text>
            <Text style={styles.exampleDescription}>
              Upward bloom with bottom anchor
            </Text>
            <CruxBloom
              size={150}
              circle1={{ fill: '#e74c3c', sides: 3 }}
              circle2={{ fill: '#c0392b', sides: 3 }}
              circle3={{ fill: '#a93226', sides: 3 }}
              circle4={{ fill: '#922b21', sides: 3 }}
            />
          </View>

          {/* Square */}
          <View style={styles.exampleCard}>
            <Text style={styles.exampleTitle}>Square Bloom</Text>
            <Text style={styles.exampleDescription}>
              Cascading square bloom effect
            </Text>
            <CruxBloom
              size={150}
              circle1={{ fill: '#3498db', sides: 4 }}
              circle2={{ fill: '#2980b9', sides: 4 }}
              circle3={{ fill: '#2471a3', sides: 4 }}
              circle4={{ fill: '#1f618d', sides: 4 }}
            />
          </View>

          {/* Pentagon */}
          <View style={styles.exampleCard}>
            <Text style={styles.exampleTitle}>Pentagon Bloom</Text>
            <Text style={styles.exampleDescription}>
              Cascading pentagon bloom effect
            </Text>
            <CruxBloom
              size={150}
              circle1={{ fill: '#2ecc71', sides: 5 }}
              circle2={{ fill: '#27ae60', sides: 5 }}
              circle3={{ fill: '#229954', sides: 5 }}
              circle4={{ fill: '#1e8449', sides: 5 }}
            />
          </View>

          {/* Hexagon */}
          <View style={styles.exampleCard}>
            <Text style={styles.exampleTitle}>Hexagon Bloom</Text>
            <Text style={styles.exampleDescription}>
              Cascading hexagon bloom effect
            </Text>
            <CruxBloom
              size={150}
              circle1={{ fill: '#9b59b6', sides: 6 }}
              circle2={{ fill: '#8e44ad', sides: 6 }}
              circle3={{ fill: '#7d3c98', sides: 6 }}
              circle4={{ fill: '#6c3483', sides: 6 }}
            />
          </View>

          {/* Octagon */}
          <View style={styles.exampleCard}>
            <Text style={styles.exampleTitle}>Octagon Bloom</Text>
            <Text style={styles.exampleDescription}>
              Cascading octagon bloom effect
            </Text>
            <CruxBloom
              size={150}
              circle1={{ fill: '#f39c12', sides: 8 }}
              circle2={{ fill: '#e67e22', sides: 8 }}
              circle3={{ fill: '#d68910', sides: 8 }}
              circle4={{ fill: '#ca6f1e', sides: 8 }}
            />
          </View>

          {/* Decagon */}
          <View style={styles.exampleCard}>
            <Text style={styles.exampleTitle}>Decagon Bloom</Text>
            <Text style={styles.exampleDescription}>
              Cascading decagon bloom effect
            </Text>
            <CruxBloom
              size={150}
              circle1={{ fill: '#16a085', sides: 10 }}
              circle2={{ fill: '#138d75', sides: 10 }}
              circle3={{ fill: '#117a65', sides: 10 }}
              circle4={{ fill: '#0e6655', sides: 10 }}
            />
          </View>

          {/* Mixed Shapes */}
          <View style={styles.exampleCard}>
            <Text style={styles.exampleTitle}>Mixed Shape Bloom</Text>
            <Text style={styles.exampleDescription}>
              Different shapes cascading
            </Text>
            <CruxBloom
              size={150}
              circle1={{ fill: '#e74c3c', sides: 8, opacity: 0.7 }}
              circle2={{ fill: '#3498db', sides: 6, opacity: 0.8 }}
              circle3={{ fill: '#2ecc71', sides: 4, opacity: 0.9 }}
              circle4={{ fill: '#f39c12', sides: 3 }}
            />
          </View>

          {/* Rotated Triangles */}
          <View style={styles.exampleCard}>
            <Text style={styles.exampleTitle}>Rotated Triangles</Text>
            <Text style={styles.exampleDescription}>
              Triangles with individual rotation (centered)
            </Text>
            <CruxBloom
              size={150}
              circle1={{ fill: '#e74c3c', sides: 3, shapeRotation: 0, opacity: 0.4, offsetY: 0 }}
              circle2={{ fill: '#e74c3c', sides: 3, shapeRotation: 60, opacity: 0.6, offsetY: 0 }}
              circle3={{ fill: '#e74c3c', sides: 3, shapeRotation: 120, opacity: 0.8, offsetY: 0 }}
              circle4={{ fill: '#e74c3c', sides: 3, shapeRotation: 180, offsetY: 0 }}
            />
          </View>

          {/* Star Pattern */}
          <View style={styles.exampleCard}>
            <Text style={styles.exampleTitle}>Star Pattern</Text>
            <Text style={styles.exampleDescription}>
              Rotated squares creating a star (centered)
            </Text>
            <CruxBloom
              size={150}
              circle1={{ fill: '#f39c12', sides: 4, shapeRotation: 0, offsetY: 0 }}
              circle2={{ fill: '#e67e22', sides: 4, shapeRotation: 45, offsetY: 0 }}
              circle3={{ fill: '#d68910', sides: 4, shapeRotation: 0, offsetY: 0 }}
              circle4={{ fill: '#ca6f1e', sides: 4, shapeRotation: 45, offsetY: 0 }}
            />
          </View>

          {/* Bordered Hexagons */}
          <View style={styles.exampleCard}>
            <Text style={styles.exampleTitle}>Bordered Hexagon Bloom</Text>
            <Text style={styles.exampleDescription}>
              Hexagons with thick borders cascading
            </Text>
            <CruxBloom
              size={150}
              circle1={{ fill: '#3498db', sides: 6, stroke: '#ffffff', strokeWidth: 8 }}
              circle2={{ fill: '#2980b9', sides: 6, stroke: '#ecf0f1', strokeWidth: 6 }}
              circle3={{ fill: '#2471a3', sides: 6, stroke: '#bdc3c7', strokeWidth: 4 }}
              circle4={{ fill: '#1f618d', sides: 6, stroke: '#95a5a6', strokeWidth: 2 }}
            />
          </View>
        </View>

        {/* Section: Animated */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Animated Blooms</Text>

          {/* Rotate */}
          <View style={styles.exampleCard}>
            <Text style={styles.exampleTitle}>Continuous Rotation</Text>
            <Text style={styles.exampleDescription}>
              Bloom rotating continuously (with triangles to show rotation)
            </Text>
            <AnimatedBloom
              preset="rotate"
              size={150}
              duration={3000}
              circle1={{ fill: '#e74c3c', sides: 3 }}
              circle2={{ fill: '#e67e22', sides: 3 }}
              circle3={{ fill: '#f39c12', sides: 3 }}
              circle4={{ fill: '#f1c40f', sides: 3 }}
            />
          </View>

          {/* Pulse */}
          <View style={styles.exampleCard}>
            <Text style={styles.exampleTitle}>Pulse</Text>
            <Text style={styles.exampleDescription}>
              Inner circle pulsing in and out
            </Text>
            <AnimatedBloom preset="pulse" size={150} duration={1500} />
          </View>

          {/* Fade */}
          <View style={styles.exampleCard}>
            <Text style={styles.exampleTitle}>Fade</Text>
            <Text style={styles.exampleDescription}>
              Inner circle fading in and out
            </Text>
            <AnimatedBloom preset="fade" size={150} duration={2000} />
          </View>

          {/* Breathe */}
          <View style={styles.exampleCard}>
            <Text style={styles.exampleTitle}>Breathe</Text>
            <Text style={styles.exampleDescription}>
              Outer circle breathing (radius + opacity)
            </Text>
            <AnimatedBloom preset="breathe" size={150} duration={2500} />
          </View>

          {/* Orbit */}
          <View style={styles.exampleCard}>
            <Text style={styles.exampleTitle}>Orbit</Text>
            <Text style={styles.exampleDescription}>
              Inner circle orbiting around center
            </Text>
            <AnimatedBloom preset="orbit" size={150} duration={4000} />
          </View>

          {/* Rainbow */}
          <View style={styles.exampleCard}>
            <Text style={styles.exampleTitle}>Rainbow Cycle</Text>
            <Text style={styles.exampleDescription}>
              Inner circle cycling through rainbow colors
            </Text>
            <AnimatedBloom preset="rainbow" size={150} duration={7000} />
          </View>

          {/* Spin */}
          <View style={styles.exampleCard}>
            <Text style={styles.exampleTitle}>Spin</Text>
            <Text style={styles.exampleDescription}>
              Global rotation with counter-rotating inner triangle
            </Text>
            <AnimatedBloom
              preset="spin"
              size={150}
              duration={4000}
              circle1={{ fill: '#e74c3c', sides: 3 }}
              circle2={{ fill: '#e67e22', sides: 3 }}
              circle3={{ fill: '#f39c12', sides: 3 }}
              circle4={{ fill: '#f1c40f', sides: 3 }}
            />
          </View>

          {/* Glow */}
          <View style={styles.exampleCard}>
            <Text style={styles.exampleTitle}>Glow</Text>
            <Text style={styles.exampleDescription}>
              Cascading opacity glow effect
            </Text>
            <AnimatedBloom preset="glow" size={150} duration={2500} />
          </View>

          {/* Custom Color Animation */}
          <View style={styles.exampleCard}>
            <Text style={styles.exampleTitle}>Custom Color Fade</Text>
            <Text style={styles.exampleDescription}>
              Inner circle smoothly transitioning from red to blue
            </Text>
            <AnimatedBloom
              size={150}
              animatedCircle4={{
                fill: { from: '#ff0000', to: '#0000ff', duration: 3000, reverse: true }
              }}
              loop
            />
          </View>

          {/* Custom Multi-property */}
          <View style={styles.exampleCard}>
            <Text style={styles.exampleTitle}>Custom Multi-property</Text>
            <Text style={styles.exampleDescription}>
              Inner circle growing, fading, and color shifting
            </Text>
            <AnimatedBloom
              size={150}
              animatedCircle4={{
                radius: { from: 250, to: 350, duration: 2000, reverse: true },
                opacity: { from: 1, to: 0.3, duration: 2000, reverse: true },
                fill: { from: '#2ecc71', to: '#e74c3c', duration: 2000, reverse: true }
              }}
              loop
            />
          </View>

          {/* Rotating Triangles with Color */}
          <View style={styles.exampleCard}>
            <Text style={styles.exampleTitle}>Rotating Rainbow Triangles</Text>
            <Text style={styles.exampleDescription}>
              All circles as triangles, rotating with color cycle
            </Text>
            <AnimatedBloom
              size={150}
              duration={6000}
              circle1={{ sides: 3 }}
              circle2={{ sides: 3 }}
              circle3={{ sides: 3 }}
              circle4={{ sides: 3 }}
              animatedRotate={{ from: 0, to: 360 }}
              animatedCircle4={{
                fill: { from: '#ff0000', to: '#0000ff' }
              }}
              loop
            />
          </View>
        </View>

        {/* Section: Experimental */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Experimental</Text>

          {/* Minimal */}
          <View style={styles.exampleCard}>
            <Text style={styles.exampleTitle}>Minimal</Text>
            <Text style={styles.exampleDescription}>
              Simple, clean design with subtle borders
            </Text>
            <CruxBloom
              size={150}
              circle1={{ fill: '#ffffff', stroke: '#000000', strokeWidth: 2, opacity: 0.1 }}
              circle2={{ fill: '#ffffff', stroke: '#000000', strokeWidth: 2, opacity: 0.3 }}
              circle3={{ fill: '#ffffff', stroke: '#000000', strokeWidth: 2, opacity: 0.6 }}
              circle4={{ fill: '#000000' }}
            />
          </View>

          {/* Chaotic */}
          <View style={styles.exampleCard}>
            <Text style={styles.exampleTitle}>Chaotic</Text>
            <Text style={styles.exampleDescription}>
              Wild offsets and rotation!
            </Text>
            <CruxBloom
              size={150}
              rotate={-35}
              circle1={{
                fill: '#8e44ad',
                radius: 850,
                offsetX: 120,
                offsetY: -80,
                stroke: '#f39c12',
                strokeWidth: 8
              }}
              circle2={{
                fill: '#27ae60',
                radius: 720,
                offsetX: -90,
                offsetY: 200,
                stroke: '#e74c3c',
                strokeWidth: 6
              }}
              circle3={{
                fill: '#2980b9',
                radius: 420,
                offsetX: 60,
                offsetY: 100,
                stroke: '#f1c40f',
                strokeWidth: 4
              }}
              circle4={{
                fill: '#e67e22',
                radius: 280,
                offsetX: -40,
                offsetY: 350,
                stroke: '#9b59b6',
                strokeWidth: 3
              }}
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
