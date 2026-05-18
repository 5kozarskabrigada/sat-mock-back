import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    // Initialize nodemailer transporter for Microsoft/Outlook
    this.transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp-mail.outlook.com',
      port: parseInt(process.env.EMAIL_PORT || '587'),
      secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.EMAIL_USER, // info@examroomedu.com
        pass: process.env.EMAIL_PASSWORD, // App password from Microsoft account
      },
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
    const { firstName, lastName, username, password } = studentData;

    const mailOptions = {
      from: `"ExamRoom EDU" <${process.env.EMAIL_USER}>`,
      to,
      subject: 'Welcome to ExamRoom EDU - Your Login Credentials',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #4F46E5; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background-color: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }
            .credentials { background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4F46E5; }
            .credential-row { margin: 10px 0; }
            .label { font-weight: bold; color: #4F46E5; }
            .value { font-family: 'Courier New', monospace; background-color: #f3f4f6; padding: 5px 10px; border-radius: 4px; display: inline-block; }
            .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
            .button { display: inline-block; background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
            .warning { background-color: #fef3c7; padding: 15px; border-radius: 8px; border-left: 4px solid #f59e0b; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to ExamRoom EDU</h1>
            </div>
            <div class="content">
              <p>Dear ${firstName} ${lastName},</p>
              
              <p>Your student account has been created successfully. Below are your login credentials:</p>
              
              <div class="credentials">
                <div class="credential-row">
                  <span class="label">Username:</span> <span class="value">${username}</span>
                </div>
                <div class="credential-row">
                  <span class="label">Password:</span> <span class="value">${password}</span>
                </div>
              </div>
              
              <div class="warning">
                <strong>⚠️ Important Security Notice:</strong><br>
                Please change your password after your first login for security purposes.
              </div>
              
              <div style="text-align: center;">
                <a href="https://examroomedu.com" class="button">Login to Your Account</a>
              </div>
              
              <p><strong>Getting Started:</strong></p>
              <ol>
                <li>Visit the ExamRoom EDU platform</li>
                <li>Click on "Student Login"</li>
                <li>Enter your username and password</li>
                <li>Change your password in your profile settings</li>
              </ol>
              
              <p>If you have any questions or need assistance, please contact your administrator.</p>
              
              <p>Best regards,<br>
              <strong>The ExamRoom EDU Team</strong></p>
            </div>
            <div class="footer">
              <p>This is an automated email. Please do not reply to this message.</p>
              <p>&copy; 2026 ExamRoom EDU. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
Welcome to ExamRoom EDU

Dear ${firstName} ${lastName},

Your student account has been created successfully. Below are your login credentials:

Username: ${username}
Password: ${password}

⚠️ Important: Please change your password after your first login for security purposes.

Getting Started:
1. Visit the ExamRoom EDU platform
2. Click on "Student Login"
3. Enter your username and password
4. Change your password in your profile settings

If you have any questions or need assistance, please contact your administrator.

Best regards,
The ExamRoom EDU Team

---
This is an automated email. Please do not reply to this message.
© 2026 ExamRoom EDU. All rights reserved.
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
