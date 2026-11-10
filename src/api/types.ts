// Types for the WaniKani API v2. Only what Step 1 needs for now;
// more resources (subjects, assignments, ...) get added in Step 2.

export interface WKResource<T> {
  object: string;
  url: string;
  data_updated_at: string | null;
  data: T;
}

export interface WKSubscription {
  active: boolean;
  type: "free" | "recurring" | "lifetime" | "unknown";
  max_level_granted: number;
  period_ends_at: string | null;
}

export interface WKUser {
  id: string;
  username: string;
  level: number;
  profile_url: string;
  started_at: string;
  current_vacation_started_at: string | null;
  subscription: WKSubscription;
}
