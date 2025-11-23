module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'react-native-unistyles/plugin',
        {
          // All files under this folder will be processed by Babel
          root: './src',
        },
      ],
    ],
  };
};
