import nodemailer from 'nodemailer';
import { config } from './config';
import { HttpError } from './http';

const transport = config.smtpUrl ? nodemailer.createTransport(config.smtpUrl) : null;

export function requireVerificationDelivery(): void {
  if (config.isProd && !transport) {
    throw new HttpError(503, 'Registration is temporarily unavailable while verification email is being configured.');
  }
}

/** Sends the verification email. Without SMTP_URL it just prints the link (fine for local work). */
export async function sendVerification(to: string, token: string): Promise<void> {
  requireVerificationDelivery();
  const link = `${config.appOrigin}/verify?token=${token}`;
  if (!transport) {
    console.log(`[mail not configured] Verify link for ${to}: ${link}`);
    return;
  }
  try {
    await transport.sendMail({
      from: config.mailFrom,
      to,
      subject: 'Welcome to The Creator Generation. Please verify your email',
      text: `Welcome to The Creator Generation.\n\nVerify your email to start posting:\n${link}\n\nIf you did not sign up, you can ignore this email.`,
    });
  } catch (e) {
    if (config.isProd) {
      console.error('Verification email delivery failed');
      throw new HttpError(503, 'Verification email could not be sent. Sign in and try resending it.');
    }
    console.error('Could not send verification email', e);
  }
}
