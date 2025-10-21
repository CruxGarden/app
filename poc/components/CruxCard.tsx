import { useEffect, useState, ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import api, { Dimension } from '@/lib/api';
import DimensionsList from './DimensionsList';
import { Colors, Fonts, FontSizes } from '@/constants/theme';

export interface CruxCardProps {
  cruxKey: string;
  title?: string;
  data: string;
  type?: string;
  status?: string;
  showDimensions?: boolean;
  authorUsername?: string;
  actions?: ReactNode;
}

export default function CruxCard({ cruxKey, title, data, showDimensions = false, authorUsername, actions }: CruxCardProps) {
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDimensions = async () => {
      try {
        const dims = await api.getDimensions(cruxKey);
        setDimensions(dims);
      } catch (err) {
        console.error('Failed to fetch dimensions:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDimensions();
  }, [cruxKey]);

  return (
    <View style={styles.container}>
      {title && <Text style={styles.title}>{title}</Text>}
      <Text style={styles.data}>{data}</Text>

      {showDimensions ? (
        <View style={styles.dimensionsSection}>
          <DimensionsList dimensions={dimensions} loading={loading} authorUsername={authorUsername} />
        </View>
      ) : (
        !loading && dimensions.length > 0 && (
          <Text style={styles.dimensionCount}>
            {dimensions.length} {dimensions.length === 1 ? 'dimension' : 'dimensions'}
          </Text>
        )
      )}

      {actions && (
        <View style={styles.actionsSection}>
          {actions}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  title: {
    fontSize: FontSizes.xxl,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 12,
    fontFamily: Fonts.body,
  },
  data: {
    fontSize: FontSizes.lg,
    color: Colors.textSecondary,
    lineHeight: 28,
    fontFamily: Fonts.body,
  },
  dimensionCount: {
    fontSize: FontSizes.sm,
    color: Colors.textTertiary,
    marginTop: 12,
    fontStyle: 'italic',
    fontFamily: Fonts.body,
  },
  dimensionsSection: {
    marginTop: 20,
  },
  actionsSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
});
