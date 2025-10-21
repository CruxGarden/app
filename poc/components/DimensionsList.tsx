import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Dimension } from '@/lib/api';
import { Colors, Fonts, FontSizes } from '@/constants/theme';

export interface DimensionsListProps {
  dimensions: Dimension[];
  loading?: boolean;
  authorUsername?: string;
}

export default function DimensionsList({ dimensions, loading, authorUsername }: DimensionsListProps) {
  const router = useRouter();

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading dimensions...</Text>
      </View>
    );
  }

  if (dimensions.length === 0) {
    return null;
  }

  // Group dimensions by type
  const dimensionsByType = {
    gate: dimensions.filter(d => d.type === 'gate'),
    garden: dimensions.filter(d => d.type === 'garden'),
    growth: dimensions.filter(d => d.type === 'growth'),
    graft: dimensions.filter(d => d.type === 'graft'),
  };

  const typeLabels = {
    gate: 'Gates',
    garden: 'Gardens',
    growth: 'Growth',
    graft: 'Grafts',
  };

  const typeDescriptions = {
    gate: 'Origins and sources',
    garden: 'Creations and consequences',
    growth: 'Development over time',
    graft: 'Lateral connections',
  };

  return (
    <View style={styles.container}>
      {Object.entries(dimensionsByType).map(([type, dims]) => {
        if (dims.length === 0) return null;

        return (
          <View key={type} style={styles.typeSection}>
            <View style={styles.typeHeader}>
              <Text style={styles.typeTitle}>
                {typeLabels[type as keyof typeof typeLabels]} ({dims.length})
              </Text>
              <Text style={styles.typeDescription}>
                {typeDescriptions[type as keyof typeof typeDescriptions]}
              </Text>
            </View>
            <View style={styles.dimensionsList}>
              {dims.map((dimension) => (
                <TouchableOpacity
                  key={dimension.id}
                  style={styles.dimensionCard}
                  onPress={() => {
                    if (authorUsername) {
                      // Strip leading @ if present
                      const cleanUsername = authorUsername.startsWith('@')
                        ? authorUsername.slice(1)
                        : authorUsername;

                      // Prefer slug-based URL, fall back to key or ID
                      if (dimension.target.slug) {
                        router.push(`/@${cleanUsername}/+${dimension.target.slug}`);
                      } else if (dimension.target.key) {
                        router.push(`/@${cleanUsername}/c/${dimension.target.key}`);
                      } else if (dimension.target.id) {
                        router.push(`/@${cleanUsername}/c/${dimension.target.id}`);
                      }
                    }
                  }}
                >
                  {dimension.target.title && (
                    <Text style={styles.dimensionTitle}>{dimension.target.title}</Text>
                  )}
                  {dimension.target.data && (
                    <Text style={styles.dimensionPreview} numberOfLines={2}>
                      {dimension.target.data}
                    </Text>
                  )}
                  {dimension.target.slug && (
                    <Text style={styles.dimensionSlug}>+{dimension.target.slug}</Text>
                  )}
                  {dimension.note && (
                    <Text style={styles.dimensionNote}>{dimension.note}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingText: {
    fontSize: FontSizes.base,
    color: Colors.textTertiary,
    textAlign: 'center',
    padding: 20,
    fontFamily: Fonts.body,
  },
  emptyText: {
    fontSize: FontSizes.base,
    color: Colors.textTertiary,
    textAlign: 'center',
    padding: 20,
    fontStyle: 'italic',
    fontFamily: Fonts.body,
  },
  typeSection: {
    marginBottom: 24,
  },
  typeHeader: {
    marginBottom: 12,
  },
  typeTitle: {
    fontSize: FontSizes.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
    fontFamily: Fonts.body,
  },
  typeDescription: {
    fontSize: FontSizes.sm,
    color: Colors.textSecondary,
    fontStyle: 'italic',
    fontFamily: Fonts.body,
  },
  dimensionsList: {
    gap: 8,
  },
  dimensionCard: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accentPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dimensionTitle: {
    fontSize: FontSizes.lg,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 6,
    fontFamily: Fonts.body,
  },
  dimensionPreview: {
    fontSize: FontSizes.base,
    color: Colors.textSecondary,
    lineHeight: 24,
    marginBottom: 6,
    fontFamily: Fonts.body,
  },
  dimensionSlug: {
    fontSize: FontSizes.xs,
    color: Colors.accentSecondary,
    fontFamily: Fonts.mono,
    marginBottom: 4,
  },
  dimensionNote: {
    fontSize: FontSizes.sm,
    color: Colors.textTertiary,
    fontStyle: 'italic',
    lineHeight: 22,
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    fontFamily: Fonts.body,
  },
});
