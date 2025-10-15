import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import api, { Dimension } from '@/lib/api';
import DimensionsList from './DimensionsList';

export interface CruxCardProps {
  cruxKey: string;
  title?: string;
  data: string;
  type?: string;
  status?: string;
  showDimensions?: boolean;
  authorUsername?: string;
}

export default function CruxCard({ cruxKey, title, data, showDimensions = false, authorUsername }: CruxCardProps) {
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
  },
  data: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
  },
  dimensionCount: {
    fontSize: 13,
    color: '#999',
    marginTop: 12,
    fontStyle: 'italic',
  },
  dimensionsSection: {
    marginTop: 20,
  },
});
