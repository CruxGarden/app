import { useState, useEffect, useRef } from 'react';
import { Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from './lib/_AppContext';
import api, { Author } from './lib/api';
import { Container, ScrollView, View, Text, TextInput, Button, Section, Loading } from '@/components';
import { useTheme } from '@/contexts/ThemeContext';

export default function AuthorScreen() {
  const router = useRouter();
  const { account } = useApp();
  const { tokens } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [author, setAuthor] = useState<Author | null>(null);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [checkingUsername, setCheckingUsername] = useState(false);
  const usernameCheckTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadAuthor();
  }, []);

  useEffect(() => {
    return () => {
      if (usernameCheckTimeout.current) {
        clearTimeout(usernameCheckTimeout.current);
      }
    };
  }, []);

  const loadAuthor = async () => {
    try {
      setLoading(true);
      if (account?.author) {
        const authorData = await api.getAuthor(account.author.username);
        setAuthor(authorData);
        setUsername(authorData.username);
        setDisplayName(authorData.displayName);
        setBio(authorData.bio || '');
      }
    } catch (error: any) {
      console.error('Failed to load author:', error);
      Alert.alert('Error', 'Failed to load author information');
    } finally {
      setLoading(false);
    }
  };

  const checkUsernameAvailability = async (usernameToCheck: string) => {
    if (!usernameToCheck || usernameToCheck.trim().length === 0) {
      setUsernameError('Username cannot be empty');
      return;
    }

    const usernameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!usernameRegex.test(usernameToCheck)) {
      setUsernameError('Username can only contain letters, numbers, hyphens, and underscores');
      return;
    }

    if (usernameToCheck.toLowerCase() === author?.username.toLowerCase()) {
      setUsernameError('');
      return;
    }

    try {
      setCheckingUsername(true);
      setUsernameError('');
      const result = await api.checkUsernameAvailability(usernameToCheck);

      if (!result.available) {
        setUsernameError('This username is already in use');
      }
    } catch (error: any) {
      console.error('Failed to check username availability:', error);
    } finally {
      setCheckingUsername(false);
    }
  };

  const handleUsernameChange = (newUsername: string) => {
    setUsername(newUsername);
    setUsernameError('');

    if (usernameCheckTimeout.current) {
      clearTimeout(usernameCheckTimeout.current);
    }

    usernameCheckTimeout.current = setTimeout(() => {
      if (newUsername) {
        checkUsernameAvailability(newUsername);
      }
    }, 500);
  };

  const handleUpdateAuthor = async () => {
    if (!author) return;

    const hasChanges =
      username !== author.username ||
      displayName !== author.displayName ||
      bio !== (author.bio || '');

    if (!hasChanges) {
      return;
    }

    if (usernameError) {
      Alert.alert('Invalid Username', usernameError);
      return;
    }

    if (!username || username.trim().length === 0) {
      Alert.alert('Invalid Username', 'Username cannot be empty');
      return;
    }

    const usernameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!usernameRegex.test(username)) {
      Alert.alert(
        'Invalid Username',
        'Username can only contain letters, numbers, hyphens, and underscores'
      );
      return;
    }

    const updateData: any = {};
    if (username !== author.username) updateData.username = username;
    if (displayName !== author.displayName) updateData.displayName = displayName;
    if (bio !== (author.bio || '')) updateData.bio = bio;

    try {
      setSaving(true);
      const updatedAuthor = await api.updateAuthor(author.key, updateData);
      setAuthor(updatedAuthor);
      setUsernameError('');
      Alert.alert('Success', 'Author profile updated successfully');
    } catch (error: any) {
      console.error('Failed to update author:', error);
      const message = error.response?.data?.message || 'Failed to update author profile';
      Alert.alert('Error', message);
      setUsername(author.username);
      setDisplayName(author.displayName);
      setBio(author.bio || '');
      setUsernameError('');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Loading />;
  }

  if (!author) {
    return (
      <Container centered>
        <View style={{ marginBottom: tokens.spacing.lg }}>
          <Button
            title="← Back"
            variant="ghost"
            onPress={() => router.back()}
            style={{ alignSelf: 'flex-start', marginBottom: tokens.spacing.md }}
          />
          <Text variant="heading" weight="bold">
            Author Profile
          </Text>
        </View>
        <Text style={{ color: '#e63946' }}>No author profile found</Text>
      </Container>
    );
  }

  const hasChanges =
    username !== author.username ||
    displayName !== author.displayName ||
    bio !== (author.bio || '');

  return (
    <ScrollView>
      <Container padded>
        <View style={{ marginBottom: tokens.spacing.lg }}>
          <Button
            title="← Back"
            variant="ghost"
            onPress={() => router.back()}
            style={{ alignSelf: 'flex-start', marginBottom: tokens.spacing.md }}
          />
          <Text variant="heading" weight="bold">
            Author Profile
          </Text>
        </View>

        {/* Author Information */}
        <Section title="Profile Information">
          <View style={{ gap: tokens.spacing.md }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ opacity: 0.7 }}>Author ID:</Text>
              <Text>{author.id}</Text>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ opacity: 0.7 }}>Created:</Text>
              <Text>
                {author.created ? new Date(author.created).toLocaleDateString() : 'N/A'}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ opacity: 0.7 }}>Last Updated:</Text>
              <Text>
                {author.updated ? new Date(author.updated).toLocaleDateString() : 'N/A'}
              </Text>
            </View>
          </View>
        </Section>

        {/* Username */}
        <Section title="Username">
          <Text style={{ fontSize: 14, opacity: 0.7, marginBottom: tokens.spacing.md }}>
            Your username is used in your public profile URL (@{username})
          </Text>
          <View style={{ position: 'relative', marginBottom: tokens.spacing.md }}>
            <TextInput
              value={username}
              onChangeText={handleUsernameChange}
              placeholder="Enter username"
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect={false}
              style={usernameError ? { borderColor: '#e63946', borderWidth: 1 } : undefined}
            />
            {checkingUsername && (
              <View style={{ position: 'absolute', right: 16, top: 12 }}>
                <ActivityIndicator size="small" color={tokens.colors.buttonBackground} />
              </View>
            )}
          </View>
          {usernameError ? (
            <Text style={{ color: '#e63946', fontSize: 14 }}>{usernameError}</Text>
          ) : null}
        </Section>

        {/* Display Name */}
        <Section title="Display Name">
          <Text style={{ fontSize: 14, opacity: 0.7, marginBottom: tokens.spacing.md }}>
            Your display name is shown on your profile and posts
          </Text>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Enter display name"
            autoComplete="name"
          />
        </Section>

        {/* Bio */}
        <Section title="Bio">
          <Text style={{ fontSize: 14, opacity: 0.7, marginBottom: tokens.spacing.md }}>
            Tell others about yourself
          </Text>
          <TextInput
            value={bio}
            onChangeText={setBio}
            placeholder="Enter your bio (optional)"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            style={{ minHeight: 100, paddingTop: 12 }}
          />
        </Section>

        {/* Save Button */}
        <Button
          title="Update Profile"
          onPress={handleUpdateAuthor}
          disabled={!hasChanges || !!usernameError || checkingUsername || saving}
          loading={saving}
          fullWidth
          style={{ marginTop: tokens.spacing.md }}
        />
      </Container>
    </ScrollView>
  );
}
