import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

interface MobilePageProps {
  /** 省略时应用栏只保留操作区，用于首页这类不需要标题的页面 */
  title?: string;
  subtitle?: string;
  /** 显示返回首页的箭头，仅二级页面需要 */
  back?: boolean;
  actions?: ReactNode;
  children?: ReactNode;
}

/**
 * 移动端页面外壳。
 *
 * 用固定高度 + 内部滚动区代替文档滚动：应用栏在横屏平板上始终可见，
 * 也避免 sticky 定位与安全区内边距互相打架。
 */
export function MobilePage({
  title,
  subtitle,
  back,
  actions,
  children,
}: MobilePageProps) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background p-safe">
      <header className="flex shrink-0 items-center gap-3 border-b px-4 py-3 short:py-2 landscape:px-6">
        {back ? (
          <Button asChild variant="ghost" size="icon" aria-label="返回">
            <Link to="/">
              <ArrowLeft />
            </Link>
          </Button>
        ) : null}

        <div className="min-w-0 flex-1">
          {title ? (
            <h1 className="truncate text-base font-semibold">{title}</h1>
          ) : null}
          {subtitle ? (
            <p className="truncate text-xs text-muted-foreground short:hidden">
              {subtitle}
            </p>
          ) : null}
        </div>

        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {actions}
          </div>
        ) : null}
      </header>

      <main className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 short:py-3 landscape:px-6">
        <div className="mx-auto w-full max-w-3xl landscape:max-w-6xl">
          {children}
        </div>
      </main>
    </div>
  );
}
