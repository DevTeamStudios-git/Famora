const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
// Keep native builds usable alongside the web development server on laptops.
const config = { maxWorkers: 2 };

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
