export interface GmailAccount {
  id: string;
  email: string;
  appPassword?: string;
  label?: string;
  selected: boolean;
  status?: "idle" | "sending" | "sent" | "error";
  error?: string;
  lastVerified?: string;
}

export interface EmailTemplate {
  id: number;
  name: string;
  subject: string;
  htmlBody: string;
  description: string;
  color: string;
  icon: string;
}

export interface AppealRecord {
  id: string;
  targetNumber: string;
  templateId: number;
  templateName: string;
  gmailAccounts: string[];
  sentAt: string;
  status: "sent" | "partial" | "failed";
  replies: ReplyRecord[];
}

export interface ReplyRecord {
  id: string;
  appealId: string;
  fromEmail: string;
  toEmail: string;
  subject: string;
  body: string;
  receivedAt: string;
  gmailAccount: string;
  screenshotPath?: string;
}

export interface TerminalLog {
  id: string;
  timestamp: string;
  type: "info" | "success" | "error" | "warn" | "system" | "packet";
  message: string;
}

export interface Stats {
  totalSent: number;
  totalReplied: number;
  successRate: number;
  avgReplyTime: number;
}

export interface SendAppealRequest {
  targetNumber: string;
  templateId: number;
  gmailAccounts: GmailAccount[];
  attachments?: File[];
}
