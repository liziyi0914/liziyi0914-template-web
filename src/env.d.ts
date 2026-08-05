/// <reference types="@rsbuild/core/types" />

/**
 * Tauri 构建期注入的目标平台：android / ios / windows / macos / linux。
 * 非 Tauri 构建（浏览器调试）下为空字符串。
 */
declare const __TAURI_PLATFORM__: string;

/**
 * Imports the SVG file as a React component.
 * @requires [@rsbuild/plugin-svgr](https://npmjs.com/package/@rsbuild/plugin-svgr)
 */
declare module '*.svg?react' {
  import type React from 'react';

  const ReactComponent: React.FunctionComponent<React.SVGProps<SVGSVGElement>>;
  export default ReactComponent;
}
