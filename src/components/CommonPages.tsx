import { useNavigate } from '@tanstack/react-router';
import { Button, Result } from 'antd';

export function NotFoundPage(props: { redirectTo?: string }) {
  const navigate = useNavigate();

  return (
    <Result
      status="404"
      title="找不到该页面"
      extra={
        <Button
          type="primary"
          onClick={() => {
            navigate({ to: props.redirectTo ?? '/' });
          }}
        >
          返回首页
        </Button>
      }
    />
  );
}
