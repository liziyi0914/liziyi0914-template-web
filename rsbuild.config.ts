import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { tanstackRouter } from "@tanstack/router-plugin/rspack";
import {pluginLess} from "@rsbuild/plugin-less";
import Font from 'vite-plugin-font';

export default defineConfig({
  plugins: [pluginReact(), pluginLess()],
  tools: {
    rspack: {
      plugins: [
        tanstackRouter({
          target: 'react',
          autoCodeSplitting: true,
        }),
        Font.rspack({
          scanFiles: ['src/**/*.{vue,ts,tsx,js,jsx}'],
        }),
      ],
    },
    bundlerChain(chain, { CHAIN_ID }) {
      chain.module.rule(CHAIN_ID.RULE.FONT).exclude.add(/\.(ttf|otf)$/);  // 要求 RsBuild 不处理 .ttf 文件
    },
  },
  performance: {
    chunkSplit: {
      strategy: 'split-by-experience',
    },
  },
});
