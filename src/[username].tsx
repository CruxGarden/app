import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { useApp } from './lib/_AppContext';
import { api, Author } from './lib/api';

export default function AuthorPage() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const router = useRouter();
  const { account, logout } = useApp();

  const [author, setAuthor] = useState<Author | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadAuthor();
  }, [username]);

  const loadAuthor = async () => {
    if (!username) return;

    setIsLoading(true);
    setError('');

    try {
      // username param includes @ prefix (e.g., "@john"), pass as-is to API
      // Fetch with 'root' embed to get the root crux for display
      const authorData = await api.getAuthor(username, 'root');
      setAuthor(authorData);
    } catch (err: any) {
      console.error('Failed to load author:', err);
      setError('Author not found');
    } finally {
      setIsLoading(false);
    }
  };

  // Strip @ prefix for comparison if present
  const cleanUsername = username?.startsWith('@') ? username.slice(1) : username;
  const isOwnPage = account?.author?.username === cleanUsername;

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#4dd9b8" />
      </View>
    );
  }

  if (error || !author) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{error || 'Author not found'}</Text>
        <TouchableOpacity style={styles.button} onPress={() => router.back()}>
          <Text style={styles.buttonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.username}>@{author.username}</Text>
        <Text style={styles.displayName}>{author.displayName}</Text>
        {author.bio && <Text style={styles.bio}>{author.bio}</Text>}
      </View>

      {isOwnPage && (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.button} onPress={() => logout()}>
            <Text style={styles.buttonText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.content}>
        {author.root ? (
          <View style={styles.rootCrux}>
            <Text style={styles.rootLabel}>Root Crux</Text>
            {author.root.title && <Text style={styles.rootTitle}>{author.root.title}</Text>}
            <Text style={styles.rootData}>{author.root.data}</Text>
          </View>
        ) : (
          <Text style={styles.placeholder}>No root crux yet...</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1214',
    padding: 24,
  },
  header: {
    marginBottom: 32,
  },
  username: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4dd9b8',
    marginBottom: 8,
  },
  displayName: {
    fontSize: 20,
    color: '#e8eef2',
    marginBottom: 8,
  },
  bio: {
    fontSize: 14,
    color: '#c2cad2',
    lineHeight: 20,
  },
  actions: {
    marginBottom: 24,
  },
  content: {
    flex: 1,
  },
  rootCrux: {
    backgroundColor: '#1a1d21',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2f3338',
  },
  rootLabel: {
    fontSize: 12,
    color: '#8b9199',
    textTransform: 'uppercase',
    marginBottom: 8,
    fontWeight: '600',
  },
  rootTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#e8eef2',
    marginBottom: 8,
  },
  rootData: {
    fontSize: 14,
    color: '#c2cad2',
    lineHeight: 20,
  },
  placeholder: {
    fontSize: 14,
    color: '#8b9199',
    textAlign: 'center',
    marginTop: 40,
  },
  button: {
    backgroundColor: '#4dd9b8',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  buttonText: {
    color: '#0f1214',
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 16,
    color: '#e89881',
    textAlign: 'center',
    marginBottom: 24,
  },
});
