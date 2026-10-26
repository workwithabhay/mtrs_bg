export type OtpPurpose = 'signup' | 'login';

export interface SendOtpEmailParams {
  to: string;
  otp: string;
  purpose: OtpPurpose;
}

export interface EmailProvider {
  sendOtpEmail(params: SendOtpEmailParams): Promise<void>;
}
