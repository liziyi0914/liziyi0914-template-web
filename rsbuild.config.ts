import { defineConfig } from '@rsbuild/core';
import { pluginLess } from '@rsbuild/plugin-less';
import { pluginReact } from '@rsbuild/plugin-react';
import TanStackRouterRspack from '@tanstack/router-plugin/rspack';

export default defineConfig({
  plugins: [pluginReact(), pluginLess()],
  tools: {
    rspack: {
      plugins: [TanStackRouterRspack()],
    },
  },
  performance: {
    chunkSplit: {
      strategy: 'split-by-experience',
    },
  },
  server: {
    port: 8000,
  },
  html: {
    tags: [
      // {
      //   tag: 'script',
      //   publicPath: false,
      //   attrs: {
      //     src: 'https://turing.captcha.qcloud.com/TJCaptcha.js',
      //   },
      // },
    ],
  },
});
