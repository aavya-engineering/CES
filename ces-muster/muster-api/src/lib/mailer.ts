// SPDX-FileCopyrightText: Blue Heron Defense LLC and its licensors. All rights reserved.
// SPDX-License-Identifier: LicenseRef-BHD-Proprietary
// CONFIDENTIAL - TRADE SECRET. Unpublished work. Provided solely to perform work for Blue Heron Defense LLC at its direction.
// Any other use, copying, disclosure, or reuse, in whole or in part, is prohibited.
// Changes made to this file for Blue Heron Defense LLC are made on its behalf; it claims all rights in them.
// Submitting a change to this repository means you accept TERMS.md.
// Removing or altering this notice is prohibited (17 U.S.C. 1202). Ref: BHD-CES-MUSTER-2026A
// See LICENSE and TERMS.md.

// mailer.ts — S1.9: outbound e-mail for password reset links.
//   MUSTER_SMTP_URL set     → sent through that SMTP server (nodemailer), e.g.
//                             smtps://user:pass@smtp.example.com:465
//   unset, not production   → the message is printed to the API log when
//                             MUSTER_DEV_MAIL_LOG=1 (developer / review laptop only)
//   unset otherwise         → not sent; the API logs that no mail transport is set
// The message body is never written to the audit log.
import nodemailer from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}
export type Mailer = (m: MailMessage) => Promise<'sent' | 'logged' | 'not_configured'>;

export function createMailer(env: NodeJS.ProcessEnv = process.env): Mailer {
  const url = env.MUSTER_SMTP_URL;
  const from = env.MUSTER_MAIL_FROM ?? 'CES <no-reply@localhost>';
  if (url) {
    const transport = nodemailer.createTransport(url);
    return async (m) => {
      await transport.sendMail({ from, to: m.to, subject: m.subject, text: m.text });
      return 'sent';
    };
  }
  const devLog = env.MUSTER_DEV_MAIL_LOG === '1' && env.NODE_ENV !== 'production';
  return async (m) => {
    if (devLog) {
      console.log(`[mail:dev] to=${m.to} subject="${m.subject}"\n${m.text}`);
      return 'logged';
    }
    console.warn('[mail] no mail transport configured (MUSTER_SMTP_URL); message not sent:', m.subject);
    return 'not_configured';
  };
}
