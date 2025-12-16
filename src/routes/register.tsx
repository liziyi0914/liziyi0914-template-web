import {
  ProForm,
  ProFormCaptcha,
  ProFormSelect,
  ProFormText,
} from '@ant-design/pro-components';
import { Icon } from '@iconify/react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Button } from 'antd';
import { Toast } from 'antd-mobile';
import { useRef } from 'react';
import AliyunCaptcha, {
  type AliyunCaptchaRef,
} from '@/components/AliyunCaptcha.tsx';
import AuthPage from '@/components/AuthPage.tsx';
import { Api } from '@/lib/api';
import { validateIdCard } from '@/lib/functions.tsx';

export const Route = createFileRoute('/register')({
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = useNavigate();

  const ali = useRef<AliyunCaptchaRef>(null);

  return (
    <AuthPage title="万勋">
      <ProForm
        submitter={false}
        onFinish={async (values) => {
          const captcha = await ali.current?.show();

          if (captcha?.type === 'Success') {
            const toast = Toast.show({
              content: '注册中...',
              icon: 'loading',
              duration: 0,
            });

            const resp = await Api.auth.register(
              values.phone,
              values.captcha,
              values.companyId,
              values.companyRegCode,
              values.name,
              values.idCard,
              captcha,
            );

            toast.close();

            if (resp.code === 200) {
              Toast.show({
                content: '注册成功',
              });
              navigate({
                to: '/login',
              });
            } else {
              Toast.show({
                content: `注册失败: ${resp.msg}`,
              });
              console.error(resp);
            }
          } else {
            Toast.show({
              content: '人机验证失败，请重试',
            });
            throw new Error('人机验证失败');
          }
        }}
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
          request={async () => {
            const resp = await Api.common.getCompanies();
            if (resp.code !== 200) {
              return [];
            }
            return (
              resp.data?.map((item) => {
                return {
                  label: item.name,
                  value: item.id,
                };
              }) ?? []
            );
          }}
          showSearch={{
            onSearch: () => {},
          }}
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
          rules={[
            {
              required: true,
              message: '请输入姓名！',
            },
          ]}
        />
        <ProFormText
          fieldProps={{
            size: 'large',
            prefix: <Icon icon="icon-park-outline:id-card" />,
          }}
          name="idCard"
          placeholder={'身份证号'}
          rules={[
            {
              validator: (_, value) => {
                if (!value || (value?.length ?? 0) === 0) {
                  return Promise.reject('请输入身份证号！');
                }
                if (!validateIdCard(value)) {
                  return Promise.reject('身份证号格式错误！');
                }
                return Promise.resolve();
              },
            },
          ]}
        />
        <ProFormText
          fieldProps={{
            size: 'large',
            prefix: <Icon icon="icon-park-outline:phone" />,
          }}
          name="phone"
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
          phoneName="phone"
          name="captcha"
          rules={[
            {
              required: true,
              message: '请输入验证码！',
            },
            {
              pattern: /^\d{6}$/,
              message: '验证码格式错误！',
            },
          ]}
          onGetCaptcha={async (phone) => {
            if (!phone || !/^1\d{10}$/.test(phone)) {
              Toast.show({
                content: '请输入正确的手机号',
              });
              return;
            }

            const captcha = await ali.current?.show();

            if (captcha?.type === 'Success') {
              const toast = Toast.show({
                content: '发送中...',
                icon: 'loading',
                duration: 0,
              });

              const resp = await Api.auth.registerSms(phone, captcha);

              toast.close();

              if (resp.code === 200) {
                Toast.show({
                  content: '验证码已发送，请注意查收',
                });
              } else {
                Toast.show({
                  content: '验证码发送失败，请稍后重试',
                });
                throw new Error('验证码发送失败');
              }
            } else {
              Toast.show({
                content: '人机验证失败，请重试',
              });
              throw new Error('人机验证失败');
            }
          }}
        />
        <ProForm.Item>
          <Button block size="large" type="primary" htmlType="submit">
            注册
          </Button>
          <div className="h-3" />
          <Button
            block
            size="large"
            onClick={() => {
              navigate({
                to: '/login',
              });
            }}
          >
            登录
          </Button>
        </ProForm.Item>
      </ProForm>
      <AliyunCaptcha ref={ali} />
    </AuthPage>
  );
}
