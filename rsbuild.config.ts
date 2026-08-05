import { defineConfig } from '@rsbuild/core';
import { pluginBabel } from '@rsbuild/plugin-babel';
import { pluginReact } from '@rsbuild/plugin-react';
import type { RspackPluginInstance } from '@rspack/core';
import { tanstackRouter } from '@tanstack/router-plugin/rspack';
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

/**
 * 移动端 dev 时 WebView 走 tauri.localhost 自定义协议代理，
 * 懒编译触发用的 POST /_rspack/lazy/trigger 到不了 dev server，
 * 异步 chunk 的 import() 会永远挂起，页面渲染不出任何内容
 */
const tauriPlatform = process.env.TAURI_ENV_PLATFORM ?? '';
const isTauriMobile = ['android', 'ios'].includes(tauriPlatform);

// Docs: https://rsbuild.rs/config/
export default defineConfig({
  dev: {
    lazyCompilation: !isTauriMobile,
  },
  html: {
    title: 'GDUFE Classroom',
    meta: {
      // viewport-fit=cover 才能拿到非零的 safe-area-inset-*，禁用缩放避免误触双指放大
      viewport:
        'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover',
    },
  },
  source: {
    define: {
      __TAURI_PLATFORM__: JSON.stringify(tauriPlatform),
    },
  },
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
      watchOptions: {
        ignored: [
          '**/src-tauri/target/**',
          '**/src-tauri/gen/**',
          '**/node_modules/**',
          '**/.git/**',
        ],
      },
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
