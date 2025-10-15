import { Stack, Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import api, { Author } from '@/lib/api';

export default function Index() {
  const [authors, setAuthors] = useState<Author[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAuthors = async () => {
      try {
        const authorsData = await api.getAllAuthors();
        setAuthors(authorsData);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch authors');
        console.error('Authors fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchAuthors();
  }, []);

  const renderAuthor = ({ item }: { item: Author }) => {
    const displayName = item.displayName || item.username || 'Unknown';
    const avatarInitial = displayName.charAt(0).toUpperCase();

    return (
      <Link href={`/@${item.username}`} asChild>
        <TouchableOpacity style={styles.authorCard}>
          <View style={styles.authorAvatar}>
            <Text style={styles.authorAvatarText}>
              {avatarInitial}
            </Text>
          </View>
          <View style={styles.authorInfo}>
            <Text style={styles.authorDisplayName}>{displayName}</Text>
            <Text style={styles.authorUsername}>@{item.username}</Text>
            {item.bio && (
              <Text style={styles.authorBio} numberOfLines={2}>
                {item.bio}
              </Text>
            )}
          </View>
        </TouchableOpacity>
      </Link>
    );
  };

  return (
    <>
      <Stack.Screen options={{
        title: 'Crux Garden',
        headerBackVisible: false,
        headerLeft: () => null,
      }} />
      <View style={styles.container}>
        {loading && (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color="#12230F" />
            <Text style={styles.loadingText}>Loading authors...</Text>
          </View>
        )}

        {error && (
          <View style={styles.centerContent}>
            <Text style={styles.errorText}>Error: {error}</Text>
          </View>
        )}

        {!loading && !error && (
          <>
            <View style={styles.header}>
              <Text style={styles.title}>Authors</Text>
              <Text style={styles.subtitle}>
                {authors.length} {authors.length === 1 ? 'author' : 'authors'}
              </Text>
            </View>
            <FlatList
              data={authors}
              renderItem={renderAuthor}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>No authors found</Text>
                </View>
              }
            />
          </>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
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
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  listContent: {
    padding: 16,
  },
  authorCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  authorAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#12230F',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  authorAvatarText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  authorInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  authorDisplayName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 2,
  },
  authorUsername: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  authorBio: {
    fontSize: 14,
    color: '#888',
    lineHeight: 20,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
});
