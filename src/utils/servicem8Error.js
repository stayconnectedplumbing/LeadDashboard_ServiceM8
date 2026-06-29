export function formatServiceM8Error(message) {
  let text = String(message ?? "");

  text = text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"');

  const failedMatch = text.match(/failed\s*\(\d+\)\s*:\s*(.+)$/is);
  if (failedMatch) {
    text = failedMatch[1].trim();
  }

  text = text.replace(/\s+/g, " ").trim();

  if (text.length > 220) {
    return `${text.slice(0, 217)}...`;
  }

  return text || "ServiceM8 request failed";
}
