export type ApiScope = 'auth:verify' | 'directory:read' | 'user:status';
export interface ApplicationInput {
  application_name: string;
  application_url: string;
  application_description: string;
  application_type: string;
  application_status: 'active' | 'inactive';
  api_access_enabled: boolean;
}
export interface ApplicationRecord extends ApplicationInput {
  application_id: string;
  created_at: string;
  updated_at: string;
  record_version: number;
}
export interface CredentialMetadata {
  credential_id: string;
  application_id: string;
  credential_name: string;
  key_id: string;
  credential_fingerprint: string;
  allowed_scopes: ApiScope[];
  status: 'active' | 'expired' | 'revoked';
  effective_status: 'active' | 'expired' | 'revoked';
  lifecycle_committed: boolean;
  usable: boolean;
  created_at: string;
  expires_at: string;
  rotated_at: string;
  revoked_at: string;
  revision: string;
}
export interface CredentialOptions {
  credential_name: string;
  allowed_scopes: ApiScope[];
  expires_in_seconds?: number;
}
export interface OperationInfo {
  operation_id: string;
  operation_type: string;
  target_type: 'application' | 'credential' | 'credential_key';
  target_id: string;
  state: 'pending' | 'completed' | 'failed' | 'needs_reconciliation';
  created_at: string;
  updated_at: string;
  error_code: string;
}
export interface PageOptions { page?: number; page_size?: number }
export interface Page<T> {
  items: T[];
  pagination: {page: number; page_size: number; total: number; total_pages: number; has_next: boolean};
}
export interface RegistryService {
  listApplications(token: string, filters?: PageOptions & {query?: string; status?: 'active'|'inactive'|'all'}): Promise<Page<ApplicationRecord>>;
  getApplication(token: string, applicationId: string): Promise<{application: ApplicationRecord}>;
  createApplication(token: string, application: Pick<ApplicationInput,'application_name'|'application_url'> & Partial<ApplicationInput>, operationId?: string): Promise<{application: ApplicationRecord; operation_id: string}>;
  updateApplication(token: string, applicationId: string, expectedVersion: number, patch: Partial<ApplicationInput>, operationId?: string): Promise<{application: ApplicationRecord; operation_id: string}>;
  disableApplication(token: string, applicationId: string, expectedVersion: number, operationId?: string): Promise<{application: ApplicationRecord; operation_id: string}>;
  listCredentials(token: string, applicationId: string, filters?: PageOptions & {status?: 'active'|'revoked'|'expired'|'all'}): Promise<Page<CredentialMetadata>>;
  getCredential(token: string, credentialId: string): Promise<{credential: CredentialMetadata}>;
  generateClientCredential(token: string, applicationId: string, options: CredentialOptions, operationId?: string): Promise<{credential: CredentialMetadata; client_secret: string; previous_credential_id: null; operation_id: string}>;
  rotateClientCredential(token: string, credentialId: string, expectedRevision: string, options?: Partial<CredentialOptions>, operationId?: string): Promise<{credential: CredentialMetadata; client_secret: string; previous_credential_id: string; operation_id: string}>;
  revokeClientCredential(token: string, credentialId: string, expectedRevision: string, operationId?: string): Promise<{credential: CredentialMetadata; operation_id: string}>;
  updateCredentialScopes(token: string, credentialId: string, expectedRevision: string, scopes: ApiScope[], operationId?: string): Promise<{credential: CredentialMetadata; operation_id: string}>;
  getOperationStatus(token: string, operationId: string): Promise<{operation: OperationInfo}>;
}
export function validateApplication(input: Partial<ApplicationInput>, partial?: boolean): Partial<ApplicationInput>;
export function createApplicationRegistry(call: (operation: string, payload: unknown) => Promise<Record<string, unknown>>): RegistryService;
