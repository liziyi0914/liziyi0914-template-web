export type CaptchaResultType = 'Cancel' | 'Success' | 'Failed';

export interface CaptchaResult {
  type: CaptchaResultType;
  platform?: string;
  data?: string;
}
