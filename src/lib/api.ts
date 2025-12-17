import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { BACKEND_URL } from '@/lib/constants';
import type {
  AssetsInfoVO,
  CompanyListVO,
  CompanyStructureDepartmentUpdateVO,
  CompanyStructurePositionUpdateVO,
  CompanyStructureVO,
  EmployeeDataVO,
  EmployeeSearchResultItem,
  OSSUploadPresignArgs,
  UserInfoVO,
} from '@/lib/types.ts';
import type {ProFormColumnsType} from "@ant-design/pro-components";

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
  common: {
    getCompanies: () => {
      return request<CompanyListVO[]>({
        url: '/common/companies',
        method: 'GET',
      });
    },
    uploadAssets: (
      name: string,
      fileType: string,
      hash: string,
      suffix: string,
    ) => {
      return request<OSSUploadPresignArgs>({
        url: '/common/assets/upload',
        method: 'POST',
        data: {
          name,
          fileType,
          hash,
          suffix,
        },
      });
    },
    getAssetsLink: (id: string) => {
      return request<string>({
        url: '/common/assets/link',
        method: 'GET',
        params: {
          id,
        },
      });
    },
    getAssetsInfo: (id: string) => {
      return request<AssetsInfoVO>({
        url: '/common/assets/info',
        method: 'GET',
        params: {
          id,
        },
      });
    },
    getDepartments: () => {
      return request<
        {
          id: string;
          name: string;
          parent?: string;
          positions?: Array<{
            id: string;
            name: string;
          }>;
        }[]
      >({
        url: '/common/departments',
        method: 'GET',
      });
    },
    requestAiInForm: (prompts: string, assets: string, columns: ProFormColumnsType[]) => {
      return request<Record<string, any>>({
        url: '/common/ai/form',
        method: 'POST',
        data: {
          prompts,
          assets,
          columns,
        },
      });
    },
  },
  auth: {
    loginSms: (phone: string, captcha: CaptchaResult) => {
      return requestWithCaptcha(
        {
          url: '/auth/login/sms',
          method: 'POST',
          data: {
            phone,
          },
        },
        captcha,
      );
    },
    login: (
      phone?: string,
      code?: string,
      token?: string,
      captcha?: CaptchaResult,
    ) => {
      if (!captcha) {
        return request<Array<string> | null | undefined>({
          url: '/auth/login',
          method: 'POST',
          data: {
            token,
          },
        });
      }
      return requestWithCaptcha<Array<string> | null | undefined>(
        {
          url: '/auth/login',
          method: 'POST',
          data: {
            phone,
            code,
          },
        },
        captcha,
      );
    },
    check: () => {
      return request<{
        name: string;
        idCard: string;
        companyName: string;
      }>({
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
      captcha: CaptchaResult,
    ) => {
      return requestWithCaptcha(
        {
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
        },
        captcha,
      );
    },
    registerSms: (phone: string, captcha: CaptchaResult) => {
      return requestWithCaptcha(
        {
          url: '/auth/register/sms',
          method: 'POST',
          data: {
            phone,
          },
        },
        captcha,
      );
    },
  },
  dashboard: {
    system: {
      company: {
        list: (page: PageQuery) => {
          return requestPage(
            {
              url: '/dashboard/system/company/',
              method: 'POST',
            },
            page,
          );
        },
        create: (
          list: Array<{
            companyName: string;
            companyRegCode?: string;
          }>,
        ) => {
          return request({
            url: '/dashboard/system/company/',
            method: 'PUT',
            data: {
              list,
            },
          });
        },
        get: (id: string) => {
          return request<{
            id: string;
            companyName: string;
            companyRegCode: string;
          }>({
            url: `/dashboard/system/company/${id}`,
            method: 'GET',
          });
        },
        update: (
          id: string,
          data: {
            companyName: string;
            companyRegCode?: string;
          },
        ) => {
          return request({
            url: `/dashboard/system/company/${id}`,
            method: 'POST',
            data,
          });
        },
        delete: (id: string) => {
          return request({
            url: `/dashboard/system/company/${id}`,
            method: 'DELETE',
          });
        },
      },
      user: {
        list: (page: PageQuery) => {
          return requestPage<UserInfoVO>(
            {
              url: '/dashboard/system/user/',
              method: 'POST',
            },
            page,
          );
        },
        create: (
          list: Array<{
            name: string;
            phone: string;
            idCard: string;
            isBanned: boolean;
            companies: Array<string>;
          }>,
        ) => {
          return request({
            url: '/dashboard/system/user/',
            method: 'PUT',
            data: {
              list,
            },
          });
        },
        get: (id: string) => {
          return request<UserInfoVO>({
            url: `/dashboard/system/user/${id}`,
            method: 'GET',
          });
        },
        update: (
          id: string,
          data: {
            name?: string;
            phone?: string;
            idCard?: string;
            isBanned?: boolean;
            companies?: Array<string>;
          },
        ) => {
          return request({
            url: `/dashboard/system/user/${id}`,
            method: 'POST',
            data,
          });
        },
      },
    },
    core: {
      company: {
        info: {
          get: () => {
            return request({
              url: '/dashboard/core/company/info/',
              method: 'GET',
            });
          },
          update: (data: any) => {
            return request({
              url: '/dashboard/core/company/info/',
              method: 'POST',
              data,
            });
          },
        },
        assets: {
          list: (page: PageQuery) => {
            return requestPage<AssetsInfoVO>(
              {
                url: '/dashboard/core/company/assets/',
                method: 'POST',
              },
              page,
            );
          },
          rename: (id: string, name: string) => {
            return request({
              url: `/dashboard/core/company/assets/${id}/rename`,
              method: 'POST',
              data: {
                name,
              },
            });
          },
          delete: (id: string) => {
            return request({
              url: `/dashboard/core/company/assets/${id}`,
              method: 'DELETE',
            });
          },
        },
        structure: {
          list: () => {
            return request<CompanyStructureVO>({
              url: '/dashboard/core/company/structure/',
              method: 'GET',
            });
          },
          createDepartment: (data: CompanyStructureDepartmentUpdateVO) => {
            return request<void>({
              url: '/dashboard/core/company/structure/department',
              method: 'PUT',
              data,
            });
          },
          updateDepartment: (
            id: string,
            data: CompanyStructureDepartmentUpdateVO,
          ) => {
            return request<void>({
              url: `/dashboard/core/company/structure/department/${id}`,
              method: 'POST',
              data,
            });
          },
          deleteDepartment: (id: string) => {
            return request<void>({
              url: `/dashboard/core/company/structure/department/${id}`,
              method: 'DELETE',
            });
          },
          createPosition: (
            departmentId: string,
            data: CompanyStructurePositionUpdateVO,
          ) => {
            return request<void>({
              url: `/dashboard/core/company/structure/department/${departmentId}/position`,
              method: 'PUT',
              data,
            });
          },
          updatePosition: (
            id: string,
            data: CompanyStructurePositionUpdateVO,
          ) => {
            return request<void>({
              url: `/dashboard/core/company/structure/position/${id}`,
              method: 'POST',
              data,
            });
          },
          deletePosition: (id: string) => {
            return request<void>({
              url: `/dashboard/core/company/structure/position/${id}`,
              method: 'DELETE',
            });
          },
        },
      },
      employee: {
        document: {
          list: (page: PageQuery) => {
            return requestPage<EmployeeSearchResultItem>(
              {
                url: '/dashboard/core/employee/document/',
                method: 'POST',
              },
              page,
            );
          },
          create: (phone: string, data: Record<string, any>) => {
            return request({
              url: `/dashboard/core/employee/document/`,
              method: 'PUT',
              data: {
                phone,
                data,
              },
            });
          },
          get: (id: string) => {
            return request<EmployeeDataVO>({
              url: `/dashboard/core/employee/document/${id}`,
              method: 'GET',
            });
          },
          update: (id: string, phone: string, data: Record<string, any>) => {
            return request({
              url: `/dashboard/core/employee/document/${id}`,
              method: 'POST',
              data: {
                phone,
                data,
              },
            });
          },
          delete: (id: string) => {
            return request({
              url: `/dashboard/core/employee/document/${id}`,
              method: 'DELETE',
            });
          },
          refreshBinding: (id: string) => {
            return request({
              url: `/dashboard/core/employee/document/${id}/refreshBinding`,
              method: 'POST',
            });
          },
        },
      },
    },
  },
};
