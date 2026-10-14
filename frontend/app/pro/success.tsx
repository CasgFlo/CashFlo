import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, ThemeColors } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../utils/api';
import { Button, space } from '../../components/ui';

type Status = 'checking' | 'success' | 'unfinished' | 'error';

const MAX_ATTEMPTS = 6;
const POLL_MS = 2000;

export default function PaymentSuccessScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ session_id?: string }>();
  const { colors } = useTheme();
  const { refreshUser } = useAuth();
  const [status, setStatus] = useState<Status>('checking');
  const cancelled = useRef(false);

  const styles = createStyles(colors);

  useEffect(() => {
    cancelled.current = false;
    const sessionId = typeof params.session_id === 'string' ? params.session_id : '';
    if (!sessionId) {
      setStatus('error');
    } else {
      check(sessionId, 0);
    }
    return () => {
      cancelled.current = true;
    };
  }, [params.session_id]);

  const check = async (sessionId: string, attempt: number) => {
    if (cancelled.current) return;
    try {
      const { data } = await api.get(`/payments/status/${sessionId}`);
      if (data.is_pro_activated || data.payment_status === 'paid') {
        await refreshUser();
        if (!cancelled.current) setStatus('success');
        return;
      }
      if (data.status === 'expired' || (data.status === 'open' && attempt >= 1)) {
        // The payment page was closed without paying
        setStatus('unfinished');
        return;
      }
    } catch (error) {
      console.error('Error checking payment status:', error);
    }
    if (attempt + 1 >= MAX_ATTEMPTS) {
      setStatus('error');
      return;
    }
    setTimeout(() => check(sessionId, attempt + 1), POLL_MS);
  };

  return (
    <View style={styles.screen}>
      {status === 'checking' ? (
        <View style={styles.content}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.title}>Sprawdzamy płatność</Text>
          <Text style={styles.text}>To potrwa tylko chwilę.</Text>
        </View>
      ) : null}

      {status === 'success' ? (
        <View style={styles.content}>
          <View style={[styles.icon, { backgroundColor: colors.accent }]}>
            <Ionicons name="star" size={36} color={colors.onAccent} />
          </View>
          <Text style={styles.title}>Masz CashFlo Pro!</Text>
          <Text style={styles.text}>Dziękujemy. Nieograniczone cele i własne kategorie są już odblokowane.</Text>
          <Button title="Przejdź do aplikacji" onPress={() => router.replace('/(tabs)')} style={styles.button} />
        </View>
      ) : null}

      {status === 'unfinished' ? (
        <View style={styles.content}>
          <View style={[styles.icon, { backgroundColor: colors.surfaceAlt }]}>
            <Ionicons name="card-outline" size={34} color={colors.textSecondary} />
          </View>
          <Text style={styles.title}>Płatność nie została dokończona</Text>
          <Text style={styles.text}>Nic nie zostało pobrane. Możesz spróbować jeszcze raz.</Text>
          <Button title="Wróć do planów" onPress={() => router.replace('/pro/upgrade')} style={styles.button} />
          <Button title="Nie teraz" variant="ghost" onPress={() => router.replace('/(tabs)')} style={styles.button} />
        </View>
      ) : null}

      {status === 'error' ? (
        <View style={styles.content}>
          <View style={[styles.icon, { backgroundColor: colors.expenseSoft }]}>
            <Ionicons name="alert" size={34} color={colors.error} />
          </View>
          <Text style={styles.title}>Nie udało się potwierdzić płatności</Text>
          <Text style={styles.text}>
            Jeśli pieniądze zostały pobrane, Pro włączy się automatycznie w ciągu kilku minut. Gdyby tak się nie stało, napisz do nas: cashflo2026@gmail.com.
          </Text>
          <Button title="Przejdź do aplikacji" onPress={() => router.replace('/(tabs)')} style={styles.button} />
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', padding: space.xl },
    content: { alignItems: 'center', alignSelf: 'center', width: '100%', maxWidth: 360 },
    icon: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 24, fontWeight: '800', color: colors.text, textAlign: 'center', marginTop: space.xl },
    text: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 21, marginTop: space.sm },
    button: { alignSelf: 'stretch', marginTop: space.lg },
  });
