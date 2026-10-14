import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Button, space } from '../../components/ui';
import { AuthBrand, createAuthStyles } from '../../components/auth';

const MIN_PASSWORD = 6;

export default function RegisterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { register } = useAuth();
  const { colors } = useTheme();
  const styles = createAuthStyles(colors);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRegister = async () => {
    if (!name.trim() || !email.trim() || !password) {
      setError('Uzupełnij imię, e-mail i hasło.');
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setError(`Hasło musi mieć co najmniej ${MIN_PASSWORD} znaków.`);
      return;
    }
    if (!termsAccepted) {
      setError('Aby założyć konto, zaakceptuj Regulamin i Politykę prywatności.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await register(email, password, name);
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
        <Text style={styles.title}>Załóż konto</Text>
        <Text style={styles.subtitle}>Zobacz, dokąd idą Twoje pieniądze. Zajmie to minutę.</Text>

        <Text style={styles.label}>Imię</Text>
        <View style={styles.inputBox}>
          <Ionicons name="person-outline" size={20} color={colors.textSecondary} />
          <TextInput
            style={styles.input}
            placeholder="np. Anna"
            value={name}
            onChangeText={(t) => {
              setName(t);
              setError(null);
            }}
            autoCapitalize="words"
            autoComplete="name"
            textContentType="givenName"
            maxLength={60}
            placeholderTextColor={colors.textLight}
          />
        </View>

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
            placeholder={`Co najmniej ${MIN_PASSWORD} znaków`}
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              setError(null);
            }}
            secureTextEntry={!showPassword}
            autoComplete="password-new"
            textContentType="newPassword"
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
          style={local.terms}
          onPress={() => setTermsAccepted(!termsAccepted)}
          activeOpacity={0.7}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: termsAccepted }}
        >
          <View
            style={[
              local.checkbox,
              { borderColor: termsAccepted ? colors.primary : colors.border, backgroundColor: termsAccepted ? colors.primary : colors.surface },
            ]}
          >
            {termsAccepted ? <Ionicons name="checkmark" size={16} color={colors.onPrimary} /> : null}
          </View>
          <Text style={[local.termsText, { color: colors.textSecondary }]}>
            Akceptuję{' '}
            <Text style={styles.link} onPress={() => router.push('/terms')}>
              Regulamin
            </Text>{' '}
            i{' '}
            <Text style={styles.link} onPress={() => router.push('/privacy')}>
              Politykę prywatności
            </Text>
          </Text>
        </TouchableOpacity>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Button title="Załóż konto" onPress={handleRegister} loading={loading} style={{ marginTop: space.lg }} />

        <View style={styles.footer}>
          <Text style={styles.footerText}>Masz już konto? </Text>
          <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/auth/login'))}>
            <Text style={styles.link}>Zaloguj się</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const local = StyleSheet.create({
  terms: { flexDirection: 'row', alignItems: 'flex-start', marginTop: space.lg },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.md,
    marginTop: 1,
  },
  termsText: { flex: 1, fontSize: 14, lineHeight: 21 },
});
