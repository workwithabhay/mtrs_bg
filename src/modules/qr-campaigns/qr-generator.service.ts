import qrcode from 'qrcode';
import PDFDocument from 'pdfkit';
import { env } from '../../config/env.js';
import type { IQrCampaignDocument } from './models/qr-campaign.model.js';

const PDFDoc = (
  typeof PDFDocument === 'function'
    ? PDFDocument
    : (PDFDocument as unknown as { default: typeof PDFDocument }).default
);

const qr = (
  typeof qrcode === 'object' && qrcode !== null && 'toBuffer' in qrcode
    ? qrcode
    : (qrcode as unknown as { default: typeof qrcode }).default
);

export class QrGeneratorService {
  /**
   * Builds the stable, fully qualified public customer landing page URL.
   */
  getPublicCampaignUrl(publicToken: string): string {
    const base = env.PUBLIC_APP_URL.trim().replace(/\/+$/, '');
    return `${base}/qr/${publicToken}`;
  }

  /**
   * Generates a high-resolution PNG QR code buffer.
   */
  async generatePng(campaign: IQrCampaignDocument): Promise<Buffer> {
    const url = this.getPublicCampaignUrl(campaign.publicToken);

    return qr.toBuffer(url, {
      type: 'png',
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 600,
      color: {
        dark: campaign.branding.primaryColor || '#2563EB',
        light: campaign.branding.backgroundColor || '#FFFFFF',
      },
    });
  }

  /**
   * Generates a clean, valid SVG QR code string.
   */
  async generateSvg(campaign: IQrCampaignDocument): Promise<string> {
    const url = this.getPublicCampaignUrl(campaign.publicToken);

    return qr.toString(url, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 2,
      color: {
        dark: campaign.branding.primaryColor || '#2563EB',
        light: campaign.branding.backgroundColor || '#FFFFFF',
      },
    });
  }

  /**
   * Generates a print-ready branded PDF export containing the QR code and campaign heading.
   */
  async generatePdf(campaign: IQrCampaignDocument): Promise<Buffer> {
    const qrPngBuffer = await this.generatePng(campaign);

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDoc({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
      });

      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err: Error) => reject(err));

      // 1. Header / Campaign Title
      doc
        .fontSize(26)
        .font('Helvetica-Bold')
        .fillColor('#1E293B')
        .text(campaign.title, { align: 'center' });

      doc.moveDown(0.5);

      // 2. Landing Heading
      doc
        .fontSize(16)
        .font('Helvetica')
        .fillColor('#475569')
        .text(campaign.heading, { align: 'center' });

      if (campaign.description) {
        doc.moveDown(0.3);
        doc
          .fontSize(12)
          .font('Helvetica-Oblique')
          .fillColor('#64748B')
          .text(campaign.description, { align: 'center' });
      }

      doc.moveDown(1.5);

      // 3. Embedded High-Res QR Code Image (centered)
      const qrSize = 300;
      const x = (doc.page.width - qrSize) / 2;
      const y = doc.y;

      doc.image(qrPngBuffer, x, y, { width: qrSize, height: qrSize });

      // 4. Instructions below QR
      doc.y = y + qrSize + 25;
      doc
        .fontSize(14)
        .font('Helvetica-Bold')
        .fillColor('#2563EB')
        .text('Scan with your smartphone camera to leave a review', { align: 'center' });

      doc.end();
    });
  }
}

export const qrGeneratorService = new QrGeneratorService();
