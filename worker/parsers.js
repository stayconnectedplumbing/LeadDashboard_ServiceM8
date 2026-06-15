function matchField(text, label) {
  const re = new RegExp(`(?:^|\\n)\\s*(?:${label})\\s*[:\\-|]\\s*(.+)`, "i");
  const m = text.match(re);
  return m ? m[1].split("\n")[0].replace(/\s*\|.*$/, "").trim() : "";
}

function plainTextFromEmail(email) {
  return [email.textPlain, email.snippet, email.textHtml]
    .filter(Boolean)
    .join("\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ");
}

function tableTextFromHtml(rawHtml) {
  return rawHtml
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/td>/gi, " | ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}

function baseLead(email, source, fields) {
  return {
    source,
    external_id: email.id,
    full_name: fields.full_name ?? "",
    email: fields.email ?? "",
    phone: fields.phone ?? "",
    service_requested: fields.service_requested ?? "",
    message: fields.message ?? "",
    raw_payload: email.raw_payload,
    received_at: email.received_at,
  };
}

export function parseGoogleForm(email) {
  const text = plainTextFromEmail(email);
  return baseLead(email, "google_form", {
    full_name: matchField(text, "Name"),
    email: matchField(text, "Email"),
    phone: matchField(text, "Phone|Mobile"),
    service_requested: matchField(text, "Service|Service Requested|Job Description"),
    message: matchField(
      text,
      "Message|Comments|Details|Additional Information|Project Summary",
    ),
  });
}

export function parseStayConnected(email) {
  const text = plainTextFromEmail(email);
  return baseLead(email, "stay_connected_plumbing", {
    full_name: matchField(text, "Name"),
    email: matchField(text, "Email"),
    phone: matchField(text, "Mobile|Phone Number|Phone"),
    service_requested: matchField(text, "Job Description|Service Type|Service"),
    message: matchField(text, "Additional Information|Message|Comments|Details"),
  });
}

export function parseSameDayHome(email) {
  const stripped = tableTextFromHtml(email.textHtml || "");
  const text = [email.textPlain, email.snippet, stripped].filter(Boolean).join("\n");
  return baseLead(email, "same_day_home_services", {
    full_name: matchField(text, "Customer Name"),
    email: matchField(text, "Email"),
    phone: matchField(text, "Phone"),
    service_requested: matchField(text, "Requested Service"),
    message: matchField(
      text,
      "Project Summary|Additional Information|Message|Comments|Details",
    ),
  });
}

export function parseSameDayShower(email) {
  const text = plainTextFromEmail(email);
  return baseLead(email, "same_day_shower_repairs", {
    full_name: matchField(text, "Name"),
    email: matchField(text, "Email"),
    phone: matchField(text, "Phone|Mobile|Phone Number"),
    service_requested: matchField(text, "Service|Service Type|Job Description"),
    message: matchField(text, "Additional Information|Message|Comments|Details"),
  });
}

export function parseEmergencyPlumbing(email) {
  const text = plainTextFromEmail(email);
  return baseLead(email, "emergency_plumbing_sydney", {
    full_name: matchField(text, "Name"),
    email: matchField(text, "Email"),
    phone: matchField(text, "Phone Number|Phone|Mobile"),
    service_requested: matchField(text, "Service Type|Service|Job Description"),
    message: matchField(text, "Additional Information|Message|Comments|Details"),
  });
}

export const PARSERS = {
  googleForm: parseGoogleForm,
  stayConnected: parseStayConnected,
  sameDayHome: parseSameDayHome,
  sameDayShower: parseSameDayShower,
  emergencyPlumbing: parseEmergencyPlumbing,
};
