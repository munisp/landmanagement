declare module "@fluvio/client" {
  export interface TopicProducer {
    send(key: string, value: string): Promise<void>;
    flush(): Promise<void>;
  }

  export default class Fluvio {
    static connect(options: { host: string; port: number }): Promise<Fluvio>;
    topicProducer(topic: string): Promise<TopicProducer>;
  }
}
