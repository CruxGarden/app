import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { useRouter } from 'expo-router';
import { useApp } from './lib/_AppContext';
import api, { Author } from './lib/api';

export default function AuthorScreen() {
  const router = useRouter();
  const { account } = useApp();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [author, setAuthor] = useState<Author | null>(null);
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [checkingUsername, setCheckingUsername] = useState(false);
  const usernameCheckTimeout = useRef<NodeJS.Timeout | null>(null);

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
      // Use the author info from the profile (already contains author data)
      if (account?.author) {
        // Fetch full author details
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
    // Check if username is empty
    if (!usernameToCheck || usernameToCheck.trim().length === 0) {
      setUsernameError('Username cannot be empty');
      return;
    }

    // Basic username validation (alphanumeric, hyphens, underscores only)
    const usernameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!usernameRegex.test(usernameToCheck)) {
      setUsernameError('Username can only contain letters, numbers, hyphens, and underscores');
      return;
    }

    // If username hasn't changed (case-insensitive), clear error
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
      // Don't show error for network issues - just allow submission
    } finally {
      setCheckingUsername(false);
    }
  };

  const handleUsernameChange = (newUsername: string) => {
    setUsername(newUsername);
    setUsernameError('');

    // Clear previous timeout
    if (usernameCheckTimeout.current) {
      clearTimeout(usernameCheckTimeout.current);
    }

    // Debounce username check (wait 500ms after user stops typing)
    usernameCheckTimeout.current = setTimeout(() => {
      if (newUsername) {
        checkUsernameAvailability(newUsername);
      }
    }, 500);
  };

  const handleUpdateAuthor = async () => {
    if (!author) return;

    // Check if anything changed (exact comparison to detect even casing changes)
    const hasChanges =
      username !== author.username ||
      displayName !== author.displayName ||
      bio !== (author.bio || '');

    if (!hasChanges) {
      return;
    }

    // Check if there's a validation error
    if (usernameError) {
      Alert.alert('Invalid Username', usernameError);
      return;
    }

    // Validate username is not empty
    if (!username || username.trim().length === 0) {
      Alert.alert('Invalid Username', 'Username cannot be empty');
      return;
    }

    // Basic username validation
    const usernameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!usernameRegex.test(username)) {
      Alert.alert(
        'Invalid Username',
        'Username can only contain letters, numbers, hyphens, and underscores'
      );
      return;
    }

    // Build update data (only include changed fields)
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
      // Reset to original values on error
      setUsername(author.username);
      setDisplayName(author.displayName);
      setBio(author.bio || '');
      setUsernameError('');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#4dd9b8" />
      </View>
    );
  }

  if (!author) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Author Profile</Text>
        </View>
        <Text style={styles.errorText}>No author profile found</Text>
      </View>
    );
  }

  const hasChanges =
    username !== author.username ||
    displayName !== author.displayName ||
    bio !== (author.bio || '');

  return (
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Author Profile</Text>
      </View>

      {/* Author Information */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Profile Information</Text>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Author ID:</Text>
          <Text style={styles.value}>{author.id}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Created:</Text>
          <Text style={styles.value}>
            {author.created ? new Date(author.created).toLocaleDateString() : 'N/A'}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Last Updated:</Text>
          <Text style={styles.value}>
            {author.updated ? new Date(author.updated).toLocaleDateString() : 'N/A'}
          </Text>
        </View>
      </View>

      {/* Username */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Username</Text>
        <Text style={styles.helperText}>
          Your username is used in your public profile URL (@{username})
        </Text>
        <View style={styles.inputWrapper}>
          <TextInput
            style={[styles.input, usernameError && styles.inputError]}
            value={username}
            onChangeText={handleUsernameChange}
            placeholder="Enter username"
            placeholderTextColor="#666"
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect={false}
          />
          {checkingUsername && (
            <View style={styles.inputIcon}>
              <ActivityIndicator size="small" color="#4dd9b8" />
            </View>
          )}
        </View>
        {usernameError ? <Text style={styles.errorText}>{usernameError}</Text> : null}
      </View>

      {/* Display Name */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Display Name</Text>
        <Text style={styles.helperText}>Your display name is shown on your profile and posts</Text>
        <TextInput
          style={styles.input}
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Enter display name"
          placeholderTextColor="#666"
          autoComplete="name"
        />
      </View>

      {/* Bio */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Bio</Text>
        <Text style={styles.helperText}>Tell others about yourself</Text>
        <TextInput
          style={[styles.input, styles.bioInput]}
          value={bio}
          onChangeText={setBio}
          placeholder="Enter your bio (optional)"
          placeholderTextColor="#666"
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
      </View>

      {/* Save Button */}
      <TouchableOpacity
        style={[
          styles.button,
          (!hasChanges || !!usernameError || checkingUsername || saving) && styles.buttonDisabled,
        ]}
        onPress={handleUpdateAuthor}
        disabled={!hasChanges || !!usernameError || checkingUsername || saving}
      >
        {saving ? (
          <ActivityIndicator color="#0f1214" />
        ) : (
          <Text style={styles.buttonText}>Update Profile</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: '#0F1214',
  },
  container: {
    padding: 24,
  },
  header: {
    marginBottom: 24,
  },
  backButton: {
    marginBottom: 16,
  },
  backButtonText: {
    color: '#4dd9b8',
    fontSize: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#e8eef2',
  },
  section: {
    marginBottom: 32,
    padding: 16,
    backgroundColor: '#1a1f24',
    borderRadius: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#e8eef2',
    marginBottom: 8,
  },
  helperText: {
    fontSize: 14,
    color: '#a0aab5',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    color: '#a0aab5',
  },
  value: {
    fontSize: 14,
    color: '#e8eef2',
  },
  inputWrapper: {
    position: 'relative',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#0f1214',
    borderWidth: 1,
    borderColor: '#2d3339',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    paddingRight: 48,
    fontSize: 16,
    color: '#e8eef2',
  },
  bioInput: {
    minHeight: 100,
    paddingTop: 12,
  },
  inputError: {
    borderColor: '#e63946',
  },
  inputIcon: {
    position: 'absolute',
    right: 16,
    top: 12,
  },
  errorText: {
    color: '#e63946',
    fontSize: 14,
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#4dd9b8',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 32,
    alignItems: 'center',
    marginTop: 16,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#0f1214',
    fontSize: 16,
    fontWeight: '600',
  },
});
