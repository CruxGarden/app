import { Stack, Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View, FlatList, StyleSheet, TouchableOpacity, Image } from 'react-native';
import api, { Author } from '@/lib/api';
import { Colors, Fonts, FontSizes } from '@/constants/theme';

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

    return (
      <Link href={`/@${item.username}`} asChild>
        <TouchableOpacity style={styles.authorCard}>
          <View style={styles.authorAvatar}>
            <Image
              source={require('@/assets/images/crux.garden-icon-forest.png')}
              style={styles.authorAvatarImage}
              resizeMode="contain"
            />
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
            <ActivityIndicator size="large" color={Colors.accentSecondary} />
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
    backgroundColor: Colors.background,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
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
  header: {
    padding: 20,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    fontSize: FontSizes.xxxxl,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 4,
    fontFamily: Fonts.body,
  },
  subtitle: {
    fontSize: FontSizes.base,
    color: Colors.textSecondary,
    fontFamily: Fonts.body,
  },
  listContent: {
    padding: 16,
  },
  authorCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  authorAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.accentPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    overflow: 'hidden',
  },
  authorAvatarImage: {
    width: 60,
    height: 60,
  },
  authorInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  authorDisplayName: {
    fontSize: FontSizes.xl,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    marginBottom: 2,
    fontFamily: Fonts.body,
  },
  authorUsername: {
    fontSize: FontSizes.base,
    color: Colors.textSecondary,
    marginBottom: 4,
    fontFamily: Fonts.body,
  },
  authorBio: {
    fontSize: FontSizes.base,
    color: Colors.textSecondary,
    lineHeight: 24,
    fontFamily: Fonts.body,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: FontSizes.base,
    color: Colors.textTertiary,
    fontFamily: Fonts.body,
  },
});
