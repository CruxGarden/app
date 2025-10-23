import { View, Image } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

export default function Index() {
  return (
    <View style={styles.container}>
      <Image
        source={require('../assets/images/banner.png')}
        style={styles.banner}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F1214',
    justifyContent: 'center',
    alignItems: 'center',
  },
  banner: {
    width: '90%',
    maxWidth: 1200,
    height: undefined,
    aspectRatio: 3 / 1,
  },
});
