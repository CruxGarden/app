import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import Editor from '../components/Editor';

export default function Index() {
  return (
    <View style={styles.container}>
      <Text>Hello world from Unistyles</Text>
      <Editor />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'red',
  },
});
