/**
 * HexColorInput Component
 *
 * A color picker with hex input for solid colors
 */

import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { HexColorPicker } from 'react-colorful';

export interface HexColorInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export const HexColorInput: React.FC<HexColorInputProps> = ({
  label,
  value,
  onChange,
  placeholder = '#000000',
}) => {
  const [showPicker, setShowPicker] = useState(false);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>

      <View style={styles.inputRow}>
        {/* Color Preview Button */}
        <TouchableOpacity
          style={[styles.colorPreview, { backgroundColor: value || '#000000' }]}
          onPress={() => setShowPicker(!showPicker)}
        />

        {/* Hex Input */}
        <TextInput
          style={styles.hexInput}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor="#666"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {/* Color Picker */}
      {showPicker && (
        <View style={styles.pickerContainer}>
          <HexColorPicker color={value || '#000000'} onChange={onChange} />
          <TouchableOpacity
            style={styles.doneButton}
            onPress={() => setShowPicker(false)}
          >
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e8eef2',
    marginBottom: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  colorPreview: {
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
    paddingVertical: 12,
    paddingHorizontal: 16,
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
});
