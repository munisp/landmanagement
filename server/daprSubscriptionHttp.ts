import { Router, type Request, type Response } from "express";
import { consumeVerificationCloudEvent } from "./daprVerificationConsumer";

export const daprSubscriptionHttpRouter = Router();

const subscriptions = [
  { pubsubname: "idlr-pubsub", topic: "verification-received", route: "/api/internal/dapr/verification-received", deadLetterTopic: "verification-dead-letter" },
  { pubsubname: "idlr-pubsub", topic: "verification-reviewed", route: "/api/internal/dapr/verification-reviewed", deadLetterTopic: "verification-dead-letter" },
];

export function daprSubscriptions(_req: Request, res: Response) {
  res.json(subscriptions);
}

function handler(topic: string) {
  return async (req: Request, res: Response) => {
    try {
      await consumeVerificationCloudEvent(req.body, topic);
      res.status(200).json({ status: "SUCCESS" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Dapr delivery failed";
      if (message.includes("invalid") || message.includes("not subscribed")) {
        res.status(400).json({ status: "DROP", error: message });
        return;
      }
      console.error("[DaprVerificationConsumer] event handling failed", { topic, message });
      res.status(500).json({ status: "RETRY" });
    }
  };
}

daprSubscriptionHttpRouter.post("/verification-received", handler("verification-received"));
daprSubscriptionHttpRouter.post("/verification-reviewed", handler("verification-reviewed"));
