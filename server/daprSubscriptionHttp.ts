import { Router, type Request, type Response } from "express";
import { consumeStakeholderJourneyPortfolioCloudEvent } from "./daprPortfolioEventConsumer";
import { consumeVerificationCloudEvent } from "./daprVerificationConsumer";

export const daprSubscriptionHttpRouter = Router();

type DaprConsumer = (eventBody: unknown, topic: string) => Promise<unknown>;

const subscriptions = [
  { pubsubname: "idlr-pubsub", topic: "verification-received", route: "/api/internal/dapr/verification-received", deadLetterTopic: "verification-dead-letter" },
  { pubsubname: "idlr-pubsub", topic: "verification-reviewed", route: "/api/internal/dapr/verification-reviewed", deadLetterTopic: "verification-dead-letter" },
  { pubsubname: "idlr-pubsub", topic: "portfolio.events", route: "/api/internal/dapr/portfolio-events", deadLetterTopic: "portfolio-events-dead-letter" },
];

export function daprSubscriptions(_req: Request, res: Response) {
  res.json(subscriptions);
}

function handler(topic: string, consume: DaprConsumer) {
  return async (req: Request, res: Response) => {
    try {
      await consume(req.body, topic);
      res.status(200).json({ status: "SUCCESS" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Dapr delivery failed";
      if (message.includes("invalid") || message.includes("not subscribed")) {
        res.status(400).json({ status: "DROP", error: message });
        return;
      }
      console.error("[DaprSubscriptionConsumer] event handling failed", { topic, message });
      res.status(500).json({ status: "RETRY" });
    }
  };
}

daprSubscriptionHttpRouter.post("/verification-received", handler("verification-received", consumeVerificationCloudEvent));
daprSubscriptionHttpRouter.post("/verification-reviewed", handler("verification-reviewed", consumeVerificationCloudEvent));
daprSubscriptionHttpRouter.post("/portfolio-events", handler("portfolio.events", consumeStakeholderJourneyPortfolioCloudEvent));
