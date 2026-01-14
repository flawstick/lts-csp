import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = "LTS Tax <noreply@lts.tax>";

export interface SendInvitationEmailParams {
  to: string;
  inviterName: string;
  organisationName: string;
  role: "owner" | "admin" | "member";
  acceptUrl: string;
  expiresAt: Date;
}

export async function sendInvitationEmail({
  to,
  inviterName,
  organisationName,
  role,
  acceptUrl,
  expiresAt,
}: SendInvitationEmailParams) {
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
  const expiresFormatted = expiresAt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `You've been invited to join ${organisationName} on LTS Tax`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invitation to join ${organisationName}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">LTS Tax</h1>
  </div>

  <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
    <h2 style="margin-top: 0; color: #1f2937;">You've been invited!</h2>

    <p style="color: #4b5563;">
      <strong>${inviterName}</strong> has invited you to join <strong>${organisationName}</strong> on LTS Tax as a <strong>${roleLabel}</strong>.
    </p>

    <p style="color: #4b5563;">
      LTS Tax is an AI-powered tax compliance platform that automates tax return processing and filing.
    </p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${acceptUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
        Accept Invitation
      </a>
    </div>

    <p style="color: #6b7280; font-size: 14px;">
      This invitation will expire on <strong>${expiresFormatted}</strong>.
    </p>

    <p style="color: #6b7280; font-size: 14px;">
      If you don't have an account yet, you'll be able to create one after clicking the link above.
    </p>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

    <p style="color: #9ca3af; font-size: 12px; text-align: center;">
      If you didn't expect this invitation, you can safely ignore this email.
    </p>

    <p style="color: #9ca3af; font-size: 12px; text-align: center;">
      <a href="${acceptUrl}" style="color: #667eea; word-break: break-all;">${acceptUrl}</a>
    </p>
  </div>
</body>
</html>
    `.trim(),
    text: `
You've been invited to join ${organisationName} on LTS Tax!

${inviterName} has invited you to join ${organisationName} as a ${roleLabel}.

LTS Tax is an AI-powered tax compliance platform that automates tax return processing and filing.

Accept your invitation by visiting:
${acceptUrl}

This invitation will expire on ${expiresFormatted}.

If you don't have an account yet, you'll be able to create one after clicking the link.

If you didn't expect this invitation, you can safely ignore this email.
    `.trim(),
  });

  if (error) {
    console.error("Failed to send invitation email:", error);
    throw new Error(`Failed to send invitation email: ${error.message}`);
  }

  return data;
}

export interface SendInvoiceEmailParams {
  to: string;
  organisationName: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  description?: string | null;
  dueDate?: Date | null;
  pdfUrl?: string | null;
}

export async function sendInvoiceEmail({
  to,
  organisationName,
  invoiceNumber,
  amount,
  currency,
  description,
  dueDate,
  pdfUrl,
}: SendInvoiceEmailParams) {
  const formattedAmount = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
  }).format(amount / 100);

  const dueDateFormatted = dueDate
    ? dueDate.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `Invoice ${invoiceNumber} from LTS Tax`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${invoiceNumber}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">LTS Tax</h1>
  </div>

  <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
    <h2 style="margin-top: 0; color: #1f2937;">Invoice ${invoiceNumber}</h2>

    <p style="color: #4b5563;">
      A new invoice has been issued for <strong>${organisationName}</strong>.
    </p>

    <div style="background: #f9fafb; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Invoice Number:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600;">${invoiceNumber}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Amount:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600; font-size: 18px; color: #1f2937;">${formattedAmount}</td>
        </tr>
        ${dueDateFormatted ? `
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Due Date:</td>
          <td style="padding: 8px 0; text-align: right; font-weight: 600;">${dueDateFormatted}</td>
        </tr>
        ` : ""}
        ${description ? `
        <tr>
          <td style="padding: 8px 0; color: #6b7280;">Description:</td>
          <td style="padding: 8px 0; text-align: right;">${description}</td>
        </tr>
        ` : ""}
      </table>
    </div>

    ${pdfUrl ? `
    <div style="text-align: center; margin: 30px 0;">
      <a href="${pdfUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
        Download Invoice PDF
      </a>
    </div>
    ` : ""}

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

    <p style="color: #9ca3af; font-size: 12px; text-align: center;">
      If you have any questions about this invoice, please contact us.
    </p>
  </div>
</body>
</html>
    `.trim(),
    text: `
Invoice ${invoiceNumber} from LTS Tax

A new invoice has been issued for ${organisationName}.

Invoice Number: ${invoiceNumber}
Amount: ${formattedAmount}
${dueDateFormatted ? `Due Date: ${dueDateFormatted}` : ""}
${description ? `Description: ${description}` : ""}

${pdfUrl ? `Download the invoice PDF: ${pdfUrl}` : ""}

If you have any questions about this invoice, please contact us.
    `.trim(),
  });

  if (error) {
    console.error("Failed to send invoice email:", error);
    throw new Error(`Failed to send invoice email: ${error.message}`);
  }

  return data;
}

export function generateSecureToken(length = 32): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => chars[byte % chars.length]).join("");
}
