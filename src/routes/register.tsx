import { createFileRoute } from '@tanstack/react-router'
import {ProForm, ProFormCaptcha, ProFormSelect, ProFormText} from '@ant-design/pro-components'
import {Button} from "antd";
import { Icon } from "@iconify/react";
import AuthPage from "@/components/AuthPage.tsx";

export const Route = createFileRoute('/register')({
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
        <ProFormSelect
          fieldProps={{
            size: 'large',
            prefix: <Icon icon="icon-park-outline:building-one" />,
          }}
          name="companyId"
          placeholder={'请选择企业'}
          rules={[
            {
              required: true,
              message: '请选择企业！',
            },
          ]}
        />
        <ProFormText.Password
          fieldProps={{
            size: 'large',
            prefix: <Icon icon="icon-park-outline:lock" />,
          }}
          name="companyRegCode"
          placeholder={'企业密码'}
          rules={[
            {
              required: true,
              message: '请输入企业密码！',
            },
          ]}
        />
        <ProFormText
          fieldProps={{
            size: 'large',
            prefix: <Icon icon="icon-park-outline:user" />,
          }}
          name="name"
          placeholder={'姓名'}
        />
        <ProFormText
          fieldProps={{
            size: 'large',
            prefix: <Icon icon="icon-park-outline:id-card" />,
          }}
          name="idCard"
          placeholder={'身份证号'}
        />
        <ProFormText
          fieldProps={{
            size: 'large',
            prefix: <Icon icon="icon-park-outline:phone" />,
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
            prefix: <Icon icon="icon-park-outline:lock" />,
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
          >注册</Button>
          <div className="h-3" />
          <Button
            block
            size="large"
          >登录</Button>
        </ProForm.Item>
      </ProForm>
    </AuthPage>
  )
}
