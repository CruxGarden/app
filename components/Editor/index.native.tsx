import { TextInput, View, Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

export interface EditorProps {
  content?: string;
  onChange?: (content: string) => void;
  editable?: boolean;
  placeholder?: string;
}

/**
 * Rich text editor component for iOS/Android.
 * This is a placeholder using TextInput. For a full rich text editor on native,
 * consider using react-native-webview with TipTap, or a native solution like
 * react-native-rich-editor or similar.
 */
export default function Editor({
  content = '',
  onChange,
  editable = true,
  placeholder = 'Start typing...',
}: EditorProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.notice}>Note: Rich text editing not yet implemented for mobile</Text>
      <TextInput
        style={styles.input}
        value={content}
        onChangeText={onChange}
        placeholder={placeholder}
        editable={editable}
        multiline
        textAlignVertical="top"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
  },
  notice: {
    padding: 8,
    fontSize: 12,
    color: '#6b7280',
    backgroundColor: '#fef3c7',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  input: {
    flex: 1,
    padding: 16,
    fontSize: 16,
    lineHeight: 24,
  },
});
