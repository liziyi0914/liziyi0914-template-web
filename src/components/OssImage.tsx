import { Image, Spin } from 'antd';
import type { ImageProps } from 'antd/es/image';
import React, { Suspense, useMemo } from 'react';
import { Api } from '@/lib/api.ts';

const Component: React.FC<ImageProps> = (props) => {
  const Img = useMemo(() => {
    return React.lazy(async () => {
      const linkRes = await Api.common.getAssetsLink(props.src ?? '');
      if (linkRes.code === 200 && linkRes.data) {
        return {
          default: () => <Image {...props} src={linkRes.data} />,
        };
      } else {
        return {
          default: () => (
            <div className="select-none text-sm text-muted-foreground">
              资源获取失败
            </div>
          ),
        };
      }
    });
  }, [props]);

  return (
    <Suspense
      fallback={
        <Spin spinning tip="加载中...">
          <div className="h-16" />
        </Spin>
      }
    >
      <Img />
    </Suspense>
  );
};

export default Component;
