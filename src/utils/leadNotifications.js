import { formatCategoryLabel, getLeadReceivedAt } from "../leadCategories";

export const MAX_LEAD_NOTIFICATIONS = 50;

export function createLeadNotification(lead) {
  return {
    id: lead.id,
    leadId: lead.id,
    fullName: lead.full_name || "Unnamed",
    categoryLabel: formatCategoryLabel(lead.source, lead.raw_payload),
    phone: lead.phone || "",
    service: lead.service_requested || "",
    receivedAt: getLeadReceivedAt(lead),
    read: false,
  };
}
