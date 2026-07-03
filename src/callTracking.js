/** Call tracking helpers — WildJar phone_calls table */

export const CALL_STATUS_OPTIONS = [
  { id: "all", label: "All statuses" },
  { id: "answered", label: "Answered" },
  { id: "missed", label: "Missed" },
  { id: "abandoned", label: "Abandoned" },
  { id: "missed_abandoned", label: "Missed & Abandoned" },
];

export function matchesCallStatusFilter(callStatus, filterId) {
  if (filterId === "all") return true;
  if (filterId === "missed_abandoned") {
    return callStatus === "missed" || callStatus === "abandoned";
  }
  return callStatus === filterId;
}

export const BRAND_FILTER_OPTIONS = [
  { id: "all", label: "All brands" },
  { id: "Stay Connected Plumbing", label: "Stay Connected Plumbing" },
  { id: "Same Day Home Services", label: "Same Day Home Services" },
];

export function formatCallStatus(status) {
  if (!status) return "Unknown";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function statusBadgeClass(status) {
  if (!status) return "unknown";
  if (status === "answered") return "answered";
  if (status === "missed") return "missed";
  if (status === "abandoned") return "abandoned";
  return "unknown";
}

export function normalizePhoneCall(call) {
  return {
    notes: "",
    followed_up: false,
    first_time_caller: null,
    ...call,
  };
}

export const DEMO_PHONE_CALLS = [
  {
    id: "demo-call-1",
    wildjar_call_id: "wj-demo-1001",
    event_type: "call_completed",
    caller_phone: "0412 345 678",
    tracking_number: "1300 111 222",
    tracking_source: "Google Paid - Stay Connected",
    call_status: "answered",
    duration_seconds: 154,
    talk_time_seconds: 132,
    first_time_caller: true,
    caller_area: "Sydney",
    web_source: "google",
    web_medium: "cpc",
    ivr_option: "Sales",
    account_name: "Stay Connected Plumbing",
    brand: "Stay Connected Plumbing",
    notes: "",
    followed_up: false,
    call_started_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    call_ended_at: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
  },
  {
    id: "demo-call-2",
    wildjar_call_id: "wj-demo-1002",
    event_type: "call_completed",
    caller_phone: "0423 987 654",
    tracking_number: "1300 333 444",
    tracking_source: "Website - Same Day Home Services",
    call_status: "missed",
    duration_seconds: 28,
    talk_time_seconds: 0,
    first_time_caller: false,
    caller_area: "Parramatta",
    web_source: "direct",
    web_medium: "none",
    ivr_option: null,
    account_name: "Same Day Home Services",
    brand: "Same Day Home Services",
    notes: "Left voicemail — call back before 5pm",
    followed_up: true,
    call_started_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    call_ended_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "demo-call-3",
    wildjar_call_id: "wj-demo-1003",
    event_type: "call_completed",
    caller_phone: "0400 222 333",
    tracking_number: "1300 555 666",
    tracking_source: "Google Organic",
    call_status: "answered",
    duration_seconds: 412,
    talk_time_seconds: 385,
    first_time_caller: true,
    caller_area: "North Shore",
    web_source: "google",
    web_medium: "organic",
    ivr_option: "Emergency",
    account_name: "Same Day Home Services",
    brand: "Same Day Home Services",
    notes: "",
    followed_up: false,
    call_started_at: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
    call_ended_at: new Date(Date.now() - 25.9 * 60 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 25.9 * 60 * 60 * 1000).toISOString(),
  },
];

export function downloadCallsCSV(calls, formatDate, formatDuration, formatCallStatus) {
  const headers = [
    "Caller",
    "Brand",
    "Tracking Source",
    "Status",
    "Duration",
    "Talk Time",
    "First Time",
    "Area",
    "Followed Up",
    "Notes",
    "Call Time",
  ];

  const rows = calls.map((call) => [
    call.caller_phone || "",
    call.brand || call.tracking_source || "",
    call.tracking_source || "",
    formatCallStatus(call.call_status),
    formatDuration(call.duration_seconds),
    formatDuration(call.talk_time_seconds),
    call.first_time_caller ? "Yes" : call.first_time_caller === false ? "No" : "",
    call.caller_area || "",
    call.followed_up ? "Yes" : "No",
    call.notes || "",
    call.call_started_at ? formatDate(call.call_started_at) : formatDate(call.created_at),
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((row) =>
      row.map((field) => `"${String(field).replace(/"/g, '""')}"`).join(","),
    ),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute(
    "download",
    `phone-calls-${new Date().toISOString().split("T")[0]}.csv`,
  );
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
