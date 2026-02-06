-- Baseline migration to sync existing database state with migration history
-- This migration marks all existing tables and columns as being in sync

-- No SQL commands needed - database already has these structures:
-- - NotificationChannel, NotificationPriority, NotificationType, VerificationStatus enums
-- - AdminAuditLog, Notification, PlanRestriction, SubscriptionPlan, system_settings tables
-- - All indexes and foreign keys on existing tables
-- - Restaurant.legalDetails, Restaurant.verificationStatus columns
-- - Subscription.cancellationReason, Subscription.planId, Subscription.previousPlanType columns
-- - Removed unique constraint on User.email

-- This is a baseline migration representing the current production state
