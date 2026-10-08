import nodemailer from 'nodemailer';
import { config } from './config';
import { HttpError } from './http';

function boundedSmtpUrl(value: string) {
  const url = new URL(value);
  url.searchParams.set('connectionTimeout', '15000');
  url.searchParams.set('greetingTimeout', '15000');
  url.searchParams.set('socketTimeout', '30000');
  return url.toString();
}
const transport = config.smtpUrl ? nodemailer.createTransport(boundedSmtpUrl(config.smtpUrl)) : null;
export const replyEmailConfigured = Boolean(transport);

export async function sendReplyNotification(to: string, postId: string, unsubscribeToken: string, notificationId: string) {
  if (!transport) throw new HttpError(503, 'Reply email is not configured');
  const link = `${config.appOrigin}/posts/${postId}`;
  const unsubscribe = `${config.appOrigin}/notifications/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
  // Keep personal stories and comment text out of email inboxes and lock-screen previews.
  await transport.sendMail({ from: config.mailFrom, to, subject: 'Someone replied to your HTAFL post',
    messageId: `<reply-${notificationId}@${new URL(config.appOrigin).hostname}>`,
    text: `Someone replied to your post on HTAFL.\n\nRead the reply:\n${link}\n\nYou chose to receive reply emails. Turn them off here:\n${unsubscribe}\n\nYou can also change this in Notifications on HTAFL.` });
}

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
