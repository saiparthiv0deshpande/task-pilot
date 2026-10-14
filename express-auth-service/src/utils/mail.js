const nodemailer = require('nodemailer');
const config = require('../config/env');

const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.secure,
  auth: { user: config.smtp.user, pass: config.smtp.password },
});

async function sendAccountEmail({ to, subject, text }) {
  await transporter.sendMail({ from: config.smtp.from, to, subject, text });
}

module.exports = { sendAccountEmail };
