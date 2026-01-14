/**
 * FERPA-Compliant Audit Logger
 *
 * Centralized service for logging all critical operations involving student data.
 * Required by FERPA 34 CFR § 99.32 for maintaining records of disclosures.
 *
 * @see docs/audit/FERPA-CRITICAL-ISSUES-REMEDIATION-PLAN.md Issue #3
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logging/safe-logger';

/**
 * Standard audit action types
 * These cover all FERPA-required logging scenarios
 */
export type AuditAction =
  // Competitor operations
  | 'competitor_created'
  | 'competitor_updated'
  | 'competitor_deleted'
  | 'competitor_viewed'
  | 'competitor_bulk_imported'
  | 'profile_link_regenerated'
  | 'competitor_status_changed'

  // Team operations
  | 'team_created'
  | 'team_updated'
  | 'team_deleted'
  | 'team_member_added'
  | 'team_member_removed'

  // Third-party disclosures (CRITICAL for FERPA)
  | 'data_disclosed_zoho'
  | 'data_disclosed_game_platform'
  | 'data_disclosed_third_party'

  // Agreement/consent operations
  | 'agreement_sent'
  | 'agreement_signed'
  | 'agreement_viewed'
  | 'agreement_voided'
  | 'consent_revoked'

  // Administrative operations
  | 'bulk_status_update'
  | 'admin_access'
  | 'password_reset';

export interface AuditLogParams {
  user_id?: string | null;
  action: AuditAction;
  entity_type?: string;
  entity_id?: string;
  metadata?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
}

/**
 * Centralized audit logging service
 *
 * All methods are static for easy use across the application.
 * Logs are inserted async and errors are caught to avoid blocking operations.
 */
export class AuditLogger {
  /**
   * Log a general audit action
   *
   * @param supabase - Supabase client instance
   * @param params - Audit log parameters
   *
   * @example
   * await AuditLogger.logAction(supabase, {
   *   user_id: user.id,
   *   action: 'competitor_created',
   *   entity_type: 'competitor',
   *   entity_id: competitor.id,
   *   metadata: { coach_id: user.id }
   * });
   */
  static async logAction(
    supabase: SupabaseClient,
    params: AuditLogParams
  ): Promise<void> {
    try {
      const { error } = await supabase.from('activity_logs').insert({
        user_id: params.user_id ?? null,
        action: params.action,
        entity_type: params.entity_type,
        entity_id: params.entity_id,
        metadata: params.metadata,
        ip_address: params.ip_address,
        user_agent: params.user_agent,
        created_at: new Date().toISOString(),
      });

      if (error) {
        logger.error('Audit log insertion failed', {
          error: error.message,
          action: params.action,
          entity_id: params.entity_id
        });
      }
    } catch (error) {
      // Never let audit logging failures break the application
      logger.error('Audit logging exception', {
        error: error instanceof Error ? error.message : 'Unknown error',
        action: params.action
      });
    }
  }

  /**
   * Log third-party data disclosure (FERPA CRITICAL)
   *
   * Required by FERPA 34 CFR § 99.32: Schools must maintain a record of each
   * request for access to and each disclosure of personally identifiable
   * information from the education records of each student.
   *
   * @param supabase - Supabase client instance
   * @param competitorId - ID of the competitor whose data was disclosed
   * @param disclosedTo - Name of the third party (e.g., "Zoho Sign", "MetaCTF")
   * @param purpose - Purpose of the disclosure
   * @param userId - ID of the user who initiated the disclosure (optional for system/webhook actions)
   * @param dataFields - List of data fields disclosed (optional)
   *
   * @example
   * await AuditLogger.logDisclosure(supabase, {
   *   competitorId: '123',
   *   disclosedTo: 'Zoho Sign',
   *   purpose: 'Electronic signature collection for consent forms',
   *   userId: user.id,
   *   dataFields: ['first_name', 'last_name', 'email', 'parent_email']
   * });
   */
  static async logDisclosure(
    supabase: SupabaseClient,
    params: {
      competitorId: string;
      disclosedTo: string;
      purpose: string;
      userId?: string | null;
      dataFields?: string[];
      requestId?: string;
    }
  ): Promise<void> {
    await this.logAction(supabase, {
      user_id: params.userId ?? null,
      action: this.getDisclosureAction(params.disclosedTo),
      entity_type: 'competitor',
      entity_id: params.competitorId,
      metadata: {
        disclosed_to: params.disclosedTo,
        purpose: params.purpose,
        data_fields: params.dataFields,
        request_id: params.requestId,
        disclosure_date: new Date().toISOString(),
      }
    });
  }

  /**
   * Log bulk import operation
   *
   * @param supabase - Supabase client instance
   * @param userId - ID of the user who performed the import
   * @param stats - Import statistics
   *
   * @example
   * await AuditLogger.logBulkImport(supabase, {
   *   userId: user.id,
   *   stats: { inserted: 10, updated: 5, skipped: 2, errors: 1 }
   * });
   */
  static async logBulkImport(
    supabase: SupabaseClient,
    params: {
      userId: string;
      coachId: string;
      stats: {
        inserted: number;
        updated: number;
        skipped: number;
        errors: number;
      };
    }
  ): Promise<void> {
    await this.logAction(supabase, {
      user_id: params.userId,
      action: 'competitor_bulk_imported',
      entity_type: 'competitors',
      metadata: {
        coach_id: params.coachId,
        ...params.stats,
        total_processed: params.stats.inserted + params.stats.updated + params.stats.skipped + params.stats.errors
      }
    });
  }

  /**
   * Log agreement/consent operation
   *
   * @param supabase - Supabase client instance
   * @param agreementId - ID of the agreement
   * @param competitorId - ID of the competitor
   * @param action - Type of agreement action
   * @param userId - ID of the user (optional for system/webhook actions)
   * @param metadata - Additional context
   *
   * @example
   * await AuditLogger.logAgreement(supabase, {
   *   agreementId: '123',
   *   competitorId: '456',
   *   action: 'agreement_sent',
   *   userId: user.id,
   *   metadata: { provider: 'zoho', template_kind: 'adult' }
   * });
   */
  static async logAgreement(
    supabase: SupabaseClient,
    params: {
      agreementId: string;
      competitorId: string;
      action: Extract<AuditAction, 'agreement_sent' | 'agreement_signed' | 'agreement_viewed' | 'agreement_voided' | 'consent_revoked'>;
      userId?: string | null;
      metadata?: Record<string, any>;
    }
  ): Promise<void> {
    await this.logAction(supabase, {
      user_id: params.userId ?? null,
      action: params.action,
      entity_type: 'agreement',
      entity_id: params.agreementId,
      metadata: {
        competitor_id: params.competitorId,
        ...params.metadata
      }
    });
  }

  /**
   * Get the appropriate disclosure action based on the third party
   */
  private static getDisclosureAction(disclosedTo: string): AuditAction {
    const lowerTo = disclosedTo.toLowerCase();
    if (lowerTo.includes('zoho')) return 'data_disclosed_zoho';
    if (lowerTo.includes('metacctf') || lowerTo.includes('game') || lowerTo.includes('platform')) {
      return 'data_disclosed_game_platform';
    }
    return 'data_disclosed_third_party';
  }

  /**
   * Retrieve audit logs for a specific competitor (for parent disclosure reports)
   *
   * @param supabase - Supabase client instance
   * @param competitorId - ID of the competitor
   * @param actions - Optional filter for specific actions
   * @param limit - Maximum number of logs to return
   *
   * @returns Array of audit log entries
   *
   * @example
   * const disclosures = await AuditLogger.getCompetitorLogs(supabase, {
   *   competitorId: '123',
   *   actions: ['data_disclosed_zoho', 'data_disclosed_game_platform'],
   *   limit: 50
   * });
   */
  static async getCompetitorLogs(
    supabase: SupabaseClient,
    params: {
      competitorId: string;
      actions?: AuditAction[];
      limit?: number;
    }
  ): Promise<any[]> {
    try {
      let query = supabase
        .from('activity_logs')
        .select('*')
        .eq('entity_type', 'competitor')
        .eq('entity_id', params.competitorId)
        .order('created_at', { ascending: false });

      if (params.actions && params.actions.length > 0) {
        query = query.in('action', params.actions);
      }

      if (params.limit) {
        query = query.limit(params.limit);
      }

      const { data, error } = await query;

      if (error) {
        logger.error('Failed to retrieve audit logs', {
          error: error.message,
          competitor_id: params.competitorId
        });
        return [];
      }

      return data || [];
    } catch (error) {
      logger.error('Audit log retrieval exception', {
        error: error instanceof Error ? error.message : 'Unknown error',
        competitor_id: params.competitorId
      });
      return [];
    }
  }

  /**
   * Retrieve all third-party disclosures for a competitor
   *
   * This is specifically for FERPA compliance - parents have the right to
   * see all disclosures of their child's education records.
   *
   * @param supabase - Supabase client instance
   * @param competitorId - ID of the competitor
   *
   * @returns Array of disclosure log entries
   */
  static async getDisclosures(
    supabase: SupabaseClient,
    competitorId: string
  ): Promise<any[]> {
    return this.getCompetitorLogs(supabase, {
      competitorId,
      actions: [
        'data_disclosed_zoho',
        'data_disclosed_game_platform',
        'data_disclosed_third_party'
      ]
    });
  }
}
