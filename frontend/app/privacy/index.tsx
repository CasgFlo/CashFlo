import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../contexts/ThemeContext';

const BRAND_GREEN = '#2F5B4C';

export default function PrivacyPolicy() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const styles = createStyles(colors);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Polityka Prywatności</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView 
        style={styles.content}
        contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 40 }]}
      >
        <Text style={styles.lastUpdated}>Ostatnia aktualizacja: Maj 2026</Text>

        <Text style={styles.intro}>
          Ochrona Twoich danych osobowych jest dla nas priorytetem. Niniejsza Polityka 
          Prywatności wyjaśnia, jakie dane zbieramy, jak je wykorzystujemy i jakie 
          masz prawa w związku z ich przetwarzaniem.
        </Text>

        <Text style={styles.sectionTitle}>1. Administrator danych</Text>
        <Text style={styles.paragraph}>
          Administratorem Twoich danych osobowych jest CashFlo z siedzibą w Polsce.
        </Text>
        <Text style={styles.paragraph}>
          Kontakt w sprawach związanych z ochroną danych: hello@cashflo.cash
        </Text>

        <Text style={styles.sectionTitle}>2. Jakie dane zbieramy</Text>
        <Text style={styles.subTitle}>2.1. Dane podawane przez Użytkownika:</Text>
        <Text style={styles.listItem}>• Adres e-mail (do rejestracji i logowania)</Text>
        <Text style={styles.listItem}>• Imię/nazwa użytkownika</Text>
        <Text style={styles.listItem}>• Dane finansowe wprowadzane do aplikacji (transakcje, cele, budżety)</Text>

        <Text style={styles.subTitle}>2.2. Dane zbierane automatycznie:</Text>
        <Text style={styles.listItem}>• Informacje o urządzeniu (model, system operacyjny)</Text>
        <Text style={styles.listItem}>• Dane o korzystaniu z aplikacji (statystyki użytkowania)</Text>
        <Text style={styles.listItem}>• Adres IP</Text>

        <Text style={styles.sectionTitle}>3. Cel przetwarzania danych</Text>
        <Text style={styles.paragraph}>Twoje dane przetwarzamy w celu:</Text>
        <Text style={styles.listItem}>• Świadczenia usług aplikacji CashFlo</Text>
        <Text style={styles.listItem}>• Obsługi Twojego konta użytkownika</Text>
        <Text style={styles.listItem}>• Realizacji płatności za usługę Premium</Text>
        <Text style={styles.listItem}>• Komunikacji z Tobą (obsługa klienta, powiadomienia)</Text>
        <Text style={styles.listItem}>• Ulepszania i rozwijania aplikacji</Text>
        <Text style={styles.listItem}>• Zapewnienia bezpieczeństwa usług</Text>

        <Text style={styles.sectionTitle}>4. Podstawa prawna przetwarzania</Text>
        <Text style={styles.paragraph}>Przetwarzamy Twoje dane na podstawie:</Text>
        <Text style={styles.listItem}>• Wykonania umowy (art. 6 ust. 1 lit. b RODO)</Text>
        <Text style={styles.listItem}>• Prawnie uzasadnionego interesu (art. 6 ust. 1 lit. f RODO)</Text>
        <Text style={styles.listItem}>• Twojej zgody (art. 6 ust. 1 lit. a RODO) - w przypadku marketingu</Text>

        <Text style={styles.sectionTitle}>5. Udostępnianie danych</Text>
        <Text style={styles.paragraph}>
          Twoje dane mogą być udostępniane następującym podmiotom:
        </Text>
        <Text style={styles.listItem}>• <Text style={styles.bold}>Stripe</Text> - w celu przetwarzania płatności</Text>
        <Text style={styles.listItem}>• <Text style={styles.bold}>Dostawcy usług hostingowych</Text> - przechowywanie danych</Text>
        <Text style={styles.listItem}>• <Text style={styles.bold}>Organy państwowe</Text> - gdy wymagają tego przepisy prawa</Text>
        <Text style={styles.paragraph}>
          Nie sprzedajemy Twoich danych osobowych stronom trzecim.
        </Text>

        <Text style={styles.sectionTitle}>6. Bezpieczeństwo danych</Text>
        <Text style={styles.paragraph}>
          Stosujemy odpowiednie środki techniczne i organizacyjne, aby chronić Twoje dane, w tym:
        </Text>
        <Text style={styles.listItem}>• Szyfrowanie danych w tranzycie (SSL/TLS)</Text>
        <Text style={styles.listItem}>• Szyfrowanie haseł (bcrypt)</Text>
        <Text style={styles.listItem}>• Regularne kopie zapasowe</Text>
        <Text style={styles.listItem}>• Ograniczony dostęp do danych dla pracowników</Text>

        <Text style={styles.sectionTitle}>7. Okres przechowywania danych</Text>
        <Text style={styles.paragraph}>
          Twoje dane przechowujemy przez okres korzystania z usług CashFlo. 
          Po usunięciu konta, dane są usuwane w ciągu 30 dni, z wyjątkiem 
          danych niezbędnych do celów rozliczeniowych lub prawnych.
        </Text>

        <Text style={styles.sectionTitle}>8. Twoje prawa</Text>
        <Text style={styles.paragraph}>Przysługują Ci następujące prawa:</Text>
        <Text style={styles.listItem}>• <Text style={styles.bold}>Prawo dostępu</Text> - możesz uzyskać informacje o przetwarzanych danych</Text>
        <Text style={styles.listItem}>• <Text style={styles.bold}>Prawo do sprostowania</Text> - możesz poprawić nieprawidłowe dane</Text>
        <Text style={styles.listItem}>• <Text style={styles.bold}>Prawo do usunięcia</Text> - możesz żądać usunięcia swoich danych</Text>
        <Text style={styles.listItem}>• <Text style={styles.bold}>Prawo do ograniczenia przetwarzania</Text> - w określonych przypadkach</Text>
        <Text style={styles.listItem}>• <Text style={styles.bold}>Prawo do przenoszenia danych</Text> - możesz otrzymać kopię swoich danych</Text>
        <Text style={styles.listItem}>• <Text style={styles.bold}>Prawo do sprzeciwu</Text> - wobec przetwarzania opartego na prawnie uzasadnionym interesie</Text>
        <Text style={styles.listItem}>• <Text style={styles.bold}>Prawo do cofnięcia zgody</Text> - w dowolnym momencie</Text>
        <Text style={styles.paragraph}>
          Aby skorzystać z tych praw, skontaktuj się z nami: hello@cashflo.cash
        </Text>

        <Text style={styles.sectionTitle}>9. Kontakt</Text>
        <Text style={styles.paragraph}>
          W sprawach związanych z ochroną danych osobowych prosimy o kontakt:
        </Text>
        <Text style={styles.contactInfo}>Email: hello@cashflo.cash</Text>

        <View style={styles.rightsBox}>
          <Ionicons name="shield-checkmark" size={24} color={BRAND_GREEN} />
          <Text style={styles.rightsBoxText}>
            Masz prawo wnieść skargę do Prezesa Urzędu Ochrony Danych Osobowych, 
            jeśli uważasz, że przetwarzanie Twoich danych narusza przepisy RODO.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  lastUpdated: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  intro: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 24,
    marginBottom: 24,
    fontStyle: 'italic',
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: BRAND_GREEN,
    marginTop: 24,
    marginBottom: 12,
  },
  subTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginTop: 12,
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 24,
    marginBottom: 12,
  },
  listItem: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 24,
    marginBottom: 8,
    paddingLeft: 8,
  },
  bold: {
    fontWeight: '600',
    color: colors.text,
  },
  contactInfo: {
    fontSize: 15,
    color: BRAND_GREEN,
    fontWeight: '600',
    marginTop: 8,
  },
  rightsBox: {
    flexDirection: 'row',
    backgroundColor: BRAND_GREEN + '10',
    padding: 16,
    borderRadius: 12,
    marginTop: 24,
    borderLeftWidth: 4,
    borderLeftColor: BRAND_GREEN,
  },
  rightsBoxText: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
    lineHeight: 20,
    marginLeft: 12,
  },
});
