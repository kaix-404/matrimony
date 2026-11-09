import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { PrimaryButton } from '../components/PrimaryButton';
import { Screen } from '../components/Screen';
import { colors, radii, spacing, typography } from '../theme/tokens';

/**
 * Help.
 *
 * Every answer here describes behaviour that exists in this build — the unlock
 * window, who sets the price, what KYC stores, what pausing does, what deletion
 * keeps and for how long. An FAQ that promises something the product does not do
 * is a support ticket waiting to happen, so there is deliberately no answer to
 * anything the client has not decided yet.
 *
 * There is no support address in this file because the business has not given
 * one; the closing card points at the team instead of inventing an inbox.
 */

interface Entry {
  question: string;
  answer: string;
}

const GETTING_STARTED: Entry[] = [
  {
    question: 'Why can’t I see anyone yet?',
    answer:
      'Discovery opens once your identity check has passed and the one-time account setup fee is paid. Until then your profile is offline and your feed is empty.',
  },
  {
    question: 'What does it cost?',
    answer:
      '₹17.70 once to set up your account, GST included. Contacting someone is separate: each unlock is priced by the band of the profile you are opening, and you always see the price before you pay.',
  },
  {
    question: 'Why do I see only some bands?',
    answer:
      'Visibility works both ways. You choose which bands you want to see, and each member chooses which bands may see them; you appear in a feed only when both sides agree. Your own band is the default in both directions.',
  },
  {
    question: 'Why did my feed get smaller?',
    answer:
      'Partner preferences in Settings narrow the feed. A field you filled in excludes profiles that do not match it — including profiles that left that field blank. Clear the field to stop filtering on it.',
  },
];

const MONEY: Entry[] = [
  {
    question: 'What is a setup fee?',
    answer:
      'A one-time charge for creating your account, paid once and never again. It is separate from unlocks, which are charged per profile you choose to contact.',
  },
  {
    question: 'What does unlocking give me?',
    answer:
      'The contact details of that profile, visible for 24 hours. Photos are never hidden behind payment.',
  },
  {
    question: 'Who sets the unlock price?',
    answer:
      'The band of the profile you are unlocking, not your own band. The price shown on the button is the amount charged, GST included.',
  },
];

const PRIVACY: Entry[] = [
  {
    question: 'What does KYC keep?',
    answer:
      'Only a masked Aadhaar reference, the name and the year of birth that appear on it. Your Aadhaar number and any document copy are not stored.',
  },
  {
    question: 'What does pausing my profile do?',
    answer:
      'It hides you from every feed immediately, and nothing is deleted. Turn it back on and you are visible to your selected bands again; unlocks you already bought keep their 24 hours.',
  },
  {
    question: 'What happens if I delete my account?',
    answer:
      'Your profile leaves discovery straight away and your sessions end. The account is kept for a limited retention period so a mistaken deletion can be reversed, then erased permanently.',
  },
  {
    question: 'Someone is behaving badly. What can I do?',
    answer:
      'Report the profile from its page, and block it if you would rather not see it again. A block hides you from each other in both directions, and neither side is told.',
  },
  {
    question: 'Can I get a copy of my data?',
    answer:
      'Yes — request it from Settings. The copy is prepared by the team and handed over through the same channel they used to reach you.',
  },
];

function Section({ title, entries }: { title: string; entries: Entry[] }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {entries.map((entry) => (
        <View key={entry.question} style={styles.card}>
          <Text style={styles.question}>{entry.question}</Text>
          <Text style={styles.answer}>{entry.answer}</Text>
        </View>
      ))}
    </View>
  );
}

export default function HelpScreen() {
  return (
    <Screen
      title="Help"
      subtitle="How this works, in plain terms."
      back
      footer={
        <PrimaryButton label="See pricing" onPress={() => router.push('/pricing')} />
      }
    >
      <Section title="Getting started" entries={GETTING_STARTED} />
      <Section title="Payments and unlocks" entries={MONEY} />
      <Section title="Privacy and safety" entries={PRIVACY} />

      <View style={styles.card}>
        <Text style={styles.question}>Still stuck?</Text>
        <Text style={styles.answer}>
          Contact the team that invited you to join, with your registered mobile number and what you
          were trying to do. Anything about a payment, include the amount and the date.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.textPrimary,
    ...typography.h2,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.cardMd,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  question: {
    color: colors.textPrimary,
    ...typography.title,
  },
  answer: {
    color: colors.textMuted,
    ...typography.body,
  },
});
