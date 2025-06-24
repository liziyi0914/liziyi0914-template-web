import { BACKEND_URL } from '@/utils/constants.ts';
import type { CaptchaResult } from '@/utils/captcha';
import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';

export interface ApiResult<T = any> {
  code: number;
  msg?: string;
  data?: T;
  total?: number;
}

type RequestMfa = () => Promise<boolean>;

interface Config {
  requestMfa?: RequestMfa;
}

export type PageQuery<T = any> = {
  pageSize?: number;
  current?: number;
} & T;

function splitPageQueryParams<T>(raw: PageQuery<T>): {
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
    params: page,
    data: query,
  };
}

const instance = axios.create({
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
      if (res.data?.code === 100 && options.requestMfa) {
        if (await options.requestMfa()) {
          return await request(options);
        }
      }
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
    ...splitPageQueryParams(page),
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

export const Api = {};
