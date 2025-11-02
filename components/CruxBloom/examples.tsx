/**
 * CruxBloom Examples
 *
 * This file contains example implementations of the CruxBloom component
 * demonstrating various customization options.
 *
 * Copy any of these examples into your own components to get started!
 */

import React from 'react';
import { View, ScrollView, Text, StyleSheet } from 'react-native';
import { CruxBloom } from './index';
import { PRESET_THEMES, createMonochromaticTheme, PRESET_GRADIENTS } from './types';

/**
 * Example 1: Basic usage with default styling
 */
export const BasicExample = () => (
  <View style={styles.container}>
    <Text style={styles.title}>Default Bloom</Text>
    <CruxBloom size={150} />
  </View>
);

/**
 * Example 2: Custom solid colors
 */
export const CustomColorsExample = () => (
  <View style={styles.container}>
    <Text style={styles.title}>Custom Colors</Text>
    <CruxBloom
      size={150}
      circle1={{ fill: '#e74c3c' }}
      circle2={{ fill: '#3498db' }}
      circle3={{ fill: '#2ecc71' }}
      circle4={{ fill: '#f39c12' }}
    />
  </View>
);

/**
 * Example 3: With borders
 */
export const BordersExample = () => (
  <View style={styles.container}>
    <Text style={styles.title}>With Borders</Text>
    <CruxBloom
      size={150}
      circle1={{ fill: '#2a3d2c', stroke: '#ffffff', strokeWidth: 8 }}
      circle2={{ fill: '#426046', stroke: '#e0e0e0', strokeWidth: 6 }}
      circle3={{ fill: '#58825e', stroke: '#c0c0c0', strokeWidth: 4 }}
      circle4={{ fill: '#73a079', stroke: '#a0a0a0', strokeWidth: 2 }}
    />
  </View>
);

/**
 * Example 4: Gradient bloom
 */
export const GradientExample = () => (
  <View style={styles.container}>
    <Text style={styles.title}>Sunset Gradient</Text>
    <CruxBloom
      size={150}
      gradients={[
        {
          id: 'sunset',
          stops: [
            { color: '#ff6b6b', offset: '0%' },
            { color: '#feca57', offset: '100%' }
          ],
          angle: 135
        }
      ]}
      circle1={{ fill: 'url(#sunset)', opacity: 0.4 }}
      circle2={{ fill: 'url(#sunset)', opacity: 0.6 }}
      circle3={{ fill: 'url(#sunset)', opacity: 0.8 }}
      circle4={{ fill: 'url(#sunset)', opacity: 1 }}
    />
  </View>
);

/**
 * Example 5: Skewed perspective
 */
export const SkewExample = () => (
  <View style={styles.container}>
    <Text style={styles.title}>Skewed Perspective</Text>
    <CruxBloom
      size={150}
      skewX={15}
      skewY={-5}
      rotate={10}
    />
  </View>
);

/**
 * Example 6: Offset circles
 */
export const OffsetExample = () => (
  <View style={styles.container}>
    <Text style={styles.title}>Offset Circles</Text>
    <CruxBloom
      size={150}
      circle1={{ fill: '#e74c3c', offsetX: -50, offsetY: -50 }}
      circle2={{ fill: '#3498db', offsetX: 0, offsetY: 100 }}
      circle3={{ fill: '#2ecc71', offsetX: 50, offsetY: 250 }}
      circle4={{ fill: '#f39c12', offsetX: 0, offsetY: 400 }}
    />
  </View>
);

/**
 * Example 7: Using preset themes
 */
export const PresetThemeExample = () => (
  <View style={styles.container}>
    <Text style={styles.title}>Ocean Breeze Theme</Text>
    <CruxBloom
      size={150}
      {...PRESET_THEMES.oceanBreeze.config}
    />
  </View>
);

/**
 * Example 8: Monochromatic theme
 */
export const MonochromaticExample = () => {
  const blueTheme = createMonochromaticTheme('Blue', '#3498db', {
    lighten: true,
    withBorders: false,
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Monochromatic Blue</Text>
      <CruxBloom
        size={150}
        {...blueTheme.config}
      />
    </View>
  );
};

/**
 * Example 9: Multiple gradients
 */
export const MultipleGradientsExample = () => (
  <View style={styles.container}>
    <Text style={styles.title}>Multiple Gradients</Text>
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
);

/**
 * Example 10: Custom radii for unique shape
 */
export const CustomRadiiExample = () => (
  <View style={styles.container}>
    <Text style={styles.title}>Custom Radii</Text>
    <CruxBloom
      size={150}
      circle1={{ fill: '#2a3d2c', radius: 900 }}
      circle2={{ fill: '#426046', radius: 600 }}
      circle3={{ fill: '#58825e', radius: 300 }}
      circle4={{ fill: '#73a079', radius: 100 }}
    />
  </View>
);

/**
 * Example: Gallery of all preset themes
 */
export const ThemeGallery = () => (
  <ScrollView style={styles.gallery}>
    <Text style={styles.galleryTitle}>CruxBloom Theme Gallery</Text>
    {Object.entries(PRESET_THEMES).map(([key, theme]) => (
      <View key={key} style={styles.galleryItem}>
        <Text style={styles.themeName}>{theme.name}</Text>
        <Text style={styles.themeDescription}>{theme.description}</Text>
        <CruxBloom size={120} {...theme.config} />
      </View>
    ))}
  </ScrollView>
);

/**
 * Example: Interactive demo showing all customization in one place
 */
export const CompleteExample = () => (
  <View style={styles.container}>
    <Text style={styles.title}>Everything Combined</Text>
    <CruxBloom
      size={150}
      gradients={[
        {
          id: 'custom1',
          stops: [
            { color: '#667eea', offset: '0%' },
            { color: '#764ba2', offset: '100%' }
          ],
          angle: 45
        },
        {
          id: 'custom2',
          stops: [
            { color: '#f093fb', offset: '0%' },
            { color: '#f5576c', offset: '100%' }
          ],
          angle: 135
        }
      ]}
      skewX={8}
      rotate={15}
      circle1={{
        fill: 'url(#custom1)',
        opacity: 0.6,
        stroke: '#ffffff',
        strokeWidth: 4,
        offsetX: -20
      }}
      circle2={{
        fill: 'url(#custom2)',
        opacity: 0.7,
        stroke: '#ffffff',
        strokeWidth: 3,
        offsetY: 150
      }}
      circle3={{
        fill: '#667eea',
        opacity: 0.8,
        stroke: '#f5576c',
        strokeWidth: 3,
        offsetY: 280
      }}
      circle4={{
        fill: '#ffffff',
        stroke: '#764ba2',
        strokeWidth: 4,
        offsetY: 430
      }}
    />
  </View>
);

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    margin: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 15,
    color: '#333',
  },
  gallery: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  galleryTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginVertical: 20,
    color: '#333',
  },
  galleryItem: {
    alignItems: 'center',
    padding: 20,
    marginHorizontal: 10,
    marginVertical: 10,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  themeName: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 5,
    color: '#333',
  },
  themeDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 15,
    textAlign: 'center',
  },
});

// Export all examples for easy access
export const CruxBloomExamples = {
  BasicExample,
  CustomColorsExample,
  BordersExample,
  GradientExample,
  SkewExample,
  OffsetExample,
  PresetThemeExample,
  MonochromaticExample,
  MultipleGradientsExample,
  CustomRadiiExample,
  ThemeGallery,
  CompleteExample,
};
