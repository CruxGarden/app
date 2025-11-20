import { EditorContent, useEditor } from '@tiptap/react';
import { BubbleMenu, FloatingMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

export interface EditorProps {
  content?: string;
  onChange?: (content: string) => void;
  editable?: boolean;
  placeholder?: string;
}

/**
 * Rich text editor component for WEB using TipTap.
 * For iOS/Android, see index.native.tsx
 */
export default function Editor({
  content = '',
  onChange,
  editable = true,
  placeholder = 'Start typing...',
}: EditorProps) {
  const editor = useEditor({
    extensions: [StarterKit], // define your extension array
    content: '<p>Hello from TipTap!</p>', // initial content
  });

  return (
    <View style={styles.container}>
      <EditorContent editor={editor} />
      <FloatingMenu editor={editor}>This is the floating menu</FloatingMenu>
      <BubbleMenu editor={editor}>This is the bubble menu</BubbleMenu>
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
});
