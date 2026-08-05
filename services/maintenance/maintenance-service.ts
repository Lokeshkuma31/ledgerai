import * as maintenanceRepository from "@/repositories/maintenance-repository";

export async function deleteExpiredSessions(now?: Date): Promise<number> {
  return maintenanceRepository.deleteExpiredSessions(now);
}

export async function deleteOldAuditLogs(olderThan: Date): Promise<number> {
  return maintenanceRepository.deleteOldAuditLogs(olderThan);
}

export async function deleteExpiredRecommendations(now?: Date): Promise<number> {
  return maintenanceRepository.deleteExpiredRecommendations(now);
}

export async function deleteOldDismissedFeedItems(olderThan: Date): Promise<number> {
  return maintenanceRepository.deleteOldDismissedFeedItems(olderThan);
}
