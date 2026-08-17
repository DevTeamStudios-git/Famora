// Risky administrative action classification (§41.6, §41.8).
//
// Risky actions always require layered confirmation. Extremely destructive
// actions additionally require typing a confirmation phrase.

export type RiskLevel = "MODERATE" | "HIGH" | "CRITICAL";

export type RiskyAction =
  | "members.remove"
  | "members.disable"
  | "members.change_role"
  | "whitelist.remove"
  | "whitelist.disable"
  | "permissions.change"
  | "security.change"
  | "sessions.revoke"
  | "chat.bulk_delete"
  | "files.delete"
  | "announcements.delete"
  | "family.transfer"
  | "family.delete";

const ACTION_RISK: Record<RiskyAction, RiskLevel> = {
  "members.remove": "HIGH",
  "members.disable": "HIGH",
  "members.change_role": "HIGH",
  "whitelist.remove": "HIGH",
  "whitelist.disable": "HIGH",
  "permissions.change": "HIGH",
  "security.change": "CRITICAL",
  "sessions.revoke": "HIGH",
  "chat.bulk_delete": "HIGH",
  "files.delete": "HIGH",
  "announcements.delete": "HIGH",
  "family.transfer": "CRITICAL",
  "family.delete": "CRITICAL",
};

const CONFIRMATION_PHRASES: Record<RiskyAction, string> = {
  "members.remove": "REMOVE MEMBER",
  "members.disable": "DISABLE ACCOUNT",
  "members.change_role": "CHANGE ROLE",
  "whitelist.remove": "REMOVE ACCESS",
  "whitelist.disable": "DISABLE ACCESS",
  "permissions.change": "CHANGE PERMISSIONS",
  "security.change": "CHANGE SECURITY",
  "sessions.revoke": "REVOKE SESSIONS",
  "chat.bulk_delete": "DELETE MESSAGES",
  "files.delete": "DELETE FILES",
  "announcements.delete": "DELETE ANNOUNCEMENT",
  "family.transfer": "TRANSFER OWNERSHIP",
  "family.delete": "DELETE FAMILY",
};

export function riskOf(action: RiskyAction): RiskLevel {
  return ACTION_RISK[action];
}

export function confirmationPhrase(action: RiskyAction): string {
  return CONFIRMATION_PHRASES[action];
}

export function requiresPhraseConfirmation(action: RiskyAction): boolean {
  return ACTION_RISK[action] === "CRITICAL";
}

export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  MODERATE: "Moderate",
  HIGH: "High",
  CRITICAL: "Critical",
};