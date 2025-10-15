import { useEffect, useState, useCallback } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import api, { Author } from '@/lib/api';
import CruxCard from '@/components/CruxCard';
import CruxFormModal, { CruxFormData } from '@/components/CruxFormModal';

export default function AuthorProfile() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const [author, setAuthor] = useState<Author | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const fetchAuthor = useCallback(async () => {
    if (!username) {
      setError('No username provided');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const authorData = await api.getAuthor(username, 'root');
      setAuthor(authorData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch author');
      console.error('Author fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [username]);

  useEffect(() => {
    fetchAuthor();
  }, [fetchAuthor]);

  const handleCreateCrux = async (formData: CruxFormData) => {
    if (!author?.root) {
      throw new Error('No root crux found');
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

    // Create dimension linking root crux to new crux
    await api.createDimension(author.root.key, {
      targetId: newCrux.id,
      type: formData.dimensionType,
    });

    // Refresh author data to show updated dimension count
    await fetchAuthor();
    console.log('Created crux and dimension:', newCrux.key, formData.dimensionType);
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: author ? `@${author.username}` : 'Author Profile',
        }}
      />
      <ScrollView contentContainerStyle={styles.container}>
        {loading && (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color="#0000ff" />
            <Text style={styles.loadingText}>Loading author...</Text>
          </View>
        )}

        {error && (
          <View style={styles.centerContent}>
            <Text style={styles.errorText}>Error: {error}</Text>
          </View>
        )}

        {author && !loading && (
          <View style={styles.profileContainer}>
            {/* Profile Header */}
            <View style={styles.header}>
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>
                  {author.displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text style={styles.displayName}>{author.displayName}</Text>
              <Text style={styles.username}>@{author.username}</Text>
              {author.bio && (
                <Text style={styles.bioText}>{author.bio}</Text>
              )}
            </View>

            {/* Root Crux */}
            {author.root && (
              <CruxCard
                cruxKey={author.root.key}
                title={author.root.title}
                data={author.root.data}
                type={author.root.type}
                status={author.root.status}
                showDimensions={true}
                authorUsername={author.username}
              />
            )}

            {/* Add Crux Button */}
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setModalVisible(true)}
            >
              <Text style={styles.addButtonText}>+ Add Crux</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Crux Form Modal */}
      <CruxFormModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSubmit={handleCreateCrux}
        sourceCrux={author?.root ? {
          title: author.root.title,
          data: author.root.data,
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
  profileContainer: {
    padding: 20,
    maxWidth: 900,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    paddingVertical: 30,
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 20,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#12230F',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  displayName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  username: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  bioText: {
    fontSize: 15,
    color: '#666',
    lineHeight: 22,
    textAlign: 'center',
    paddingHorizontal: 20,
    marginTop: 8,
  },
  addButton: {
    backgroundColor: '#12230F',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
