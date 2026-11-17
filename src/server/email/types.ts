export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
  template: string;
  from?: string;
};
export type EmailSendResult = { providerMessageId?: string; status: "sent" | "pending" };
export interface EmailProvider {
  send(message: EmailMessage): Promise<EmailSendResult>;
}
