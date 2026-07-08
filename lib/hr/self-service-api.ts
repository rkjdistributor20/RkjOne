import type {
 CreateEmployeeHrServiceRequestPayload,
 EmployeeHrServiceRequest,
} from '@/lib/hr/employee-self-service';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
 const res = await fetch(url, {
 ...init,
 headers: {
 'Content-Type': 'application/json',
 ...(init?.headers ?? {}),
 },
 });
 const data = await res.json().catch(() => ({}));
 if (!res.ok) {
 throw new Error(typeof data.error === 'string' ? data.error : 'Permintaan HR gagal.');
 }
 return data as T;
}

export async function createEmployeeHrServiceRequest(
 payload: CreateEmployeeHrServiceRequestPayload,
) {
 return fetchJson<{ request: EmployeeHrServiceRequest }>('/api/hr/self-service/requests', {
 method: 'POST',
 body: JSON.stringify(payload),
 });
}

export async function cancelEmployeeHrServiceRequest(requestId: string) {
 return fetchJson<{ request: EmployeeHrServiceRequest }>(
 `/api/hr/self-service/requests/${requestId}`,
 {
 method: 'PATCH',
 body: JSON.stringify({
 status: 'CANCELLED',
 reviewer_note: 'Dibatalkan oleh staf melalui HRMIS kendiri.',
 }),
 },
 );
}

export async function fetchEmployeeHrServiceRequests() {
 return fetchJson<{ requests: EmployeeHrServiceRequest[] }>('/api/hr/self-service/requests');
}
