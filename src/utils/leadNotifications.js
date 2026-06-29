import { formatCategoryLabel, getLeadReceivedAt } from "../leadCategories";

export const MAX_LEAD_NOTIFICATIONS = 50;

export function createLeadNotification(lead) {
  const service = String(lead.service_requested || "").trim();
  const message = String(lead.message || "").trim();
  const receivedAt = getLeadReceivedAt(lead);

  return {
    id: `${lead.id}-${receivedAt}`,
    leadId: lead.id,
    fullName: lead.full_name || "Unnamed",
    categoryLabel: formatCategoryLabel(lead.source, lead.raw_payload),
    phone: lead.phone || "",
    service,
    message,
    preview: message || service || "New lead received",
    receivedAt,
    read: false,
  };
}
