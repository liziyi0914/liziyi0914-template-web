import { createFileRoute } from '@tanstack/react-router'
import {ProForm, ProFormCaptcha, ProFormText} from '@ant-design/pro-components'
import {Button} from "antd";
import { Icon } from "@iconify/react";
import AuthPage from "@/components/AuthPage.tsx";

export const Route = createFileRoute('/login')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <AuthPage
      title="万勋"
    >
      <ProForm
        submitter={false}
      >
        <ProFormText
          fieldProps={{
            size: 'large',
            prefix: <Icon icon="lucide:smartphone" />,
          }}
          name="mobile"
          placeholder={'手机号'}
          rules={[
            {
              required: true,
              message: '请输入手机号！',
            },
            {
              pattern: /^1\d{10}$/,
              message: '手机号格式错误！',
            },
          ]}
        />
        <ProFormCaptcha
          fieldProps={{
            size: 'large',
            prefix: <Icon icon="lucide:lock" />,
          }}
          captchaProps={{
            size: 'large',
          }}
          placeholder={'请输入验证码'}
          captchaTextRender={(timing, count) => {
            if (timing) {
              return `${count}秒后重新获取`;
            }
            return '获取验证码';
          }}
          name="captcha"
          rules={[
            {
              required: true,
              message: '请输入验证码！',
            },
          ]}
          onGetCaptcha={async () => {
            // message.success('获取验证码成功！验证码为：1234');
          }}
        />
        <ProForm.Item>
          <Button
            block
            size="large"
            type="primary"
            htmlType="submit"
          >登录</Button>
          <div className="h-3" />
          <Button
            block
            size="large"
          >注册</Button>
        </ProForm.Item>
      </ProForm>
    </AuthPage>
  );
}
