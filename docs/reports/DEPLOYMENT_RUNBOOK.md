# Deployment Runbook - Matrimony Platform (Free-Tier Edition)

This document outlines the environment configuration required for a $0-cost deployment of the Matrimony platform.

## 1. Prerequisites (Always-Free Tiers)
- [ ] **Database:** [Neon.tech](https://neon.tech/) (Serverless Postgres, permanently free tier).
- [ ] **Cache/Queues:** [Upstash](https://upstash.com/) (Serverless Redis, generous free tier).
- [ ] **Hosting:** [Render](https://render.com/) (Web Services for NestJS, Static Site for Admin).
- [ ] **Storage:** [Cloudflare R2](https://www.cloudflare.com/products/r2/) (10GB free, low ops cost).
- [ ] **Notifications:** [Firebase](https://firebase.google.com/) (FCM - Free) & [MSG91](https://msg91.com/) (Sign up for free trials).

## 2. Environment Configuration (Populate in Render Dashboard)
Populate these in your Render Web Service dashboard under "Environment".

### Application & Security
- `NODE_ENV`: `production`
- `JWT_ACCESS_SECRET`: [Generate via `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`]
- `JWT_REFRESH_SECRET`: [Same as above]
- `MFA_ENCRYPTION_KEY`: [Same as above]
- `OTP_HASH_SECRET`: [Same as above]

### Database & Cache (Free Tiers)
- `DATABASE_URL`: `postgresql://<user>:<password>@<host>:<port>/matrimony?sslmode=require` (From Neon)
- `REDIS_URL`: `rediss://:<password>@<host>:<port>` (From Upstash - *Note the extra 's' for secure*)

### Storage (Cloudflare R2)
- `S3_ENDPOINT`: [R2 S3-API Endpoint]
- `S3_BUCKET`: [Bucket Name]
- `S3_ACCESS_KEY`: [R2 Access Key]
- `S3_SECRET_KEY`: [R2 Secret Key]

### Payments (Razorpay - Test Mode for now)
- `RAZORPAY_KEY_ID`: [Test/Prod Key ID]
- `RAZORPAY_KEY_SECRET`: [Test/Prod Key Secret]
- `RAZORPAY_WEBHOOK_SECRET`: [Webhook Secret]

### Notifications (Firebase & MSG91)
- `FCM_SERVICE_ACCOUNT_JSON`: [Paste raw JSON content]
- `SMS_PROVIDER_API_KEY`: [MSG91 AuthKey]
- `SMS_SENDER_ID`: [Registered Sender ID]
- `SMS_TEMPLATE_ID`: [MSG91 Template ID]
- `SMS_DLT_ENTITY_ID`: [DLT Entity ID]
- `SMS_DLT_TEMPLATE_ID`: [DLT Template ID]
- `EMAIL_PROVIDER_API_KEY`: [Email API Key]
- `EMAIL_FROM_ADDRESS`: [Verified Email]

## 3. Post-Deployment Checklist
- [ ] **Database Setup:** Connect to Neon, then run `npx prisma migrate deploy` in your CI or manual build step.
- [ ] **Check Health:** Ensure the API service successfully boots in Render (check logs for errors).
- [ ] **Test:** Perform a full user registration flow to verify database connectivity and Redis caching.
