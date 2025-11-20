/**
 * ShadowControls Component
 *
 * Reusable shadow configuration controls for theme builder
 */

import React from 'react';
import { View, Text, Switch } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import Slider from '@react-native-community/slider';
import { HexColorInput } from './HexColorInput';

export interface ShadowControlsProps {
  /** Label for this shadow control (e.g., "Bloom Shadow", "Panel Shadow") */
  label: string;
  /** Whether shadow is enabled */
  enabled?: boolean;
  /** Shadow color (hex string) */
  color?: string;
  /** X offset as string */
  offsetX?: string;
  /** Y offset as string */
  offsetY?: string;
  /** Blur radius as string */
  blurRadius?: string;
  /** Opacity as string (0-1) */
  opacity?: string;
  /** Callback when any value changes */
  onChange: (field: 'enabled' | 'color' | 'offsetX' | 'offsetY' | 'blurRadius' | 'opacity', value: string | boolean) => void;
}

export const ShadowControls: React.FC<ShadowControlsProps> = ({
  label,
  enabled = false,
  color = '#000000',
  offsetX = '0',
  offsetY = '0',
  blurRadius = '0',
  opacity = '0',
  onChange,
}) => {
  return (
    <View style={styles.container}>
      {/* Enable Toggle */}
      <View style={styles.field}>
        <View style={styles.switchRow}>
          <Text style={styles.label}>{label}</Text>
          <Switch
            value={enabled}
            onValueChange={(value) => onChange('enabled', value)}
            trackColor={{ false: '#2a3138', true: '#4dd9b8' }}
            thumbColor={enabled ? '#ffffff' : '#f4f3f4'}
          />
        </View>
      </View>

      {/* Show controls only when enabled */}
      {enabled && (
        <>
          {/* Shadow Color */}
          <HexColorInput
            label="Shadow Color"
            value={color}
            onChange={(value) => onChange('color', value)}
            placeholder="#000000"
          />

          {/* X Offset Slider */}
          <View style={styles.field}>
            <Text style={styles.label}>
              X Offset: {parseInt(offsetX || '0')}px
            </Text>
            <Slider
              style={styles.slider}
              minimumValue={-20}
              maximumValue={20}
              step={1}
              value={parseInt(offsetX || '0')}
              onValueChange={(val) => onChange('offsetX', Math.round(val).toString())}
              minimumTrackTintColor="#4dd9b8"
              maximumTrackTintColor="#2a3138"
              thumbTintColor="#4dd9b8"
            />
          </View>

          {/* Y Offset Slider */}
          <View style={styles.field}>
            <Text style={styles.label}>
              Y Offset: {parseInt(offsetY || '0')}px
            </Text>
            <Slider
              style={styles.slider}
              minimumValue={-20}
              maximumValue={20}
              step={1}
              value={parseInt(offsetY || '0')}
              onValueChange={(val) => onChange('offsetY', Math.round(val).toString())}
              minimumTrackTintColor="#4dd9b8"
              maximumTrackTintColor="#2a3138"
              thumbTintColor="#4dd9b8"
            />
          </View>

          {/* Blur Radius Slider */}
          <View style={styles.field}>
            <Text style={styles.label}>
              Blur Radius: {parseInt(blurRadius || '0')}px
            </Text>
            <Slider
              style={styles.slider}
              minimumValue={0}
              maximumValue={30}
              step={1}
              value={parseInt(blurRadius || '0')}
              onValueChange={(val) => onChange('blurRadius', Math.round(val).toString())}
              minimumTrackTintColor="#4dd9b8"
              maximumTrackTintColor="#2a3138"
              thumbTintColor="#4dd9b8"
            />
          </View>

          {/* Opacity Slider */}
          <View style={styles.field}>
            <Text style={styles.label}>
              Opacity: {(parseFloat(opacity || '0') * 100).toFixed(0)}%
            </Text>
            <Slider
              style={styles.slider}
              minimumValue={0}
              maximumValue={1}
              step={0.05}
              value={parseFloat(opacity || '0')}
              onValueChange={(val) => onChange('opacity', val.toFixed(2))}
              minimumTrackTintColor="#4dd9b8"
              maximumTrackTintColor="#2a3138"
              thumbTintColor="#4dd9b8"
            />
          </View>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  field: {
    marginBottom: 16,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#e8eef2',
    marginBottom: 8,
  },
  slider: {
    width: '100%',
    height: 40,
  },
});
