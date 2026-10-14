import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

export default function Index() {
  const router = useRouter();
  const { isAuthenticated, loading } = useAuth();
  const { colors } = useTheme();

  useEffect(() => {
    if (!loading) {
      router.replace(isAuthenticated ? '/(tabs)' : '/auth/login');
    }
  }, [isAuthenticated, loading]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
