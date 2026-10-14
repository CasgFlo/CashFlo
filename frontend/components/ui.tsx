/**
 * Shared building blocks for CashFlo screens, so every screen uses the same
 * spacing, corners, type sizes and colors.
 */
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  StyleProp,
  ViewStyle,
  TextStyle,
  Modal,
  ScrollView,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, ThemeColors } from '../contexts/ThemeContext';
import { Category, Transaction } from '../utils/types';
import { formatSignedCurrency } from '../utils/format';

export const radius = { sm: 10, md: 14, lg: 20, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

// Numbers line up in columns
export const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

type IconName = React.ComponentProps<typeof Ionicons>['name'];

/** Big title at the top of a tab screen. */
export function LargeTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.largeTitleRow}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.largeTitle, { color: colors.text }]} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? <Text style={[styles.largeSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

/** Row with a back (or close) button and the screen title, for screens opened on top of the tabs. */
export function ScreenHeader({
  title,
  onBack,
  icon = 'arrow-back',
  right,
}: {
  title: string;
  onBack: () => void;
  icon?: 'arrow-back' | 'close';
  right?: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.headerRow}>
      <TouchableOpacity
        onPress={onBack}
        style={[styles.headerButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityLabel={icon === 'close' ? 'Zamknij' : 'Wróć'}
      >
        <Ionicons name={icon} size={22} color={colors.text} />
      </TouchableOpacity>
      <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1} accessibilityRole="header">
        {title}
      </Text>
      <View style={styles.headerRight}>{right}</View>
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>
      {children}
    </View>
  );
}

export function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity onPress={onAction} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={[styles.sectionAction, { color: colors.primary }]}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({
  title,
  onPress,
  loading = false,
  disabled = false,
  icon,
  variant = 'primary',
  style,
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  variant?: ButtonVariant;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const palette: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
    primary: { bg: colors.primary, fg: colors.onPrimary, border: colors.primary },
    secondary: { bg: colors.surface, fg: colors.text, border: colors.border },
    danger: { bg: colors.error, fg: '#FFFFFF', border: colors.error },
    ghost: { bg: 'transparent', fg: colors.primary, border: 'transparent' },
  };
  const p = palette[variant];
  const inactive = disabled || loading;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={inactive}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={[
        styles.button,
        { backgroundColor: p.bg, borderColor: p.border },
        inactive && !loading && { opacity: 0.45 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={p.fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={20} color={p.fg} style={{ marginRight: 8 }} /> : null}
          <Text style={[styles.buttonText, { color: p.fg }]}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

/** Two or three options side by side, one selected. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; color?: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: colors.surfaceAlt }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <TouchableOpacity
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[
              styles.segment,
              selected && { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <Text
              style={[
                styles.segmentText,
                { color: selected ? option.color || colors.text : colors.textSecondary },
              ]}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  icon,
  color,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: IconName;
  color?: string;
}) {
  const { colors } = useTheme();
  const tint = color || colors.primary;
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? tint : colors.surface,
          borderColor: selected ? tint : colors.border,
        },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      {icon ? <Ionicons name={icon} size={16} color={selected ? '#FFFFFF' : tint} style={{ marginRight: 6 }} /> : null}
      <Text style={[styles.chipText, { color: selected ? '#FFFFFF' : colors.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function ProgressBar({ value, color }: { value: number; color: string }) {
  const { colors } = useTheme();
  const pct = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <View style={[styles.progressTrack, { backgroundColor: colors.surfaceAlt }]}>
      <View style={[styles.progressFill, { width: `${pct * 100}%`, backgroundColor: color }]} />
    </View>
  );
}

export function IconBubble({ name, color, size = 40 }: { name: IconName; color: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color + '1F',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={name} size={Math.round(size * 0.5)} color={color} />
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  text,
  actionLabel,
  onAction,
}: {
  icon: IconName;
  title: string;
  text?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <IconBubble name={icon} color={colors.primary} size={56} />
      <Text style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text>
      {text ? <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{text}</Text> : null}
      {actionLabel && onAction ? (
        <Button title={actionLabel} onPress={onAction} icon="add" style={{ marginTop: space.lg, alignSelf: 'stretch' }} />
      ) : null}
    </View>
  );
}

/** One transaction in a list: category icon, name, description, signed amount. */
export function TransactionRow({
  transaction,
  category,
  onPress,
  showDate,
  dateLabel,
}: {
  transaction: Transaction;
  category?: Category;
  onPress?: () => void;
  showDate?: boolean;
  dateLabel?: string;
}) {
  const { colors } = useTheme();
  const isIncome = transaction.type === 'income';
  const tint = category?.color || (isIncome ? colors.income : colors.expense);
  const iconName = (category?.icon as IconName) || (isIncome ? 'arrow-down' : 'arrow-up');
  const secondary = [transaction.description, showDate ? dateLabel : null].filter(Boolean).join(' · ');

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.7}
      style={styles.txRow}
      accessibilityRole={onPress ? 'button' : undefined}
    >
      <IconBubble name={iconName} color={tint} size={42} />
      <View style={styles.txMiddle}>
        <Text style={[styles.txTitle, { color: colors.text }]} numberOfLines={1}>
          {transaction.category}
        </Text>
        {secondary ? (
          <Text style={[styles.txSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
            {secondary}
          </Text>
        ) : null}
      </View>
      <View style={styles.txRight}>
        <Text style={[styles.txAmount, tabular, { color: isIncome ? colors.income : colors.text }]}>
          {formatSignedCurrency(transaction.amount, transaction.type)}
        </Text>
        <View style={styles.txBadges}>
          {transaction.is_recurring || transaction.recurring_parent_id ? (
            <Ionicons name="repeat" size={13} color={colors.textLight} style={{ marginLeft: 6 }} />
          ) : null}
          {transaction.has_receipt ? (
            <Ionicons name="receipt-outline" size={13} color={colors.textLight} style={{ marginLeft: 6 }} />
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export function Fab({ onPress, label }: { onPress: () => void; label: string }) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.fab, { backgroundColor: colors.primary, shadowColor: colors.primaryDark }]}
      accessibilityRole="button"
      accessibilityLabel={label}
      activeOpacity={0.85}
    >
      <Ionicons name="add" size={30} color={colors.onPrimary} />
    </TouchableOpacity>
  );
}

/** Small amber "PRO" label next to features that need Pro. */
export function ProBadge({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.proBadge, { backgroundColor: colors.accent }, style]}>
      <Ionicons name="star" size={10} color={colors.onAccent} />
      <Text style={[styles.proBadgeText, { color: colors.onAccent }]}>PRO</Text>
    </View>
  );
}

/** A tappable row with an icon, title and optional subtitle, used in grouped lists. */
export function ListRow({
  icon,
  title,
  subtitle,
  onPress,
  right,
  tint,
  divider,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  tint?: string;
  divider?: boolean;
}) {
  const { colors } = useTheme();
  const color = tint || colors.primary;
  return (
    <TouchableOpacity
      style={[styles.listRow, divider && { borderTopWidth: 1, borderTopColor: colors.divider }]}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.7}
      accessibilityRole={onPress ? 'button' : undefined}
    >
      <View style={[styles.listRowIcon, { backgroundColor: color + '1A' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.listRowTitle, { color: colors.text }]}>{title}</Text>
        {subtitle ? <Text style={[styles.listRowSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
      </View>
      {right !== undefined ? right : onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textLight} /> : null}
    </TouchableOpacity>
  );
}

/** One plain-language conclusion ("Wydano o 12% mniej niż we wrześniu"). */
export function InsightRow({
  icon,
  text,
  tone = 'neutral',
  divider,
}: {
  icon: string;
  text: string;
  tone?: 'positive' | 'negative' | 'neutral';
  divider?: boolean;
}) {
  const { colors } = useTheme();
  const color = tone === 'positive' ? colors.income : tone === 'negative' ? colors.expense : colors.textSecondary;
  return (
    <View style={[styles.insightRow, divider && { borderTopWidth: 1, borderTopColor: colors.divider }]}>
      <Ionicons name={(icon as IconName) || 'bulb-outline'} size={18} color={color} style={{ marginTop: 1 }} />
      <Text style={[styles.insightText, { color: colors.text }]}>{text}</Text>
    </View>
  );
}

/** A friendly "this is in Pro" card with a button that opens the Pro screen. */
export function LockedCard({
  title,
  text,
  onPress,
  buttonLabel = 'Zobacz CashFlo Pro',
}: {
  title: string;
  text?: string;
  onPress: () => void;
  buttonLabel?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, styles.locked, { backgroundColor: colors.surface, borderColor: colors.accent }]}>
      <View style={styles.lockedTop}>
        <View style={[styles.lockedIcon, { backgroundColor: colors.accent + '33' }]}>
          <Ionicons name="lock-closed" size={16} color={colors.warning} />
        </View>
        <Text style={[styles.lockedTitle, { color: colors.text }]}>{title}</Text>
      </View>
      {text ? <Text style={[styles.lockedText, { color: colors.textSecondary }]}>{text}</Text> : null}
      <Button title={buttonLabel} icon="star" variant="secondary" onPress={onPress} style={{ marginTop: space.md }} />
    </View>
  );
}

/** A panel that slides up from the bottom of the screen. */
export function Sheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.sheetOverlay, { backgroundColor: colors.overlay }]}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Zamknij" />
        <View style={[styles.sheet, { backgroundColor: colors.background, paddingBottom: insets.bottom + space.lg }]}>
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: colors.text }]} numberOfLines={2}>
              {title}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityLabel="Zamknij">
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 520 }}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export const makeScreenStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: space.lg, paddingBottom: 120 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  });

const styles = StyleSheet.create({
  largeTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingTop: space.sm,
    paddingBottom: space.lg,
  },
  largeTitle: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  largeSubtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: space.sm,
    paddingBottom: space.lg,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    marginLeft: space.md,
  },
  headerRight: {
    minWidth: 40,
    alignItems: 'flex-end',
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space.lg,
    marginBottom: space.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.sm,
    marginBottom: space.md,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  sectionAction: {
    fontSize: 14,
    fontWeight: '600',
  },
  button: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: radius.md,
    padding: 4,
  },
  segment: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: 'transparent',
    borderWidth: 1,
  },
  segmentText: {
    fontSize: 15,
    fontWeight: '600',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    minHeight: 38,
    borderRadius: radius.pill,
    borderWidth: 1,
    marginRight: space.sm,
    marginBottom: space.sm,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  empty: {
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingVertical: space.xxl,
    paddingHorizontal: space.xl,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: space.md,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    marginTop: space.xs,
    textAlign: 'center',
    lineHeight: 20,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.md,
  },
  txMiddle: {
    flex: 1,
    marginLeft: space.md,
    marginRight: space.sm,
  },
  txTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  txSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  txRight: {
    alignItems: 'flex-end',
  },
  txAmount: {
    fontSize: 15,
    fontWeight: '700',
  },
  txBadges: {
    flexDirection: 'row',
    marginTop: 3,
    minHeight: 13,
  },
  proBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  proBadgeText: { fontSize: 10, fontWeight: '800', marginLeft: 2, letterSpacing: 0.4 },
  listRow: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingVertical: space.sm },
  listRowIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.md,
  },
  listRowTitle: { fontSize: 15, fontWeight: '600' },
  listRowSubtitle: { fontSize: 13, marginTop: 1 },
  insightRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: space.sm },
  insightText: { flex: 1, fontSize: 14, lineHeight: 20, marginLeft: space.sm },
  locked: { borderWidth: 1 },
  lockedTop: { flexDirection: 'row', alignItems: 'center' },
  lockedIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginRight: space.sm },
  lockedTitle: { flex: 1, fontSize: 15, fontWeight: '700' },
  lockedText: { fontSize: 14, lineHeight: 20, marginTop: space.sm },
  sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.md },
  sheetTitle: { flex: 1, fontSize: 18, fontWeight: '800', marginRight: space.md },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
});
