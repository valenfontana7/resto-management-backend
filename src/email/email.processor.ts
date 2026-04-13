import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

export interface EmailJobData {
  from: string;
  to: string;
  subject: string;
  html: string;
}

export const EMAIL_QUEUE = 'email';

@Processor(EMAIL_QUEUE)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);
  private resend: Resend | null = null;

  constructor(private readonly configService: ConfigService) {
    super();
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (apiKey) {
      this.resend = new Resend(apiKey);
    }
  }

  async process(job: Job<EmailJobData>): Promise<boolean> {
    const { from, to, subject } = job.data;

    if (!this.resend) {
      this.logger.log(`[EMAIL MOCK] To: ${to} | Subject: ${subject}`);
      return true;
    }

    const result = await this.resend.emails.send({
      from,
      to,
      subject,
      html: job.data.html,
    });

    if (result.error) {
      this.logger.error(
        `Email to ${to} failed (attempt ${job.attemptsMade + 1}): ${result.error.message}`,
      );
      throw new Error(result.error.message);
    }

    this.logger.log(
      `Email sent to ${to}: ${result.data?.id} (attempt ${job.attemptsMade + 1})`,
    );
    return true;
  }
}
