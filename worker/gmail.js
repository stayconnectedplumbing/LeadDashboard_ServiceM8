import { google } from "googleapis";

function decodeBase64Url(data) {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
    "utf8",
  );
}

function extractBodies(payload) {
  let textPlain = "";
  let textHtml = "";

  function walk(part) {
    if (!part) return;

    if (part.mimeType === "text/plain" && part.body?.data) {
      textPlain += decodeBase64Url(part.body.data);
    } else if (part.mimeType === "text/html" && part.body?.data) {
      textHtml += decodeBase64Url(part.body.data);
    }

    for (const child of part.parts ?? []) {
      walk(child);
    }
  }

  if (payload.body?.data && payload.mimeType === "text/plain") {
    textPlain = decodeBase64Url(payload.body.data);
  } else if (payload.body?.data && payload.mimeType === "text/html") {
    textHtml = decodeBase64Url(payload.body.data);
  }

  walk(payload);
  return { textPlain: textPlain.trim(), textHtml: textHtml.trim() };
}

function headerValue(headers, name) {
  const found = headers?.find(
    (header) => header.name?.toLowerCase() === name.toLowerCase(),
  );
  return found?.value ?? "";
}

export function createGmailClient(config) {
  const auth = new google.auth.OAuth2(
    config.googleClientId,
    config.googleClientSecret,
  );

  auth.setCredentials({ refresh_token: config.googleRefreshToken });
  return google.gmail({ version: "v1", auth });
}

export async function listMessageIds(gmail, query, limit) {
  const response = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults: limit,
  });

  return (response.data.messages ?? []).map((message) => message.id);
}

export async function fetchMessage(gmail, messageId) {
  const response = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  const message = response.data;
  const headers = message.payload?.headers ?? [];
  const { textPlain, textHtml } = extractBodies(message.payload ?? {});

  const receivedAt = message.internalDate
    ? new Date(Number(message.internalDate)).toISOString()
    : new Date().toISOString();

  return {
    id: message.id,
    threadId: message.threadId,
    snippet: message.snippet ?? "",
    subject: headerValue(headers, "Subject"),
    from: headerValue(headers, "From"),
    date: headerValue(headers, "Date"),
    textPlain,
    textHtml,
    received_at: receivedAt,
    raw_payload: {
      id: message.id,
      threadId: message.threadId,
      snippet: message.snippet,
      subject: headerValue(headers, "Subject"),
      from: headerValue(headers, "From"),
      date: headerValue(headers, "Date"),
      labelIds: message.labelIds ?? [],
    },
  };
}
