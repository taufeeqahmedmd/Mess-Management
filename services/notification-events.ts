/**
 * Notification event catalog (Notifications Module spec). Events are CODE — they
 * ship with the features that raise them; which channels fire, to whom, and with
 * what template is DATA (notification_rules / notification_templates), edited in
 * Notifications Management without deployments.
 *
 * `variables` are the {{placeholders}} a template may use for the event.
 * `audience` declares which recipient kinds make sense (drives the config UI):
 *  - cardholder: the affected cardholder's email/WhatsApp (they never log in, so never push)
 *  - vendor:     the staff logins linked to the request's vendor (push)
 *  - requester:  the staff login who raised the request (push)
 *  - roles:      staff by role name (push; email/WhatsApp via their staff contact)
 */

export type NotificationAudience = {
  cardholder: boolean;
  vendor: boolean;
  requester: boolean;
  roles: boolean;
};

export type NotificationEventDef = {
  code: string;
  module: string;
  label: string;
  description: string;
  variables: readonly string[];
  audience: NotificationAudience;
};

const AUD = (over: Partial<NotificationAudience> = {}): NotificationAudience => ({
  cardholder: false,
  vendor: false,
  requester: false,
  roles: true,
  ...over,
});

export const NOTIFICATION_EVENTS: readonly NotificationEventDef[] = [
  {
    code: "user.created",
    module: "Cardholders",
    label: "Cardholder created",
    description: "A new cardholder account was created.",
    variables: ["name", "code", "category", "branch"],
    audience: AUD({ cardholder: true }),
  },
  {
    code: "coupon.utilized",
    module: "Counter",
    label: "Meal coupon utilized",
    description: "A coupon was consumed at a counter tap.",
    variables: ["name", "code", "meal", "counter", "remaining", "time"],
    audience: AUD({ cardholder: true }),
  },
  {
    code: "recharge.created",
    module: "Recharge",
    label: "Recharge posted",
    description: "Coupons were granted to a cardholder by staff.",
    variables: ["name", "code", "amount", "coupons", "validTill"],
    audience: AUD({ cardholder: true }),
  },
  {
    code: "recharge.online_credited",
    module: "Payments",
    label: "Online top-up credited",
    description: "A self-service Jodo payment was confirmed and coupons credited.",
    variables: ["name", "code", "amount", "coupons", "transactionId"],
    audience: AUD({ cardholder: true }),
  },
  {
    code: "foodRequest.raised",
    module: "Food Requests",
    label: "Food request raised",
    description: "A new food request was submitted to a vendor.",
    variables: ["requestCode", "cardholder", "vendor", "items", "location", "requestedFor", "amount"],
    audience: AUD({ vendor: true }),
  },
  {
    code: "foodRequest.accepted",
    module: "Food Requests",
    label: "Vendor accepted",
    description: "The vendor accepted the food request.",
    variables: ["requestCode", "cardholder", "vendor", "location", "requestedFor"],
    audience: AUD({ requester: true, cardholder: true }),
  },
  {
    code: "foodRequest.preparing",
    module: "Food Requests",
    label: "Preparing",
    description: "The vendor started preparing the order.",
    variables: ["requestCode", "cardholder", "vendor", "location", "requestedFor"],
    audience: AUD({ requester: true, cardholder: true }),
  },
  {
    code: "foodRequest.out_for_delivery",
    module: "Food Requests",
    label: "Out for delivery",
    description: "The vendor marked the order out for delivery.",
    variables: ["requestCode", "cardholder", "vendor", "location", "requestedFor"],
    audience: AUD({ requester: true, cardholder: true }),
  },
  {
    code: "foodRequest.delivered",
    module: "Food Requests",
    label: "Delivered",
    description: "The order was delivered (RFID verified).",
    variables: ["requestCode", "cardholder", "vendor", "items", "location", "amount", "time"],
    audience: AUD({ requester: true, cardholder: true, vendor: true }),
  },
  {
    code: "foodRequest.rejected",
    module: "Food Requests",
    label: "Rejected",
    description: "The request was rejected (approval or vendor).",
    variables: ["requestCode", "cardholder", "vendor", "reason"],
    audience: AUD({ requester: true }),
  },
  {
    code: "foodRequest.cancelled",
    module: "Food Requests",
    label: "Cancelled",
    description: "The request was cancelled by an admin.",
    variables: ["requestCode", "cardholder", "vendor", "stage"],
    audience: AUD({ requester: true, vendor: true }),
  },
] as const;

const BY_CODE = new Map(NOTIFICATION_EVENTS.map((e) => [e.code, e]));

export function notificationEvent(code: string): NotificationEventDef | null {
  return BY_CODE.get(code) ?? null;
}
