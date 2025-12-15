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
}

export type CompanyStructureDepartmentVO = {
  id: string;
  name: string;
  parent?: string | null;
  head?: string | null;
  responsibilities?: string | null;
  positions?: CompanyStructurePositionVO[] | null;
}

export type CompanyStructurePositionVO = {
  id: string;
  name: string;
  description?: string | null;
}

export type CompanyStructurePositionUpdateVO = {
  name: string;
  description?: string | null;
}

export type CompanyStructureDepartmentUpdateVO = {
  name: string;
  responsibilities?: string | null;
}
