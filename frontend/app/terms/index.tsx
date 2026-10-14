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

export default function TermsOfService() {
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
        <Text style={styles.headerTitle}>Regulamin</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView 
        style={styles.content}
        contentContainerStyle={[styles.contentContainer, { paddingBottom: insets.bottom + 40 }]}
      >
        <Text style={styles.lastUpdated}>Ostatnia aktualizacja: Maj 2026</Text>

        <Text style={styles.sectionTitle}>1. Postanowienia ogólne</Text>
        <Text style={styles.paragraph}>
          Niniejszy Regulamin określa zasady korzystania z aplikacji mobilnej CashFlo 
          (dalej "Aplikacja"), świadczonej przez CashFlo (dalej "Usługodawca").
        </Text>
        <Text style={styles.paragraph}>
          Korzystanie z Aplikacji oznacza akceptację niniejszego Regulaminu w całości. 
          Jeśli nie zgadzasz się z postanowieniami Regulaminu, nie powinieneś korzystać 
          z Aplikacji.
        </Text>

        <Text style={styles.sectionTitle}>2. Definicje</Text>
        <Text style={styles.listItem}>• <Text style={styles.bold}>Aplikacja</Text> – aplikacja mobilna CashFlo dostępna na urządzenia z systemem iOS i Android.</Text>
        <Text style={styles.listItem}>• <Text style={styles.bold}>Użytkownik</Text> – osoba fizyczna korzystająca z Aplikacji.</Text>
        <Text style={styles.listItem}>• <Text style={styles.bold}>Konto</Text> – zbiór zasobów i uprawnień przypisanych Użytkownikowi w Aplikacji.</Text>
        <Text style={styles.listItem}>• <Text style={styles.bold}>Usługa Premium</Text> – płatna wersja Aplikacji z rozszerzonymi funkcjami.</Text>

        <Text style={styles.sectionTitle}>3. Zakres usług</Text>
        <Text style={styles.paragraph}>
          CashFlo to aplikacja do zarządzania finansami osobistymi, która umożliwia:
        </Text>
        <Text style={styles.listItem}>• Śledzenie wydatków i przychodów</Text>
        <Text style={styles.listItem}>• Ustalanie celów oszczędnościowych</Text>
        <Text style={styles.listItem}>• Monitorowanie budżetu miesięcznego</Text>
        <Text style={styles.listItem}>• Analizę wydatków według kategorii</Text>
        <Text style={styles.listItem}>• Obliczanie dziennego limitu "Safe-to-Spend"</Text>

        <Text style={styles.sectionTitle}>4. Rejestracja i Konto</Text>
        <Text style={styles.paragraph}>
          4.1. Korzystanie z pełnej funkcjonalności Aplikacji wymaga utworzenia Konta.
        </Text>
        <Text style={styles.paragraph}>
          4.2. Użytkownik zobowiązuje się do podania prawdziwych danych podczas rejestracji.
        </Text>
        <Text style={styles.paragraph}>
          4.3. Użytkownik jest odpowiedzialny za bezpieczeństwo swojego hasła i Konta.
        </Text>
        <Text style={styles.paragraph}>
          4.4. Użytkownik może w każdej chwili usunąć swoje Konto w aplikacji (Więcej → Usuń konto)
          albo kontaktując się z nami pod adresem cashflo2026@gmail.com.
        </Text>

        <Text style={styles.sectionTitle}>5. Usługa Premium</Text>
        <Text style={styles.paragraph}>
          5.1. Usługa Premium jest dostępna w następujących planach:
        </Text>
        <Text style={styles.listItem}>• Miesięczny: 19,99 PLN/miesiąc</Text>
        <Text style={styles.listItem}>• Roczny: 99,99 PLN/rok</Text>
        <Text style={styles.listItem}>• Bezterminowy: 199 PLN (jednorazowo)</Text>
        <Text style={styles.paragraph}>
          5.2. Płatności są przetwarzane przez zewnętrznego dostawcę usług płatniczych (Stripe).
        </Text>
        <Text style={styles.paragraph}>
          5.3. Subskrypcja odnawia się automatycznie, chyba że zostanie anulowana przed 
          końcem okresu rozliczeniowego.
        </Text>
        <Text style={styles.paragraph}>
          5.4. Użytkownik może anulować subskrypcję w dowolnym momencie. Anulowanie 
          będzie skuteczne od następnego okresu rozliczeniowego.
        </Text>

        <Text style={styles.sectionTitle}>6. Zasady korzystania</Text>
        <Text style={styles.paragraph}>
          Użytkownik zobowiązuje się do:
        </Text>
        <Text style={styles.listItem}>• Korzystania z Aplikacji zgodnie z prawem i dobrymi obyczajami</Text>
        <Text style={styles.listItem}>• Niepodejmowania działań mogących zakłócić działanie Aplikacji</Text>
        <Text style={styles.listItem}>• Nieudostępniania swojego Konta osobom trzecim</Text>
        <Text style={styles.listItem}>• Nienaruszania praw własności intelektualnej Usługodawcy</Text>

        <Text style={styles.sectionTitle}>7. Odpowiedzialność</Text>
        <Text style={styles.paragraph}>
          7.1. Aplikacja jest narzędziem pomocniczym do zarządzania finansami. 
          Usługodawca nie ponosi odpowiedzialności za decyzje finansowe podejmowane 
          przez Użytkownika na podstawie danych z Aplikacji.
        </Text>
        <Text style={styles.paragraph}>
          7.2. Usługodawca nie gwarantuje nieprzerwanego dostępu do Aplikacji i zastrzega 
          sobie prawo do przerw technicznych.
        </Text>
        <Text style={styles.paragraph}>
          7.3. Usługodawca nie ponosi odpowiedzialności za szkody wynikłe z utraty danych 
          przez Użytkownika.
        </Text>

        <Text style={styles.sectionTitle}>8. Zwroty i reklamacje</Text>
        <Text style={styles.paragraph}>
          8.1. Użytkownik ma prawo do zwrotu płatności w ciągu 14 dni od zakupu, 
          jeśli nie korzystał z funkcji Premium.
        </Text>
        <Text style={styles.paragraph}>
          8.2. Reklamacje należy zgłaszać na adres cashflo2026@gmail.com.
        </Text>
        <Text style={styles.paragraph}>
          8.3. Reklamacje rozpatrujemy w ciągu 14 dni roboczych.
        </Text>

        <Text style={styles.sectionTitle}>9. Zmiany Regulaminu</Text>
        <Text style={styles.paragraph}>
          9.1. Usługodawca zastrzega sobie prawo do zmiany niniejszego Regulaminu.
        </Text>
        <Text style={styles.paragraph}>
          9.2. O istotnych zmianach Użytkownicy zostaną poinformowani za pośrednictwem 
          Aplikacji lub e-mail.
        </Text>
        <Text style={styles.paragraph}>
          9.3. Dalsze korzystanie z Aplikacji po wprowadzeniu zmian oznacza ich akceptację.
        </Text>

        <Text style={styles.sectionTitle}>10. Postanowienia końcowe</Text>
        <Text style={styles.paragraph}>
          10.1. Regulamin podlega prawu polskiemu.
        </Text>
        <Text style={styles.paragraph}>
          10.2. Wszelkie spory będą rozstrzygane przez sąd właściwy dla siedziby Usługodawcy.
        </Text>
        <Text style={styles.paragraph}>
          10.3. W sprawach nieuregulowanych w Regulaminie zastosowanie mają przepisy 
          prawa polskiego.
        </Text>

        <Text style={styles.sectionTitle}>11. Kontakt</Text>
        <Text style={styles.paragraph}>
          W sprawach związanych z Regulaminem prosimy o kontakt:
        </Text>
        <Text style={styles.contactInfo}>Email: cashflo2026@gmail.com</Text>
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
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: BRAND_GREEN,
    marginTop: 24,
    marginBottom: 12,
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
});
