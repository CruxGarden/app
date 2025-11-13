/**
 * Themed Image Component
 *
 * Drop-in replacement for React Native Image with automatic theme support
 */

import React from 'react';
import { Image as RNImage, ImageProps as RNImageProps } from 'react-native';

export interface ImageProps extends RNImageProps {
  // Image doesn't need theme styling typically, but we include it for consistency
  // You can extend with tintColor support if needed
}

export const Image: React.FC<ImageProps> = (props) => {
  return <RNImage {...props} />;
};
