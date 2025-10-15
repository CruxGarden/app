import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

export type DimensionType = 'gate' | 'garden' | 'growth' | 'graft';

export interface CruxFormData {
  title: string;
  data: string;
  slug: string;
  dimensionType: DimensionType;
}

export interface CruxFormModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (formData: CruxFormData) => Promise<void>;
  sourceCrux?: {
    title?: string;
    data: string;
  };
  editMode?: boolean;
  initialData?: {
    title?: string;
    slug: string;
    data: string;
  };
}

export default function CruxFormModal({ visible, onClose, onSubmit, sourceCrux, editMode = false, initialData }: CruxFormModalProps) {
  const [title, setTitle] = useState(initialData?.title || '');
  const [data, setData] = useState(initialData?.data || '');
  const [slug, setSlug] = useState(initialData?.slug || '');
  const [dimensionType, setDimensionType] = useState<DimensionType>('garden');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  // Convert title to slug format
  const titleToSlug = (text: string): string => {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove non-alphanumeric except spaces and hyphens
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
  };

  // Update form when initialData changes
  React.useEffect(() => {
    if (initialData) {
      setTitle(initialData.title || '');
      setData(initialData.data || '');
      setSlug(initialData.slug || '');
      setSlugManuallyEdited(false);
    }
  }, [initialData]);

  // Auto-populate slug from title (unless manually edited)
  React.useEffect(() => {
    if (!slugManuallyEdited && title && !editMode) {
      setSlug(titleToSlug(title));
    }
  }, [title, slugManuallyEdited, editMode]);

  const handleSubmit = async () => {
    // Basic validation
    if (!slug.trim()) {
      setError('Slug is required');
      return;
    }
    if (!data.trim()) {
      setError('Content is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await onSubmit({ title, data, slug, dimensionType });
      // Reset form on success
      setTitle('');
      setData('');
      setSlug('');
      setDimensionType('garden');
      setSlugManuallyEdited(false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create crux');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setTitle('');
    setData('');
    setSlug('');
    setDimensionType('garden');
    setError(null);
    setSlugManuallyEdited(false);
    onClose();
  };

  const handleSlugChange = (text: string) => {
    setSlug(text);
    setSlugManuallyEdited(true);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose}>
            <Text style={styles.cancelButton}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{editMode ? 'Edit Crux' : 'Add Crux'}</Text>
          <TouchableOpacity onPress={handleSubmit} disabled={loading}>
            <Text style={[styles.submitButton, loading && styles.submitButtonDisabled]}>
              {loading ? (editMode ? 'Saving...' : 'Creating...') : (editMode ? 'Save' : 'Create')}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.form} contentContainerStyle={styles.formContent}>
          {!editMode && sourceCrux && (
            <View style={styles.sourceCruxContainer}>
              {sourceCrux.title && (
                <Text style={styles.sourceCruxTitle}>{sourceCrux.title}</Text>
              )}
              <Text style={styles.sourceCruxData} numberOfLines={2}>
                {sourceCrux.data}
              </Text>
            </View>
          )}

          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {!editMode && (
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>
                Dimension Type <Text style={styles.required}>*</Text>
              </Text>
              <View style={styles.dimensionTypes}>
                {(['gate', 'garden', 'growth', 'graft'] as DimensionType[]).map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.dimensionTypeButton,
                      dimensionType === type && styles.dimensionTypeButtonActive,
                    ]}
                    onPress={() => setDimensionType(type)}
                  >
                    <Text
                      style={[
                        styles.dimensionTypeText,
                        dimensionType === type && styles.dimensionTypeTextActive,
                      ]}
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.hint}>
                {dimensionType === 'gate' && 'Origins and sources that influenced this crux'}
                {dimensionType === 'garden' && 'Creations and consequences that emerged from this crux'}
                {dimensionType === 'growth' && 'How this crux developed and evolved over time'}
                {dimensionType === 'graft' && 'Lateral connections and associations'}
              </Text>
            </View>
          )}

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Title</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="My Crux Title"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              Slug <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={styles.input}
              value={slug}
              onChangeText={handleSlugChange}
              placeholder="my-crux-slug"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.hint}>Auto-generated from title (editable)</Text>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>
              Content <Text style={styles.required}>*</Text>
            </Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={data}
              onChangeText={setData}
              placeholder="Enter your crux content here..."
              multiline
              numberOfLines={8}
              textAlignVertical="top"
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  cancelButton: {
    fontSize: 16,
    color: '#666',
  },
  submitButton: {
    fontSize: 16,
    fontWeight: '600',
    color: '#12230F',
  },
  submitButtonDisabled: {
    color: '#ccc',
  },
  form: {
    flex: 1,
  },
  formContent: {
    padding: 20,
  },
  sourceCruxContainer: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#12230F',
  },
  sourceCruxLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  sourceCruxTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  sourceCruxData: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  errorContainer: {
    backgroundColor: '#ffebee',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    color: '#d32f2f',
    fontSize: 14,
  },
  fieldGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  required: {
    color: '#d32f2f',
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#333',
  },
  textArea: {
    minHeight: 120,
    paddingTop: 12,
  },
  hint: {
    fontSize: 13,
    color: '#999',
    marginTop: 4,
  },
  dimensionTypes: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  dimensionTypeButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#ddd',
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  dimensionTypeButtonActive: {
    borderColor: '#12230F',
    backgroundColor: '#e8f5e9',
  },
  dimensionTypeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  dimensionTypeTextActive: {
    color: '#12230F',
  },
});
