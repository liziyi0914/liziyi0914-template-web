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
