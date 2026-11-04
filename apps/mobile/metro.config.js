const { getDefaultConfig } = require('@expo/metro-config');

const root = require('path').resolve(__dirname, '..');

module.exports = (() => {
  const config = getDefaultConfig(__dirname);

  // Add the repository root to Metro's resolver paths so that
  // expo/AppEntry.js can resolve ../../App when expo is hoisted
  // to the root node_modules.
  config.resolver.nodeModulesPaths = [
    ...config.resolver.nodeModulesPaths,
    root,
  ];

  return config;
})();
