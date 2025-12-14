import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { v4 as uuid } from 'uuid';
import { ALIYUN_CAPTCHA } from '@/lib/constants.ts';
import type {CaptchaResult} from "@/lib/api.ts";

export type AliyunCaptchaRef = {
  show: () => Promise<CaptchaResult>;
};

const Component = React.forwardRef<AliyunCaptchaRef>(
  (_props, ref) => {
    const id = useMemo(() => uuid(), []);

    const instance = useRef(null);

    const task = useRef<{
      resolve: (value: CaptchaResult) => void;
      reject: () => void;
    }>(null);

    useImperativeHandle(
      ref,
      () => ({
        show: () => {
          // if (task.current) {
          //   // @ts-ignore
          //   instance.current?.hide();
          //   task.current.reject();
          //   task.current = undefined;
          // }

          // @ts-ignore
          instance.current?.show();

          return new Promise<CaptchaResult>((resolve, reject) => {
            task.current = {
              resolve,
              reject,
            };
          });
        },
      }),
      [instance, task],
    );

    const captchaVerifyCallback = useCallback(
      async (captchaVerifyParam: any) => {
        // 1.向后端发起业务请求，获取验证码验证结果和业务结果
        // const result = await xxxx('http://您的业务请求地址', {
        //     captchaVerifyParam: captchaVerifyParam, // 验证码参数
        //     yourBizParam... // 业务参数
        // });
        // return {
        //  captchaResult: true, // 验证码验证是否通过，boolean类型，必选
        //  bizResult: true, // 业务验证是否通过，boolean类型，可选；若为无业务验证结果的场景，bizResult可以为空
        // }
        console.log(captchaVerifyParam);
        if (task.current) {
          task.current.resolve({
            type: 'Success',
            platform: 'aliyun',
            data: captchaVerifyParam,
          });
          task.current = null;
        }
        return {
          captchaResult: true,
          bizResult: true,
        };
      },
      [task],
    );

    // 验证通过后调用
    const onBizResultCallback = () => {
      // console.log('onBizResultCallback');
    };

    useEffect(() => {
      // @ts-ignore
      window.initAliyunCaptcha({
        SceneId: ALIYUN_CAPTCHA.sceneId, // 场景ID。根据步骤二新建验证场景后，您可以在验证码场景列表，获取该场景的场景ID
        prefix: ALIYUN_CAPTCHA.prefix, // 身份标。开通阿里云验证码2.0后，您可以在控制台概览页面的实例基本信息卡片区域，获取身份标
        mode: 'popup', // 验证码模式。popup表示要集成的验证码模式为弹出式。无需修改
        element: `#captcha-${id}`, // 页面上预留的渲染验证码的元素，与原代码中预留的页面元素保持一致。
        // button: `#btn-${id}`, // 触发验证码弹窗的元素。button表示单击登录按钮后，触发captchaVerifyCallback函数。您可以根据实际使用的元素修改element的值
        captchaVerifyCallback: captchaVerifyCallback, // 业务请求(带验证码校验)回调函数，无需修改
        onBizResultCallback: onBizResultCallback, // 业务请求结果回调函数，无需修改
        getInstance: (i: any) => {
          instance.current = i;
        }, // 绑定验证码实例函数，无需修改
        onError: () => {
          task.current?.reject();
        },
        onClose: () => {
          task.current?.reject();
        },
        // slideStyle: {
        //   width: 360,
        //   height: 40,
        // }, // 滑块验证码样式，支持自定义宽度和高度，单位为px。其中，width最小值为320 px
        language: 'cn', // 验证码语言类型，支持简体中文（cn）、繁体中文（tw）、英文（en）
      });
      return () => {
        // 必须删除相关元素，否则再次mount多次调用 initAliyunCaptcha 会导致多次回调 captchaVerifyCallback
        document.getElementById('aliyunCaptcha-mask')?.remove();
        document.getElementById('aliyunCaptcha-window-popup')?.remove();
      };
    }, []);

    return <div id={`captcha-${id}`} />;
  },
);

export default Component;
