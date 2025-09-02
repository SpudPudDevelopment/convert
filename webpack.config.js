const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');

const isDevelopment = process.env.NODE_ENV !== 'production';

module.exports = {
  mode: process.env.NODE_ENV || 'development',
  entry: './src/renderer/index.js',
  output: {
    path: path.resolve(__dirname, 'build'),
    filename: 'bundle.js',
    publicPath: './',
    clean: true
  },
  optimization: {
    usedExports: true,
    minimize: !isDevelopment,
    splitChunks: false, // Disable code splitting to avoid conflicts
    runtimeChunk: false
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              ['@babel/preset-env', {
                targets: {
                  node: 'current'
                },
                modules: 'auto'
              }],
              '@babel/preset-react'
            ],
            plugins: ['@babel/plugin-transform-modules-commonjs']
          }
        }
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './public/index.html',
      filename: 'index.html',
      inject: 'body',
      templateParameters: {
        isProduction: !isDevelopment
      },
      minify: !isDevelopment ? false : {
        removeComments: true,
        collapseWhitespace: true,
        removeRedundantAttributes: true,
        useShortDoctype: true,
        removeEmptyAttributes: true,
        removeStyleLinkTypeAttributes: true,
        keepClosingSlash: true,
        minifyJS: true,
        minifyCSS: true,
        minifyURLs: true
      }
    }),
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
      'process.env.IS_PRODUCTION': JSON.stringify(!isDevelopment),
      '__IS_PRODUCTION__': JSON.stringify(!isDevelopment)
    }),
    new webpack.ProvidePlugin({
      global: 'global',
      process: 'process/browser',
      Buffer: ['buffer', 'Buffer']
    })
  ],
  devServer: {
    static: {
      directory: path.join(__dirname, 'public')
    },
    port: 3000,
    hot: false,
    liveReload: true,
    open: false,
    historyApiFallback: true,
    compress: true,
    client: {
      overlay: {
        errors: true,
        warnings: false
      },
      progress: true
    },
    devMiddleware: {
      writeToDisk: false
    }
  },
  target: 'web',
  resolve: {
    extensions: ['.js', '.jsx'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@renderer': path.resolve(__dirname, 'src/renderer')
    },
    fallback: {
      "events": require.resolve("events/"),
      "util": require.resolve("util/"),
      "stream": require.resolve("stream-browserify"),
      "buffer": require.resolve("buffer"),
      "process": require.resolve("process/browser"),
      "global": require.resolve("global/window")
    }
  },
  devtool: isDevelopment ? 'eval-source-map' : 'source-map',
  stats: {
    errorDetails: true,
    children: true
  },
  performance: {
    hints: isDevelopment ? false : 'warning',
    maxEntrypointSize: 512000,
    maxAssetSize: 512000
  }
};