import express from 'express';
import serverless from 'serverless-http';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const router = express.Router();

app.use(express.json());

// Helper: Validar formato de correo electrónico
function esCorreoValido(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

// RETO 1: Middleware de Autenticación mediante API Key
function validarApiKey(req, res, next) {
  const apiKeyGuardada = process.env.API_SECRET_KEY;
  const apiKeyEnviada = req.headers['x-api-key'];

  if (!apiKeyGuardada || apiKeyEnviada !== apiKeyGuardada) {
    return res.status(401).json({
      status: 'error',
      message: 'No autorizado. La cabecera x-api-key es inválida o está ausente.'
    });
  }

  next();
}

// Endpoint 1: Consultar Hora del Servidor
router.get('/time', (req, res) => {
  const now = new Date();

  return res.status(200).json({
    status: 'success',
    data: {
      serverTimeISO: now.toISOString(),
      timestamp: now.getTime(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      formatted: now.toUTCString(),
      platform: 'Netlify Functions (AWS Lambda)'
    }
  });
});

// Endpoint 2: Envío de Correo Transaccional
router.post('/send-email', validarApiKey, async (req, res) => {
  try {
    const { to, subject, message, senderName } = req.body;

    if (!to || !subject || !message) {
      return res.status(400).json({
        status: 'error',
        message: 'Parámetros obligatorios faltantes: to, subject y message son requeridos.'
      });
    }

    if (!esCorreoValido(to)) {
      return res.status(400).json({
        status: 'error',
        message: 'El formato de correo en el campo "to" no es válido.'
      });
    }

    // RETO 2: Sanitización contra Inyección CRLF
    const subjectSanitizado = subject.replace(/[\r\n]/g, '');

    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM } = process.env;

    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
      return res.status(500).json({
        status: 'error',
        message: 'Servicio de correo no configurado en el servidor.'
      });
    }

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT) || 587,
      secure: Number(SMTP_PORT) === 465,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
      }
    });

    // RETO 3: Plantilla HTML Personalizada
    const nombreRemitente = senderName ? senderName.trim() : 'Sistema Notificaciones';

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #4f46e5; padding: 20px; text-align: center;">
          <h2 style="color: #ffffff; margin: 0;">Mensaje Transaccional</h2>
          <p style="color: #c7d2fe; margin: 5px 0 0 0;">De: ${nombreRemitente}</p>
        </div>
        <div style="padding: 24px; background-color: #ffffff; color: #334155;">
          <p style="font-size: 16px; line-height: 1.5;">${message}</p>
        </div>
        <div style="background-color: #f8fafc; padding: 12px; text-align: center;">
          <small style="color: #94a3b8;">Despachado el ${new Date().toUTCString()}</small>
        </div>
      </div>
    `;

    const info = await transporter.sendMail({
      from: EMAIL_FROM || `"${nombreRemitente}" <${SMTP_USER}>`,
      to,
      subject: subjectSanitizado,
      text: message,
      html: htmlContent
    });

    return res.status(200).json({
      status: 'success',
      message: 'Correo despachado satisfactoriamente.',
      data: {
        messageId: info.messageId,
        recipient: to
      }
    });

  } catch (error) {
    console.error('Error al procesar envío de correo:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Fallo interno al despachar el correo.',
      details: error.message
    });
  }
});

// Solución de enrutamiento múltiple para Netlify
app.use('/api', router);
app.use('/.netlify/functions/api', router);
app.use('/', router);

export const handler = serverless(app);