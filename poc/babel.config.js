module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'react-native-unistyles/plugin',
        {
          // Pass root folder of your application
          // All files under this folder will be processed by the Babel plugin
          root: './src',
        },
      ],
    ],
  };
};
