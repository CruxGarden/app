import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { useApp } from './lib/_AppContext';
import { api, Author } from './lib/api';
import { Container, View, Text, Button, Panel, Loading } from '@/components';
import { useTheme } from '@/contexts/ThemeContext';

export default function AuthorPage() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const router = useRouter();
  const { account } = useApp();
  const { tokens } = useTheme();

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
    return <Loading />;
  }

  if (error || !author) {
    return (
      <Container centered>
        <Text style={{ color: '#e63946', fontSize: 16, marginBottom: tokens.spacing.lg }}>
          {error || 'Author not found'}
        </Text>
        <Button title="Go Back" onPress={() => router.back()} />
      </Container>
    );
  }

  return (
    <Container padded>
      <View style={{ marginBottom: tokens.spacing.xxl }}>
        <Text
          style={{
            fontSize: 24,
            fontWeight: 'bold',
            color: tokens.colors.buttonBackground,
            marginBottom: tokens.spacing.sm,
          }}
        >
          @{author.username}
        </Text>
        <Text variant="heading" style={{ marginBottom: tokens.spacing.sm }}>
          {author.displayName}
        </Text>
        {author.bio && (
          <Text style={{ fontSize: 14, opacity: 0.7, lineHeight: 20 }}>{author.bio}</Text>
        )}
      </View>

      {isOwnPage && (
        <View style={{ marginBottom: tokens.spacing.lg }}>
          <View style={{ flexDirection: 'row', gap: tokens.spacing.md }}>
            <Button title="Profile" onPress={() => router.push('/author')} />
            <Button title="Account" onPress={() => router.push('/account')} />
            <Button title="Settings" onPress={() => router.push('/settings')} />
          </View>
        </View>
      )}

      <View style={{ flex: 1 }}>
        {author.root ? (
          <Panel>
            <Text
              style={{
                fontSize: 12,
                opacity: 0.7,
                textTransform: 'uppercase',
                marginBottom: tokens.spacing.sm,
                fontWeight: '600',
              }}
            >
              Root Crux
            </Text>
            {author.root.title && (
              <Text
                variant="heading"
                weight="bold"
                style={{ marginBottom: tokens.spacing.sm }}
              >
                {author.root.title}
              </Text>
            )}
            <Text style={{ opacity: 0.7, lineHeight: 20 }}>{author.root.data}</Text>
          </Panel>
        ) : (
          <Text style={{ opacity: 0.7, textAlign: 'center', marginTop: 40 }}>
            No root crux yet...
          </Text>
        )}
      </View>
    </Container>
  );
}
