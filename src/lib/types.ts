import type { ProFormColumnsType } from '@ant-design/pro-components';

export type FormFieldType =
  | 'text'
  | 'group'
  | 'formList'
  | 'formSet'
  | 'divider'
  | 'dependency'
  | '$tabGroup'
  | '#ai'
  | '#assets'
  | 'department'
  | 'validDateRange';
export type ColumnsType<T = any, ValueType = FormFieldType> = Omit<
  ProFormColumnsType<T, ValueType>,
  'columns'
> & {
  columns?: ColumnsType<T, ValueType | FormFieldType>[];
  group?: {
    title?: string;
    id?: string;
  };
};

export type CompanyListVO = {
  id: string;
  name: string;
};

export type UserInfoVO = {
  id: string;
  name: string;
  phone: string;
  idCard: string;
  isBanned: boolean;
  companies: Array<CompanyListVO>;
};

export type AssetsInfoVO = {
  id: string;
  name: string;
  fileType: string;
};

export type OSSUploadPresignArgs = {
  url: string;
  callback?: string;
  callbackVar?: string;
};

export type CompanyStructureVO = {
  departments: CompanyStructureDepartmentVO[];
};

export type CompanyStructureDepartmentVO = {
  id: string;
  name: string;
  parent?: string | null;
  head?: string | null;
  responsibilities?: string | null;
  positions?: CompanyStructurePositionVO[] | null;
};

export type CompanyStructurePositionVO = {
  id: string;
  name: string;
  description?: string | null;
};

export type CompanyStructurePositionUpdateVO = {
  name: string;
  description?: string | null;
};

export type CompanyStructureDepartmentUpdateVO = {
  name: string;
  responsibilities?: string | null;
};

// EmployeeSearchRequest 类型定义
export type EmployeeSearchRequest = {
  id?: string | null;
  name?: string | null;
  phone?: string | null;
  idCard?: string | null;
  gender?: number | null;
  careerRole?: string | null;
  departmentPosition?: string | null;
  isEmployed?: boolean | null;
  isRegistered?: boolean | null;
};

// EmployeeSearchResultItem 类型定义
export type EmployeeSearchResultItem = {
  id: string;
  name?: string | null;
  phone: string;
  idCard?: string | null;
  gender?: number | null;
  careerRole?: string | null;
  departmentPosition?: string | null;
  isEmployed?: boolean | null;
  isRegistered: boolean;
};

// EmployeeEditRequest 类型定义
export type EmployeeEditRequest = {
  phone: string;
  data: Record<string, any>; // 对应 Kotlin 中的 JsonNode，可以根据实际 JSON 结构进一步细化
};

export type EmployeeDataVO = {
  id: string;
  phone: string;
  data: Record<string, any>;
};

export type DepartmentInfoVO = {
  id: string;
  name: string;
  parent?: string;
  positions?: Array<{
    id: string;
    name: string;
  }>;
};