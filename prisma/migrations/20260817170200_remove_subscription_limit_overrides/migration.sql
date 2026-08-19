-- Per-user override columns removed: limits now come from the assigned Plan only.
ALTER TABLE "subscriptions" DROP COLUMN "postsLimit",
                            DROP COLUMN "connectedAccountsLimit";
