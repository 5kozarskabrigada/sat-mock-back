import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    // Log email configuration (without password)
    console.log('Email Service Configuration:');
    console.log('- Host:', process.env.EMAIL_HOST || 'smtp.office365.com');
    console.log('- Port:', process.env.EMAIL_PORT || '587');
    console.log('- Secure:', process.env.EMAIL_SECURE === 'true');
    console.log('- User:', process.env.EMAIL_USER || 'NOT SET');
    console.log('- Password:', process.env.EMAIL_PASSWORD ? '***SET***' : 'NOT SET');
    
    // Initialize nodemailer transporter for Microsoft 365/Outlook with custom domain
    this.transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.office365.com',
      port: parseInt(process.env.EMAIL_PORT || '587'),
      secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.EMAIL_USER, // info@examroomedu.com
        pass: process.env.EMAIL_PASSWORD, // Account password
      },
      tls: {
        ciphers: 'SSLv3',
        rejectUnauthorized: false
      }
    });
  }

  async sendWelcomeEmail(
    to: string,
    studentData: {
      firstName: string;
      lastName: string;
      username: string;
      password: string;
    },
  ) {
    console.log(`[EmailService] Attempting to send email to: ${to}`);
    const { firstName, lastName, username, password } = studentData;

    const mailOptions = {
      from: `"ExamRoom Team" <${process.env.EMAIL_USER}>`,
      to,
      subject: 'Welcome to ExamRoom - Your Login Credentials',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #123b71; color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .logo-wrapper { background-color: white; display: inline-block; padding: 15px 30px; border-radius: 12px; margin-bottom: 20px; }
            .logo { max-width: 200px; height: auto; display: block; }
            .content { background-color: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }
            .credentials { background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .credential-row { margin: 15px 0; padding: 10px; background-color: #f8fafc; border-radius: 6px; }
            .label { font-weight: bold; color: #123b71; display: block; margin-bottom: 5px; font-size: 12px; text-transform: uppercase; }
            .value { font-family: 'Courier New', monospace; background-color: #e0f2fe; padding: 8px 12px; border-radius: 4px; display: block; font-size: 16px; color: #0c4a6e; }
            .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
            .button { display: inline-block; background-color: #123b71; color: white !important; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: 600; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo-wrapper">
                <img src="https://i.postimg.cc/4Y5V5pBq/logo.png" alt="ExamRoom Logo" class="logo" />
              </div>
              <h1 style="margin: 0; font-size: 28px;">Welcome to ExamRoom</h1>
            </div>
            <div class="content">
              <p>Dear ${firstName} ${lastName},</p>
              
              <p>Your student account has been created successfully. Below are your login credentials:</p>
              
              <div class="credentials">
                <div class="credential-row">
                  <span class="label">Username</span>
                  <span class="value">${username}</span>
                </div>
                <div class="credential-row">
                  <span class="label">Password</span>
                  <span class="value">${password}</span>
                </div>
              </div>
              
              <div style="text-align: center;">
                <a href="https://examroomedu.com/1/login" class="button" style="color: white;">Login to Your Account</a>
              </div>
              
              <p><strong>Getting Started:</strong></p>
              <ol>
                <li>Visit the ExamRoom platform</li>
                <li>Click on "Student Login"</li>
                <li>Enter your username and password</li>
              </ol>
              
              <p>If you have any questions or need assistance, please contact your administrator.</p>
              
              <p>Best regards,<br>
              <strong>The ExamRoom Team</strong></p>
            </div>
            <div class="footer">
              <p>This is an automated email. Please do not reply to this message.</p>
              <p>&copy; 2026 ExamRoom. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
Welcome to ExamRoom

Dear ${firstName} ${lastName},

Your student account has been created successfully. Below are your login credentials:

Username: ${username}
Password: ${password}

Getting Started:
1. Visit the ExamRoom platform at https://examroomedu.com/1/login
2. Click on "Student Login"
3. Enter your username and password

If you have any questions or need assistance, please contact your administrator.

Best regards,
The ExamRoom Team

---
This is an automated email. Please do not reply to this message.
© 2026 ExamRoom. All rights reserved.
      `,
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log('Email sent successfully:', info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  }

  async testConnection() {
    try {
      await this.transporter.verify();
      console.log('Email service is ready to send emails');
      return true;
    } catch (error) {
      console.error('Email service connection failed:', error);
      return false;
    }
  }
}
