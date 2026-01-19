# Supabase Email Templates

Custom branded email templates for LTS Tax passwordless authentication.

## Templates Included

1. **supabase-otp.html** - OTP (6-digit code) login email (primary authentication method)
2. **supabase-magic-link.html** - Magic link login email (deprecated)
3. **supabase-confirm-signup.html** - Email confirmation for new signups

## How to Configure in Supabase

### Step 1: Access Email Templates

1. Go to your Supabase project dashboard
2. Navigate to **Authentication** → **Email Templates**

### Step 2: Update Templates

#### OTP Template (Recommended)
1. Select **Magic Link** from the left sidebar (Supabase uses the same template for OTP)
2. Copy the content from `supabase-otp.html`
3. Paste it into the **Email template body** field in Supabase
4. Click **Save**

**Note:** When using `signInWithOtp` in your code, Supabase will automatically send a 6-digit code and use this template. The `{{ .Token }}` variable will contain the OTP code.

#### Confirm Signup Template
1. Select **Confirm Signup** from the left sidebar
2. Copy the content from `supabase-confirm-signup.html`
3. Paste it into the **Email template body** field in Supabase
4. Click **Save**

### Step 3: Configure SMTP (Optional but Recommended)

For better deliverability and branding:

1. Go to **Project Settings** → **Authentication**
2. Scroll to **SMTP Settings**
3. Configure your SMTP provider (recommended: Resend, since you're already using it)
   - SMTP Host: `smtp.resend.com`
   - Port: `587`
   - Username: `resend`
   - Password: Your Resend API key
   - Sender email: `noreply@ltstax.com`
   - Sender name: `LTS Tax`

## Template Variables

Supabase automatically replaces these variables:

- `{{ .ConfirmationURL }}` - The magic link or confirmation URL
- `{{ .Email }}` - The user's email address
- `{{ .Token }}` - The confirmation token (if needed)
- `{{ .CurrentYear }}` - Current year for copyright

## Brand Colors

The templates use LTS Tax brand colors:
- Primary gradient: `#667eea` to `#764ba2`
- Text colors: `#1f2937` (headings), `#4b5563` (body)
- Backgrounds: `#f9fafb` (page), `#ffffff` (card)

## Testing

After configuring:
1. Test magic link login by signing in with your email
2. Test email confirmation for new signups
3. Check spam folders to ensure deliverability

## Notes

- Templates are mobile-responsive
- Use inline CSS for maximum email client compatibility
- Include security notices and expiry information
- Provide both button and text link for accessibility
