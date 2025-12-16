import { Result } from 'antd';
import type React from 'react';

const Component: React.FC<{
  isDeveloping?: boolean;
}> = (props) => {
  return (
    <Result
      status="404"
      title="404"
      subTitle={props.isDeveloping ? '开发中' : '您访问的页面不存在'}
    />
  );
};

export default Component;
