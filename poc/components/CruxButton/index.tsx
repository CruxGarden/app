/**
 * CruxButton Component
 *
 * A button component that supports both solid colors and gradients,
 * similar to CruxBloom's color handling.
 */

import React from 'react';
import { Text, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { GradientDefinition } from '@/components/CruxBloom';
import type { ShadowConfig } from '@/utils/shadow';
import { getShadowStyle } from '@/utils/shadow';

export type ButtonColorValue =
  | { type: 'solid'; value: string }
  | { type: 'gradient'; value: GradientDefinition };

export interface CruxButtonProps {
  /** Button text */
  title: string;
  /** Background color - can be solid or gradient */
  backgroundColor: ButtonColorValue;
  /** Text color */
  textColor: string;
  /** Border color */
  borderColor?: string;
  /** Border width */
  borderWidth?: number;
  /** Border style */
  borderStyle?: 'solid' | 'dashed' | 'dotted';
  /** Border radius */
  borderRadius?: number;
  /** Shadow configuration */
  shadow?: ShadowConfig;
  /** onPress handler */
  onPress?: () => void;
  /** Font family */
  fontFamily?: string;
  /** Font size (defaults to 16 for sans-serif) */
  fontSize?: number;
}

export const CruxButton: React.FC<CruxButtonProps> = ({
  title,
  backgroundColor,
  textColor,
  borderColor,
  borderWidth = 0,
  borderStyle = 'solid',
  borderRadius = 6,
  shadow,
  onPress,
  fontFamily,
  fontSize = 16,
}) => {
  const shadowStyle = shadow ? getShadowStyle(shadow) : {};

  const buttonStyle = {
    borderColor,
    borderWidth,
    borderStyle,
    borderRadius,
    ...shadowStyle,
  };

  const textStyle = {
    color: textColor,
    fontFamily,
    fontSize,
  };

  if (backgroundColor.type === 'gradient') {
    // Extract gradient colors and angle
    const gradient = backgroundColor.value;
    const colors = gradient.stops.map((stop) => stop.color) as [string, string, ...string[]];

    // Convert angle to start/end points for LinearGradient
    // LinearGradient uses [x, y] coordinates where 0,0 is top-left
    const angleInRadians = ((gradient.angle || 0) - 90) * (Math.PI / 180);
    const start = {
      x: 0.5 + Math.cos(angleInRadians) * 0.5,
      y: 0.5 + Math.sin(angleInRadians) * 0.5,
    };
    const end = {
      x: 0.5 - Math.cos(angleInRadians) * 0.5,
      y: 0.5 - Math.sin(angleInRadians) * 0.5,
    };

    return (
      <Pressable onPress={onPress} style={[styles.button, buttonStyle]}>
        <LinearGradient colors={colors} start={start} end={end} style={styles.gradient}>
          <Text style={[styles.text, textStyle]}>{title}</Text>
        </LinearGradient>
      </Pressable>
    );
  }

  // Solid color button
  return (
    <Pressable
      onPress={onPress}
      style={[styles.button, buttonStyle, { backgroundColor: backgroundColor.value }]}
    >
      <Text style={[styles.text, styles.solidText, textStyle]}>{title}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  button: {
    overflow: 'hidden',
  },
  gradient: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontWeight: '600',
    textAlign: 'center',
  },
  solidText: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
});
