const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

/**
 * expo-secure-store's own config plugin points AndroidManifest.xml at two Auto
 * Backup rule files -- `@xml/secure_store_backup_rules` (SDK 30 and below) and
 * `@xml/secure_store_data_extraction_rules` (SDK 31 and above) -- but, as of
 * SDK 57, it writes neither of them and never creates `res/xml`. A clean
 * prebuild therefore hands gradle a manifest referencing resources nothing
 * provides, and the build fails in AAPT on a missing resource rather than
 * anywhere the cause is visible.
 *
 * The rules themselves are ordinary XML and live in `resources/xml/`; this
 * plugin is only the placement step, so `expo prebuild`, `expo run:android` and
 * an EAS build all produce a project that compiles with no manual copy.
 */
const RULES_DIR = path.join('resources', 'xml');
const RULE_FILES = ['secure_store_backup_rules.xml', 'secure_store_data_extraction_rules.xml'];

module.exports = function withSecureStoreBackupRules(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const sourceDir = path.join(config.modRequest.projectRoot, RULES_DIR);
      const targetDir = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'xml',
      );

      // Name the missing file instead of letting prebuild fail on a read that
      // does not say which rule set is absent.
      for (const file of RULE_FILES) {
        if (!fs.existsSync(path.join(sourceDir, file))) {
          throw new Error(
            `withSecureStoreBackupRules: ${RULES_DIR}/${file} is missing, so the backup rules that expo-secure-store references in AndroidManifest.xml cannot be provided.`,
          );
        }
      }

      await fs.promises.mkdir(targetDir, { recursive: true });
      // Rewrite on every prebuild: the android directory is regenerated, and the
      // files are ours, so there is nothing here to preserve.
      for (const file of RULE_FILES) {
        await fs.promises.copyFile(path.join(sourceDir, file), path.join(targetDir, file));
      }

      return config;
    },
  ]);
};
