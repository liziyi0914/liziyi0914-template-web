import { defineConfig } from '@rsbuild/core';
import { pluginBabel } from '@rsbuild/plugin-babel';
import { pluginReact } from '@rsbuild/plugin-react';
import { tanstackRouter } from '@tanstack/router-plugin/rspack';
import type { RspackPluginInstance } from '@rspack/core';
import Font from 'vite-plugin-font';

/** vite-plugin-font 在 Windows 会生成 /D:/... 路径，Rspack 无法解析 */
function fixWindowsFontAbsolutePaths(): RspackPluginInstance {
  return {
    name: 'fix-windows-font-absolute-paths',
    apply(compiler) {
      compiler.hooks.normalModuleFactory.tap(
        'fix-windows-font-absolute-paths',
        (nmf) => {
          nmf.hooks.beforeResolve.tap(
            'fix-windows-font-absolute-paths',
            (resolveData) => {
              const request = resolveData.request;
              if (request && /^\/[a-zA-Z]:/.test(request)) {
                resolveData.request = request.slice(1);
              }
            },
          );
        },
      );
    },
  };
}

// Docs: https://rsbuild.rs/config/
export default defineConfig({
  plugins: [
    pluginReact(),
    pluginBabel({
      include: /\.[jt]sx?$/,
      exclude: [/[\\/]node_modules[\\/]/],
      babelLoaderOptions(opts) {
        opts.plugins?.unshift('babel-plugin-react-compiler');
      },
    }),
  ],
  tools: {
    bundlerChain(chain, { CHAIN_ID }) {
      chain.module.rule(CHAIN_ID.RULE.FONT).exclude.add(/\.(ttf|otf)$/); // 要求 RsBuild 不处理 .ttf 文件
    },
    rspack: {
      plugins: [
        tanstackRouter({
          target: 'react',
          autoCodeSplitting: true,
        }),
        Font.rspack({
          scanFiles: ['src/**/*.{vue,ts,tsx,js,jsx}'],
        }),
        fixWindowsFontAbsolutePaths(),
      ],
    },
  },
});
