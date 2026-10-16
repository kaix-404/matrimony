import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, layout } from '../theme/tokens';

/**
 * Constrains the app to a phone-width canvas and centres it on wider viewports.
 *
 * The design targets a 390-412px column; on tablets and web `maxWidth` keeps the
 * layout from stretching, while `flex: 1` still fills the height.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <View style={styles.root}>
      <View style={styles.canvas}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: 'center',
    overflow: 'hidden',
  },
  canvas: {
    flex: 1,
    width: '100%',
    maxWidth: layout.maxWidth,
    backgroundColor: colors.background,
  },
});
