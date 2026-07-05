export interface ApprovalRequest {
 id: string;
 entity_type: string;
 entity_id: string;
 title: string;
 description: string | null;
 status: string;
 created_at: string;
 branch: { branch_name: string } | null;
 requester: { full_name: string; email: string } | null;
}
