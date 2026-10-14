import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../utils/api';

export default function PaymentSuccessScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { colors } = useTheme();
  const { refreshUser } = useAuth();
  const [status, setStatus] = useState<'checking' | 'success' | 'error'>('checking');
  const [message, setMessage] = useState('Sprawdzamy status płatności...');
  const [attempts, setAttempts] = useState(0);

  const styles = createStyles(colors);

  useEffect(() => {
    const sessionId = params.session_id as string;
    if (sessionId) {
      checkPaymentStatus(sessionId);
    } else {
      setStatus('error');
      setMessage('Brak identyfikatora sesji płatności');
    }
  }, [params.session_id]);

  const checkPaymentStatus = async (sessionId: string, attempt = 0) => {
    const maxAttempts = 5;
    const pollInterval = 2000; // 2 seconds

    if (attempt >= maxAttempts) {
      setStatus('error');
      setMessage('Nie udało się potwierdzić płatności. Sprawdź email lub skontaktuj się z nami.');
      return;
    }

    try {
      const response = await api.get(`/payments/status/${sessionId}`);
      const data = response.data;

      if (data.payment_status === 'paid') {
        setStatus('success');
        setMessage('Płatność zakończona sukcesem!');
        
        // Refresh user data to update Pro status
        if (refreshUser) {
          await refreshUser();
        }
        
        // Redirect to home after 3 seconds
        setTimeout(() => {
          router.replace('/(tabs)');
        }, 3000);
        
        return;
      } else if (data.status === 'expired') {
        setStatus('error');
        setMessage('Sesja płatności wygasła. Spróbuj ponownie.');
        return;
      }

      // If payment is still pending, continue polling
      setMessage('Przetwarzamy płatność...');
      setAttempts(attempt + 1);
      
      setTimeout(() => {
        checkPaymentStatus(sessionId, attempt + 1);
      }, pollInterval);

    } catch (error: any) {
      console.error('Error checking payment status:', error);
      
      if (attempt < maxAttempts - 1) {
        setTimeout(() => {
          checkPaymentStatus(sessionId, attempt + 1);
        }, pollInterval);
      } else {
        setStatus('error');
        setMessage('Wystąpił błąd podczas sprawdzania statusu płatności.');
      }
    }
  };

  return (
    <View style={styles.container}>
      {status === 'checking' && (
        <View style={styles.content}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.title}>Weryfikacja płatności</Text>
          <Text style={styles.message}>{message}</Text>
          {attempts > 0 && (
            <Text style={styles.attempts}>Próba {attempts}/5</Text>
          )}
        </View>
      )}

      {status === 'success' && (
        <View style={styles.content}>
          <LinearGradient
            colors={[colors.warning, '#F5A623']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.successIcon}
          >
            <Ionicons name="checkmark" size={60} color="#fff" />
          </LinearGradient>
          <Text style={styles.successTitle}>Gratulacje!</Text>
          <Text style={styles.successMessage}>
            Jesteś teraz użytkownikiem CashFlo Pro!
          </Text>
          <View style={styles.features}>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={24} color={colors.success} />
              <Text style={styles.featureText}>Nieograniczone cele</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={24} color={colors.success} />
              <Text style={styles.featureText}>Nieograniczone kategorie</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="checkmark-circle" size={24} color={colors.success} />
              <Text style={styles.featureText}>Szczegółowe raporty</Text>
            </View>
          </View>
          <Text style={styles.redirect}>Przekierowanie za chwilę...</Text>
        </View>
      )}

      {status === 'error' && (
        <View style={styles.content}>
          <View style={styles.errorIcon}>
            <Ionicons name="alert-circle" size={60} color={colors.error} />
          </View>
          <Text style={styles.errorTitle}>Coś poszło nie tak</Text>
          <Text style={styles.errorMessage}>{message}</Text>
          <Text style={styles.contact}>
            Skontaktuj się z nami: hello@cashflo.cash
          </Text>
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    alignItems: 'center',
    maxWidth: 320,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginTop: 24,
    marginBottom: 8,
  },
  message: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  attempts: {
    fontSize: 14,
    color: colors.textLight,
    marginTop: 12,
  },
  successIcon: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#F5A623',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  successTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text,
    marginTop: 28,
    marginBottom: 8,
  },
  successMessage: {
    fontSize: 18,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  features: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    marginBottom: 24,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  featureText: {
    fontSize: 16,
    color: colors.text,
    marginLeft: 12,
  },
  redirect: {
    fontSize: 14,
    color: colors.textLight,
    fontStyle: 'italic',
  },
  errorIcon: {
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.error,
    marginBottom: 12,
  },
  errorMessage: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
  },
  contact: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '600',
  },
});
