export interface AnalyticsEventRecord {
  id: string;
  orgId: string;
  name: string;
  version: number;
  sessionId: string;
  userId: string | null;
  properties: Record<string, unknown>;
  occurredAt: Date;
}

export interface AnalyticsEventRepository {
  append(input: {
    orgId: string;
    name: string;
    version: number;
    sessionId: string;
    userId?: string;
    properties: Record<string, unknown>;
    occurredAt: Date;
  }): Promise<AnalyticsEventRecord>;
  listByNames(input: {
    orgId: string;
    names: string[];
    from: Date;
    to: Date;
    limit?: number;
  }): Promise<AnalyticsEventRecord[]>;
}

export interface RateLimitPolicyRecord {
  id: string;
  orgId: string;
  route: string;
  limit: number;
  windowSeconds: number;
  createdAt: Date;
}

export interface RateLimitCounterRecord {
  id: string;
  orgId: string;
  route: string;
  windowKey: string;
  hits: number;
}

export interface RateLimitPolicyRepository {
  upsert(input: {
    orgId: string;
    route: string;
    limit: number;
    windowSeconds: number;
  }): Promise<RateLimitPolicyRecord>;
  find(orgId: string, route: string): Promise<RateLimitPolicyRecord | null>;
  listByOrg(orgId: string): Promise<RateLimitPolicyRecord[]>;
}

export interface RateLimitCounterRepository {
  /** Atomic hit increment; returns the new count for the window. */
  incrementHits(input: {
    orgId: string;
    route: string;
    windowKey: string;
  }): Promise<number>;
}
