# Email Deliverability Setup for LTS Tax

Your emails are going to spam because you're missing proper email authentication records (SPF, DKIM, DMARC). Here's how to fix it.

## Current Setup

- **Domain:** `email.aionarete.com`
- **Email Service:** Resend
- **From Address:** `noreply@email.aionarete.com`

## Step 1: Verify Domain in Resend

1. Go to https://resend.com/domains
2. Find `email.aionarete.com` in your domains list
3. Check the verification status

## Step 2: Add DNS Records

You need to add these DNS records to your domain (`aionarete.com`). Go to your DNS provider (Cloudflare, Namecheap, etc.):

### SPF Record (Required)
**Type:** TXT
**Name:** `email` (or `email.aionarete.com` depending on your DNS provider)
**Value:** `v=spf1 include:_spf.resend.com ~all`

### DKIM Records (Required)
Resend will provide you with DKIM records. They look like:

**Type:** TXT
**Name:** `resend._domainkey.email` (Resend will give you the exact name)
**Value:** (Long string provided by Resend)

To get your DKIM records:
1. Go to https://resend.com/domains
2. Click on `email.aionarete.com`
3. Look for "DKIM" section
4. Copy the exact records shown

### DMARC Record (Recommended)
**Type:** TXT
**Name:** `_dmarc.email`
**Value:** `v=DMARC1; p=none; rua=mailto:dev@flawstick.com`

This sets a relaxed DMARC policy and sends reports to your email.

## Step 3: Verify DNS Changes

After adding the records:

1. Wait 5-10 minutes for DNS propagation
2. Use this tool to verify: https://mxtoolbox.com/SuperTool.aspx
   - Check SPF: Enter `email.aionarete.com`
   - Check DKIM: Enter `resend._domainkey.email.aionarete.com`
   - Check DMARC: Enter `_dmarc.email.aionarete.com`

## Step 4: Verify in Resend

1. Go back to https://resend.com/domains
2. Click "Verify" next to `email.aionarete.com`
3. Resend will check your DNS records
4. Once verified, you'll see green checkmarks ✓

## Step 5: Additional Best Practices

### 1. Warm Up Your Domain
Start sending emails slowly:
- Day 1-3: Send 10-20 emails
- Day 4-7: Send 50-100 emails
- Week 2: Gradually increase to normal volume

### 2. Monitor Sender Reputation
Check your domain reputation:
- https://senderscore.org
- https://www.google.com/postmaster/

### 3. Content Best Practices
- Avoid spam trigger words ("free", "click here", excessive caps)
- Include plain text version (Resend does this automatically)
- Add unsubscribe link (for marketing emails)
- Keep HTML clean and simple

### 4. Enable Feedback Loops
In Resend:
1. Go to Settings → Webhooks
2. Add webhooks for bounces and spam complaints
3. Monitor and remove bad addresses

## Step 6: Test Email Deliverability

After setup, test your emails:

1. **Mail Tester**
   - Go to https://www.mail-tester.com
   - Send a test email to the address they provide
   - Check your score (aim for 10/10)

2. **Send to Multiple Providers**
   - Gmail
   - Outlook/Hotmail
   - Yahoo
   - ProtonMail

   Check if they land in inbox or spam.

## Common Issues

### Emails Still Going to Spam

1. **Check DNS propagation**: Use `nslookup` or `dig`
   ```bash
   nslookup -type=TXT email.aionarete.com
   ```

2. **Check Resend verification**: Make sure green checkmarks appear

3. **Check sender reputation**: Your domain might be on a blacklist
   - Check at: https://mxtoolbox.com/blacklists.aspx

4. **Review email content**: Test score at mail-tester.com

### DNS Records Not Working

- Wait 24-48 hours for full propagation
- Clear your DNS cache: `sudo dscacheutil -flushcache` (Mac)
- Verify exact record names with your DNS provider

## Quick Fix (If Urgent)

If you need emails to work immediately:

1. Use Resend's built-in domain: `resend.dev`
   - Update `RESEND_FROM_EMAIL` to `LTS Tax <noreply@resend.dev>`
   - This works immediately but less professional

2. Or use Gmail SMTP with your Google Workspace account:
   - More reliable for small volumes
   - Better reputation than new domains

## Monitoring

Set up monitoring to catch issues early:

1. **Resend Dashboard**
   - Track delivery rates
   - Monitor bounces and complaints

2. **Google Postmaster Tools**
   - Add your domain: https://postmaster.google.com
   - Monitor Gmail delivery

3. **Set Up Alerts**
   - Alert if delivery rate drops below 95%
   - Alert if spam complaints > 0.1%

## Expected Timeline

- **DNS Setup**: 10 minutes
- **DNS Propagation**: 5 minutes - 48 hours
- **Resend Verification**: Immediate after DNS propagates
- **Inbox Delivery**: Immediate once verified
- **Full Reputation**: 2-4 weeks of consistent sending

## Contact Support

If issues persist:
- Resend Support: https://resend.com/support
- Check Discord: https://discord.gg/resend

---

**Last Updated:** January 2026
**Status:** Pending DNS Configuration
