import Resend from "@auth/core/providers/resend";
import { Resend as ResendAPI } from "resend";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";

export const ResendOTPPasswordReset = Resend({
  id: "resend-otp",
  apiKey: process.env.AUTH_RESEND_KEY,
  async generateVerificationToken() {
    const random: RandomReader = {
      read(bytes) {
        crypto.getRandomValues(bytes);
      },
    };
    return generateRandomString(random, "0123456789", 8);
  },
  async sendVerificationRequest({ identifier: email, provider, token }) {
    const resend = new ResendAPI(provider.apiKey);
    const { error } = await resend.emails.send({
      from: "Dental Task OS <noreply@labsync.space>",
      to: [email],
      subject: "Reset your password — Dental Task OS",
      html: `
        <div style="font-family: -apple-system, sans-serif; max-width: 400px; margin: 0 auto; padding: 32px 0;">
          <h2 style="font-size: 18px; font-weight: 600; margin-bottom: 8px;">Password Reset</h2>
          <p style="font-size: 14px; color: #666; margin-bottom: 24px;">
            Enter this code to reset your password:
          </p>
          <div style="background: #f4f4f5; border-radius: 8px; padding: 16px; text-align: center; margin-bottom: 24px;">
            <span style="font-size: 32px; font-weight: 700; letter-spacing: 4px; font-family: monospace;">${token}</span>
          </div>
          <p style="font-size: 12px; color: #999;">
            This code expires in 15 minutes. If you didn't request this, ignore this email.
          </p>
        </div>
      `,
    });

    if (error) {
      throw new Error("Could not send password reset email");
    }
  },
});
