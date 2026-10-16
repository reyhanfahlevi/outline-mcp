// Methods whose effect cannot be undone, or that silently change who can reach the workspace,
// are refused by the generic outline_call so destructive intent has to go through a tool that
// guards it (see outline_delete_document, which requires the document title as confirmation).
const BLOCKED = /\.(delete|destroy|revoke|suspend|demote)$/i;

export function isBlockedMethod(method: string): boolean {
  return BLOCKED.test(method.trim());
}
