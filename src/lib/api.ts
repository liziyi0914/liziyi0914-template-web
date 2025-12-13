import axios, {type AxiosRequestConfig, type AxiosResponse} from "axios";
import { BACKEND_URL } from "@/lib/constants";

export interface ApiResult<T = any> {
  code: number;
  msg?: string;
  data?: T;
  total?: number;
}

export type CaptchaResultType = 'Cancel' | 'Success' | 'Failed';

export interface CaptchaResult {
  type: CaptchaResultType;
  platform?: string;
  data?: string;
}

type Config = {};

export type PageQuery<T = any> = {
  pageSize?: number;
  current?: number;
} & T;

function splitPageQueryParams<T>(
  raw: PageQuery<T>,
  options: AxiosRequestConfig<T>,
): {
  params: {
    pageSize?: number;
    current?: number;
  };
  data: T;
} {
  const page: {
    pageSize?: number;
    current?: number;
  } = {};
  if (raw.pageSize) {
    page['pageSize'] = raw.pageSize;
  }
  if (raw.current) {
    page['current'] = raw.current;
  }
  const query = raw;
  delete query.pageSize;
  delete query.current;
  return {
    params: {
      ...(options.params || {}),
      ...page,
    },
    data: {
      ...(options.data || {}),
      ...query,
    },
  };
}

export const instance = axios.create({
  baseURL: BACKEND_URL,
  withCredentials: true,
});

async function request<T = any, D = any>(
  options: AxiosRequestConfig<D> & Config,
) {
  try {
    const res = await instance.request<T, AxiosResponse<ApiResult<T>>, D>({
      ...options,
    });

    if (res.status === 200) {
      return res.data;
    } else {
      return {
        code: 400,
        msg: `API调用失败: ${res.status}`,
      };
    }
  } catch (error) {
    console.error(error);
    return {
      code: 400,
      msg: `API调用失败: ${error}`,
    };
  }
}

function requestWithCaptcha<T = any, D = any>(
  options: AxiosRequestConfig<D> & Config,
  captcha: CaptchaResult,
) {
  if (options?.method === 'POST') {
    return request<T, D>({
      ...options,
      headers: {
        ...(options.headers ?? {}),
        'x-xb-captcha': captcha.platform,
      },
      data: {
        ...(options.data as any),
        _CAPTCHA_DATA: captcha.data,
      },
    });
  }
  return request<T, D>({
    ...options,
    headers: {
      ...(options.headers ?? {}),
      'x-xb-captcha': captcha.platform,
      'x-xb-captcha-data': captcha.data,
    },
  });
}

async function requestPage<T = any, D = any>(
  options: AxiosRequestConfig<D> & Config,
  page: PageQuery<D>,
) {
  const resp = await request<Array<T>, D>({
    ...options,
    ...splitPageQueryParams(page, options),
  });
  if (resp.code === 200) {
    return {
      data: resp.data,
      success: true,
      total: resp.total,
    };
  } else {
    return {
      data: [],
      success: false,
    };
  }
}

export const uploadOss: <T = any>(
  url: string,
  data: BodyInit,
  headers?: Record<string, any>,
) => Promise<ApiResult<T>> = async (url, data, headers) => {
  const uploadResp = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/octet-stream',
      ...(headers ?? {}),
    },
    // @ts-ignore
    body: data,
  });

  if (!uploadResp.ok) {
    return {
      code: 400,
      msg: uploadResp.statusText,
    };
  } else {
    try {
      const json = await uploadResp.json();

      if (json?.code && typeof json?.code === 'number' && json.code !== 200) {
        return {
          code: json.code,
          msg: json.msg || '上传失败',
        };
      }

      return {
        ...json,
        code: 200,
        msg: 'Success',
      };
    } catch (e) {}

    return {
      code: 200,
      msg: 'Success',
    };
  }
};

export const Api = {
  auth: {
    loginSms: (phone: string, captcha: CaptchaResult) => {
      return requestWithCaptcha({
        url: '/auth/login/sms',
        method: 'POST',
        data: {
          phone,
        },
      }, captcha);
    },
    login: (phone: string, code: string, captcha: CaptchaResult) => {
      return requestWithCaptcha({
        url: '/auth/login',
        method: 'POST',
        data: {
          phone,
          code,
        },
      }, captcha);
    },
    check: () => {
      return request({
        url: '/auth/check',
        method: 'GET',
      });
    },
    logout: () => {
      return request({
        url: '/auth/logout',
        method: 'POST',
      });
    },
    register: (
      phone: string,
      code: string,
      companyId: string,
      companyRegCode: string,
      name: string,
      idCard: string,
      captcha: CaptchaResult
    ) => {
      return requestWithCaptcha({
        url: '/auth/register',
        method: 'POST',
        data: {
          phone,
          code,
          companyId,
          companyRegCode,
          name,
          idCard,
        },
      }, captcha);
    },
    registerSms: (phone: string, captcha: CaptchaResult) => {
      return requestWithCaptcha({
        url: '/auth/register/sms',
        method: 'POST',
        data: {
          phone,
        },
      }, captcha);
    },
  },
};
