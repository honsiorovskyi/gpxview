const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = (env, argv) => {
  const isDev = argv.mode === 'development';

  return {
    entry: './src/index.js',
    output: {
      filename: 'bundle.js',
      path: path.resolve(__dirname, isDev ? 'dev' : 'dist'),
      clean: true,
    },
    devtool: 'source-map',
    ignoreWarnings: [
      {
        module: /node_modules\/@raruto\/leaflet-elevation/,
        message: /Critical dependency: the request of a dependency is an expression/,
      },
    ],
    module: {
      rules: [
        {
          test: /\.css$/i,
          use: [MiniCssExtractPlugin.loader, 'css-loader'],
        },
        {
          test: /\.(png|svg|jpg|jpeg|gif)$/i,
          type: 'asset/resource',
        },
      ],
    },
    plugins: [
      new MiniCssExtractPlugin({
        filename: 'bundle.css',
      }),
      new CopyWebpackPlugin({
        patterns: [
          { from: './src/index.html', to: 'index.html' },
        ],
      }),
      ...(isDev ? [
        new CopyWebpackPlugin({
          patterns: [
            { from: 'sample.gpx', to: 'sample.gpx' }
          ],
        })
      ] : []),
    ],
    resolve: {
      alias: {
        // Help webpack find leaflet images
        'leaflet$': path.resolve(__dirname, 'node_modules/leaflet/dist/leaflet.js'),
      },
    },
  };
};