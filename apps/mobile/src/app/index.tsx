import { Text, View, StyleSheet, Pressable } from 'react-native';
import { Link } from 'expo-router';

export default function Index() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Matrimony</Text>
      <Text style={styles.subtitle}>Mobile App (Expo + TypeScript)</Text>
      <Link href="/" asChild>
        <Pressable style={styles.button}>
          <Text style={styles.buttonText}>Get Started</Text>
        </Pressable>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 16,
    opacity: 0.8,
    textAlign: 'center',
  },
  button: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#111827',
  },
  buttonText: {
    color: 'white',
    fontWeight: '600',
  },
});
