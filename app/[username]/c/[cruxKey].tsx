import { useEffect, useState, useCallback } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import api, { Crux } from '@/lib/api';
import CruxCard from '@/components/CruxCard';
import CruxFormModal, { CruxFormData } from '@/components/CruxFormModal';

export default function CruxDetail() {
  const router = useRouter();
  const { username, cruxKey } = useLocalSearchParams<{ username: string; cruxKey: string }>();
  const [crux, setCrux] = useState<Crux | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);

  const fetchCrux = useCallback(async () => {
    if (!cruxKey) {
      setError('No crux key provided');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const cruxData = await api.getCrux(cruxKey);
      setCrux(cruxData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch crux');
      console.error('Crux fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [cruxKey]);

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
      // Navigate back after deletion using replace to force refresh
      // Navigate to the author page to force a fresh data load
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
            <ActivityIndicator size="large" color="#12230F" />
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
            />

            {/* Action Buttons */}
            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[styles.button, styles.editButton]}
                onPress={() => setEditModalVisible(true)}
              >
                <Text style={styles.editButtonText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.addButton]}
                onPress={() => setModalVisible(true)}
              >
                <Text style={styles.addButtonText}>+ Add Crux</Text>
              </TouchableOpacity>
            </View>

            {/* Delete Button */}
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={handleDeleteCrux}
            >
              <Text style={styles.deleteButtonText}>Delete Crux</Text>
            </TouchableOpacity>
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
    backgroundColor: '#f5f5f5',
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
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    color: '#d32f2f',
    fontSize: 16,
    textAlign: 'center',
  },
  cruxContainer: {
    padding: 20,
    maxWidth: 900,
    width: '100%',
    alignSelf: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  button: {
    flex: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  editButton: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#12230F',
  },
  editButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#12230F',
  },
  addButton: {
    backgroundColor: '#12230F',
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  deleteButton: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d32f2f',
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#d32f2f',
  },
});
