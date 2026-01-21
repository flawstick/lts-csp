import { Resend } from "resend";
import crypto from "crypto";

const resend = new Resend(process.env.RESEND_API_KEY);

interface InvitationEmailParams {
  to: string;
  inviterName: string;
  organisationName: string;
  role: "owner" | "admin" | "member";
  acceptUrl: string;
  expiresAt: Date;
}

export async function sendInvitationEmail(params: InvitationEmailParams) {
  const { to, inviterName, organisationName, role, acceptUrl, expiresAt } = params;

  const roleDescription = {
    owner: "full administrative access",
    admin: "administrative privileges",
    member: "member access",
  }[role];

  const expiryDate = expiresAt.toLocaleDateString("en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const { data, error } = await resend.emails.send({
    from: "LTS Tax <noreply@ltstax.com>",
    to: [to],
    subject: `You've been invited to join ${organisationName} on LTS Tax`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">LTS Tax</h1>
          </div>

          <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
            <h2 style="color: #1f2937; margin-top: 0;">You're Invited!</h2>

            <p style="color: #4b5563;">
              <strong>${inviterName}</strong> has invited you to join <strong>${organisationName}</strong> on LTS Tax with ${roleDescription}.
            </p>

            <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; color: #6b7280; font-size: 14px;">
                <strong>Role:</strong> ${role.charAt(0).toUpperCase() + role.slice(1)}<br>
                <strong>Organisation:</strong> ${organisationName}<br>
                <strong>Expires:</strong> ${expiryDate}
              </p>
            </div>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${acceptUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
                Accept Invitation
              </a>
            </div>

            <p style="color: #9ca3af; font-size: 12px; margin-top: 30px;">
              If you didn't expect this invitation, you can safely ignore this email.
              <br><br>
              This invitation link will expire on ${expiryDate}.
            </p>
          </div>

          <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
            <p>&copy; ${new Date().getFullYear()} LTS Tax. All rights reserved.</p>
          </div>
        </body>
      </html>
    `,
  });

  if (error) {
    throw new Error(`Failed to send invitation email: ${error.message}`);
  }

  return data;
}

interface InvoiceEmailParams {
  to: string;
  organisationName: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  dueDate?: Date;
  description?: string;
  pdfUrl?: string;
}

export async function sendInvoiceEmail(params: InvoiceEmailParams) {
  const { to, organisationName, invoiceNumber, amount, currency, dueDate, description, pdfUrl } = params;

  const formattedAmount = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency,
  }).format(amount / 100);

  const dueDateStr = dueDate
    ? dueDate.toLocaleDateString("en-GB", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "Upon receipt";

  const { data, error } = await resend.emails.send({
    from: "LTS Tax <billing@ltstax.com>",
    to: [to],
    subject: `Invoice ${invoiceNumber} from LTS Tax`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">LTS Tax</h1>
          </div>

          <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
            <h2 style="color: #1f2937; margin-top: 0;">Invoice ${invoiceNumber}</h2>

            <p style="color: #4b5563;">
              Dear ${organisationName},
            </p>

            <p style="color: #4b5563;">
              Please find attached your invoice from LTS Tax.
            </p>

            <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; color: #6b7280; font-size: 14px;">
                <strong>Invoice Number:</strong> ${invoiceNumber}<br>
                <strong>Amount:</strong> ${formattedAmount}<br>
                <strong>Due Date:</strong> ${dueDateStr}
                ${description ? `<br><strong>Description:</strong> ${description}` : ""}
              </p>
            </div>

            ${pdfUrl ? `
            <div style="text-align: center; margin: 30px 0;">
              <a href="${pdfUrl}" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
                Download Invoice PDF
              </a>
            </div>
            ` : ""}

            <p style="color: #4b5563;">
              If you have any questions about this invoice, please don't hesitate to contact us.
            </p>

            <p style="color: #9ca3af; font-size: 12px; margin-top: 30px;">
              Thank you for your business.
            </p>
          </div>

          <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
            <p>&copy; ${new Date().getFullYear()} LTS Tax. All rights reserved.</p>
          </div>
        </body>
      </html>
    `,
  });

  if (error) {
    throw new Error(`Failed to send invoice email: ${error.message}`);
  }

  return data;
}

export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString("hex");
}

interface FeedbackEmailParams {
  from: string;
  userName: string;
  feedback: string;
}

export async function sendFeedbackEmail(params: FeedbackEmailParams) {
  const { from, userName, feedback } = params;

  const { data, error } = await resend.emails.send({
    from: "LTS Tax <noreply@ltstax.com>",
    to: ["dev@flawstick.com"],
    replyTo: from,
    subject: `Feedback from ${userName}`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 28px;">LTS Tax Feedback</h1>
          </div>

          <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
            <h2 style="color: #1f2937; margin-top: 0;">New Feedback Received</h2>

            <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; color: #6b7280; font-size: 14px;">
                <strong>From:</strong> ${userName}<br>
                <strong>Email:</strong> ${from}<br>
                <strong>Date:</strong> ${new Date().toLocaleString("en-GB")}
              </p>
            </div>

            <div style="background: #ffffff; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #1f2937; margin-top: 0;">Feedback:</h3>
              <p style="color: #4b5563; white-space: pre-wrap;">${feedback}</p>
            </div>
          </div>

          <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
            <p>&copy; ${new Date().getFullYear()} LTS Tax. All rights reserved.</p>
          </div>
        </body>
      </html>
    `,
  });

  if (error) {
    throw new Error(`Failed to send feedback email: ${error.message}`);
  }

  return data;
}
