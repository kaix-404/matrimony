import { Ionicons } from '@expo/vector-icons';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { colors, spacing, typography } from '../theme/tokens';

/**
 * Help.
 *
 * A contact page, nothing else: the screen name, one line saying we are here,
 * then each way to reach the team as a label with its link underneath. Answers
 * to the questions members actually ask live with the thing they ask about, so
 * this page stays a way to reach a person rather than a second manual.
 */

/** The address the team answers from. Kept in one place so no surface drifts. */
const SUPPORT_EMAIL = 'tetflow2025@gmail.com';

/**
 * Support numbers the business has not given us yet. Digits only, without the
 * country code — `9876543210`. While a value is null its row is absent, so the
 * page never offers a link that goes nowhere.
 */
const SUPPORT_WHATSAPP: string | null = null;
const SUPPORT_CARE_NUMBER: string | null = null;

/** One way to reach the team, rendered in list order. */
interface Channel {
  label: string;
  value: string;
  url: string;
  /** Marks a channel that leaves the app, shown with a chevron. */
  chevron?: boolean;
}

const SUPPORT_CHANNELS: Channel[] = [
  ...(SUPPORT_WHATSAPP
    ? [
        {
          label: 'Whatsapp',
          value: 'Chat with us',
          url: `https://wa.me/91${SUPPORT_WHATSAPP}`,
          chevron: true,
        },
      ]
    : []),
  ...(SUPPORT_CARE_NUMBER
    ? [
        {
          label: 'Customer Care Number',
          value: SUPPORT_CARE_NUMBER,
          url: `tel:+91${SUPPORT_CARE_NUMBER}`,
        },
      ]
    : []),
  { label: 'Write to us', value: SUPPORT_EMAIL, url: `mailto:${SUPPORT_EMAIL}` },
];

export default function HelpScreen() {
  return (
    <Screen title="Contact support" back>
      <View style={styles.support}>
        <Text style={styles.heading}>We’re here to help.</Text>
        {SUPPORT_CHANNELS.map((channel) => (
          <View key={channel.label} style={styles.channel}>
            <Text style={styles.label}>{channel.label}</Text>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`${channel.label}: ${channel.value}`}
              hitSlop={8}
              onPress={() => void Linking.openURL(channel.url)}
              style={styles.link}
            >
              <Text style={styles.value}>{channel.value}</Text>
              {channel.chevron ? (
                <Ionicons name="chevron-forward" size={16} color={colors.primary} />
              ) : null}
            </Pressable>
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  support: {
    gap: spacing.xxl,
    paddingTop: spacing.md,
  },
  heading: {
    color: colors.textPrimary,
    ...typography.display,
  },
  channel: {
    gap: spacing.md,
  },
  label: {
    color: colors.textPrimary,
    ...typography.h2,
  },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
  },
  value: {
    color: colors.primary,
    ...typography.body,
    fontWeight: '600',
  },
});
