"use node";

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import webpush from "web-push";

export const sendPush = internalAction({
  args: {
    subscriptions: v.array(v.object({
      endpoint: v.string(),
      keys: v.object({
        p256dh: v.string(),
        auth: v.string(),
      }),
    })),
    title: v.string(),
    body: v.string(),
  },
  returns: v.array(v.string()),
  handler: async (_, { subscriptions, title, body }) => {
    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const vapidSubject = process.env.VAPID_SUBJECT;

    if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
      console.error("VAPID keys not configured");
      return [];
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const payload = JSON.stringify({
      title,
      body,
      icon: "/icons/icon-192.png",
    });

    // Track expired endpoints (410 Gone) for cleanup
    const expiredEndpoints: string[] = [];

    const results = await Promise.allSettled(
      subscriptions.map((sub) =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          payload,
        ),
      ),
    );

    results.forEach((result, i) => {
      if (result.status === "rejected") {
        const err = result.reason as { statusCode?: number };
        if (err.statusCode === 410 || err.statusCode === 404) {
          expiredEndpoints.push(subscriptions[i].endpoint);
        } else {
          console.error(
            `Push failed for ${subscriptions[i].endpoint}: ${result.reason}`,
          );
        }
      }
    });

    return expiredEndpoints;
  },
});
