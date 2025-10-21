import { useEffect, useState, useCallback } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, ScrollView, TouchableOpacity, Platform, Image } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import api, { Author } from '@/lib/api';
import CruxCard from '@/components/CruxCard';
import CruxFormModal, { CruxFormData } from '@/components/CruxFormModal';
import { Colors, Fonts, FontSizes } from '@/constants/theme';

// Web-only import for force graph
const CruxNetworkGraph = Platform.OS === 'web'
  ? require('@/components/CruxNetworkGraph.web').default
  : null;

export default function AuthorProfile() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const [author, setAuthor] = useState<Author | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<'graph' | 'crux'>('crux');

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
            <ActivityIndicator size="large" color={Colors.accentSecondary} />
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
                <Image
                  source={require('@/assets/images/crux.garden-icon-forest.png')}
                  style={styles.avatarImage}
                  resizeMode="contain"
                />
              </View>
              <Text style={styles.displayName}>{author.displayName}</Text>
              <Text style={styles.username}>@{author.username}</Text>
              {author.bio && (
                <Text style={styles.bioText}>{author.bio}</Text>
              )}
            </View>

            {/* Tab Buttons */}
            <View style={styles.tabContainer}>
              <TouchableOpacity
                style={[styles.tabButton, activeTab === 'crux' && styles.tabButtonActive]}
                onPress={() => setActiveTab('crux')}
              >
                <Text style={[styles.tabButtonText, activeTab === 'crux' && styles.tabButtonTextActive]}>
                  Root
                </Text>
              </TouchableOpacity>
              {Platform.OS === 'web' && CruxNetworkGraph && (
                <TouchableOpacity
                  style={[styles.tabButton, activeTab === 'graph' && styles.tabButtonActive]}
                  onPress={() => setActiveTab('graph')}
                >
                  <Text style={[styles.tabButtonText, activeTab === 'graph' && styles.tabButtonTextActive]}>
                    Graph
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Tab Content */}
            {activeTab === 'graph' && Platform.OS === 'web' && CruxNetworkGraph && (
              <View style={styles.graphContainer}>
                <View style={styles.graphWrapper}>
                  <CruxNetworkGraph authorKey={`@${author.username}`} />
                </View>
              </View>
            )}

            {activeTab === 'crux' && author.root && (
              <CruxCard
                cruxKey={author.root.key}
                title={author.root.title}
                data={author.root.data}
                type={author.root.type}
                status={author.root.status}
                showDimensions={true}
                authorUsername={author.username}
                actions={
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => setModalVisible(true)}
                  >
                    <Text style={styles.actionButtonText}>+ Add Crux</Text>
                  </TouchableOpacity>
                }
              />
            )}
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
  profileContainer: {
    padding: 20,
    maxWidth: 900,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    paddingVertical: 30,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  avatarImage: {
    width: 80,
    height: 80,
  },
  displayName: {
    fontSize: FontSizes.xxxl,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 4,
    fontFamily: Fonts.body,
  },
  username: {
    fontSize: FontSizes.lg,
    color: Colors.textSecondary,
    marginBottom: 8,
    fontFamily: Fonts.body,
  },
  bioText: {
    fontSize: FontSizes.base,
    color: Colors.textSecondary,
    lineHeight: 26,
    textAlign: 'center',
    paddingHorizontal: 20,
    marginTop: 8,
    fontFamily: Fonts.body,
  },
  actionButton: {
    backgroundColor: Colors.accentMuted,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.accentPrimary,
    alignSelf: 'flex-start',
  },
  actionButtonText: {
    fontSize: FontSizes.sm,
    fontWeight: '600',
    color: Colors.textPrimary,
    fontFamily: Fonts.body,
  },
  graphContainer: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionTitle: {
    fontSize: FontSizes.xxl,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 16,
    fontFamily: Fonts.body,
  },
  graphWrapper: {
    height: 600,
    borderRadius: 8,
  },
  tabContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  tabButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  tabButtonActive: {
    backgroundColor: Colors.accentMuted,
    borderColor: Colors.accentPrimary,
  },
  tabButtonText: {
    fontSize: FontSizes.lg,
    fontWeight: '600',
    color: Colors.textSecondary,
    fontFamily: Fonts.body,
  },
  tabButtonTextActive: {
    color: Colors.textPrimary,
  },
});
