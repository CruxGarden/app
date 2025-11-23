/**
 * ColorPicker Component
 *
 * A picker that supports both solid colors and gradients for theme building
 */

import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import Svg, { Defs, LinearGradient, Stop, Circle } from 'react-native-svg';
import Slider from '@react-native-community/slider';
import { HexColorPicker } from 'react-colorful';
import type { ColorValue } from './types';
import type { GradientDefinition } from '@/components/CruxBloom';

export interface ColorPickerProps {
  label: string;
  value: ColorValue;
  onChange: (value: ColorValue) => void;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({ label, value, onChange }) => {
  const [mode, setMode] = useState<'solid' | 'gradient'>(value.type);
  const [showSolidPicker, setShowSolidPicker] = useState(false);
  const [activeStopIndex, setActiveStopIndex] = useState<number | null>(null);

  const handleModeChange = (newMode: 'solid' | 'gradient') => {
    setMode(newMode);
    if (newMode === 'solid') {
      // Convert to solid - use first color if gradient
      const color = value.type === 'gradient' ? value.value.stops[0].color : value.value;
      onChange({ type: 'solid', value: color });
    } else {
      // Convert to gradient - use current color as first stop
      const color = value.type === 'solid' ? value.value : value.value.stops[0].color;
      // Generate unique ID with label and timestamp + random component to avoid collisions
      const uniqueId = `${label.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      onChange({
        type: 'gradient',
        value: {
          id: uniqueId,
          stops: [
            { color, offset: '0%' },
            { color: '#ffffff', offset: '100%' },
          ],
          angle: 0,
        },
      });
    }
  };

  const handleSolidColorChange = (color: string) => {
    onChange({ type: 'solid', value: color });
  };

  const handleGradientChange = (gradient: GradientDefinition) => {
    onChange({ type: 'gradient', value: gradient });
  };

  const handleGradientStopChange = (index: number, color: string) => {
    if (value.type !== 'gradient') return;
    const newStops = [...value.value.stops];
    newStops[index] = { ...newStops[index], color };
    handleGradientChange({ ...value.value, stops: newStops });
  };

  const handleGradientStopOffsetChange = (index: number, offset: number) => {
    if (value.type !== 'gradient') return;
    const newStops = [...value.value.stops];
    newStops[index] = { ...newStops[index], offset: `${offset}%` };
    handleGradientChange({ ...value.value, stops: newStops });
  };

  const handleGradientAngleChange = (angle: string) => {
    if (value.type !== 'gradient') return;
    const numAngle = parseInt(angle) || 0;
    handleGradientChange({ ...value.value, angle: numAngle });
  };

  // Helper to calculate gradient coordinates based on angle
  // 0° = top to bottom, 90° = left to right, 180° = bottom to top, 270° = right to left
  const getGradientCoords = (angle: number = 0) => {
    const rad = ((90 - angle) * Math.PI) / 180;
    return {
      x1: `${50 - 50 * Math.cos(rad)}%`,
      y1: `${50 - 50 * Math.sin(rad)}%`,
      x2: `${50 + 50 * Math.cos(rad)}%`,
      y2: `${50 + 50 * Math.sin(rad)}%`,
    };
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>

      {/* Mode Selector */}
      <View style={styles.modeSelector}>
        <TouchableOpacity
          style={[styles.modeButton, mode === 'solid' && styles.modeButtonActive]}
          onPress={() => handleModeChange('solid')}
        >
          <Text style={[styles.modeButtonText, mode === 'solid' && styles.modeButtonTextActive]}>
            Solid
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeButton, mode === 'gradient' && styles.modeButtonActive]}
          onPress={() => handleModeChange('gradient')}
        >
          <Text style={[styles.modeButtonText, mode === 'gradient' && styles.modeButtonTextActive]}>
            Gradient
          </Text>
        </TouchableOpacity>
      </View>

      {/* Preview */}
      <View style={styles.preview}>
        {mode === 'solid' && value.type === 'solid' ? (
          <View style={[styles.solidPreview, { backgroundColor: value.value }]} />
        ) : value.type === 'gradient' ? (
          <Svg width={80} height={80} style={styles.gradientPreview}>
            <Defs>
              <LinearGradient
                id={`preview-${value.value.id}`}
                {...getGradientCoords(value.value.angle)}
              >
                {value.value.stops.map((stop, idx) => (
                  <Stop
                    key={idx}
                    offset={stop.offset}
                    stopColor={stop.color}
                    stopOpacity={stop.opacity ?? 1}
                  />
                ))}
              </LinearGradient>
            </Defs>
            <Circle
              cx={40}
              cy={40}
              r={38}
              fill={`url(#preview-${value.value.id})`}
              stroke="#2a3138"
              strokeWidth={2}
            />
          </Svg>
        ) : null}
      </View>

      {/* Solid Color Picker */}
      {mode === 'solid' && value.type === 'solid' && (
        <View style={styles.solidPicker}>
          <View style={styles.inputRow}>
            <TouchableOpacity
              style={[styles.colorPreviewButton, { backgroundColor: value.value }]}
              onPress={() => setShowSolidPicker(!showSolidPicker)}
            />
            <TextInput
              style={styles.hexInput}
              value={value.value}
              onChangeText={handleSolidColorChange}
              placeholder="#000000"
              placeholderTextColor="#666"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {showSolidPicker && (
            <View style={styles.pickerContainer}>
              <HexColorPicker color={value.value} onChange={handleSolidColorChange} />
              <TouchableOpacity style={styles.doneButton} onPress={() => setShowSolidPicker(false)}>
                <Text style={styles.doneButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Gradient Picker */}
      {mode === 'gradient' && value.type === 'gradient' && (
        <View style={styles.gradientPicker}>
          {/* Gradient Colors - Always exactly 2 */}
          <Text style={styles.sectionLabel}>Color Stops</Text>
          {[0, 1].map((index) => {
            const stop = value.value.stops[index] || {
              color: '#000000',
              offset: index === 0 ? '0%' : '100%',
            };
            const offsetValue = parseInt(stop.offset) || (index === 0 ? 0 : 100);

            return (
              <View key={index}>
                <View style={styles.gradientStop}>
                  <TouchableOpacity
                    style={[styles.stopPreview, { backgroundColor: stop.color }]}
                    onPress={() => setActiveStopIndex(activeStopIndex === index ? null : index)}
                  />
                  <TextInput
                    style={styles.stopInput}
                    value={stop.color}
                    onChangeText={(color) => handleGradientStopChange(index, color)}
                    placeholder="#000000"
                    placeholderTextColor="#666"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Text style={styles.stopLabel}>{offsetValue}%</Text>
                </View>

                {/* Offset Slider */}
                <Slider
                  style={styles.slider}
                  minimumValue={0}
                  maximumValue={100}
                  step={1}
                  value={offsetValue}
                  onValueChange={(val) => handleGradientStopOffsetChange(index, Math.round(val))}
                  minimumTrackTintColor="#4dd9b8"
                  maximumTrackTintColor="#2a3138"
                  thumbTintColor="#4dd9b8"
                />

                {activeStopIndex === index && (
                  <View style={styles.pickerContainer}>
                    <HexColorPicker
                      color={stop.color}
                      onChange={(color) => handleGradientStopChange(index, color)}
                    />
                    <TouchableOpacity
                      style={styles.doneButton}
                      onPress={() => setActiveStopIndex(null)}
                    >
                      <Text style={styles.doneButtonText}>Done</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}

          {/* Gradient Angle */}
          <Text style={styles.sectionLabel}>Direction: {value.value.angle || 0}°</Text>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={360}
            step={1}
            value={value.value.angle || 0}
            onValueChange={(val) => handleGradientAngleChange(Math.round(val).toString())}
            minimumTrackTintColor="#4dd9b8"
            maximumTrackTintColor="#2a3138"
            thumbTintColor="#4dd9b8"
          />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e8eef2',
    marginBottom: 8,
  },
  modeSelector: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 8,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2a3138',
    backgroundColor: '#1a1f24',
    alignItems: 'center',
  },
  modeButtonActive: {
    backgroundColor: '#4dd9b8',
    borderColor: '#4dd9b8',
  },
  modeButtonText: {
    fontSize: 14,
    color: '#8b9298',
  },
  modeButtonTextActive: {
    color: '#0f1214',
    fontWeight: '600',
  },
  preview: {
    height: 100,
    borderRadius: 8,
    backgroundColor: '#1a1f24',
    marginBottom: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a3138',
  },
  solidPreview: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: '#2a3138',
  },
  gradientPreview: {
    // Circle preview, border handled by SVG stroke
  },
  solidPicker: {
    gap: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  colorPreviewButton: {
    width: 48,
    height: 48,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#2a3138',
  },
  hexInput: {
    flex: 1,
    backgroundColor: '#1a1f24',
    borderWidth: 1,
    borderColor: '#2a3138',
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: '#e8eef2',
    fontSize: 16,
    fontFamily: 'monospace',
  },
  pickerContainer: {
    marginTop: 12,
    backgroundColor: '#1a1f24',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2a3138',
  },
  doneButton: {
    marginTop: 16,
    backgroundColor: '#4dd9b8',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 6,
    alignItems: 'center',
  },
  doneButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f1214',
  },
  gradientPicker: {
    gap: 12,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8b9298',
    marginTop: 8,
  },
  gradientStop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stopPreview: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#2a3138',
  },
  stopInput: {
    flex: 1,
    backgroundColor: '#1a1f24',
    borderWidth: 1,
    borderColor: '#2a3138',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    color: '#e8eef2',
    fontSize: 14,
    fontFamily: 'monospace',
  },
  stopLabel: {
    fontSize: 14,
    color: '#8b9298',
    width: 50,
    fontWeight: '600',
  },
  slider: {
    width: '100%',
    height: 40,
  },
});
