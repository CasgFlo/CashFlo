import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Button, ScreenHeader, space } from '../../components/ui';
import { createAuthStyles } from '../../components/auth';

const MIN_PASSWORD = 6;

/** Two steps: send a 6-digit code to the e-mail, then set a new password with it. */
export default function ForgotPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const insets = useSafeAreaInsets();
  const { requestPasswordReset, resetPassword, login } = useAuth();
  const { colors } = useTheme();
  const styles = createAuthStyles(colors);

  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState(typeof params.email === 'string' ? params.email : '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const sendCode = async () => {
    if (!email.trim() || !email.includes('@')) {
      setError('Wpisz adres e-mail, na który założono konto.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await requestPasswordReset(email);
      setStep('code');
      setInfo(`Jeśli konto ${email.trim()} istnieje, wysłaliśmy na nie 6-cyfrowy kod. Sprawdź też folder spam.`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const savePassword = async () => {
    if (code.trim().length !== 6) {
      setError('Wpisz 6-cyfrowy kod z e-maila.');
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setError(`Nowe hasło musi mieć co najmniej ${MIN_PASSWORD} znaków.`);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await resetPassword(email, code, password);
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
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.sm, paddingBottom: insets.bottom + space.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <ScreenHeader title="" onBack={() => (router.canGoBack() ? router.back() : router.replace('/auth/login'))} />
        <Text style={styles.title}>{step === 'email' ? 'Nowe hasło' : 'Wpisz kod'}</Text>
        <Text style={styles.subtitle}>
          {step === 'email'
            ? 'Podaj e-mail swojego konta. Wyślemy na niego kod do ustawienia nowego hasła.'
            : info}
        </Text>

        {step === 'email' ? (
          <>
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
                autoFocus
                placeholderTextColor={colors.textLight}
              />
            </View>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <Button title="Wyślij kod" onPress={sendCode} loading={loading} style={{ marginTop: space.xl }} />
          </>
        ) : (
          <>
            <Text style={styles.label}>Kod z e-maila</Text>
            <View style={styles.inputBox}>
              <Ionicons name="keypad-outline" size={20} color={colors.textSecondary} />
              <TextInput
                style={[styles.input, { letterSpacing: 4, fontWeight: '700' }]}
                placeholder="000000"
                value={code}
                onChangeText={(t) => {
                  setCode(t.replace(/\D/g, '').slice(0, 6));
                  setError(null);
                }}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                autoFocus
                placeholderTextColor={colors.textLight}
              />
            </View>

            <Text style={styles.label}>Nowe hasło</Text>
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

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            <Button title="Ustaw nowe hasło" onPress={savePassword} loading={loading} style={{ marginTop: space.xl }} />

            <TouchableOpacity onPress={sendCode} disabled={loading} style={{ alignSelf: 'center', marginTop: space.lg }}>
              <Text style={styles.link}>Wyślij kod jeszcze raz</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
