const { Resend } = require('resend');
const nodemailer = require('nodemailer');

/**
 * Sends a 6-digit OTP email using the official Resend SDK.
 * Falls back to console logging if RESEND_API_KEY is not set.
 */
async function sendOtpEmail(toEmail, otp, userName = 'User') {
  const subject = `Your Ticketify Login Code: ${otp}`;
  const textContent = `Your Ticketify verification code is: ${otp}. This code is valid for 10 minutes. If you did not attempt to sign in, please ignore this email.`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0f172a; margin: 0; padding: 20px; color: #e2e8f0; }
          .container { max-width: 500px; margin: 0 auto; background-color: #1e293b; border-radius: 16px; border: 1px solid #334155; padding: 32px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
          .header { text-align: center; margin-bottom: 24px; }
          .logo { display: inline-block; font-size: 24px; font-weight: 800; color: #818cf8; letter-spacing: -0.5px; }
          .title { font-size: 20px; font-weight: 700; color: #f8fafc; margin-top: 12px; }
          .subtitle { font-size: 14px; color: #94a3b8; margin-top: 4px; }
          .otp-box { margin: 28px 0; background: linear-gradient(135deg, rgba(99,102,241,0.15), rgba(168,85,247,0.15)); border: 1px solid rgba(129,140,248,0.3); border-radius: 12px; padding: 20px; text-align: center; }
          .otp-code { font-size: 42px; font-weight: 800; letter-spacing: 12px; color: #a5b4fc; font-family: monospace; }
          .expiry { font-size: 12px; color: #cbd5e1; margin-top: 8px; font-weight: 500; }
          .footer { text-align: center; margin-top: 28px; font-size: 12px; color: #64748b; line-height: 1.5; border-top: 1px solid #334155; padding-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">🎫 Ticketify</div>
            <div class="title">Login Verification Code</div>
            <div class="subtitle">Hello ${userName}, enter the code below to complete your sign in:</div>
          </div>
          <div class="otp-box">
            <div class="otp-code">${otp}</div>
            <div class="expiry">⏱ Valid for 10 minutes</div>
          </div>
          <p style="font-size: 13px; color: #94a3b8; text-align: center;">
            If you did not attempt to sign in to your Ticketify account, please ignore this email.
          </p>
          <div class="footer">
            Ticket Management Real-Time Collaboration<br/>
            Secure Two-Factor Authentication
          </div>
        </div>
      </body>
    </html>
  `;

  // Always log OTP to server console (useful for debugging)
  console.log(`\n==================================================`);
  console.log(`📧 [EMAIL OTP DISPATCH]`);
  console.log(`Recipient : ${toEmail}`);
  console.log(`OTP Code  : >>> ${otp} <<<`);
  console.log(`Expires In: 10 minutes`);
  console.log(`==================================================\n`);

  // Use SMTP when configured. SMTP providers deliver to any valid recipient.
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 465),
        secure: process.env.SMTP_SECURE !== 'false',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      const from = process.env.EMAIL_FROM || process.env.SMTP_USER;
      console.log(`[Mailer] Sending OTP via SMTP to ${toEmail}...`);

      const result = await transporter.sendMail({
        from,
        to: toEmail,
        subject,
        html: htmlContent,
        text: textContent,
      });

      console.log(`✅ [Mailer] SMTP delivered successfully. ID: ${result.messageId}`);
      return { success: true, provider: 'smtp', id: result.messageId };
    } catch (err) {
      console.error(`❌ [Mailer] SMTP exception:`, err.message);
    }
  }

  // Use official Resend SDK if API key is configured
  if (process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);

      const from = process.env.EMAIL_FROM || 'Ticketify <onboarding@resend.dev>';

      console.log(`[Mailer] Sending OTP via Resend SDK to ${toEmail}...`);

      const { data, error } = await resend.emails.send({
        from,
        to: [toEmail],
        subject,
        html: htmlContent,
        text: textContent,
      });

      if (error) {
        console.error(`❌ [Mailer] Resend SDK error:`, error);
        throw new Error(error.message || 'Resend delivery failed');
      }

      console.log(`✅ [Mailer] Resend SDK delivered successfully. ID: ${data?.id}`);
      return { success: true, provider: 'resend', id: data?.id };
    } catch (err) {
      console.error(`❌ [Mailer] Resend SDK exception:`, err.message);
      // Don't throw — fall through to console simulation so login still works
    }
  } else {
    console.log(`ℹ️  [Mailer] RESEND_API_KEY not set — OTP logged to console above.`);
  }

  // Fallback: simulated (OTP was already printed to console)
  return { success: true, simulated: true };
}

module.exports = { sendOtpEmail };
