import { Text, View } from "react-native";
import { StyleSheet } from 'react-native-unistyles';

export default function Index() {
  return (
    <View style={styles.container}>
      <Text>Hello world from Unistyles</Text>
    </View>
  );
}

const styles = StyleSheet.create({
   container: {
     backgroundColor: 'red'
   }
});