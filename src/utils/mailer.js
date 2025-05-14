import nodemailer from "nodemailer";
import ApiError from "./ApiError.js";

const sendPasswordResetMail = async (resetURL, receiver) => {
  // Create Nodemailer transporter
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  // Email options
  const mailOptions = {
    from: `"MERNTube" <${process.env.EMAIL_USER}>`,
    to: receiver,
    subject: "Password Reset Request",
    html: `
      <p>You requested a password reset for your MERNTube account.</p>
      <p>Click the link below to reset your password:</p>
      <a href="${resetURL}" target="_blank">Reset Password</a>
      <p>This link will expire in 1 hour.</p>
      <p>If you didn’t request this, please ignore this email.</p>
    `,
  };

  // Send email
  try {
    const info = await transporter.sendMail(mailOptions);
    return info;
  } catch (error) {
    throw new ApiError(500, `Failed to send email: ${error.message}`);
  }
};

export { sendPasswordResetMail };
