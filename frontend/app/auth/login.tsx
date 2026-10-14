import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Button, space } from '../../components/ui';
import { AuthBrand, createAuthStyles } from '../../components/auth';

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const { colors } = useTheme();
  const styles = createAuthStyles(colors);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError('Wpisz e-mail i hasło.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      router.replace('/(tabs)');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <AuthBrand colors={colors} />
        <Text style={styles.title}>Witaj ponownie</Text>
        <Text style={styles.subtitle}>Zaloguj się, żeby zobaczyć swoje finanse.</Text>

        <Text style={styles.label}>E-mail</Text>
        <View style={styles.inputBox}>
          <Ionicons name="mail-outline" size={20} color={colors.textSecondary} />
          <TextInput
            style={styles.input}
            placeholder="ty@przyklad.pl"
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              setError(null);
            }}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            placeholderTextColor={colors.textLight}
          />
        </View>

        <Text style={styles.label}>Hasło</Text>
        <View style={styles.inputBox}>
          <Ionicons name="lock-closed-outline" size={20} color={colors.textSecondary} />
          <TextInput
            style={styles.input}
            placeholder="Twoje hasło"
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              setError(null);
            }}
            secureTextEntry={!showPassword}
            autoComplete="password"
            textContentType="password"
            onSubmitEditing={handleLogin}
            placeholderTextColor={colors.textLight}
          />
          <TouchableOpacity
            onPress={() => setShowPassword(!showPassword)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel={showPassword ? 'Ukryj hasło' : 'Pokaż hasło'}
          >
            <Ionicons name={showPassword ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={() => router.push({ pathname: '/auth/forgot', params: { email } })}
          style={styles.forgot}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.link}>Nie pamiętasz hasła?</Text>
        </TouchableOpacity>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Button title="Zaloguj się" onPress={handleLogin} loading={loading} style={{ marginTop: space.lg }} />

        <View style={styles.footer}>
          <Text style={styles.footerText}>Nie masz konta? </Text>
          <TouchableOpacity onPress={() => router.push('/auth/register')}>
            <Text style={styles.link}>Załóż konto</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
