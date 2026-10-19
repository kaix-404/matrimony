import type { ReactNode } from 'react';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppShell } from './AppShell';
import { BottomNav } from './BottomNav';
import { ScreenHeader } from './ScreenHeader';
import { spacing } from '../theme/tokens';

interface ScreenProps {
  title: string;
  subtitle?: string;
  /** Shows a back chevron that runs `onBack`, or `router.back()` when omitted. */
  back?: boolean;
  onBack?: () => void;
  children: ReactNode;
  /** Rendered below the scroll area, pinned above the bottom safe-area inset. */
  footer?: ReactNode;
  /** Renders the floating tab bar; use on tab destinations, not pushed screens. */
  bottomNav?: boolean;
}

/**
 * Standard pushed-screen frame: canvas, safe-area padding, title row, optional
 * scrolling body and an optional pinned footer for the primary action.
 */
export function Screen({
  title,
  subtitle,
  back,
  onBack,
  children,
  footer,
  bottomNav,
}: ScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <AppShell>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <ScreenHeader
          title={title}
          subtitle={subtitle}
          onBack={back ? (onBack ?? (() => router.back())) : undefined}
        />
        <ScrollView
          contentContainerStyle={[styles.content, bottomNav && styles.contentWithNav]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
        {footer ? (
          <View
            style={[
              styles.footer,
              { paddingBottom: insets.bottom + (bottomNav ? spacing.navClearance : spacing.lg) },
            ]}
          >
            {footer}
          </View>
        ) : null}
      </View>
      {bottomNav ? <BottomNav /> : null}
    </AppShell>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.screenX,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  contentWithNav: {
    paddingBottom: spacing.navClearance,
  },
  footer: {
    paddingHorizontal: spacing.screenX,
    paddingTop: spacing.md,
  },
});
