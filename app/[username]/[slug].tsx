import { useEffect, useState, useCallback } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import api, { Crux } from '@/lib/api';
import CruxCard from '@/components/CruxCard';
import CruxFormModal, { CruxFormData } from '@/components/CruxFormModal';
import { Colors, Fonts, FontSizes } from '@/constants/theme';

export default function CruxBySlug() {
  const router = useRouter();
  const { username, slug } = useLocalSearchParams<{ username: string; slug: string }>();
  const [crux, setCrux] = useState<Crux | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);

  // Extract the actual slug (remove + prefix if present)
  const actualSlug = slug?.startsWith('+') ? slug.substring(1) : slug;

  const fetchCrux = useCallback(async () => {
    if (!username || !actualSlug) {
      setError('Missing username or slug');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const cruxData = await api.getCruxByAuthorAndSlug(username, actualSlug);
      setCrux(cruxData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch crux');
      console.error('Crux fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [username, actualSlug]);

  useEffect(() => {
    fetchCrux();
  }, [fetchCrux]);

  const handleCreateCrux = async (formData: CruxFormData) => {
    if (!crux) {
      throw new Error('No source crux found');
    }

    // Create the new crux
    const newCrux = await api.createCrux({
      slug: formData.slug,
      title: formData.title,
      data: formData.data,
      type: 'markdown',
      status: 'living',
      visibility: 'unlisted',
    });

    // Create dimension linking this crux to new crux
    await api.createDimension(crux.key, {
      targetId: newCrux.id,
      type: formData.dimensionType,
    });

    // Refresh crux data to show updated dimensions
    await fetchCrux();
    console.log('Created crux and dimension:', newCrux.key, formData.dimensionType);
  };

  const handleEditCrux = async (formData: CruxFormData) => {
    if (!crux) {
      throw new Error('No crux found');
    }

    // Update the crux
    await api.updateCrux(crux.key, {
      slug: formData.slug,
      title: formData.title,
      data: formData.data,
    });

    // Refresh crux data to show updates
    await fetchCrux();
    console.log('Updated crux:', crux.key);
  };

  const handleDeleteCrux = async () => {
    console.log('Delete button clicked!');
    if (!crux) {
      console.log('No crux found');
      return;
    }

    const confirmed = window.confirm(
      'Are you sure you want to delete this crux? This will also delete all dimensions you created involving this crux.'
    );

    if (!confirmed) {
      console.log('Delete cancelled');
      return;
    }

    console.log('Delete confirmed, calling API...');
    try {
      await api.deleteCrux(crux.key);
      console.log('Deleted crux:', crux.key);
      // Navigate back to author page after deletion
      if (username) {
        router.replace(`/@${username.startsWith('@') ? username.slice(1) : username}`);
      } else {
        router.replace('/');
      }
    } catch (err) {
      console.error('Delete error:', err);
      alert('Failed to delete crux');
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: crux ? (crux.title || crux.slug) : 'Crux',
        }}
      />
      <ScrollView contentContainerStyle={styles.container}>
        {loading && (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color={Colors.accentSecondary} />
            <Text style={styles.loadingText}>Loading crux...</Text>
          </View>
        )}

        {error && (
          <View style={styles.centerContent}>
            <Text style={styles.errorText}>Error: {error}</Text>
          </View>
        )}

        {crux && !loading && (
          <View style={styles.cruxContainer}>
            <CruxCard
              cruxKey={crux.key}
              title={crux.title}
              data={crux.data}
              type={crux.type}
              status={crux.status}
              showDimensions={true}
              authorUsername={username}
              actions={
                <View style={styles.buttonContainer}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => setEditModalVisible(true)}
                  >
                    <Text style={styles.actionButtonText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => setModalVisible(true)}
                  >
                    <Text style={styles.actionButtonText}>+ Add Crux</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={handleDeleteCrux}
                  >
                    <Text style={styles.deleteButtonText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              }
            />
          </View>
        )}
      </ScrollView>

      {/* Add Crux Modal */}
      <CruxFormModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSubmit={handleCreateCrux}
        sourceCrux={crux ? {
          title: crux.title,
          data: crux.data,
        } : undefined}
      />

      {/* Edit Crux Modal */}
      <CruxFormModal
        visible={editModalVisible}
        onClose={() => setEditModalVisible(false)}
        onSubmit={handleEditCrux}
        editMode={true}
        initialData={crux ? {
          title: crux.title,
          slug: crux.slug,
          data: crux.data,
        } : undefined}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: Colors.background,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    minHeight: 300,
  },
  loadingText: {
    marginTop: 12,
    fontSize: FontSizes.lg,
    color: Colors.textSecondary,
    fontFamily: Fonts.body,
  },
  errorText: {
    color: Colors.error,
    fontSize: FontSizes.lg,
    textAlign: 'center',
    fontFamily: Fonts.body,
  },
  cruxContainer: {
    padding: 20,
    maxWidth: 900,
    width: '100%',
    alignSelf: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    backgroundColor: Colors.accentMuted,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.accentPrimary,
  },
  actionButtonText: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.textPrimary,
    fontFamily: Fonts.body,
  },
  deleteButton: {
    backgroundColor: Colors.surface,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.error,
  },
  deleteButtonText: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.error,
    fontFamily: Fonts.body,
  },
});
