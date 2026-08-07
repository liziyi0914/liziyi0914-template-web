#!/usr/bin/env npx tsx
/** 开发期定制热词管理：以 vocabulary.json 为源，同步到百炼 HTTP API。 */

const USAGE = `用法:
  pnpm vocabulary -- sync
  pnpm vocabulary -- list [--prefix <p>]
  pnpm vocabulary -- query [id]
  pnpm vocabulary -- delete [id]
  pnpm vocabulary -- pull`;

function main(argv: string[]): void {
  const [cmd] = argv;
  if (!cmd || cmd === "-h" || cmd === "--help") {
    console.log(USAGE);
    process.exit(cmd ? 0 : 1);
  }
  console.error(`尚未实现子命令：${cmd}`);
  process.exit(1);
}

main(process.argv.slice(2));
