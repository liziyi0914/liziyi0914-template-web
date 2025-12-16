import {
  ProForm,
  ProFormCaptcha,
  ProFormText,
} from '@ant-design/pro-components';
import { Icon } from '@iconify/react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Button } from 'antd';
import { Toast } from 'antd-mobile';
import * as jose from 'jose';
import { useRef, useState } from 'react';
import AliyunCaptcha, {
  type AliyunCaptchaRef,
} from '@/components/AliyunCaptcha.tsx';
import AuthPage from '@/components/AuthPage.tsx';
import { Api } from '@/lib/api.ts';

export const Route = createFileRoute('/login')({
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = useNavigate();

  const ali = useRef<AliyunCaptchaRef>(null);

  const [accounts, setAccounts] = useState<Array<string>>([]);

  return (
    <AuthPage title="万勋">
      {accounts.length > 0 && (
        <div>
          <div className="select-none pb-2">请选择登录企业：</div>
          <div className="max-h-96 overflow-y-auto flex flex-col gap-y-3">
            {accounts.map((account) => (
              <Button
                key={account}
                block
                size="large"
                onClick={async () => {
                  const toast = Toast.show({
                    content: '登录中...',
                    icon: 'loading',
                    duration: 0,
                  });

                  const resp = await Api.auth.login(
                    undefined,
                    undefined,
                    account,
                  );

                  toast.close();

                  if (resp.code === 200) {
                    Toast.show({
                      content: '登录成功',
                    });
                    navigate({
                      to: '/',
                    });
                  } else {
                    Toast.show({
                      content: '登录失败',
                    });
                    setAccounts([]);
                  }
                }}
              >
                {`${jose.decodeJwt(account)?.['companyName'] ?? '-'}`}
              </Button>
            ))}
            <Button
              block
              danger
              size="large"
              onClick={async () => {
                setAccounts([]);
              }}
            >
              返回
            </Button>
          </div>
        </div>
      )}
      {accounts.length === 0 && (
        <ProForm
          submitter={false}
          onFinish={async (values) => {
            const captcha = await ali.current?.show();

            if (captcha?.type === 'Success') {
              const toast = Toast.show({
                content: '登录中...',
                icon: 'loading',
                duration: 0,
              });

              const resp = await Api.auth.login(
                values.phone,
                values.code,
                undefined,
                captcha,
              );

              toast.close();

              if (resp.code === 200) {
                const data = resp.data;
                const len = data?.length ?? 0;
                if (len === 0) {
                  Toast.show({
                    content: '登录成功',
                  });
                  navigate({
                    to: '/',
                  });
                } else {
                  setAccounts(data ?? []);
                }
              } else {
                Toast.show({
                  content: `登录失败: ${resp.data}`,
                });
                throw new Error('登录失败');
              }
            } else {
              Toast.show({
                content: '人机验证失败，请重试',
              });
              throw new Error('人机验证失败');
            }
          }}
        >
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
            name="code"
            phoneName="phone"
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

                const resp = await Api.auth.loginSms(phone, captcha);

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
              登录
            </Button>
            <div className="h-3" />
            <Button
              block
              size="large"
              onClick={() => {
                navigate({
                  to: '/register',
                });
              }}
            >
              注册
            </Button>
          </ProForm.Item>
        </ProForm>
      )}
      <AliyunCaptcha ref={ali} />
    </AuthPage>
  );
}
