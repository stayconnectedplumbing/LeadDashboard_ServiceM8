export function isInServiceM8Iframe() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function pushLeadViaServiceM8Bridge(lead) {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const timeout = setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("ServiceM8 push timed out. Open the dashboard from the ServiceM8 add-on menu."));
    }, 30000);

    function onMessage(event) {
      if (
        event.data?.type !== "PUSH_LEAD_RESULT" ||
        event.data.requestId !== requestId
      ) {
        return;
      }

      window.removeEventListener("message", onMessage);
      clearTimeout(timeout);

      if (event.data.error) {
        reject(new Error(event.data.error));
        return;
      }

      const result = event.data.result;
      if (result?.error) {
        reject(new Error(result.error));
        return;
      }

      resolve(result);
    }

    window.addEventListener("message", onMessage);
    window.parent.postMessage(
      {
        type: "PUSH_LEAD",
        requestId,
        payload: {
          id: lead.id,
          source: lead.source,
          full_name: lead.full_name,
          email: lead.email,
          phone: lead.phone,
          service_requested: lead.service_requested,
          message: lead.message,
          notes: lead.notes,
          raw_payload: lead.raw_payload,
          servicem8_job_uuid: lead.servicem8_job_uuid,
        },
      },
      "*",
    );
  });
}
